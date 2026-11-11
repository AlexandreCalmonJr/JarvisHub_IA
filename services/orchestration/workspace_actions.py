import difflib
import logging
import re
from typing import Any

from packages.contracts.approval import ApprovalStatus
from services.security_core import PermissionDeniedError

logger = logging.getLogger("jarvis.orchestration.workspace")


def execute_workspace_modification(
    workspace_service: Any,
    user_prompt: str,
    project_id: str | None = None,
    *,
    approval_id: str | None = None,
    task_id: str | None = None,
    preview_only: bool = False,
) -> tuple[str, list[str]]:
    """Acessa os arquivos do projeto no disco, aplica a modificação solicitada e retorna o diff."""
    if not workspace_service:
        return ("Serviço de workspace não disponível.", [])

    projects = workspace_service.list_available_projects()
    target_project = project_id
    p_lower = user_prompt.lower()

    if not target_project:
        best_match = None
        best_score = 0
        for prj in projects:
            p_id = prj["id"].lower()
            score = 0
            if p_id in p_lower:
                score += 10
            score += sum(1 for part in p_id.split("-") if len(part) > 2 and part in p_lower)
            if score > best_score:
                best_score = score
                best_match = prj["id"]
        if best_match and best_score > 0:
            target_project = best_match
        elif projects:
            target_project = projects[-1]["id"]

    if not target_project:
        return ("Nenhum projeto encontrado em workspace/ para aplicar a alteração.", [])

    target_file = "index.html"
    if any(k in p_lower for k in ("style", "css", "cor", "fundo", "background", "tema", "estilo")):
        target_file = "style.css"
    elif any(k in p_lower for k in ("app.js", "script", "js", "alerta", "interação")):
        target_file = "app.js"

    try:
        content = workspace_service.read_project_file(target_project, target_file)
    except Exception as e:
        return (f"Erro ao ler arquivo '{target_file}': {e}", [])

    new_content = content

    # 1. Modificações de estilo / cor
    if target_file == "style.css" or "cor" in p_lower or "fundo" in p_lower:
        if "verde" in p_lower:
            new_content = re.sub(r"--primary:\s*#[0-9a-fA-F]+;", "--primary: #10b981;", new_content)
            new_content = re.sub(
                r"--primary-hover:\s*#[0-9a-fA-F]+;", "--primary-hover: #059669;", new_content
            )
        elif "azul" in p_lower:
            new_content = re.sub(r"--primary:\s*#[0-9a-fA-F]+;", "--primary: #3b82f6;", new_content)
            new_content = re.sub(
                r"--primary-hover:\s*#[0-9a-fA-F]+;", "--primary-hover: #2563eb;", new_content
            )
        elif "vermelho" in p_lower:
            new_content = re.sub(r"--primary:\s*#[0-9a-fA-F]+;", "--primary: #ef4444;", new_content)
            new_content = re.sub(
                r"--primary-hover:\s*#[0-9a-fA-F]+;", "--primary-hover: #dc2626;", new_content
            )
        elif "roxo" in p_lower:
            new_content = re.sub(r"--primary:\s*#[0-9a-fA-F]+;", "--primary: #8b5cf6;", new_content)
            new_content = re.sub(
                r"--primary-hover:\s*#[0-9a-fA-F]+;", "--primary-hover: #7c3aed;", new_content
            )
        elif "amarelo" in p_lower or "dourado" in p_lower:
            new_content = re.sub(r"--primary:\s*#[0-9a-fA-F]+;", "--primary: #f59e0b;", new_content)
            new_content = re.sub(
                r"--primary-hover:\s*#[0-9a-fA-F]+;", "--primary-hover: #d97706;", new_content
            )

    # 2. Modificações de título / texto
    if (
        target_file == "index.html"
        or "título" in p_lower
        or "titulo" in p_lower
        or "nome" in p_lower
    ):
        match_title = re.search(
            r'(?:mude|altere|troque|coloque)\s+(?:o\s+)?t[ií]tulo\s+(?:para|de)?\s+["\']?([^"\']+)["\']?',
            user_prompt,
            re.IGNORECASE,
        )
        if match_title:
            novo_titulo = match_title.group(1).strip().rstrip(".")
            new_content = re.sub(
                r"<title>.*?</title>", f"<title>{novo_titulo}</title>", new_content
            )
            new_content = re.sub(
                r'<div class="logo">.*?</div>',
                f'<div class="logo">✨ {novo_titulo}</div>',
                new_content,
            )
            new_content = re.sub(
                r"<h1>Bem-vindo ao <span>.*?</span></h1>",
                f"<h1>Bem-vindo ao <span>{novo_titulo}</span></h1>",
                new_content,
            )

    if new_content == content:
        new_content += f"\n/* Modificação JARVIS: {user_prompt} */\n"

    project_root = workspace_service.get_project_dir(target_project).resolve()
    target_path = (project_root / target_file).resolve()
    try:
        target_path.relative_to(project_root)
    except ValueError as exc:
        raise PermissionDeniedError("Caminho fora da raiz autorizada do projeto.") from exc

    diff_display = "".join(
        difflib.unified_diff(
            content.splitlines(keepends=True),
            new_content.splitlines(keepends=True),
            fromfile=f"a/{target_file}",
            tofile=f"b/{target_file}",
        )
    ) or f"+ {target_file} atualizado"

    preview = (
        f"Pré-visualização da alteração proposta para {target_project}/{target_file}:\n"
        f"```diff\n{diff_display}\n```"
    )
    if preview_only:
        return (preview, [str(target_path)])

    if not approval_id or not task_id:
        raise PermissionDeniedError(
            "Escrita do workspace bloqueada: é obrigatória uma aprovação humana associada à tarefa."
        )

    approval = workspace_service.security_core.approval_engine.get_request(approval_id)
    if (
        not approval
        or approval.status != ApprovalStatus.APPROVED
        or approval.task_id != task_id
        or approval.operation != "file_write"
        or str(target_path) not in approval.affected_resources
        or approval.proposed_diff != preview
    ):
        raise PermissionDeniedError(
            "Aprovação ausente, pendente ou não correspondente ao ficheiro/diff proposto."
        )

    res = workspace_service.modify_project_file(
        project_id=target_project,
        rel_path=target_file,
        new_content=new_content,
        reason=user_prompt,
    )

    applied_diff = res.get("diff") or diff_display
    msg = (
        f"✅ **Arquivo atualizado no disco do seu computador após aprovação humana!**\n\n"
        f"📁 **Projeto**: `workspace/{target_project}/`\n"
        f"📄 **Arquivo modificado**: `{target_file}` (Backup de segurança `.bak` criado)\n\n"
        f"🔍 **Diff das alterações gravadas no arquivo**:\n```diff\n{applied_diff}\n```"
    )
    return (msg, [str(target_path)])


INTENT_DOMAIN_MAP = {
    "project_creation": "web",
    "code_modification": "backend",
    "architecture_analysis": "backend",
    "security_audit": "security",
    "qa_testing": "qa",
    "general_planning": "management",
    "multi_agent_consensus": "architecture",
}


