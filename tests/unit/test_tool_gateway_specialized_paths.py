import sqlite3

import pytest

from services.tool_gateway.specialized_tools import (
    execute_scan_sast_patterns,
    execute_scan_secrets,
    execute_sql_query_explain,
)


@pytest.mark.parametrize("scanner", [execute_scan_secrets, execute_scan_sast_patterns])
def test_scanners_reject_paths_outside_project(tmp_path, scanner):
    project = tmp_path / "project"
    project.mkdir()
    with pytest.raises(PermissionError):
        scanner(project, "../outside")


@pytest.mark.parametrize("scanner", [execute_scan_secrets, execute_scan_sast_patterns])
def test_scanners_skip_external_symlink_files(tmp_path, scanner):
    project = tmp_path / "project"
    project.mkdir()
    outside = tmp_path / "outside.py"
    outside.write_text("api_key = 'abcdefghijklmnop'", encoding="utf-8")
    try:
        (project / "external.py").symlink_to(outside)
    except (OSError, NotImplementedError):
        pytest.skip("Symlink creation is unavailable on this platform.")

    success, output, error = scanner(project, ".")
    assert success is True
    assert "external.py" not in output


def test_sql_explain_rejects_absolute_and_traversal_database_paths(tmp_path):
    project = tmp_path / "project"
    project.mkdir()
    outside = tmp_path / "outside.db"
    sqlite3.connect(outside).close()

    ok, _, message = execute_sql_query_explain("SELECT 1", project, "../outside.db")
    assert ok is False
    assert "fora do projeto" in message

    ok, _, message = execute_sql_query_explain("SELECT 1", project, str(outside))
    assert ok is False
    assert "Caminhos absolutos" in message


def test_sql_explain_uses_read_only_project_database(tmp_path):
    project = tmp_path / "project"
    project.mkdir()
    database = project / "app.db"
    with sqlite3.connect(database) as conn:
        conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY)")

    ok, output, error = execute_sql_query_explain("SELECT * FROM users", project, "app.db")
    assert ok is True
    assert "EXPLAIN QUERY PLAN" in output
    assert error == ""
