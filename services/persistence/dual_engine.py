"""
Dual-Engine Persistence Provider for JARVIS AI HUB.
Supports seamless switching between local SQLite (with Async Write Buffer)
and enterprise PostgreSQL 16 (via asyncpg / SQLAlchemy) based on DATABASE_URL.
"""

from __future__ import annotations

import logging
import os
import sqlite3
from pathlib import Path
from typing import Any

from services.persistence.write_buffer import AsyncWriteBuffer

logger = logging.getLogger("jarvis.persistence.dual_engine")

_GLOBAL_ENGINE: PersistenceEngine | None = None


class PersistenceEngine:
    """
    Unified dual-engine database interface.
    Defaults to zero-configuration SQLite with Async Write Buffer,
    or switches to PostgreSQL when DATABASE_URL is configured.
    """

    def __init__(
        self,
        db_path: str | Path = "data/jarvis.db",
        database_url: str | None = None,
    ):
        self.db_path = Path(db_path)
        self.database_url = (
            database_url or os.getenv("DATABASE_URL") or os.getenv("JARVIS_DATABASE_URL")
        )
        self.engine_type = "sqlite"
        self._write_buffer: AsyncWriteBuffer | None = None
        self._pg_engine: Any | None = None
        self._running = False

        if self.database_url and (
            self.database_url.startswith("postgresql://")
            or self.database_url.startswith("postgresql+asyncpg://")
            or self.database_url.startswith("postgres://")
        ):
            self.engine_type = "postgresql"
        else:
            self.engine_type = "sqlite"
            self._write_buffer = AsyncWriteBuffer(db_path=self.db_path)

    async def start(self) -> None:
        """Initializes database connections and workers."""
        if self._running:
            return

        if self.engine_type == "postgresql":
            await self._init_postgresql()
        else:
            if self._write_buffer:
                await self._write_buffer.start()

        self._running = True
        logger.info(f"PersistenceEngine active in '{self.engine_type}' mode.")

    async def stop(self) -> None:
        """Gracefully terminates workers and pools."""
        if not self._running:
            return

        if self.engine_type == "postgresql":
            if self._pg_engine:
                await self._pg_engine.dispose()
                self._pg_engine = None
        else:
            if self._write_buffer:
                await self._write_buffer.stop()

        self._running = False
        logger.info("PersistenceEngine stopped.")

    async def _init_postgresql(self) -> None:
        """Sets up SQLAlchemy async engine for PostgreSQL."""
        try:
            from sqlalchemy.ext.asyncio import create_async_engine

            url = self.database_url
            if url and url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql+asyncpg://", 1)
            elif (
                url
                and url.startswith("postgresql://")
                and not url.startswith("postgresql+asyncpg://")
            ):
                url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

            self._pg_engine = create_async_engine(
                url,
                pool_size=10,
                max_overflow=20,
                pool_pre_ping=True,
            )
            logger.info("Connected to PostgreSQL via SQLAlchemy asyncpg.")
        except ImportError:
            logger.warning(
                "asyncpg or sqlalchemy not available for PostgreSQL. Falling back to SQLite."
            )
            self.engine_type = "sqlite"
            self._write_buffer = AsyncWriteBuffer(db_path=self.db_path)
            await self._write_buffer.start()
        except Exception as e:
            logger.error(f"Failed to connect to PostgreSQL: {e}. Falling back to SQLite.")
            self.engine_type = "sqlite"
            self._write_buffer = AsyncWriteBuffer(db_path=self.db_path)
            await self._write_buffer.start()

    async def write(
        self,
        sql: str,
        params: tuple[Any, ...] = (),
        wait_for_commit: bool = False,
        is_script: bool = False,
    ) -> Any:
        """
        Executes a write query.
        Uses AsyncWriteBuffer in SQLite mode to prevent database locks.
        """
        if self.engine_type == "sqlite":
            if self._write_buffer:
                return await self._write_buffer.enqueue(
                    sql=sql,
                    params=params,
                    wait_for_commit=wait_for_commit,
                    is_script=is_script,
                )
            # Sync fallback
            with sqlite3.connect(str(self.db_path)) as conn:
                cur = conn.cursor()
                if is_script:
                    cur.executescript(sql)
                else:
                    cur.execute(sql, params)
                conn.commit()
                return cur.lastrowid
        else:
            # PostgreSQL execution
            from sqlalchemy import text

            async with self._pg_engine.begin() as conn:
                result = await conn.execute(text(sql), params)
                return result.rowcount

    async def read(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        """Executes a read query and returns a list of dictionaries."""
        if self.engine_type == "sqlite":
            with sqlite3.connect(str(self.db_path), timeout=10.0) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                cur.execute(sql, params)
                rows = cur.fetchall()
                return [dict(row) for row in rows]
        else:
            from sqlalchemy import text

            async with self._pg_engine.connect() as conn:
                result = await conn.execute(text(sql), params)
                rows = result.fetchall()
                return [dict(row._mapping) for row in rows]

    async def read_one(self, sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        """Executes a read query and returns the first row or None."""
        rows = await self.read(sql, params)
        return rows[0] if rows else None

    def get_status(self) -> dict[str, Any]:
        """Returns engine operational status and metrics."""
        status: dict[str, Any] = {
            "engine": self.engine_type,
            "running": self._running,
            "db_path": str(self.db_path) if self.engine_type == "sqlite" else None,
            "database_url_configured": bool(self.database_url),
        }
        if self.engine_type == "sqlite" and self._write_buffer:
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
