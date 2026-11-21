"""PostgreSQL concurrency and transaction-rollback checks for the runtime layer."""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from services.database.config import settings_from_url
from services.database.session import DatabaseRuntime
from services.memory.database import DatabaseManager

TEST_URL = os.environ.get("JARVIS_TEST_POSTGRES_URL", "")

pytestmark = pytest.mark.skipif(
    not TEST_URL,
    reason="Defina JARVIS_TEST_POSTGRES_URL para testar concorrência PostgreSQL.",
)


def _reset_and_upgrade(database_url: str) -> None:
    if not (database_url.rsplit("/", 1)[-1].split("?", 1)[0]).endswith("_test"):
        pytest.skip("A base de dados de teste PostgreSQL deve terminar em '_test'.")
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
            connection.execute(text("CREATE SCHEMA public"))
    finally:
        engine.dispose()
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "head")


def test_database_manager_connection_rolls_back_on_exception():
    _reset_and_upgrade(TEST_URL)
    settings = settings_from_url(TEST_URL)
    runtime = DatabaseRuntime.create(settings, verify=True)
    db = DatabaseManager(runtime=runtime)
    try:
        with pytest.raises(RuntimeError, match="forçar rollback"):
            with db._get_connection() as connection:
                connection.execute(
                    "INSERT INTO projects (id, name, root_path, mode, created_at, "
                    "updated_at, owner_user_id) VALUES (?, ?, ?, 'read_only', ?, ?, ?)",
                    (
                        "rollback_project",
                        "Rollback",
                        "/tmp/rollback",
                        "2026-11-21T00:00:00+00:00",
                        "2026-11-21T00:00:00+00:00",
                        "rollback_user",
                    ),
                )
                raise RuntimeError("forçar rollback")
        assert db.get_project("rollback_project", owner_user_id="rollback_user") is None
    finally:
        runtime.dispose()


def test_concurrent_writes_use_distinct_connections_and_persist():
    _reset_and_upgrade(TEST_URL)
    settings = settings_from_url(TEST_URL)
    runtime = DatabaseRuntime.create(settings, verify=True)
    db = DatabaseManager(runtime=runtime)
    workers = 16
    try:
        def write(index: int) -> int:
            worker_db = DatabaseManager(runtime=runtime)
            project_id = f"concurrent_project_{index}"
            worker_db.register_project(
                project_id,
                f"Concurrent {index}",
                f"/tmp/concurrent-{index}",
                owner_user_id=f"owner_{index}",
            )
            return worker_db.add_chat_message(
                session_id=f"concurrent_session_{index}",
                role="user",
                content=f"mensagem concorrente {index}",
                project_id=project_id,
                owner_user_id=f"owner_{index}",
            )

        with ThreadPoolExecutor(max_workers=workers) as pool:
            message_ids = list(pool.map(write, range(workers)))

        assert len(set(message_ids)) == workers
        assert len(db.list_chat_messages("concurrent_session_0", owner_user_id="owner_0")) == 1
        for index in range(workers):
            project = db.get_project(
                f"concurrent_project_{index}", owner_user_id=f"owner_{index}"
            )
            assert project is not None, index
            # Isolamento entre contas continua válido sob concorrência.
            assert (
                db.get_project(
                    f"concurrent_project_{index}", owner_user_id="owner_other"
                )
                is None
            )
    finally:
        runtime.dispose()


def test_runtime_session_scope_rolls_back_on_error():
    _reset_and_upgrade(TEST_URL)
    settings = settings_from_url(TEST_URL)
    runtime = DatabaseRuntime.create(settings, verify=True)
    try:
        with pytest.raises(RuntimeError, match="falha deliberada"):
            with runtime.session_scope() as session:
                session.execute(
                    text(
                        "INSERT INTO projects (id, name, root_path, mode, created_at, "
                        "updated_at, owner_user_id) VALUES "
                        "('session_rollback', 'Rollback', '/tmp/session', 'read_only', "
                        "now(), now(), 'session_user')"
                    )
                )
                raise RuntimeError("falha deliberada")

        with runtime.engine.connect() as connection:
            count = connection.execute(
                text("SELECT count(*) FROM projects WHERE id = 'session_rollback'")
            ).scalar_one()
        assert count == 0
    finally:
        runtime.dispose()
