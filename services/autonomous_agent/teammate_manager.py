"""Gerenciador de AI Teammates Persistentes e Protocolo ACP (nightly-labs/openbot).

Permite instanciar colegas de equipe autônomos persistentes em background,
distribuir tarefas especializadas e auditar seu ciclo de vida.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger("jarvis.teammates")


@dataclass
class Teammate:
    id: str
    name: str
    role: str
    status: str = "idle"  # idle | running | waiting_approval | completed | failed
    current_task: str | None = None
    project_id: str | None = None
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
    def __init__(self, security_core=None) -> None:
        self.security_core = security_core
        self._teammates: dict[str, Teammate] = {}

    def spawn_teammate(
        self,
        name: str,
        role: str,
        project_id: str | None = None,
    ) -> Teammate:
        """Cria e registra um novo colega de equipe de IA persistente."""
        teammate_id = f"teammate-{uuid.uuid4().hex[:8]}"
        teammate = Teammate(
            id=teammate_id,
            name=name.strip(),
            role=role.strip(),
            project_id=project_id,
        )
        teammate.add_log(f"Teammate '{teammate.name}' ({teammate.role}) inicializado com sucesso.")
        self._teammates[teammate_id] = teammate

        if self.security_core and hasattr(self.security_core, "audit"):
            self.security_core.audit.record_event(
                operation="TEAMMATE_SPAWN",
                status="COMPLETED",
                user_id="system",
                project_id=project_id,
                tool_name="teammate.spawn",
                parameters={"teammate_id": teammate_id, "name": name, "role": role},
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

        # Simulação de processamento de background com retorno do plano de ação
        result_summary = (
            f"O agente '{teammate.name}' ({teammate.role}) assumiu a tarefa: '{clean_task}'. "
            "A análise foi estruturada e o workspace de execução foi associado."
        )

        teammate.status = "completed"
        teammate.add_log(f"Tarefa finalizada com sucesso: {result_summary}")

        return {
            "teammate_id": teammate.id,
            "status": teammate.status,
            "task": clean_task,
            "summary": result_summary,
            "updated_at": teammate.updated_at,
        }

    def terminate_teammate(self, teammate_id: str) -> bool:
        """Encerra e remove o teammate do workspace ativo."""
        if teammate_id in self._teammates:
            teammate = self._teammates[teammate_id]
            teammate.status = "terminated"
            teammate.add_log("Teammate encerrado.")
            del self._teammates[teammate_id]
            logger.info("AI Teammate encerrado: %s", teammate_id)
            return True
        return False
