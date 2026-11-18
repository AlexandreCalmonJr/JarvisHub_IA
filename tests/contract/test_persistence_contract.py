"""Backend-neutral persistence contracts; SQLite is the first adapter under test.

When the PostgreSQL adapter is introduced, add its factory to the same contract
suite instead of duplicating the behavioral assertions.
"""

from __future__ import annotations

from collections.abc import Callable

import pytest

from services.database.repositories.project_memory import SqliteProjectMemoryRepository
from services.database.repositories.settings import SqliteSettingsRepository
from services.memory.database import DatabaseManager


@pytest.fixture
 def sqlite_database_factory(tmp_path) -> Callable[[], DatabaseManager]:
    def factory() -> DatabaseManager:
        return DatabaseManager(db_path=str(tmp_path / "contract.db"))

    return factory


def test_project_memory_repository_round_trip_and_owner_scope(sqlite_database_factory):
    db = sqlite_database_factory()
    repository = SqliteProjectMemoryRepository(db)
    db.register_project("project-a", "Project A", "/tmp/project-a", owner_user_id="user-a")
    db.register_project("project-b", "Project B", "/tmp/project-b", owner_user_id="user-b")

    repository.save_fact(
        project_id="project-a",
        category="architecture",
        key="database",
        content="PostgreSQL",
        sources=["adr/001.md"],
        owner_user_id="user-a",
    )
    repository.save_fact(
        project_id="project-b",
        category="architecture",
        key="database",
        content="SQLite",
        sources=["adr/002.md"],
        owner_user_id="user-b",
    )

    facts_a = repository.list_facts("project-a", owner_user_id="user-a")
    facts_b = repository.list_facts("project-b", owner_user_id="user-b")
    assert [(fact["key"], fact["content"]) for fact in facts_a] == [("database", "PostgreSQL")]
    assert [(fact["key"], fact["content"]) for fact in facts_b] == [("database", "SQLite")]
    assert facts_a[0]["sources"] == ["adr/001.md"]
    assert repository.list_facts("project-a", owner_user_id="user-b") == []


def test_settings_repository_round_trip_is_account_scoped(sqlite_database_factory):
    repository = SqliteSettingsRepository(sqlite_database_factory())
    repository.set("notification_webhooks", {"enabled": True}, owner_user_id="user-a")
    repository.set("notification_webhooks", {"enabled": False}, owner_user_id="user-b")

    assert repository.get("notification_webhooks", owner_user_id="user-a") == {"enabled": True}
    assert repository.get("notification_webhooks", owner_user_id="user-b") == {"enabled": False}
    assert repository.get("notification_webhooks", owner_user_id="user-c") is None


def test_legacy_global_settings_contract_is_preserved(sqlite_database_factory):
    repository = SqliteSettingsRepository(sqlite_database_factory())
    repository.set("notification_webhooks", {"enabled": True})

    assert repository.get("notification_webhooks") == {"enabled": True}
