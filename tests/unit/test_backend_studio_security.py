import sqlite3
from contextlib import contextmanager

import pytest

from services.backend_studio.mock_server import MockServerService
from services.backend_studio.sql_playground import SQLPlaygroundService


class SQLiteManager:
    def __init__(self, path):
        self.path = str(path)

    @contextmanager
    def _get_connection(self):
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()


class WorkspaceStub:
    def __init__(self, project_dir):
        self.project_dir = project_dir

    def get_project_dir(self, project_id):
        assert project_id == "project-a"
        return self.project_dir


def test_mock_endpoints_are_isolated_between_accounts(tmp_path):
    manager = SQLiteManager(tmp_path / "jarvis.sqlite")
    service = MockServerService(manager)

    endpoint_a = service.create_or_update_endpoint(
        {"name": "A", "method": "GET", "path": "/api/private", "response_body": {"owner": "A"}},
        "account-a",
    )
    endpoint_b = service.create_or_update_endpoint(
        {"name": "B", "method": "GET", "path": "/api/private", "response_body": {"owner": "B"}},
        "account-b",
    )

    assert service.list_endpoints("account-a")[0]["id"] == endpoint_a["id"]
    assert service.list_endpoints("account-b")[0]["id"] == endpoint_b["id"]
    assert service.match_and_serve("GET", "/api/private", "account-a")["body"] == {"owner": "A"}
    assert service.match_and_serve("GET", "/api/private", "account-b")["body"] == {"owner": "B"}
    assert service.delete_endpoint(endpoint_a["id"], "account-b") is False
    assert service.get_endpoint(endpoint_a["id"], "account-a") is not None


def test_legacy_mock_rows_are_preserved_but_not_assigned_to_an_account(tmp_path):
    db_path = tmp_path / "legacy.sqlite"
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """CREATE TABLE mock_endpoints (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, method TEXT NOT NULL DEFAULT 'GET',
                path TEXT NOT NULL, status_code INTEGER NOT NULL DEFAULT 200,
                response_body TEXT NOT NULL, headers_json TEXT NOT NULL DEFAULT '{}',
                latency_ms INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1,
                created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL
            )"""
        )
        connection.execute(
            """INSERT INTO mock_endpoints
            (id, name, method, path, response_body, created_at, updated_at)
            VALUES ('legacy', 'Legacy', 'GET', '/legacy', '{}', 'now', 'now')"""
        )

    service = MockServerService(SQLiteManager(db_path))
    assert service.list_endpoints("account-a") == []
    assert service.list_endpoints("account-b") == []
    with sqlite3.connect(db_path) as connection:
        owner = connection.execute(
            "SELECT owner_user_id FROM mock_endpoints WHERE id = 'legacy'"
        ).fetchone()[0]
    assert owner is None


def test_sql_playground_reads_only_inside_the_selected_project(tmp_path):
    project_dir = tmp_path / "project-a"
    project_dir.mkdir()
    database = project_dir / "app.db"
    with sqlite3.connect(database) as connection:
        connection.execute("CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT)")
        connection.execute("INSERT INTO records(value) VALUES ('preserve-me')")

    service = SQLPlaygroundService(WorkspaceStub(project_dir))
    result = service.execute_query("app.db", "SELECT value FROM records", "project-a")
    assert result["success"] is True
    assert result["rows"] == [{"value": "preserve-me"}]
    assert result["read_only"] is True

    denied = service.execute_query("app.db", "UPDATE records SET value = 'changed'", "project-a")
    assert denied["success"] is False

    with sqlite3.connect(database) as connection:
        value = connection.execute("SELECT value FROM records").fetchone()[0]
    assert value == "preserve-me"


def test_sql_playground_rejects_absolute_and_traversal_paths(tmp_path):
    project_dir = tmp_path / "project-a"
    project_dir.mkdir()
    service = SQLPlaygroundService(WorkspaceStub(project_dir))

    with pytest.raises(PermissionError):
        service._resolve_db_path(str(project_dir / "secret.db"), "project-a")
    with pytest.raises(PermissionError):
        service._resolve_db_path("../outside.db", "project-a")
