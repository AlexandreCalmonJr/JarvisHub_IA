"""SQLite adapter for the telemetry repository port.

Only operational metadata is stored. Prompts, responses and credentials are
never persisted by this repository.
"""

from __future__ import annotations

import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol

from sqlalchemy import case, func, select

from services.database.models.telemetry import (
    InferenceQualityFeedback,
    InferenceTelemetry,
    ModelSelectionDecision,
)


class TelemetryRepository(Protocol):
    def record_inference(self, **kwargs: Any) -> str: ...
    def list_for_owner(
        self, owner_user_id: str, limit: int = 50, task_id: str | None = None
    ) -> list[dict[str, Any]]: ...
    def summary_for_owner(self, owner_user_id: str) -> dict[str, int | float]: ...


class SqliteTelemetryRepository:
    """Append-only SQLite telemetry repository, isolated by account owner."""

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
                    cost_usd REAL NOT NULL DEFAULT 0,
                    error_type TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )
            columns = {
                row["name"] for row in conn.execute("PRAGMA table_info(inference_telemetry)")
            }
            if "cost_usd" not in columns:
                conn.execute(
                    "ALTER TABLE inference_telemetry ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0"
                )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS model_selection_decisions (
                    id TEXT PRIMARY KEY,
                    owner_user_id TEXT NOT NULL,
                    task_id TEXT,
                    agent_role TEXT,
                    task_capability TEXT,
                    selected_model TEXT NOT NULL,
                    selected_provider TEXT NOT NULL,
                    selection_reason TEXT NOT NULL,
                    candidate_count INTEGER NOT NULL DEFAULT 0,
                    estimated_cost_usd REAL NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                )
                """
            )
            selection_columns = {
                row["name"] for row in conn.execute("PRAGMA table_info(model_selection_decisions)")
            }
            if "estimated_cost_usd" not in selection_columns:
                conn.execute(
                    "ALTER TABLE model_selection_decisions ADD COLUMN estimated_cost_usd REAL NOT NULL DEFAULT 0"
                )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS inference_quality_feedback (
                    id TEXT PRIMARY KEY,
                    owner_user_id TEXT NOT NULL,
                    inference_id TEXT NOT NULL,
                    model_name TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    agent_role TEXT,
                    task_id TEXT,
                    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
                    created_at TEXT NOT NULL,
                    UNIQUE(owner_user_id, inference_id)
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_quality_feedback_owner_model
                ON inference_quality_feedback(owner_user_id, model_name, provider, agent_role)
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_model_selection_owner_created
                ON model_selection_decisions(owner_user_id, created_at DESC)
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
        cost_usd: float = 0.0,
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
                    cost_usd, error_type, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    max(0.0, float(cost_usd)),
                    error_type,
                    created_at,
                ),
            )
        return record_id

    def list_for_owner(
        self, owner_user_id: str, limit: int = 50, task_id: str | None = None
    ) -> list[dict[str, Any]]:
        if not owner_user_id or not owner_user_id.strip():
            raise ValueError("owner_user_id is required")
        safe_limit = max(1, min(int(limit), 500))
        with self._lock, self._connection() as conn:
            query = """
                SELECT i.id, i.task_id, i.agent_role, i.model_name, i.provider, i.status,
                       i.duration_ms, i.prompt_tokens, i.completion_tokens, i.cost_usd,
                       i.error_type, i.created_at, f.rating AS feedback_rating
                FROM inference_telemetry AS i
                LEFT JOIN inference_quality_feedback AS f
                  ON f.owner_user_id = i.owner_user_id AND f.inference_id = i.id
                WHERE i.owner_user_id = ?
            """
            params: list[Any] = [owner_user_id]
            if task_id:
                query += " AND i.task_id = ?"
                params.append(task_id)
            query += " ORDER BY i.created_at DESC LIMIT ?"
            params.append(safe_limit)
            rows = conn.execute(query, tuple(params)).fetchall()
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
                       COALESCE(AVG(CASE WHEN status = 'success' THEN prompt_tokens + completion_tokens END), 0) AS average_tokens,
                       COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
                       COALESCE(AVG(CASE WHEN status = 'success' THEN cost_usd END), 0) AS average_cost_usd
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
                    "total_cost_usd": round(float(row["total_cost_usd"] or 0), 6),
                    "average_cost_usd": round(float(row["average_cost_usd"] or 0), 6),
                    "sample_sufficient": total >= safe_minimum_samples,
                    "routing_eligible": (
                        total >= safe_minimum_samples and success_rate >= safe_success_rate
                    ),
                }
            )
        return result

    def record_model_selection(
        self,
        *,
        owner_user_id: str,
        task_id: str | None,
        agent_role: str | None,
        task_capability: str | None,
        selected_model: str,
        selected_provider: str,
        selection_reason: str,
        candidate_count: int,
        estimated_cost_usd: float = 0.0,
    ) -> str:
        if not owner_user_id or not owner_user_id.strip():
            raise ValueError("owner_user_id is required")
        record_id = str(uuid.uuid4())
        with self._lock, self._connection() as conn:
            conn.execute(
                """
                INSERT INTO model_selection_decisions (
                    id, owner_user_id, task_id, agent_role, task_capability,
                    selected_model, selected_provider, selection_reason,
                    candidate_count, estimated_cost_usd, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record_id,
                    owner_user_id,
                    task_id,
                    agent_role,
                    task_capability,
                    selected_model,
                    selected_provider,
                    selection_reason,
                    max(0, int(candidate_count)),
                    max(0.0, float(estimated_cost_usd)),
                    datetime.now(UTC).isoformat(),
                ),
            )
        return record_id

    def list_model_selections_for_owner(
        self, owner_user_id: str, limit: int = 20
    ) -> list[dict[str, Any]]:
        if not owner_user_id or not owner_user_id.strip():
            raise ValueError("owner_user_id is required")
        safe_limit = max(1, min(int(limit), 100))
        with self._lock, self._connection() as conn:
            rows = conn.execute(
                """
                SELECT id, task_id, agent_role, task_capability, selected_model,
                       selected_provider, selection_reason, candidate_count, estimated_cost_usd, created_at
                FROM model_selection_decisions
                WHERE owner_user_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (owner_user_id, safe_limit),
            ).fetchall()
        return [dict(row) for row in rows]

    def record_quality_feedback(
        self, *, owner_user_id: str, inference_id: str, rating: int
    ) -> bool:
        """Registra avaliação humana apenas para inferência bem-sucedida da própria conta."""
        if not owner_user_id or not owner_user_id.strip():
            raise ValueError("owner_user_id is required")
        if not inference_id or not inference_id.strip():
            raise ValueError("inference_id is required")
        if isinstance(rating, bool) or not 1 <= int(rating) <= 5:
            raise ValueError("rating must be between 1 and 5")
        with self._lock, self._connection() as conn:
            inference = conn.execute(
                """
                SELECT id, model_name, provider, agent_role, task_id
                FROM inference_telemetry
                WHERE id = ? AND owner_user_id = ? AND status = 'success'
                """,
                (inference_id, owner_user_id),
            ).fetchone()
            if inference is None:
                return False
            conn.execute(
                """
                INSERT INTO inference_quality_feedback (
                    id, owner_user_id, inference_id, model_name, provider,
                    agent_role, task_id, rating, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(owner_user_id, inference_id) DO UPDATE SET
                    rating = excluded.rating,
                    created_at = excluded.created_at
                """,
                (
                    str(uuid.uuid4()),
                    owner_user_id,
                    inference["id"],
                    inference["model_name"],
                    inference["provider"],
                    inference["agent_role"],
                    inference["task_id"],
                    int(rating),
                    datetime.now(UTC).isoformat(),
                ),
            )
        return True

    def quality_by_model_for_owner(
        self, owner_user_id: str, minimum_feedback: int = 3
    ) -> list[dict[str, Any]]:
        """Agrega avaliações humanas por modelo, sempre isoladas por conta."""
        if not owner_user_id or not owner_user_id.strip():
            raise ValueError("owner_user_id is required")
        minimum = max(1, int(minimum_feedback))
        with self._lock, self._connection() as conn:
            rows = conn.execute(
                """
                SELECT model_name, provider, agent_role,
                       COUNT(*) AS feedback_count,
                       AVG(rating) AS average_rating
                FROM inference_quality_feedback
                WHERE owner_user_id = ?
                GROUP BY model_name, provider, agent_role
                """,
                (owner_user_id,),
            ).fetchall()
        return [
            {
                "model_name": row["model_name"],
                "provider": row["provider"],
                "agent_role": row["agent_role"],
                "feedback_count": int(row["feedback_count"]),
                "average_rating": round(float(row["average_rating"] or 0), 3),
                "sample_sufficient": int(row["feedback_count"]) >= minimum,
            }
            for row in rows
        ]

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
                       COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
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
            "total_cost_usd": round(float(row["total_cost_usd"] or 0), 6),
            "average_latency_ms": round(float(row["average_latency_ms"] or 0), 2),
        }


class SqlAlchemyTelemetryRepository:
    """SQLAlchemy adapter for the telemetry repository port.

    Persists operational metadata to relational storage (PostgreSQL/SQLite),
    isolated strictly by account owner.
    """

    def __init__(self, session_factory):
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
        cost_usd: float = 0.0,
        error_type: str | None = None,
    ) -> str:
        if status not in {"success", "failed"}:
            raise ValueError("Invalid inference telemetry status")
        record_id = str(uuid.uuid4())
        created_at = datetime.now(UTC)
        entry = InferenceTelemetry(
            id=record_id,
            owner_user_id=owner_user_id,
            task_id=task_id,
            agent_role=agent_role,
            model_name=model_name,
            provider=provider,
            status=status,
            duration_ms=max(0.0, float(duration_ms)),
            prompt_tokens=max(0, int(prompt_tokens)),
            completion_tokens=max(0, int(completion_tokens)),
            cost_usd=max(0.0, float(cost_usd)),
            error_type=error_type,
            created_at=created_at,
        )
        with self._session() as session:
            session.add(entry)
        return record_id

    def list_for_owner(
        self, owner_user_id: str, limit: int = 50, task_id: str | None = None
    ) -> list[dict[str, Any]]:
        if not owner_user_id or not owner_user_id.strip():
            raise ValueError("owner_user_id is required")
        safe_limit = max(1, min(int(limit), 500))
        stmt = (
            select(
                InferenceTelemetry,
                InferenceQualityFeedback.rating.label("feedback_rating"),
            )
            .outerjoin(
                InferenceQualityFeedback,
                (InferenceQualityFeedback.owner_user_id == InferenceTelemetry.owner_user_id)
                & (InferenceQualityFeedback.inference_id == InferenceTelemetry.id),
            )
            .where(InferenceTelemetry.owner_user_id == owner_user_id)
        )
        if task_id:
            stmt = stmt.where(InferenceTelemetry.task_id == task_id)
        stmt = stmt.order_by(InferenceTelemetry.created_at.desc()).limit(safe_limit)

        with self._session() as session:
            results = session.execute(stmt).all()

        rows = []
        for telemetry, feedback_rating in results:
            rows.append(
                {
                    "id": telemetry.id,
                    "task_id": telemetry.task_id,
                    "agent_role": telemetry.agent_role,
                    "model_name": telemetry.model_name,
                    "provider": telemetry.provider,
                    "status": telemetry.status,
                    "duration_ms": telemetry.duration_ms,
                    "prompt_tokens": telemetry.prompt_tokens,
                    "completion_tokens": telemetry.completion_tokens,
                    "cost_usd": telemetry.cost_usd,
                    "error_type": telemetry.error_type,
                    "created_at": (
                        telemetry.created_at.isoformat()
                        if hasattr(telemetry.created_at, "isoformat")
                        else str(telemetry.created_at)
                    ),
                    "feedback_rating": feedback_rating,
                }
            )
        return rows

    def performance_by_model_for_owner(
        self,
        owner_user_id: str,
        limit: int = 100,
        minimum_samples: int = 5,
        minimum_success_rate: float = 0.95,
    ) -> list[dict[str, Any]]:
        if not owner_user_id or not owner_user_id.strip():
            raise ValueError("owner_user_id is required")
        safe_limit = max(1, min(int(limit), 100))
        safe_minimum_samples = max(1, int(minimum_samples))
        safe_success_rate = min(1.0, max(0.0, float(minimum_success_rate)))

        success_cond = InferenceTelemetry.status == "success"
        stmt = (
            select(
                InferenceTelemetry.model_name,
                InferenceTelemetry.provider,
                InferenceTelemetry.agent_role,
                func.count().label("total_inferences"),
                func.sum(case((success_cond, 1), else_=0)).label("successful"),
                func.sum(case((InferenceTelemetry.status == "failed", 1), else_=0)).label("failed"),
                func.coalesce(
                    func.avg(case((success_cond, InferenceTelemetry.duration_ms))), 0
                ).label("average_latency_ms"),
                func.coalesce(
                    func.avg(
                        case(
                            (
                                success_cond,
                                InferenceTelemetry.prompt_tokens
                                + InferenceTelemetry.completion_tokens,
                            )
                        )
                    ),
                    0,
                ).label("average_tokens"),
                func.coalesce(func.sum(InferenceTelemetry.cost_usd), 0).label("total_cost_usd"),
                func.coalesce(
                    func.avg(case((success_cond, InferenceTelemetry.cost_usd))), 0
                ).label("average_cost_usd"),
            )
            .where(InferenceTelemetry.owner_user_id == owner_user_id)
            .group_by(
                InferenceTelemetry.model_name,
                InferenceTelemetry.provider,
                InferenceTelemetry.agent_role,
            )
            .order_by(
                func.count().desc(),
                func.coalesce(
                    func.avg(case((success_cond, InferenceTelemetry.duration_ms))), 0
                ).asc(),
            )
            .limit(safe_limit)
        )

        with self._session() as session:
            rows = session.execute(stmt).all()

        result = []
        for row in rows:
            total = int(row.total_inferences or 0)
            successful = int(row.successful or 0)
            success_rate = successful / total if total else 0.0
            result.append(
                {
                    "model_name": row.model_name,
                    "provider": row.provider,
                    "agent_role": row.agent_role,
                    "total_inferences": total,
                    "successful": successful,
                    "failed": int(row.failed or 0),
                    "success_rate": round(success_rate, 4),
                    "average_latency_ms": round(float(row.average_latency_ms or 0), 2),
                    "average_tokens": round(float(row.average_tokens or 0), 2),
                    "total_cost_usd": round(float(row.total_cost_usd or 0), 6),
                    "average_cost_usd": round(float(row.average_cost_usd or 0), 6),
                    "sample_sufficient": total >= safe_minimum_samples,
                    "routing_eligible": (
                        total >= safe_minimum_samples and success_rate >= safe_success_rate
                    ),
                }
            )
        return result

    def record_model_selection(
        self,
        *,
        owner_user_id: str,
        task_id: str | None,
        agent_role: str | None,
        task_capability: str | None,
        selected_model: str,
        selected_provider: str,
        selection_reason: str,
        candidate_count: int,
        estimated_cost_usd: float = 0.0,
    ) -> str:
        if not owner_user_id or not owner_user_id.strip():
            raise ValueError("owner_user_id is required")
        record_id = str(uuid.uuid4())
        entry = ModelSelectionDecision(
            id=record_id,
            owner_user_id=owner_user_id,
            task_id=task_id,
            agent_role=agent_role,
            task_capability=task_capability,
            selected_model=selected_model,
            selected_provider=selected_provider,
            selection_reason=selection_reason,
            candidate_count=max(0, int(candidate_count)),
            estimated_cost_usd=max(0.0, float(estimated_cost_usd)),
            created_at=datetime.now(UTC),
        )
        with self._session() as session:
            session.add(entry)
        return record_id

    def list_model_selections_for_owner(
        self, owner_user_id: str, limit: int = 20
    ) -> list[dict[str, Any]]:
        if not owner_user_id or not owner_user_id.strip():
            raise ValueError("owner_user_id is required")
        safe_limit = max(1, min(int(limit), 100))
        stmt = (
            select(ModelSelectionDecision)
            .where(ModelSelectionDecision.owner_user_id == owner_user_id)
            .order_by(ModelSelectionDecision.created_at.desc())
            .limit(safe_limit)
        )
        with self._session() as session:
            entries = session.scalars(stmt).all()
        return [
            {
                "id": e.id,
                "task_id": e.task_id,
                "agent_role": e.agent_role,
                "task_capability": e.task_capability,
                "selected_model": e.selected_model,
                "selected_provider": e.selected_provider,
                "selection_reason": e.selection_reason,
                "candidate_count": e.candidate_count,
                "estimated_cost_usd": e.estimated_cost_usd,
                "created_at": (
                    e.created_at.isoformat()
                    if hasattr(e.created_at, "isoformat")
                    else str(e.created_at)
                ),
            }
            for e in entries
        ]

    def record_quality_feedback(
        self, *, owner_user_id: str, inference_id: str, rating: int
    ) -> bool:
        if not owner_user_id or not owner_user_id.strip():
            raise ValueError("owner_user_id is required")
        if not inference_id or not inference_id.strip():
            raise ValueError("inference_id is required")
        if isinstance(rating, bool) or not 1 <= int(rating) <= 5:
            raise ValueError("rating must be between 1 and 5")
        with self._session() as session:
            inf = session.scalar(
                select(InferenceTelemetry).where(
                    InferenceTelemetry.id == inference_id,
                    InferenceTelemetry.owner_user_id == owner_user_id,
                    InferenceTelemetry.status == "success",
                )
            )
            if inf is None:
                return False
            feedback = session.scalar(
                select(InferenceQualityFeedback).where(
                    InferenceQualityFeedback.owner_user_id == owner_user_id,
                    InferenceQualityFeedback.inference_id == inference_id,
                )
            )
            if feedback is not None:
                feedback.rating = int(rating)
                feedback.created_at = datetime.now(UTC)
            else:
                session.add(
                    InferenceQualityFeedback(
                        id=str(uuid.uuid4()),
                        owner_user_id=owner_user_id,
                        inference_id=inf.id,
                        model_name=inf.model_name,
                        provider=inf.provider,
                        agent_role=inf.agent_role,
                        task_id=inf.task_id,
                        rating=int(rating),
                        created_at=datetime.now(UTC),
                    )
                )
        return True

    def quality_by_model_for_owner(
        self, owner_user_id: str, minimum_feedback: int = 3
    ) -> list[dict[str, Any]]:
        if not owner_user_id or not owner_user_id.strip():
            raise ValueError("owner_user_id is required")
        minimum = max(1, int(minimum_feedback))
        stmt = (
            select(
                InferenceQualityFeedback.model_name,
                InferenceQualityFeedback.provider,
                InferenceQualityFeedback.agent_role,
                func.count().label("feedback_count"),
                func.avg(InferenceQualityFeedback.rating).label("average_rating"),
            )
            .where(InferenceQualityFeedback.owner_user_id == owner_user_id)
            .group_by(
                InferenceQualityFeedback.model_name,
                InferenceQualityFeedback.provider,
                InferenceQualityFeedback.agent_role,
            )
        )
        with self._session() as session:
            rows = session.execute(stmt).all()
        return [
            {
                "model_name": row.model_name,
                "provider": row.provider,
                "agent_role": row.agent_role,
                "feedback_count": int(row.feedback_count),
                "average_rating": round(float(row.average_rating or 0), 3),
                "sample_sufficient": int(row.feedback_count) >= minimum,
            }
            for row in rows
        ]

    def summary_for_owner(self, owner_user_id: str) -> dict[str, int | float]:
        if not owner_user_id or not owner_user_id.strip():
            raise ValueError("owner_user_id is required")
        success_cond = InferenceTelemetry.status == "success"
        stmt = select(
            func.count().label("total_inferences"),
            func.sum(case((success_cond, 1), else_=0)).label("successful"),
            func.sum(case((InferenceTelemetry.status == "failed", 1), else_=0)).label("failed"),
            func.coalesce(
                func.sum(InferenceTelemetry.prompt_tokens + InferenceTelemetry.completion_tokens), 0
            ).label("total_tokens"),
            func.coalesce(func.sum(InferenceTelemetry.cost_usd), 0).label("total_cost_usd"),
            func.coalesce(
                func.avg(case((success_cond, InferenceTelemetry.duration_ms))), 0
            ).label("average_latency_ms"),
        ).where(InferenceTelemetry.owner_user_id == owner_user_id)

        with self._session() as session:
            row = session.execute(stmt).one()
        return {
            "total_inferences": int(row.total_inferences or 0),
            "successful": int(row.successful or 0),
            "failed": int(row.failed or 0),
            "total_tokens": int(row.total_tokens or 0),
            "total_cost_usd": round(float(row.total_cost_usd or 0), 6),
            "average_latency_ms": round(float(row.average_latency_ms or 0), 2),
        }
