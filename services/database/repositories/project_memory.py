"""Project-memory repository contract and legacy SQLite adapter.

The adapter deliberately calls the public DatabaseManager API. It never opens
or exposes a sqlite3 connection, allowing the storage implementation to be
replaced without changing LayeredMemoryManager's callers.
"""

from __future__ import annotations

from typing import Any, Protocol


class ProjectMemoryRepository(Protocol):
    def save_fact(
        self,
        project_id: str,
        category: str,
        key: str,
        content: str,
        sources: list[str],
        owner_user_id: str | None = None,
    ) -> None: ...

    def list_facts(
        self, project_id: str, category: str | None = None, owner_user_id: str | None = None
    ) -> list[dict[str, Any]]: ...


class SqliteProjectMemoryRepository:
    """Compatibility adapter over the existing DatabaseManager public methods."""

    def __init__(self, db_manager: Any):
        self._db = db_manager

    def save_fact(
        self,
        project_id: str,
        category: str,
        key: str,
        content: str,
        sources: list[str],
        owner_user_id: str | None = None,
    ) -> None:
        self._db.set_project_memory(
            project_id=project_id,
            category=category,
            key=key,
            content=content,
            sources=sources,
            owner_user_id=owner_user_id,
        )

    def list_facts(
        self, project_id: str, category: str | None = None, owner_user_id: str | None = None
    ) -> list[dict[str, Any]]:
        rows = self._db.list_project_memory(project_id, owner_user_id=owner_user_id)
        # Keep LayeredMemoryManager's historical result shape stable.
        return [
            {
                "category": row["category"],
                "key": row["key"],
                "content": row["content"],
                "sources_json": row.get("sources_json", "[]"),
                "updated_at": row["updated_at"],
                "sources": row.get("sources", []),
            }
            for row in rows
            if category is None or row["category"] == category
        ]
