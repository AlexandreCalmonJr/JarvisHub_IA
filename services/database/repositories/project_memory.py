"""Project-memory repository contract and legacy SQLite adapter.

The adapter deliberately calls the public DatabaseManager API. It never opens
or exposes a sqlite3 connection, allowing the storage implementation to be
replaced without changing LayeredMemoryManager's callers.
"""

from __future__ import annotations

import json
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any, Protocol

from sqlalchemy import select

from services.database.models.project import ProjectMemory


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


class SqlAlchemyProjectMemoryRepository:
    """SQLAlchemy adapter for project memory facts."""

    def __init__(self, session_factory: Any):
        self._session_factory = session_factory

    @contextmanager
    def _session(self):
        if hasattr(self._session_factory, "begin"):
            with self._session_factory.begin() as session:
                yield session
        else:
            session = self._session_factory()
            try:
                with session.begin():
                    yield session
            finally:
                session.close()

    def save_fact(
        self,
        project_id: str,
        category: str,
        key: str,
        content: str,
        sources: list[str],
        owner_user_id: str | None = None,
    ) -> None:
        sources_str = json.dumps(sources or [], ensure_ascii=False)
        now = datetime.now(UTC)
        with self._session() as session:
            existing = session.scalar(
                select(ProjectMemory).where(
                    ProjectMemory.project_id == project_id,
                    ProjectMemory.category == category,
                    ProjectMemory.key == key,
                )
            )
            if existing is not None:
                existing.content = content
                existing.sources_json = sources_str
                existing.updated_at = now
                if owner_user_id is not None:
                    existing.owner_user_id = owner_user_id
            else:
                session.add(
                    ProjectMemory(
                        id=str(uuid.uuid4()),
                        project_id=project_id,
                        category=category,
                        key=key,
                        content=content,
                        sources_json=sources_str,
                        updated_at=now,
                        owner_user_id=owner_user_id,
                    )
                )

    def list_facts(
        self, project_id: str, category: str | None = None, owner_user_id: str | None = None
    ) -> list[dict[str, Any]]:
        stmt = select(ProjectMemory).where(ProjectMemory.project_id == project_id)
        if owner_user_id is not None:
            stmt = stmt.where(ProjectMemory.owner_user_id == owner_user_id)
        else:
            stmt = stmt.where(ProjectMemory.owner_user_id.is_(None))
        if category is not None:
            stmt = stmt.where(ProjectMemory.category == category)
        stmt = stmt.order_by(ProjectMemory.updated_at.desc())

        with self._session() as session:
            rows = session.scalars(stmt).all()

        results = []
        for r in rows:
            try:
                sources = json.loads(r.sources_json) if r.sources_json else []
            except Exception:
                sources = []
            results.append(
                {
                    "category": r.category,
                    "key": r.key,
                    "content": r.content,
                    "sources_json": r.sources_json,
                    "updated_at": (
                        r.updated_at.isoformat()
                        if hasattr(r.updated_at, "isoformat")
                        else str(r.updated_at)
                    ),
                    "sources": sources,
                }
            )
        return results
