import sqlite3
from pathlib import Path

import pytest

from packages.contracts.security import ProjectWorkMode
from services.security_core import SecurityCore
from services.tool_gateway import (
    ToolExecutionRequest,
    ToolGateway,
    VectorMemoryManager,
    execute_duckdb_query,
    execute_generate_sbom,
    execute_inspect_dependencies,
    execute_scan_sast_patterns,
    execute_scan_secrets,
    execute_sql_query_explain,
)


def test_duckdb_query_execution(tmp_path: Path):
    # 1. Cria um arquivo CSV simples no projeto
    csv_file = tmp_path / "vendas.csv"
    csv_file.write_text(
        "id,produto,valor\n1,Notebook,4500.0\n2,Mouse,150.0\n3,Teclado,300.0\n", encoding="utf-8"
    )

    # 2. Executa agregação SQL analítica no DuckDB
    sql = "SELECT produto, valor FROM read_csv_auto('vendas.csv') WHERE valor > 200 ORDER BY valor DESC;"
    ok, out, err = execute_duckdb_query(sql=sql, project_root=tmp_path)

    assert ok is True
    assert err == ""
    assert "Notebook" in out
    assert "Teclado" in out
    assert "Mouse" not in out
    assert "linhas retornadas" in out


def test_duckdb_query_blocks_writes_and_multiple_statements(tmp_path: Path):
    for sql in (
        "COPY (SELECT 1) TO 'out.csv'",
        "SELECT 1; COPY (SELECT 2) TO 'out.csv'",
        "ATTACH ':memory:' AS other",
    ):
        ok, _, err = execute_duckdb_query(sql=sql, project_root=tmp_path)
        assert not ok
        assert "bloquead" in err.lower() or "somente leitura" in err.lower()
    assert not (tmp_path / "out.csv").exists()


def test_scan_secrets_detects_credentials(tmp_path: Path):
    # Cria arquivo vulnerável com chaves expostas
    code_file = tmp_path / "config.py"
    code_file.write_text(
        "AWS_KEY = 'AKIA1234567890ABCDEF'\n"
        "GITHUB_TOKEN = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'\n"
        "SAFE_VAR = 'normal_value'\n",
        encoding="utf-8",
    )

    ok, out, err = execute_scan_secrets(project_root=tmp_path)
    assert ok is True
    assert err == ""
    assert "Scan de Segredos" in out
    assert "AWS Access Key" in out
    assert "GitHub Token" in out
    # Garante que o segredo foi mascarado no relatório
    assert "AKIA...CDEF" in out or "..." in out
    assert "AKIA1234567890ABCDEF" not in out  # Nunca vaza o segredo cru


def test_scan_sast_patterns_detects_sqli_and_cmdi(tmp_path: Path):
    vulnerable_py = tmp_path / "app.py"
    vulnerable_py.write_text(
        "def query_user(user_id):\n"
        "    cursor.execute(f'SELECT * FROM users WHERE id = {user_id}')\n\n"
        "def run_ping(ip):\n"
        "    os.system('ping ' + ip)\n",
        encoding="utf-8",
    )

    ok, out, err = execute_scan_sast_patterns(project_root=tmp_path)
    assert ok is True
    assert err == ""
    assert "Auditoria SAST" in out
    assert "SQL Injection Potencial" in out
    assert "Injeção de Comando de Sistema" in out
    assert "CWE-89" in out
    assert "CWE-78" in out


def test_inspect_dependencies_and_sbom_generation(tmp_path: Path):
    req_txt = tmp_path / "requirements.txt"
    req_txt.write_text("fastapi>=0.115.0\nuvicorn==0.32.0\npydantic~=2.9.0\n", encoding="utf-8")

    # 1. Inspeção de Dependências
    ok_dep, out_dep, err_dep = execute_inspect_dependencies(project_root=tmp_path)
    assert ok_dep is True
    assert "fastapi" in out_dep
    assert "uvicorn" in out_dep
    assert "pydantic" in out_dep

    # 2. Geração de SBOM
    ok_sbom, out_sbom, err_sbom = execute_generate_sbom(project_root=tmp_path)
    assert ok_sbom is True
    assert "bomFormat" in out_sbom
    assert "CycloneDX" in out_sbom
    assert "pkg:pypi/fastapi" in out_sbom


def test_sql_query_explain(tmp_path: Path):
    db_file = tmp_path / "test.db"
    conn = sqlite3.connect(str(db_file))
    conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, name TEXT);")
    conn.execute("INSERT INTO users VALUES (1, 'admin@jarvis.local', 'Admin');")
    conn.commit()
    conn.close()

    ok, out, err = execute_sql_query_explain(
        sql="SELECT * FROM users WHERE id = 1;",
        project_root=tmp_path,
        db_filename="test.db",
    )
    assert ok is True
    assert err == ""
    assert "EXPLAIN QUERY PLAN" in out
    assert "SEARCH TABLE users" in out or "PRIMARY KEY" in out


def test_vector_memory_manager_store_and_search(tmp_path: Path):
    vec_mgr = VectorMemoryManager(db_dir=tmp_path / "vectors")

    # Vetores simulados de 4 dimensões
    v1 = [1.0, 0.0, 0.0, 0.0]
    v2 = [0.0, 1.0, 0.0, 0.0]

    stored1 = vec_mgr.store_memory(
        "memories", "Autenticação via JWT implementada", v1, {"topic": "auth"}
    )
    stored2 = vec_mgr.store_memory(
        "memories", "Pipeline de dados com DuckDB", v2, {"topic": "data"}
    )
    assert stored1 is True
    assert stored2 is True

    # Busca similar ao vetor 1
    query_v = [0.95, 0.05, 0.0, 0.0]
    results = vec_mgr.search_similar("memories", query_v, top_k=1)
    assert len(results) == 1
    assert "JWT" in results[0]["text"]
    assert results[0]["metadata"]["topic"] == "auth"


@pytest.mark.asyncio
async def test_tool_gateway_dispatches_specialized_tools(tmp_path: Path):
    sec = SecurityCore()
    sec.permission_engine.register_project(
        "proj_spec", str(tmp_path), mode=ProjectWorkMode.EDIT_APPROVED
    )

    # Cria CSV de teste
    (tmp_path / "relatorio.csv").write_text(
        "mes,faturamento\nJan,50000\nFev,75000\n", encoding="utf-8"
    )

    gateway = ToolGateway(security_core=sec)

    # Executa duckdb_query via ToolGateway
    req = ToolExecutionRequest(
        agent_role="data_scientist",
        tool_name="duckdb_query",
        arguments={
            "sql": "SELECT mes, faturamento FROM read_csv_auto('relatorio.csv') WHERE faturamento > 60000;"
        },
        project_id="proj_spec",
    )
    res = await gateway.execute_tool(req, owner_user_id="test-owner", actor_role="admin")
    assert res.success is True
    assert "Fev" in res.stdout
    assert "Jan" not in res.stdout
    assert res.duration_ms > 0


@pytest.mark.asyncio
async def test_coding_tool_executor_specialized_tools(tmp_path: Path):
    from services.coding_agent.tools import CodingToolExecutor
    from services.coding_agent.types import ToolCall

    sec = SecurityCore()
    sec.permission_engine.register_project(
        "proj_exec", str(tmp_path), mode=ProjectWorkMode.EDIT_APPROVED
    )

    (tmp_path / "requirements.txt").write_text("fastapi>=0.115.0\n", encoding="utf-8")
    (tmp_path / "leak.py").write_text("API_KEY = 'AKIA0000111122223333'\n", encoding="utf-8")

    executor = CodingToolExecutor(security_core=sec, workspace_service=None)

    # 1. Executa scan_secrets
    res_sec = await executor.execute(
        ToolCall(id="c1", name="scan_secrets", arguments={}), project_id="proj_exec"
    )
    assert res_sec.success is True
    assert "AWS Access Key" in res_sec.output

    # 2. Executa inspect_dependencies
    res_dep = await executor.execute(
        ToolCall(id="c2", name="inspect_dependencies", arguments={}), project_id="proj_exec"
    )
    assert res_dep.success is True
    assert "fastapi" in res_dep.output

    # 3. Executa generate_sbom
    res_sbom = await executor.execute(
        ToolCall(id="c3", name="generate_sbom", arguments={}), project_id="proj_exec"
    )
    assert res_sbom.success is True
    assert "CycloneDX" in res_sbom.output
