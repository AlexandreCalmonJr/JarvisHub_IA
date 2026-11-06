import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


class DatabaseManager:
    """
    Gestor de persistência local SQLite do JARVIS AI HUB.
    Controla tabelas estruturadas, integridade referencial e migrações automáticas.
    """

    def __init__(self, db_path: str = "data/jarvis.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        return conn

    def _init_schema(self) -> None:
        with self._get_connection() as conn:
            conn.executescript("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                root_path TEXT NOT NULL,
                mode TEXT NOT NULL DEFAULT 'read_only',
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                project_id TEXT,
                prompt TEXT NOT NULL,
                intent TEXT,
                state_json TEXT NOT NULL,
                is_completed INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS approvals (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                agent_role TEXT NOT NULL,
                operation TEXT NOT NULL,
                impact_summary TEXT NOT NULL,
                affected_resources_json TEXT NOT NULL,
                proposed_diff TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                decided_by TEXT,
                decision_reason TEXT,
                requested_at TIMESTAMP NOT NULL,
                decided_at TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS project_memory (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                category TEXT NOT NULL,
                key TEXT NOT NULL,
                content TEXT NOT NULL,
                sources_json TEXT NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                UNIQUE(project_id, category, key),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );
            """)

    def register_project(self, project_id: str, name: str, root_path: str, mode: str = "read_only") -> None:
        now = datetime.now(UTC).isoformat()
        with self._get_connection() as conn:
            conn.execute("""
            INSERT INTO projects (id, name, root_path, mode, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name,
                root_path=excluded.root_path,
                mode=excluded.mode,
                updated_at=excluded.updated_at
            """, (project_id, name, root_path, mode, now, now))

    def save_task(
        self,
        task_id: str,
        session_id: str,
        prompt: str,
        state_dict: dict[str, Any],
        project_id: str | None = None,
    ) -> None:
        now = datetime.now(UTC).isoformat()
        state_json = json.dumps(state_dict)
        intent = state_dict.get("classified_intent")
        is_completed = 1 if state_dict.get("is_completed") else 0

        with self._get_connection() as conn:
            conn.execute(
                """
            INSERT INTO tasks (id, session_id, project_id, prompt, intent, state_json, is_completed, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                state_json=excluded.state_json,
                is_completed=excluded.is_completed,
                updated_at=excluded.updated_at
            """,
                (
                    task_id,
                    session_id,
                    project_id,
                    prompt,
                    intent,
                    state_json,
                    is_completed,
                    now,
                    now,
                ),
            )

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        with self._get_connection() as conn:
            cur = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
            row = cur.fetchone()
            if not row:
                return None
            data = dict(row)
            data["state"] = json.loads(data["state_json"])
            return data

    def list_tasks(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._get_connection() as conn:
            cur = conn.execute(
                "SELECT id, session_id, project_id, prompt, intent, is_completed, created_at FROM tasks ORDER BY created_at DESC LIMIT ?",
                (limit,),
            )
            return [dict(r) for r in cur.fetchall()]
