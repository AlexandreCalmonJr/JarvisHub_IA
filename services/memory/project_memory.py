import json
import uuid
from datetime import UTC, datetime
from typing import Any

from services.security_core.redaction import redact_string

from .database import DatabaseManager


class LayeredMemoryManager:
    """
    Gestor de memória em camadas do JARVIS AI HUB:
    - Camada 1: Memória da Tarefa (escopo imediato da execução).
    - Camada 2: Memória do Projeto (arquitetura, convenções, decisões aceites - estritamente isolada por projeto).
    - Camada 3: Memória do Agente (preferências e procedimentos).
    Garante que segredos NUNCA sejam persistidos em memória textual.
    """

    def __init__(self, db_manager: DatabaseManager):
        self.db = db_manager
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
    ) -> None:
        """Regista um fato, decisão ou convenção do projeto com redação estrita de segredos."""
        sanitized_content = redact_string(content)
        sources_json = json.dumps(sources)
        now = datetime.now(UTC).isoformat()
        fact_id = f"mem-{uuid.uuid4().hex[:10]}"

        with self.db._get_connection() as conn:
            conn.execute(
                """
            INSERT INTO project_memory (id, project_id, category, key, content, sources_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(project_id, category, key) DO UPDATE SET
                content=excluded.content,
                sources_json=excluded.sources_json,
                updated_at=excluded.updated_at
            """,
                (fact_id, project_id, category, key, sanitized_content, sources_json, now),
            )

    def get_project_facts(
        self, project_id: str, category: str | None = None
    ) -> list[dict[str, Any]]:
        """Recupera apenas fatos pertencentes ao project_id solicitado (isolamento total entre projetos)."""
        with self.db._get_connection() as conn:
            if category:
                cur = conn.execute(
                    "SELECT category, key, content, sources_json, updated_at FROM project_memory WHERE project_id = ? AND category = ?",
                    (project_id, category),
                )
            else:
                cur = conn.execute(
                    "SELECT category, key, content, sources_json, updated_at FROM project_memory WHERE project_id = ?",
                    (project_id,),
                )

            results = []
            for r in cur.fetchall():
                item = dict(r)
                item["sources"] = json.loads(item["sources_json"])
                results.append(item)
            return results
