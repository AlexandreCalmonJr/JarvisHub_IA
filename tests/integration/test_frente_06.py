"""
Testes de Integração - FRENTE 06: Backend Studio & Mock Server Nativo
Valida:
1. Criação, listagem, match e deleção de mock endpoints com status, latência e payloads JSON.
2. Inspecção de tabelas, colunas e contagem de registros em bancos SQLite de projetos.
3. Execução de queries (SELECT e DDL/DML) com medição de latência em ms.
4. Auditoria de performance com EXPLAIN QUERY PLAN e detecção de Full Table Scan com recomendação de índices.
"""

import sqlite3
from pathlib import Path
import pytest

from services.backend_studio.mock_server import MockServerService
from services.backend_studio.sql_playground import SQLPlaygroundService
from services.memory.database import DatabaseManager


@pytest.fixture
def temp_db(tmp_path: Path):
    db_file = tmp_path / "test_jarvis.db"
    db_mgr = DatabaseManager(db_path=str(db_file))
    return db_mgr


@pytest.fixture
def sample_project_sqlite(tmp_path: Path):
    """Cria um banco SQLite de exemplo simulando um projeto de backend."""
    proj_dir = tmp_path / "sample_project"
    proj_dir.mkdir(parents=True, exist_ok=True)
    db_file = proj_dir / "app.db"

    conn = sqlite3.connect(str(db_file))
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE,
            role TEXT DEFAULT 'developer'
        );
    """)
    cur.execute("""
        CREATE TABLE products (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            price REAL NOT NULL
        );
    """)
    # Insere dados de teste
    cur.executemany(
        "INSERT INTO users (name, email) VALUES (?, ?)",
        [("Alice", "alice@test.com"), ("Bob", "bob@test.com"), ("Carlos", "carlos@test.com")],
    )
    conn.commit()
    conn.close()
    return proj_dir, db_file


def test_mock_server_crud_and_serving(temp_db):
    """Valida o ciclo de vida completo do Mock Server Nativo."""
    mock_service = MockServerService(db_manager=temp_db)

    # 1. Cria endpoint simulado
    created = mock_service.create_or_update_endpoint({
        "id": "mock_users",
        "name": "Lista de Usuários",
        "method": "GET",
        "path": "/api/users",
        "status_code": 200,
        "response_body": [{"id": 1, "name": "Dev Local"}],
        "headers": {"X-Custom-Mock": "JARVIS"},
        "latency_ms": 10,
        "enabled": True,
    })

    assert created["id"] == "mock_users"
    assert created["method"] == "GET"
    assert created["path"] == "/api/users"

    # 2. Lista endpoints
    endpoints = mock_service.list_endpoints()
    assert len(endpoints) == 1
    assert endpoints[0]["name"] == "Lista de Usuários"

    # 3. Match e Serving
    match_res = mock_service.match_and_serve("GET", "/api/users")
    assert match_res is not None
    assert match_res["status_code"] == 200
    assert match_res["body"] == [{"id": 1, "name": "Dev Local"}]
    assert match_res["headers"].get("X-Custom-Mock") == "JARVIS"

    # 4. Exclui endpoint
    deleted = mock_service.delete_endpoint("mock_users")
    assert deleted is True
    assert mock_service.match_and_serve("GET", "/api/users") is None


def test_sql_playground_inspect_database(sample_project_sqlite):
    """Valida inspeção de tabelas, colunas, chaves primárias e contagem de linhas."""
    _, db_file = sample_project_sqlite
    sql_service = SQLPlaygroundService()

    inspection = sql_service.inspect_database(str(db_file))
    assert inspection["tables_count"] == 2
    table_names = [t["name"] for t in inspection["tables"]]
    assert "users" in table_names
    assert "products" in table_names

    users_tbl = next(t for t in inspection["tables"] if t["name"] == "users")
    assert users_tbl["row_count"] == 3
    col_names = [c["name"] for c in users_tbl["columns"]]
    assert "id" in col_names
    assert "name" in col_names
    assert "email" in col_names


def test_sql_playground_execute_query(sample_project_sqlite):
    """Valida execução segura de queries e medição de latência em milissegundos."""
    _, db_file = sample_project_sqlite
    sql_service = SQLPlaygroundService()

    # Executa SELECT
    res = sql_service.execute_query(str(db_file), "SELECT name, email FROM users ORDER BY name ASC")
    assert res["success"] is True
    assert res["is_select"] is True
    assert res["row_count"] == 3
    assert res["rows"][0]["name"] == "Alice"
    assert res["duration_ms"] >= 0

    # Executa INSERT / UPDATE
    update_res = sql_service.execute_query(
        str(db_file),
        "UPDATE users SET role = 'lead' WHERE name = 'Alice'",
    )
    assert update_res["success"] is True
    assert update_res["is_select"] is False
    assert update_res["affected_rows"] == 1


def test_sql_playground_audit_performance(sample_project_sqlite):
    """Valida auditoria de EXPLAIN QUERY PLAN e sugestões de índices contra Full Table Scan."""
    _, db_file = sample_project_sqlite
    sql_service = SQLPlaygroundService()

    # 1. Query sem índice que provoca Full Table Scan em users
    audit_unindexed = sql_service.audit_query_performance(
        str(db_file),
        "SELECT * FROM users WHERE role = 'developer'",
    )
    assert audit_unindexed["status"] == "audited"
    assert audit_unindexed["is_table_scan"] is True
    assert audit_unindexed["score"] < 90
    assert len(audit_unindexed["suggestions"]) >= 1
    assert audit_unindexed["suggestions"][0]["type"] == "MISSING_INDEX"
    assert "users" in audit_unindexed["suggestions"][0]["table"]

    # 2. Query que utiliza o índice UNIQUE de email
    audit_indexed = sql_service.audit_query_performance(
        str(db_file),
        "SELECT * FROM users WHERE email = 'bob@test.com'",
    )
    assert audit_indexed["status"] == "audited"
    assert audit_indexed["is_table_scan"] is False
    assert audit_indexed["score"] == 95
    assert len(audit_indexed["suggestions"]) == 0
