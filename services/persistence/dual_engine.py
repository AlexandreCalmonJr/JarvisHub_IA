"""SQLite persistence facade with an asynchronous write buffer.

PostgreSQL is intentionally not implemented here. The supported PostgreSQL
path is :class:`services.database.session.DatabaseRuntime` (synchronous
SQLAlchemy with psycopg), which enforces explicit configuration and
fail-closed startup. Passing a PostgreSQL URL to this class raises instead of
silently writing to SQLite.
"""

from __future__ import annotations

import logging
import os
import sqlite3
from pathlib import Path
from typing import Any

from sqlalchemy.engine import make_url

from services.database.config import DatabaseConfigurationError
from services.persistence.write_buffer import AsyncWriteBuffer

logger = logging.getLogger("jarvis.persistence.dual_engine")

_GLOBAL_ENGINE: PersistenceEngine | None = None


class PersistenceEngine:
    """SQLite engine with an asynchronous write buffer.

    Kept for backward compatibility with callers that used the historical
    name. New code should use ``DatabaseRuntime`` for PostgreSQL or the
    repository adapters for SQLite.
    """

    def __init__(
        self,
        db_path: str | Path = "data/jarvis.db",
        database_url: str | None = None,
    ):
        raw_url = (
            database_url or os.getenv("DATABASE_URL") or os.getenv("JARVIS_DATABASE_URL") or ""
        ).strip()
        self.database_url = raw_url or None
        self.engine_type = "sqlite"
        self._write_buffer: AsyncWriteBuffer | None = None
        self._running = False

        if not raw_url:
            self.db_path = Path(db_path)
            self._write_buffer = AsyncWriteBuffer(db_path=self.db_path)
            return

        backend = self._backend_name(raw_url)
        if backend == "postgresql":
            raise DatabaseConfigurationError(
                "PersistenceEngine não implementa PostgreSQL. Use "
                "services.database.session.DatabaseRuntime com uma URL "
                "postgresql+psycopg:// para o caminho suportado."
            )
        if backend != "sqlite":
            raise DatabaseConfigurationError(
                f"Backend {backend!r} não suportado; use SQLite ou PostgreSQL."
            )

        parsed = make_url(raw_url)
        if not parsed.database or parsed.database == ":memory:":
            raise DatabaseConfigurationError(
                "PersistenceEngine requer um ficheiro SQLite persistente."
            )
        self.db_path = Path(parsed.database)
        self._write_buffer = AsyncWriteBuffer(db_path=self.db_path)

    @staticmethod
    def _backend_name(url: str) -> str:
        normalized = url.strip()
        if normalized.startswith(("postgres://", "postgresql://", "postgresql+")):
            return "postgresql"
        try:
            return make_url(normalized).get_backend_name()
        except Exception as exc:
            raise DatabaseConfigurationError(
                "DATABASE_URL inválida para o PersistenceEngine."
            ) from exc

    async def start(self) -> None:
        """Initializes the SQLite write workers."""
        if self._running:
            return
        if self._write_buffer:
            await self._write_buffer.start()
        self._running = True
        logger.info("PersistenceEngine ativo em modo 'sqlite'.")

    async def stop(self) -> None:
        """Gracefully terminates the write workers."""
        if not self._running:
            return
        if self._write_buffer:
            await self._write_buffer.stop()
        self._running = False
        logger.info("PersistenceEngine parado.")

    async def write(
        self,
        sql: str,
        params: tuple[Any, ...] = (),
        wait_for_commit: bool = False,
        is_script: bool = False,
    ) -> Any:
        """Executes a write through the serialized SQLite buffer."""
        if not self._write_buffer:
            raise RuntimeError("PersistenceEngine não foi inicializado.")
        return await self._write_buffer.enqueue(
            sql=sql,
            params=params,
            wait_for_commit=wait_for_commit,
            is_script=is_script,
        )

    async def read(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        """Executes a read query and returns a list of dictionaries."""
        with sqlite3.connect(str(self.db_path), timeout=10.0) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(sql, params)
            rows = cur.fetchall()
            return [dict(row) for row in rows]

    async def read_one(self, sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        """Executes a read query and returns the first row or None."""
        rows = await self.read(sql, params)
        return rows[0] if rows else None

    def get_status(self) -> dict[str, Any]:
        """Returns engine operational status and metrics."""
        status: dict[str, Any] = {
            "engine": self.engine_type,
            "running": self._running,
            "db_path": str(self.db_path),
            "database_url_configured": bool(self.database_url),
        }
        if self._write_buffer:
            status["buffer_stats"] = {
                "items_queued": self._write_buffer.stats.items_queued,
                "items_written": self._write_buffer.stats.items_written,
                "batches_flushed": self._write_buffer.stats.batches_flushed,
                "failed_writes": self._write_buffer.stats.failed_writes,
                "avg_batch_duration_ms": round(self._write_buffer.stats.avg_batch_duration_ms, 2),
            }
        return status


def get_persistence_engine(db_path: str | Path = "data/jarvis.db") -> PersistenceEngine:
    """Returns the singleton persistence engine instance."""
    global _GLOBAL_ENGINE
    if _GLOBAL_ENGINE is None:
        _GLOBAL_ENGINE = PersistenceEngine(db_path=db_path)
    return _GLOBAL_ENGINE
