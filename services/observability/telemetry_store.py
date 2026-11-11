"""Persistência de telemetria de inferência com isolamento por conta.

Armazena apenas metadados operacionais. Prompts, respostas e credenciais nunca
são persistidos neste repositório de telemetria.
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


class SqliteTelemetryStore:
    """Store SQLite append-only para métricas de inferência segregadas por owner."""

    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 5000")
        return conn

    @contextmanager
    def _connection(self):
        conn = self._connect()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _initialize(self) -> None:
        with self._lock, self._connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS inference_telemetry (
                    id TEXT PRIMARY KEY,
                    owner_user_id TEXT,
                    task_id TEXT,
                    agent_role TEXT,
                    model_name TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    status TEXT NOT NULL,
                    duration_ms REAL NOT NULL DEFAULT 0,
                    prompt_tokens INTEGER NOT NULL DEFAULT 0,
                    completion_tokens INTEGER NOT NULL DEFAULT 0,
                    error_type TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_inference_telemetry_owner_created
                ON inference_telemetry(owner_user_id, created_at DESC)
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_inference_telemetry_task
                ON inference_telemetry(task_id)
                """
            )

    def record_inference(
        self,
        *,
        owner_user_id: str | None,
        task_id: str | None,
        agent_role: str | None,
        model_name: str,
        provider: str,
        status: str,
        duration_ms: float,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        error_type: str | None = None,
    ) -> str:
        if status not in {"success", "failed"}:
            raise ValueError("Invalid inference telemetry status")
        record_id = str(uuid.uuid4())
        created_at = datetime.now(UTC).isoformat()
        with self._lock, self._connection() as conn:
            conn.execute(
                """
                INSERT INTO inference_telemetry (
                    id, owner_user_id, task_id, agent_role, model_name, provider,
                    status, duration_ms, prompt_tokens, completion_tokens,
                    error_type, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record_id,
                    owner_user_id,
                    task_id,
                    agent_role,
                    model_name,
                    provider,
                    status,
                    max(0.0, float(duration_ms)),
                    max(0, int(prompt_tokens)),
                    max(0, int(completion_tokens)),
                    error_type,
                    created_at,
                ),
            )
        return record_id

    def list_for_owner(self, owner_user_id: str, limit: int = 50) -> list[dict[str, Any]]:
        if not owner_user_id or not owner_user_id.strip():
            raise ValueError("owner_user_id is required")
        safe_limit = max(1, min(int(limit), 500))
        with self._lock, self._connection() as conn:
            rows = conn.execute(
                """
                SELECT id, task_id, agent_role, model_name, provider, status,
                       duration_ms, prompt_tokens, completion_tokens, error_type, created_at
                FROM inference_telemetry
                WHERE owner_user_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (owner_user_id, safe_limit),
            ).fetchall()
        return [dict(row) for row in rows]


    def performance_by_model_for_owner(
        self,
        owner_user_id: str,
        limit: int = 100,
        minimum_samples: int = 5,
        minimum_success_rate: float = 0.95,
    ) -> list[dict[str, Any]]:
        """Agrega desempenho por modelo/provedor/papel, sempre dentro de uma conta."""
        if not owner_user_id or not owner_user_id.strip():
            raise ValueError("owner_user_id is required")
        safe_limit = max(1, min(int(limit), 100))
        safe_minimum_samples = max(1, int(minimum_samples))
        safe_success_rate = min(1.0, max(0.0, float(minimum_success_rate)))
        with self._lock, self._connection() as conn:
            rows = conn.execute(
                """
                SELECT model_name, provider, agent_role,
                       COUNT(*) AS total_inferences,
                       SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successful,
                       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
                       COALESCE(AVG(CASE WHEN status = 'success' THEN duration_ms END), 0) AS average_latency_ms,
                       COALESCE(AVG(CASE WHEN status = 'success' THEN prompt_tokens + completion_tokens END), 0) AS average_tokens
                FROM inference_telemetry
                WHERE owner_user_id = ?
                GROUP BY model_name, provider, agent_role
                ORDER BY total_inferences DESC, average_latency_ms ASC
                LIMIT ?
                """,
                (owner_user_id, safe_limit),
            ).fetchall()
        result = []
        for row in rows:
            total = int(row["total_inferences"] or 0)
            successful = int(row["successful"] or 0)
            success_rate = successful / total if total else 0.0
            result.append(
                {
                    "model_name": row["model_name"],
                    "provider": row["provider"],
                    "agent_role": row["agent_role"],
                    "total_inferences": total,
                    "successful": successful,
                    "failed": int(row["failed"] or 0),
                    "success_rate": round(success_rate, 4),
                    "average_latency_ms": round(float(row["average_latency_ms"] or 0), 2),
                    "average_tokens": round(float(row["average_tokens"] or 0), 2),
                    "sample_sufficient": total >= safe_minimum_samples,
                    "routing_eligible": (
                        total >= safe_minimum_samples
                        and success_rate >= safe_success_rate
                    ),
                }
            )
        return result

    def summary_for_owner(self, owner_user_id: str) -> dict[str, int | float]:
        if not owner_user_id or not owner_user_id.strip():
            raise ValueError("owner_user_id is required")
        with self._lock, self._connection() as conn:
            row = conn.execute(
                """
                SELECT COUNT(*) AS total_inferences,
                       SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successful,
                       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
                       COALESCE(SUM(prompt_tokens + completion_tokens), 0) AS total_tokens,
                       COALESCE(AVG(CASE WHEN status = 'success' THEN duration_ms END), 0) AS average_latency_ms
                FROM inference_telemetry
                WHERE owner_user_id = ?
                """,
                (owner_user_id,),
            ).fetchone()
        return {
            "total_inferences": int(row["total_inferences"] or 0),
            "successful": int(row["successful"] or 0),
            "failed": int(row["failed"] or 0),
            "total_tokens": int(row["total_tokens"] or 0),
            "average_latency_ms": round(float(row["average_latency_ms"] or 0), 2),
        }
