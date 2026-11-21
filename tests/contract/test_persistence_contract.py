"""Backend-neutral persistence contracts; SQLite is the first adapter under test.

When the PostgreSQL adapter is introduced, add its factory to the same contract
suite instead of duplicating the behavioral assertions.
"""

from __future__ import annotations

import os
from collections.abc import Callable

import pytest

from services.database.config import DatabaseSettings
from services.database.repositories.project_memory import (
    SqlAlchemyProjectMemoryRepository,
    SqliteProjectMemoryRepository,
)
from services.database.repositories.settings import (
    SqlAlchemySettingsRepository,
    SqliteSettingsRepository,
)
from services.database.session import DatabaseRuntime
from services.memory.database import DatabaseManager

TEST_URL = os.environ.get("JARVIS_TEST_POSTGRES_URL", "")


@pytest.fixture(params=["sqlite", "postgres"])
def database_factory(request, tmp_path) -> Callable[[], DatabaseManager]:
    if request.param == "sqlite":
        return lambda: DatabaseManager(db_path=str(tmp_path / "contract.db"))
    if not TEST_URL:
        pytest.skip("JARVIS_TEST_POSTGRES_URL não definida")
    settings = DatabaseSettings.from_env(
        {
            "JARVIS_DATABASE_BACKEND": "postgresql",
            "JARVIS_DATABASE_URL": TEST_URL,
        }
    )
    runtime = DatabaseRuntime.create(settings, verify=True)
    return lambda: DatabaseManager(runtime=runtime)


def test_project_memory_repository_round_trip_and_owner_scope(database_factory):
    db = database_factory()
    repository = SqliteProjectMemoryRepository(db)
    proj_a = f"project-a-{id(db)}"
    proj_b = f"project-b-{id(db)}"
    db.register_project(proj_a, "Project A", f"/tmp/{proj_a}", owner_user_id="user-a")
    db.register_project(proj_b, "Project B", f"/tmp/{proj_b}", owner_user_id="user-b")

    repository.save_fact(
        project_id=proj_a,
        category="architecture",
        key="database",
        content="PostgreSQL",
        sources=["adr/001.md"],
        owner_user_id="user-a",
    )
    repository.save_fact(
        project_id=proj_b,
        category="architecture",
        key="database",
        content="SQLite",
        sources=["adr/002.md"],
        owner_user_id="user-b",
    )

    facts_a = repository.list_facts(proj_a, owner_user_id="user-a")
    facts_b = repository.list_facts(proj_b, owner_user_id="user-b")
    assert [(fact["key"], fact["content"]) for fact in facts_a] == [("database", "PostgreSQL")]
    assert [(fact["key"], fact["content"]) for fact in facts_b] == [("database", "SQLite")]
    assert facts_a[0]["sources"] == ["adr/001.md"]
    assert repository.list_facts(proj_a, owner_user_id="user-b") == []
    # Omitting the owner exposes only legacy rows with no owner, never tenant data.
    assert repository.list_facts(proj_a) == []


def test_settings_repository_round_trip_is_account_scoped(database_factory):
    repository = SqliteSettingsRepository(database_factory())
    repository.set("notification_webhooks", {"enabled": True}, owner_user_id="user-a")
    repository.set("notification_webhooks", {"enabled": False}, owner_user_id="user-b")

    assert repository.get("notification_webhooks", owner_user_id="user-a") == {"enabled": True}
    assert repository.get("notification_webhooks", owner_user_id="user-b") == {"enabled": False}
    assert repository.get("notification_webhooks", owner_user_id="user-c") is None


def test_legacy_global_settings_contract_is_preserved(database_factory):
    repository = SqliteSettingsRepository(database_factory())
    repository.set("notification_webhooks", {"enabled": True})

    assert repository.get("notification_webhooks") == {"enabled": True}


def test_sqlalchemy_project_memory_and_settings_contract(tmp_path):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from services.database.models.base import Base
    from services.database.models.project import Project, ProjectMemory
    from services.database.models.settings import UserSetting

    engine = create_engine(f"sqlite:///{tmp_path / 'persistence-sa.db'}")
    Base.metadata.create_all(
        engine, tables=[Project.__table__, ProjectMemory.__table__, UserSetting.__table__]
    )
    session_factory = sessionmaker(engine, expire_on_commit=False)

    # 1. Project Memory
    memory_repo = SqlAlchemyProjectMemoryRepository(session_factory)
    memory_repo.save_fact(
        project_id="proj-1",
        category="architecture",
        key="db",
        content="PostgreSQL",
        sources=["adr/1.md"],
        owner_user_id="user-1",
    )
    memory_repo.save_fact(
        project_id="proj-2",
        category="architecture",
        key="db",
        content="SQLite",
        sources=["adr/2.md"],
        owner_user_id="user-2",
    )

    facts_1 = memory_repo.list_facts("proj-1", owner_user_id="user-1")
    assert len(facts_1) == 1
    assert facts_1[0]["key"] == "db"
    assert facts_1[0]["content"] == "PostgreSQL"
    assert facts_1[0]["sources"] == ["adr/1.md"]
    assert memory_repo.list_facts("proj-1", owner_user_id="user-2") == []

    # 2. Settings
    settings_repo = SqlAlchemySettingsRepository(session_factory)
    settings_repo.set("theme", {"mode": "dark"}, owner_user_id="user-1")
    settings_repo.set("theme", {"mode": "light"}, owner_user_id="user-2")
    settings_repo.set("global_flag", True)

    assert settings_repo.get("theme", owner_user_id="user-1") == {"mode": "dark"}
    assert settings_repo.get("theme", owner_user_id="user-2") == {"mode": "light"}
    assert settings_repo.get("theme", owner_user_id="user-3") is None
    assert settings_repo.get("global_flag") is True

    engine.dispose()
