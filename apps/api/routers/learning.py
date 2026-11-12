from __future__ import annotations

import json
import os
import re
import sqlite3
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from apps.api.auth import Principal, require_permission
from apps.api.deps import data_dir

router = APIRouter(prefix="/api/v1/learning", tags=["learning"])
_STORE = data_dir / "learning_progress.sqlite3"
_VALID_ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


class LearningProgressPayload(BaseModel):
    completed_ids: list[str] = Field(default_factory=list, max_length=200)


def _connect() -> sqlite3.Connection:
    _STORE.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(_STORE, timeout=10)
    conn.execute("PRAGMA busy_timeout=10000")
    conn.execute(
        """CREATE TABLE IF NOT EXISTS learning_progress (
            owner_user_id TEXT PRIMARY KEY,
            completed_ids_json TEXT NOT NULL DEFAULT '[]',
            updated_at TEXT NOT NULL
        )"""
    )
    if os.name != "nt":
        try:
            os.chmod(_STORE, 0o600)
        except OSError:
            pass
    return conn


@router.get("/progress")
async def get_learning_progress(principal: Principal = Depends(require_permission("profile:read"))):
    if principal.kind != "human":
        raise HTTPException(
            status_code=403, detail="Aprendizagem disponível apenas para contas humanas."
        )
    with _connect() as conn:
        row = conn.execute(
            "SELECT completed_ids_json, updated_at FROM learning_progress WHERE owner_user_id = ?",
            (principal.subject_id,),
        ).fetchone()
    if not row:
        return {"completed_ids": [], "updated_at": None}
    try:
        completed = json.loads(row[0])
    except (TypeError, ValueError):
        completed = []
    return {"completed_ids": completed if isinstance(completed, list) else [], "updated_at": row[1]}


@router.put("/progress")
async def save_learning_progress(
    payload: LearningProgressPayload,
    principal: Principal = Depends(require_permission("profile:write")),
):
    if principal.kind != "human":
        raise HTTPException(
            status_code=403, detail="Aprendizagem disponível apenas para contas humanas."
        )
    if any(
        not isinstance(item, str) or not _VALID_ID.fullmatch(item) for item in payload.completed_ids
    ):
        raise HTTPException(
            status_code=422, detail="A lista contém identificadores de guia inválidos."
        )
    completed = sorted(set(payload.completed_ids))
    now = datetime.now(UTC).isoformat()
    with _connect() as conn:
        conn.execute(
            """INSERT INTO learning_progress(owner_user_id, completed_ids_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(owner_user_id) DO UPDATE SET
              completed_ids_json = excluded.completed_ids_json,
              updated_at = excluded.updated_at""",
            (principal.subject_id, json.dumps(completed), now),
        )
    return {"status": "saved", "completed_ids": completed, "updated_at": now}
