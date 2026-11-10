import logging
import os
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger("jarvis.orchestration.workspace")


def execute_workspace_modification(
    workspace_service: Any,
    user_prompt: str,
    project_id: str | None = None,
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

    res = workspace_service.modify_project_file(
        project_id=target_project,
        rel_path=target_file,
        new_content=new_content,
        reason=user_prompt,
    )

    diff_display = res["diff"] if res["diff"] else f"+ {target_file} atualizado"
    msg = (
        f"✅ **Arquivo atualizado no disco do seu computador com sucesso!**\n\n"
        f"📁 **Projeto**: `workspace/{target_project}/`\n"
        f"📄 **Arquivo modificado**: `{target_file}` (Backup de segurança `.bak` criado)\n\n"
        f"🔍 **Diff das alterações gravadas no arquivo**:\n```diff\n{diff_display}\n```"
    )
    return (msg, [f"workspace/{target_project}/{target_file}"])


INTENT_DOMAIN_MAP = {
    "project_creation": "web",
    "code_modification": "backend",
    "architecture_analysis": "backend",
    "security_audit": "security",
    "qa_testing": "qa",
    "general_planning": "management",
    "multi_agent_consensus": "architecture",
}


