"""Engine, session and Alembic migration checks for the database foundation."""

from __future__ import annotations

import os
from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.engine import make_url

from services.database.config import DatabaseSettings
from services.database.models import Base, UserSetting
from services.database.session import DatabaseRuntime

REPO_ROOT = Path(__file__).resolve().parents[2]


def _alembic_config(database_url: str) -> Config:
    config = Config(str(REPO_ROOT / "alembic.ini"))
    config.set_main_option(
        "script_location", str(REPO_ROOT / "services" / "database" / "migrations")
    )
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def test_runtime_commits_and_rolls_back(tmp_path):
    runtime = DatabaseRuntime.create(
        DatabaseSettings(backend="sqlite", url=f"sqlite:///{(tmp_path / 'runtime.db').as_posix()}")
    )
    try:
        Base.metadata.create_all(runtime.engine, tables=[UserSetting.__table__])

        now = datetime.now(UTC)
        with runtime.session_scope() as session:
            session.add(UserSetting(key="theme", value_json='"dark"', updated_at=now))

        with runtime.session_scope() as session:
            assert session.scalar(select(UserSetting.value_json)) == '"dark"'

        with pytest.raises(RuntimeError), runtime.session_scope() as session:
            session.add(UserSetting(key="broken", value_json="null", updated_at=now))
            raise RuntimeError("rollback")

        with runtime.session_scope() as session:
            assert session.scalar(select(UserSetting.key)) == "theme"
    finally:
        runtime.dispose()


def test_alembic_upgrade_and_downgrade_on_sqlite(tmp_path):
    db_path = tmp_path / "migrations.db"
    database_url = f"sqlite:///{db_path.as_posix()}"
    config = _alembic_config(database_url)

    command.upgrade(config, "head")

    engine = create_engine(database_url)
    try:
        tables = set(inspect(engine).get_table_names())
        assert {
            "alembic_version",
            "human_users",
            "auth_attempts",
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
        } <= tables

        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO human_users (username, username_normalized, display_name, "
                    "password_hash, role, is_active, created_at, updated_at) VALUES "
                    "('admin', 'admin', 'Admin', 'pbkdf2_sha256$x', 'admin', 1, "
                    "'2026-11-19T00:00:00+00:00', '2026-11-19T00:00:00+00:00')"
                )
            )

        assert "human_users" in inspect(engine).get_table_names()
    finally:
        engine.dispose()

    command.downgrade(config, "base")

    engine = create_engine(database_url)
    try:
        tables = set(inspect(engine).get_table_names())
        assert "human_users" not in tables
        assert "inference_telemetry" not in tables
        assert "tasks" not in tables
        assert "chat_messages" not in tables
        assert "audit_events" not in tables
        assert "learning_progress" not in tables
    finally:
        engine.dispose()


@pytest.mark.skipif(
    not os.environ.get("JARVIS_TEST_POSTGRES_URL"),
    reason="Defina JARVIS_TEST_POSTGRES_URL para testar PostgreSQL real.",
)
def test_alembic_upgrade_and_downgrade_on_postgresql():
    database_url = os.environ["JARVIS_TEST_POSTGRES_URL"]
    parsed = make_url(database_url)
    if not (parsed.database or "").endswith("_test"):
        pytest.skip("A base de dados de teste PostgreSQL deve terminar em '_test'.")

    config = _alembic_config(database_url)
    command.upgrade(config, "head")
    try:
        command.downgrade(config, "base")
    finally:
        # A base de testes é partilhada com os testes de integração; deixá-la em
        # 'base' faria os testes seguintes falharem por schema ausente.
        command.upgrade(config, "head")
