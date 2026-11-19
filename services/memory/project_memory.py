from typing import Any

from services.database.repositories.project_memory import (
    ProjectMemoryRepository,
    SqliteProjectMemoryRepository,
)
from services.security_core.redaction import redact_string


class LayeredMemoryManager:
    """
    Gestor de memória em camadas do JARVIS AI HUB:
    - Camada 1: Memória da Tarefa (escopo imediato da execução).
    - Camada 2: Memória do Projeto (arquitetura, convenções, decisões aceites - estritamente isolada por projeto).
    - Camada 3: Memória do Agente (preferências e procedimentos).
    Garante que segredos NUNCA sejam persistidos em memória textual.
    """

    def __init__(
        self,
        db_manager: Any | None = None,
        repository: ProjectMemoryRepository | None = None,
    ):
        if repository is None and db_manager is None:
            raise ValueError("É necessário fornecer db_manager ou repository.")
        self.db = db_manager  # Mantido para compatibilidade com consumidores existentes.
        self._project_memory = repository or SqliteProjectMemoryRepository(db_manager)
        # task_id -> dict
        self._task_memory: dict[str, dict[str, Any]] = {}

    # --- Camada 1: Memória da Tarefa ---
    def set_task_context(self, task_id: str, key: str, value: Any) -> None:
        if task_id not in self._task_memory:
            self._task_memory[task_id] = {}
        self._task_memory[task_id][key] = value

    def get_task_context(self, task_id: str, key: str) -> Any | None:
        return self._task_memory.get(task_id, {}).get(key)

    def clear_task_context(self, task_id: str) -> None:
        self._task_memory.pop(task_id, None)

    # --- Camada 2: Memória do Projeto (Persistente e Isolada) ---
    def record_project_fact(
        self,
        project_id: str,
        category: str,
        key: str,
        content: str,
        sources: list[str],
        owner_user_id: str | None = None,
    ) -> None:
        """Regista um fato sem segredos, delegando a persistência ao repositório."""
        sanitized_content = redact_string(content)
        self._project_memory.save_fact(
            project_id=project_id,
            category=category,
            key=key,
            content=sanitized_content,
            sources=sources,
            owner_user_id=owner_user_id,
        )

    def get_project_facts(
        self,
        project_id: str,
        category: str | None = None,
        owner_user_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Recupera fatos do projeto solicitado, com escopo opcional de proprietário."""
        return self._project_memory.list_facts(
            project_id=project_id,
            category=category,
            owner_user_id=owner_user_id,
        )
