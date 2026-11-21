"""End-to-end SQLite → PostgreSQL import against a disposable test database.

Requires ``JARVIS_TEST_POSTGRES_URL`` pointing to a database whose name ends in
``_test``. The test owns that schema and resets it before and after running.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from services.database.config import settings_from_url
from services.database.migration.importer import MigrationError, run_migration

REPO_ROOT = Path(__file__).resolve().parents[2]
TEST_URL = os.environ.get("JARVIS_TEST_POSTGRES_URL", "")


def _require_test_database(url: str) -> str:
    parsed = make_url(url)
    if not (parsed.database or "").endswith("_test"):
        pytest.skip("A base de dados PostgreSQL de teste deve terminar em '_test'.")
    return url


def _alembic_config(database_url: str) -> Config:
    config = Config(str(REPO_ROOT / "alembic.ini"))
    config.set_main_option(
        "script_location", str(REPO_ROOT / "services" / "database" / "migrations")
    )
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def _reset_schema(database_url: str) -> None:
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(text("DROP SCHEMA public CASCADE"))
            connection.execute(text("CREATE SCHEMA public"))
    finally:
        engine.dispose()


def _write_source_tree(root: Path) -> None:
    (root / "auth").mkdir(parents=True)

    with sqlite3.connect(root / "auth" / "users.sqlite3") as connection:
        connection.execute(
            """
            CREATE TABLE human_users (
                username TEXT PRIMARY KEY COLLATE NOCASE,
                display_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            "INSERT INTO human_users VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                "Admin",
                "Administrador",
                "pbkdf2_sha256$600000$salt$hash",
                "admin",
                1,
                "2026-01-02T03:04:05+00:00",
                "2026-01-02T03:04:05+00:00",
            ),
        )

    with sqlite3.connect(root / "jarvis.db") as connection:
        connection.executescript(
            """
            CREATE TABLE projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                root_path TEXT NOT NULL,
                mode TEXT NOT NULL DEFAULT 'read_only',
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                owner_user_id TEXT
            );
            CREATE TABLE project_memory (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                category TEXT NOT NULL,
                key TEXT NOT NULL,
                content TEXT NOT NULL,
                sources_json TEXT NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                owner_user_id TEXT,
                UNIQUE(project_id, category, key)
            );
            CREATE TABLE user_settings (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at TIMESTAMP NOT NULL
            );
            """
        )
        connection.execute(
            "INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                "proj-1",
                "Projeto",
                "C:/work/proj",
                "read_only",
                "2026-01-02T03:04:05+00:00",
                "2026-01-02T03:04:05+00:00",
                "admin",
            ),
        )
        connection.execute(
            "INSERT INTO project_memory VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "mem-1",
                "proj-1",
                "decision",
                "stack",
                "FastAPI",
                "[]",
                "2026-01-02T03:04:05+00:00",
                "admin",
            ),
        )
        connection.execute(
            "INSERT INTO user_settings VALUES (?, ?, ?)",
            ("theme", '"dark"', "2026-01-02T03:04:05+00:00"),
        )
        connection.executescript(
            """
            CREATE TABLE tasks (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                project_id TEXT,
                prompt TEXT NOT NULL,
                intent TEXT,
                state_json TEXT NOT NULL,
                is_completed INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                owner_user_id TEXT
            );
            CREATE TABLE chat_messages (
                id INTEGER PRIMARY KEY,
                session_id TEXT NOT NULL,
                project_id TEXT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                tool_calls_json TEXT,
                tool_call_id TEXT,
                tool_name TEXT,
                created_at TEXT NOT NULL,
                owner_user_id TEXT
            );
            CREATE TABLE approvals (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                agent_role TEXT NOT NULL,
                operation TEXT NOT NULL,
                impact_summary TEXT NOT NULL,
                affected_resources_json TEXT NOT NULL,
                proposed_diff TEXT,
                status TEXT NOT NULL,
                decided_by TEXT,
                decision_reason TEXT,
                requested_at TEXT NOT NULL,
                decided_at TEXT,
                reversible INTEGER NOT NULL,
                owner_user_id TEXT
            );
            CREATE TABLE agent_memories (
                id TEXT PRIMARY KEY,
                agent_role TEXT NOT NULL,
                category TEXT NOT NULL,
                key TEXT NOT NULL,
                content TEXT NOT NULL,
                context TEXT,
                importance INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                owner_user_id TEXT
            );
            CREATE TABLE agent_configs (
                role TEXT PRIMARY KEY,
                system_prompt TEXT,
                preferred_model TEXT,
                allowed_tools_json TEXT,
                is_read_only INTEGER NOT NULL,
                assigned_key_id TEXT,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE agent_route_assignments (
                owner_user_id TEXT NOT NULL,
                agent_role TEXT NOT NULL,
                key_id TEXT NOT NULL,
                model TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (owner_user_id, agent_role)
            );
            CREATE TABLE user_skills (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                version TEXT NOT NULL,
                origin TEXT NOT NULL,
                domain TEXT NOT NULL,
                description TEXT NOT NULL,
                instructions TEXT NOT NULL,
                assigned_agents_json TEXT NOT NULL,
                is_approved INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                owner_user_id TEXT
            );
            CREATE TABLE knowledge_vault (
                id TEXT PRIMARY KEY,
                doc_name TEXT NOT NULL,
                file_type TEXT NOT NULL,
                category TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                content TEXT NOT NULL,
                file_size_formatted TEXT,
                source_path TEXT,
                created_at TEXT NOT NULL,
                owner_user_id TEXT
            );
            CREATE TABLE mobile_devices (
                device_id TEXT PRIMARY KEY,
                device_name TEXT NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                scopes_json TEXT NOT NULL,
                is_revoked INTEGER NOT NULL,
                paired_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                owner_user_id TEXT
            );
            CREATE TABLE user_sessions (
                session_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL,
                scopes_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                is_revoked INTEGER NOT NULL
            );
            CREATE TABLE audit_events (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                severity TEXT NOT NULL,
                user_id TEXT,
                agent_role TEXT,
                project_id TEXT,
                operation TEXT NOT NULL,
                tool_name TEXT,
                parameters_redacted_json TEXT,
                status TEXT NOT NULL,
                reason TEXT
            );
            CREATE TABLE mock_endpoints (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                method TEXT NOT NULL,
                path TEXT NOT NULL,
                status_code INTEGER NOT NULL,
                response_body TEXT NOT NULL,
                headers_json TEXT NOT NULL,
                latency_ms INTEGER NOT NULL,
                enabled INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                owner_user_id TEXT
            );
            CREATE TABLE inference_cache (
                prompt_hash TEXT PRIMARY KEY,
                prompt TEXT NOT NULL,
                model_name TEXT NOT NULL,
                response_text TEXT NOT NULL,
                created_at TEXT NOT NULL,
                hit_count INTEGER NOT NULL
            );
            """
        )
        connection.execute(
            "INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "task-1",
                "sess-1",
                "proj-1",
                "  prompt com espaços  \n",
                "build",
                '{"x": 1}',
                1,
                "2026-01-02T03:04:05+00:00",
                "2026-01-02T03:04:05+00:00",
                None,
            ),
        )
        connection.execute(
            "INSERT INTO chat_messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                7,
                "chat-1",
                "proj-1",
                "user",
                "  conteúdo  ",
                None,
                None,
                None,
                "2026-01-02T03:04:05+00:00",
                "admin",
            ),
        )
        connection.execute(
            "INSERT INTO approvals VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "appr-1",
                "task-1",
                "developer",
                "write",
                "Resumo",
                '["a.py"]',
                "  -a\n+b  ",
                "pending",
                None,
                None,
                "2026-01-02T03:04:05+00:00",
                None,
                1,
                None,
            ),
        )
        connection.execute(
            "INSERT INTO agent_memories VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "mem-1",
                "developer",
                "decision",
                "stack",
                "  memória  ",
                None,
                3,
                "2026-01-02T03:04:05+00:00",
                "2026-01-02T03:04:05+00:00",
                None,
            ),
        )
        connection.execute(
            "INSERT INTO agent_configs VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                "developer",
                "  prompt  ",
                "model",
                '["read_file"]',
                1,
                None,
                "2026-01-02T03:04:05+00:00",
            ),
        )
        connection.execute(
            "INSERT INTO agent_route_assignments VALUES (?, ?, ?, ?, ?)",
            (
                "admin",
                "developer",
                "key-1",
                "model",
                "2026-01-02T03:04:05+00:00",
            ),
        )
        connection.execute(
            "INSERT INTO user_skills VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "skill-1",
                "Skill",
                "1.0.0",
                "user_created",
                "test",
                "  desc  ",
                "  instruções  ",
                '["developer"]',
                1,
                "2026-01-02T03:04:05+00:00",
                "2026-01-02T03:04:05+00:00",
                "admin",
            ),
        )
        connection.execute(
            "INSERT INTO knowledge_vault VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "kv-1",
                "manual",
                "md",
                "geral",
                0,
                "  knowledge  ",
                "1 KB",
                "C:/x.md",
                "2026-01-02T03:04:05+00:00",
                "admin",
            ),
        )
        connection.execute(
            "INSERT INTO mobile_devices VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "dev-1",
                "Telefone",
                "hash-1",
                '["chat:read"]',
                0,
                "2026-01-02T03:04:05+00:00",
                "2026-01-02T03:04:05+00:00",
                "admin",
            ),
        )
        connection.execute(
            "INSERT INTO user_sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "sess-1",
                "telegram_1234",
                "admin",
                '["*"]',
                "2026-01-02T03:04:05+00:00",
                "2026-01-02T04:04:05+00:00",
                "2026-01-02T03:04:05+00:00",
                0,
            ),
        )
        connection.execute(
            "INSERT INTO audit_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "aud-1",
                "2026-01-02T03:04:05+00:00",
                "INFO",
                "system",
                None,
                None,
                "LOGIN",
                None,
                "{}",
                "SUCCESS",
                "  motivo  ",
            ),
        )
        connection.execute(
            "INSERT INTO mock_endpoints VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "mock-1",
                "Mock",
                "GET",
                "/x",
                200,
                "  corpo  ",
                "{}",
                10,
                1,
                "2026-01-02T03:04:05+00:00",
                "2026-01-02T03:04:05+00:00",
                "admin",
            ),
        )
        connection.execute(
            "INSERT INTO inference_cache VALUES (?, ?, ?, ?, ?, ?)",
            (
                "hash-1",
                "  pergunta  ",
                "model",
                "  resposta  ",
                "2026-01-02T03:04:05+00:00",
                2,
            ),
        )

    with sqlite3.connect(root / "learning_progress.sqlite3") as connection:
        connection.execute(
            """
            CREATE TABLE learning_progress (
                owner_user_id TEXT PRIMARY KEY,
                completed_ids_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            "INSERT INTO learning_progress VALUES (?, ?, ?)",
            ("admin", '["lesson-1"]', "2026-01-02T03:04:05+00:00"),
        )

    with sqlite3.connect(root / "telemetry.db") as connection:
        connection.executescript(
            """
            CREATE TABLE inference_telemetry (
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
            );
            CREATE TABLE model_selection_decisions (
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
            );
            CREATE TABLE inference_quality_feedback (
                id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL,
                inference_id TEXT NOT NULL,
                model_name TEXT NOT NULL,
                provider TEXT NOT NULL,
                agent_role TEXT,
                task_id TEXT,
                rating INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(owner_user_id, inference_id)
            );
            """
        )
        connection.execute(
            "INSERT INTO inference_telemetry VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "inf-1",
                "admin",
                "task-1",
                "developer",
                "model",
                "provider",
                "success",
                12.5,
                10,
                5,
                0.001,
                None,
                "2026-01-02T03:04:05+00:00",
            ),
        )
        connection.execute(
            "INSERT INTO model_selection_decisions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "sel-1",
                "admin",
                "task-1",
                "developer",
                "code",
                "model",
                "provider",
                "best score",
                2,
                0.001,
                "2026-01-02T03:04:05+00:00",
            ),
        )
        connection.execute(
            "INSERT INTO inference_quality_feedback VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "fb-1",
                "admin",
                "inf-1",
                "model",
                "provider",
                "developer",
                "task-1",
                5,
                "2026-01-02T03:04:05+00:00",
            ),
        )


def _add_invalid_feedback(root: Path) -> None:
    with sqlite3.connect(root / "telemetry.db") as connection:
        connection.execute(
            "INSERT INTO inference_quality_feedback VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "fb-invalid",
                "admin",
                "inf-missing",
                "model",
                "provider",
                "developer",
                "task-1",
                9,
                "2026-01-02T03:04:05+00:00",
            ),
        )


def _counts(database_url: str) -> dict[str, int]:
    engine = create_engine(database_url)
    try:
        with engine.connect() as connection:
            return {
                table: int(connection.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar() or 0)
                for table in (
                    "human_users",
                    "projects",
                    "project_memory",
                    "user_settings",
                    "inference_telemetry",
                    "model_selection_decisions",
                    "inference_quality_feedback",
                    "tasks",
                    "chat_messages",
                    "approvals",
                    "agent_memories",
                    "agent_configs",
                    "agent_route_assignments",
                    "user_skills",
                    "knowledge_vault",
                    "mobile_devices",
                    "user_sessions",
                    "audit_events",
                    "mock_endpoints",
                    "learning_progress",
                    "inference_cache",
                )
            }
    finally:
        engine.dispose()


def _scalar(database_url: str, statement: str) -> object:
    engine = create_engine(database_url)
    try:
        with engine.connect() as connection:
            return connection.execute(text(statement)).scalar()
    finally:
        engine.dispose()


@pytest.mark.skipif(
    not TEST_URL,
    reason="Defina JARVIS_TEST_POSTGRES_URL para testar a importação real.",
)
def test_sqlite_to_postgres_import_is_copy_based_idempotent_and_fail_closed(tmp_path):
    database_url = _require_test_database(TEST_URL)
    pytest.importorskip("psycopg")
    _reset_schema(database_url)
    config = _alembic_config(database_url)
    command.upgrade(config, "head")

    source = tmp_path / "data"
    _write_source_tree(source)
    backup_dir = tmp_path / "backups"
    settings = settings_from_url(database_url)

    try:
        dry_run = run_migration(
            settings,
            source_dir=source,
            backup_dir=backup_dir,
            dry_run=True,
        )
        assert dry_run.status == "dry_run"
        assert dry_run.alembic_revision == "0002_remaining_domains"
        assert all(table.inserted == 0 for table in dry_run.tables.values())
        assert all(count == 0 for count in _counts(database_url).values())
        assert dry_run.copies and all(copy["quick_check"] == "ok" for copy in dry_run.copies)
        assert "inference_cache" not in dry_run.tables

        report = run_migration(settings, source_dir=source, backup_dir=backup_dir)
        assert report.status == "success"
        for table in (
            "human_users",
            "projects",
            "project_memory",
            "user_settings",
            "inference_telemetry",
            "model_selection_decisions",
            "inference_quality_feedback",
            "tasks",
            "chat_messages",
            "approvals",
            "agent_memories",
            "agent_configs",
            "agent_route_assignments",
            "user_skills",
            "knowledge_vault",
            "mobile_devices",
            "user_sessions",
            "audit_events",
            "mock_endpoints",
            "learning_progress",
        ):
            assert report.tables[table].inserted == 1, table
        assert "inference_cache" not in report.tables
        assert report.checks == {
            "project_memory_orphans": 0,
            "inference_feedback_orphans": 0,
            "human_users_duplicate_normalized": 0,
            "tasks_project_orphans": 0,
            "chat_messages_project_orphans": 0,
            "approvals_task_orphans": 0,
            "identity_sequences": {"auth_attempts": 0, "chat_messages": 7},
        }

        counts = _counts(database_url)
        assert counts["inference_cache"] == 0
        assert all(count == 1 for table, count in counts.items() if table != "inference_cache")
        assert _scalar(database_url, "SELECT username_normalized FROM human_users") == "admin"
        assert _scalar(database_url, "SELECT is_active FROM human_users") is True
        assert _scalar(database_url, "SELECT owner_user_id FROM projects") == "admin"
        assert _scalar(database_url, "SELECT content FROM project_memory") == "FastAPI"
        assert _scalar(database_url, "SELECT value_json FROM user_settings") == '"dark"'
        assert _scalar(database_url, "SELECT status FROM inference_telemetry") == "success"
        assert _scalar(database_url, "SELECT rating FROM inference_quality_feedback") == 5
        assert _scalar(database_url, "SELECT prompt FROM tasks") == "  prompt com espaços  \n"
        assert _scalar(database_url, "SELECT is_completed FROM tasks") is True
        assert _scalar(database_url, "SELECT content FROM chat_messages") == "  conteúdo  "
        assert _scalar(database_url, "SELECT proposed_diff FROM approvals") == "  -a\n+b  "
        assert _scalar(database_url, "SELECT content FROM agent_memories") == "  memória  "
        assert _scalar(database_url, "SELECT is_read_only FROM agent_configs") is True
        assert _scalar(database_url, "SELECT user_id FROM user_sessions") == "telegram_1234"
        assert _scalar(database_url, "SELECT is_revoked FROM mobile_devices") is False
        assert _scalar(database_url, "SELECT reason FROM audit_events") == "  motivo  "
        assert (
            _scalar(database_url, "SELECT completed_ids_json FROM learning_progress")
            == '["lesson-1"]'
        )

        with create_engine(database_url).begin() as connection:
            next_id = connection.execute(
                text(
                    "INSERT INTO chat_messages (session_id, role, content, created_at) "
                    "VALUES ('seq-check', 'user', 'x', now()) RETURNING id"
                )
            ).scalar()
            connection.execute(text("DELETE FROM chat_messages WHERE id = :id"), {"id": next_id})
        assert next_id == 8

        repeated = run_migration(
            settings,
            source_dir=source,
            backup_dir=backup_dir,
            allow_non_empty=True,
        )
        assert repeated.status == "success"
        assert all(table.inserted == 0 for table in repeated.tables.values())
        assert repeated.tables["human_users"].skipped_existing == 1
        assert _counts(database_url) == counts

        cache_report = run_migration(
            settings,
            source_dir=source,
            backup_dir=backup_dir,
            allow_non_empty=True,
            include_inference_cache=True,
        )
        assert cache_report.status == "success"
        assert cache_report.tables["inference_cache"].inserted == 1
        assert _scalar(database_url, "SELECT prompt FROM inference_cache") == "  pergunta  "
        assert _scalar(database_url, "SELECT hit_count FROM inference_cache") == 2
        counts_with_cache = _counts(database_url)
        assert counts_with_cache["inference_cache"] == 1

        _add_invalid_feedback(source)
        with pytest.raises(MigrationError, match="Linhas inválidas"):
            run_migration(
                settings,
                source_dir=source,
                backup_dir=backup_dir,
                allow_non_empty=True,
            )
        assert _counts(database_url) == counts_with_cache
    finally:
        _reset_schema(database_url)
