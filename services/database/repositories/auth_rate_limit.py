"""Persistent authentication rate-limit repository."""
from __future__ import annotations

import logging
import sqlite3
import time
from pathlib import Path
from typing import Protocol

logger = logging.getLogger("jarvis.auth.rate_limit")


class AuthRateLimitRepository(Protocol):
    def allow_attempt(self, *, key: str, limit: int, window_seconds: int) -> bool: ...


class SqliteAuthRateLimitRepository:
    """Atomic SQLite adapter preserving BEGIN IMMEDIATE and fail-closed behavior."""

    def __init__(self, database_path: Path | str):
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.database_path, timeout=5, isolation_level=None)
        conn.execute("PRAGMA busy_timeout=5000")
        return conn

    def _initialize(self) -> None:
        conn = self._connect()
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS auth_attempts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    bucket_key TEXT NOT NULL,
                    attempted_at REAL NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_auth_attempts_key_time
                ON auth_attempts(bucket_key, attempted_at)
                """
            )
        finally:
            conn.close()

    def allow_attempt(self, *, key: str, limit: int, window_seconds: int) -> bool:
        now = time.time()
        cutoff = now - window_seconds
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                "DELETE FROM auth_attempts WHERE attempted_at < ?",
                (now - max(window_seconds * 4, 3600),),
            )
            count = conn.execute(
                """
                SELECT COUNT(*) FROM auth_attempts
                WHERE bucket_key = ? AND attempted_at >= ?
                """,
                (key, cutoff),
            ).fetchone()[0]
            if count >= limit:
                conn.commit()
                return False
            conn.execute(
                "INSERT INTO auth_attempts(bucket_key, attempted_at) VALUES (?, ?)",
                (key, now),
            )
            conn.commit()
            return True
        except sqlite3.Error:
            conn.rollback()
            logger.exception("Rate limiter persistente indisponível; tentativa bloqueada.")
            return False
        finally:
            conn.close()
