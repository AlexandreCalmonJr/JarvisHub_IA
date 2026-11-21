"""PostgreSQL logical backup and restore integration tests.

These tests require ``JARVIS_TEST_POSTGRES_URL`` pointing to a disposable
database whose name ends in ``_test``. The schema is reset and upgraded through
Alembic, so the test never touches the production database.
"""

from __future__ import annotations

import gzip
import json
import os
from datetime import UTC, datetime

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from services.database.backup import (
    create_postgresql_backup,
    read_postgresql_backup,
    restore_postgresql_backup,
)
from services.database.config import DatabaseConfigurationError, settings_from_url
from services.database.session import DatabaseRuntime
from services.memory.database import DatabaseManager

TEST_URL = os.environ.get("JARVIS_TEST_POSTGRES_URL", "")

pytestmark = pytest.mark.skipif(
    not TEST_URL,
    reason="Defina JARVIS_TEST_POSTGRES_URL para testar backup PostgreSQL.",
)


def _reset_schema(database_url: str) -> None:
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
            connection.execute(text("CREATE SCHEMA public"))
    finally:
        engine.dispose()


def _upgrade(database_url: str) -> None:
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "head")


def _require_test_database(database_url: str) -> str:
    if not (database_url.rsplit("/", 1)[-1].split("?", 1)[0]).endswith("_test"):
        pytest.skip("A base de dados de teste PostgreSQL deve terminar em '_test'.")
    return database_url


def test_backup_and_restore_round_trip_restores_rows_and_identity(tmp_path):
    database_url = _require_test_database(TEST_URL)
    pytest.importorskip("psycopg")
    _reset_schema(database_url)
    _upgrade(database_url)

    settings = settings_from_url(database_url)
    runtime = DatabaseRuntime.create(settings, verify=True)
    db = DatabaseManager(runtime=runtime)
    project_id = "backup_project"
    task_id = "backup_task"
    session_id = "backup_session"
    try:
        db.register_project(
            project_id,
            "Backup Project",
            "/tmp/backup_project",
            owner_user_id="backup_user",
        )
        db.save_task(
            task_id=task_id,
            session_id=session_id,
            prompt="  preservar espaços  \n",
            state_dict={"classified_intent": "backup", "is_completed": True},
            project_id=project_id,
            owner_user_id="backup_user",
        )
        first_message_id = db.add_chat_message(
            session_id=session_id,
            role="user",
            content="  conteúdo com espaços  ",
            project_id=project_id,
            owner_user_id="backup_user",
        )
        db.set_setting("theme", {"mode": "dark"}, owner_user_id="backup_user")

        backup = db.create_database_backup(tmp_path / "backups")
        assert backup.endswith(".json.gz")
        payload = read_postgresql_backup(backup)
        assert payload["alembic_revision"] == "0002_remaining_domains"
        assert payload["tables"]["projects"]
        assert payload["tables"]["chat_messages"]

        # Destruir dados para provar que o restauro os repõe.
        db.delete_project(project_id)
        assert db.get_project(project_id, owner_user_id="backup_user") is None
        with runtime.engine.begin() as connection:
            connection.execute(text("DELETE FROM chat_messages"))
            connection.execute(text("DELETE FROM user_settings"))

        restored = DatabaseManager.restore_database_backup(backup, database_url)
        try:
            project = restored.get_project(project_id, owner_user_id="backup_user")
            assert project is not None
            assert project["name"] == "Backup Project"
            task = restored.get_task(task_id, owner_user_id="backup_user")
            assert task is not None
            assert task["prompt"] == "  preservar espaços  \n"
            messages = restored.list_chat_messages(
                session_id=session_id, owner_user_id="backup_user"
            )
            assert [(m["id"], m["content"]) for m in messages] == [
                (first_message_id, "  conteúdo com espaços  ")
            ]
            assert restored.get_setting("theme", owner_user_id="backup_user") == {
                "mode": "dark"
            }
            second_message_id = restored.add_chat_message(
                session_id=session_id,
                role="assistant",
                content="depois do restauro",
                project_id=project_id,
                owner_user_id="backup_user",
            )
            assert second_message_id > first_message_id
        finally:
            restored._runtime.dispose()
    finally:
        runtime.dispose()


def test_restore_refuses_production_name_unless_explicitly_allowed(tmp_path):
    database_url = _require_test_database(TEST_URL)
    pytest.importorskip("psycopg")
    _reset_schema(database_url)
    _upgrade(database_url)

    settings = settings_from_url(database_url)
    runtime = DatabaseRuntime.create(settings, verify=True)
    try:
        db = DatabaseManager(runtime=runtime)
        db.register_project("guard_project", "Guard", "/tmp/guard", owner_user_id="guard")
        backup = db.create_database_backup(tmp_path / "backups")

        with pytest.raises(DatabaseConfigurationError, match="terminar"):
            restore_postgresql_backup(
                runtime.engine,
                backup,
                expected_database_suffix="_prod",
            )
        assert db.get_project("guard_project", owner_user_id="guard") is not None
    finally:
        runtime.dispose()


def test_corrupted_backup_is_rejected_before_restore(tmp_path):
    database_url = _require_test_database(TEST_URL)
    pytest.importorskip("psycopg")
    _reset_schema(database_url)
    _upgrade(database_url)

    settings = settings_from_url(database_url)
    runtime = DatabaseRuntime.create(settings, verify=True)
    try:
        db = DatabaseManager(runtime=runtime)
        db.register_project("corrupt_project", "Corrupt", "/tmp/corrupt", owner_user_id="u")
        backup = db.create_database_backup(tmp_path / "backups")

        with gzip.open(backup, "rb") as handle:
            payload = json.loads(handle.read().decode("utf-8"))
        payload["tables"]["projects"][0]["name"] = "Adulterado"
        corrupted = tmp_path / "corrupted.json.gz"
        with gzip.open(corrupted, "wb") as handle:
            handle.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))

        with pytest.raises(DatabaseConfigurationError, match="Checksum"):
            read_postgresql_backup(corrupted)
    finally:
        runtime.dispose()


def test_backup_file_checksum_matches_payload(tmp_path):
    database_url = _require_test_database(TEST_URL)
    pytest.importorskip("psycopg")
    _reset_schema(database_url)
    _upgrade(database_url)

    settings = settings_from_url(database_url)
    runtime = DatabaseRuntime.create(settings, verify=True)
    try:
        report = create_postgresql_backup(runtime.engine, tmp_path / "backups")
        assert report.size_bytes > 0
        assert report.alembic_revision == "0002_remaining_domains"
        assert report.payload_sha256
        assert report.file_sha256
        payload = read_postgresql_backup(report.path)
        assert payload["sha256"] == report.payload_sha256
        assert payload["created_at"] <= datetime.now(UTC).isoformat()
    finally:
        runtime.dispose()
