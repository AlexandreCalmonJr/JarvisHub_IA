"""Gerenciador de AI Teammates Persistentes e Protocolo ACP (nightly-labs/openbot).

Permite instanciar colegas de equipe autônomos persistentes em background,
distribuir tarefas especializadas, isolar workspaces concorrentes via Git Worktrees
e auditar seu ciclo de vida.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import uuid
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger("jarvis.teammates")


@dataclass
class Teammate:
    id: str
    name: str
    role: str
    status: str = "idle"  # idle | running | waiting_approval | completed | failed | terminated
    current_task: str | None = None
    project_id: str | None = None
    isolated_workspace: bool = False
    worktree_path: str | None = None
    worktree_branch: str | None = None
    log_entries: list[dict[str, Any]] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def add_log(self, message: str, level: str = "info") -> None:
        self.log_entries.append(
            {
                "timestamp": datetime.now(UTC).isoformat(),
                "level": level,
                "message": message,
            }
        )
        self.updated_at = datetime.now(UTC).isoformat()


class TeammateManager:
    def __init__(self, security_core=None, base_repo_path: str | Path | None = None) -> None:
        self.security_core = security_core
        self.base_repo_path = Path(base_repo_path or ".").resolve()
        self._teammates: dict[str, Teammate] = {}

    def spawn_teammate(
        self,
        name: str,
        role: str,
        project_id: str | None = None,
        isolate_worktree: bool = False,
    ) -> Teammate:
        """Cria e registra um novo colega de equipe de IA persistente.

        Se isolate_worktree for True, cria uma branch e um Git Worktree exclusivo
        para o agente operar sem colidir com o workspace principal.
        """
        teammate_id = f"teammate-{uuid.uuid4().hex[:8]}"
        worktree_path: str | None = None
        worktree_branch: str | None = None

        if isolate_worktree:
            try:
                worktree_branch = f"teammate/{teammate_id}"
                target_dir = self.base_repo_path / ".worktrees" / teammate_id
                target_dir.parent.mkdir(parents=True, exist_ok=True)

                res = subprocess.run(
                    ["git", "worktree", "add", "-b", worktree_branch, str(target_dir), "HEAD"],
                    cwd=str(self.base_repo_path),
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if res.returncode == 0:
                    worktree_path = str(target_dir.resolve())
                    logger.info(
                        "Git Worktree criado para %s na branch %s em %s",
                        teammate_id,
                        worktree_branch,
                        worktree_path,
                    )
                else:
                    logger.warning(
                        "Falha ao criar Git Worktree para %s (código %d): %s",
                        teammate_id,
                        res.returncode,
                        res.stderr.strip(),
                    )
            except Exception as exc:
                logger.warning("Erro ao tentar isolar workspace via Git Worktree: %s", exc)

        teammate = Teammate(
            id=teammate_id,
            name=name.strip(),
            role=role.strip(),
            project_id=project_id,
            isolated_workspace=bool(worktree_path),
            worktree_path=worktree_path,
            worktree_branch=worktree_branch,
        )
        teammate.add_log(
            f"Teammate '{teammate.name}' ({teammate.role}) inicializado com sucesso. "
            + (
                f"Workspace isolado: {worktree_path}"
                if worktree_path
                else "Workspace compartilhado."
            )
        )
        self._teammates[teammate_id] = teammate

        if self.security_core and hasattr(self.security_core, "audit"):
            self.security_core.audit.record_event(
                operation="TEAMMATE_SPAWN",
                status="COMPLETED",
                user_id="system",
                project_id=project_id,
                tool_name="teammate.spawn",
                parameters={
                    "teammate_id": teammate_id,
                    "name": name,
                    "role": role,
                    "isolated_workspace": bool(worktree_path),
                    "worktree_path": worktree_path,
                },
                reason="Inicialização de AI Teammate no workspace ACP.",
            )

        logger.info("Novo AI Teammate registrado: %s (%s)", teammate.name, teammate.id)
        return teammate

    def list_teammates(self, project_id: str | None = None) -> list[Teammate]:
        """Lista todos os teammates ou filtra por projeto."""
        all_items = list(self._teammates.values())
        if project_id:
            return [t for t in all_items if t.project_id == project_id]
        return all_items

    def get_teammate(self, teammate_id: str) -> Teammate | None:
        """Recupera um teammate específico por ID."""
        return self._teammates.get(teammate_id)

    def dispatch_task(self, teammate_id: str, task: str) -> dict[str, Any]:
        """Despacha uma tarefa para o teammate executar."""
        teammate = self.get_teammate(teammate_id)
        if not teammate:
            raise ValueError(f"Teammate '{teammate_id}' não encontrado.")

        clean_task = task.strip()
        teammate.current_task = clean_task
        teammate.status = "running"
        teammate.add_log(f"Tarefa atribuída: {clean_task}")

        # A execução autônoma de teammates ainda não está ligada a um runtime de
        # agente: o ambiente físico é preparado, mas a tarefa NÃO é executada.
        # Reportar "completed" aqui seria uma simulação apresentada como facto.
        workspace_info = (
            f"worktree isolado '{teammate.worktree_path}'"
            if teammate.isolated_workspace
            else "workspace compartilhado"
        )
        result_summary = (
            f"A tarefa '{clean_task}' não foi executada: a orquestração autônoma de "
            f"teammates ainda não está ligada ao runtime de agentes. "
            f"O ambiente ({workspace_info}) foi preparado e permanece disponível. "
            "Use o Coding Agent ou um especialista para executar o trabalho."
        )

        teammate.status = "failed"
        teammate.add_log(f"Execução não suportada: {result_summary}")

        return {
            "teammate_id": teammate.id,
            "status": teammate.status,
            "task": clean_task,
            "summary": result_summary,
            "reason": "teammate_execution_unsupported",
            "isolated_workspace": teammate.isolated_workspace,
            "worktree_path": teammate.worktree_path,
            "updated_at": teammate.updated_at,
        }

    def terminate_teammate(self, teammate_id: str) -> bool:
        """Encerra e remove o teammate do workspace ativo, limpando o Git Worktree se existir."""
        if teammate_id in self._teammates:
            teammate = self._teammates[teammate_id]
            teammate.status = "terminated"

            # Limpeza do Git Worktree se houver
            if teammate.worktree_path:
                try:
                    subprocess.run(
                        ["git", "worktree", "remove", "--force", teammate.worktree_path],
                        cwd=str(self.base_repo_path),
                        capture_output=True,
                        text=True,
                        check=False,
                    )
                    if teammate.worktree_branch:
                        subprocess.run(
                            ["git", "branch", "-D", teammate.worktree_branch],
                            cwd=str(self.base_repo_path),
                            capture_output=True,
                            text=True,
                            check=False,
                        )
                    # Caso o diretório ainda persista
                    if Path(teammate.worktree_path).exists():
                        shutil.rmtree(teammate.worktree_path, ignore_errors=True)
                except Exception as exc:
                    logger.warning("Erro na limpeza do worktree de %s: %s", teammate_id, exc)

            teammate.add_log("Teammate encerrado e recursos liberados.")
            del self._teammates[teammate_id]
            logger.info("AI Teammate encerrado: %s", teammate_id)
            return True
        return False
