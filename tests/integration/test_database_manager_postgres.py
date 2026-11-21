"""Integration tests for DatabaseManager running against real PostgreSQL via PgCompatConnection."""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta

import pytest

from services.database.config import DatabaseSettings
from services.database.session import DatabaseRuntime
from services.memory.database import DatabaseManager

TEST_URL = os.environ.get("JARVIS_TEST_POSTGRES_URL", "")


@pytest.fixture
def pg_db():
    if not TEST_URL:
        pytest.skip("JARVIS_TEST_POSTGRES_URL não definida para testes PostgreSQL")
    settings = DatabaseSettings.from_env(
        {
            "JARVIS_DATABASE_BACKEND": "postgresql",
            "JARVIS_DATABASE_URL": TEST_URL,
        }
    )
    runtime = DatabaseRuntime.create(settings, verify=True)
    db = DatabaseManager(runtime=runtime)
    yield db
    runtime.dispose()


def test_postgres_workspace_and_tasks(pg_db):
    proj_id = "test_pg_proj_01"
    pg_db.delete_project(proj_id)

    pg_db.register_project(
        project_id=proj_id,
        name="Postgres Project 01",
        root_path="/tmp/test_pg_proj_01",
        mode="read_only",
        owner_user_id="user_pg_01",
    )

    proj = pg_db.get_project(proj_id, owner_user_id="user_pg_01")
    assert proj is not None
    assert proj["name"] == "Postgres Project 01"
    assert proj["owner_user_id"] == "user_pg_01"

    # Isolamento de dono
    assert pg_db.get_project(proj_id, owner_user_id="other_user") is None

    # Tarefas
    task_id = "tsk_pg_01"
    pg_db.save_task(
        task_id=task_id,
        session_id="ses_pg_01",
        prompt="Executar auditoria PostgreSQL",
        state_dict={"status": "in_progress", "step": 1},
        project_id=proj_id,
        owner_user_id="user_pg_01",
    )

    task = pg_db.get_task(task_id, owner_user_id="user_pg_01")
    assert task is not None
    assert task["prompt"] == "Executar auditoria PostgreSQL"
    assert task["state"]["step"] == 1
    assert pg_db.get_task(task_id, owner_user_id="other_user") is None


def test_postgres_chat_messages_autoincrement(pg_db):
    session_id = "chat_ses_pg_01"
    msg_id_1 = pg_db.add_chat_message(
        session_id=session_id,
        role="user",
        content="Olá Jarvis no PostgreSQL",
        owner_user_id="user_pg_01",
    )
    assert isinstance(msg_id_1, int)
    assert msg_id_1 > 0

    msg_id_2 = pg_db.add_chat_message(
        session_id=session_id,
        role="assistant",
        content="Olá! Operando com PostgreSQL nativo.",
        owner_user_id="user_pg_01",
    )
    assert isinstance(msg_id_2, int)
    assert msg_id_2 > msg_id_1

    messages = pg_db.list_chat_messages(session_id=session_id, owner_user_id="user_pg_01")
    assert len(messages) >= 2
    contents = [m["content"] for m in messages]
    assert "Olá Jarvis no PostgreSQL" in contents
    assert "Olá! Operando com PostgreSQL nativo." in contents


def test_postgres_project_and_agent_memory(pg_db):
    proj_id = "test_pg_proj_mem"
    pg_db.register_project(
        project_id=proj_id,
        name="Mem Project",
        root_path="/tmp/mem",
        owner_user_id="user_mem",
    )

    pg_db.set_project_memory(
        project_id=proj_id,
        category="architecture",
        key="database_engine",
        content="PostgreSQL 17 com pgvector",
        sources=["adr/001.md"],
        owner_user_id="user_mem",
    )

    facts = pg_db.list_project_memory(project_id=proj_id, owner_user_id="user_mem")
    assert len(facts) == 1
    assert facts[0]["key"] == "database_engine"
    assert facts[0]["content"] == "PostgreSQL 17 com pgvector"

    # Agent memory
    pg_db.set_agent_memory(
        agent_role="software_architect",
        category="decisions",
        key="db_choice",
        content="PostgreSQL com SQLAlchemy e psycopg",
        context="migration",
        importance=3,
        owner_user_id="user_mem",
    )

    mems = pg_db.list_agent_memories(
        agent_role="software_architect", category="decisions", owner_user_id="user_mem"
    )
    assert len(mems) >= 1
    assert any(m["key"] == "db_choice" for m in mems)


def test_postgres_approvals_lifecycle(pg_db):
    appr_id = "appr_pg_01"
    pg_db.save_approval(
        id=appr_id,
        task_id="task_appr_01",
        agent_role="devops",
        operation="schema_migration",
        impact_summary="Aplicar migrações Alembic",
        affected_resources=["jarvis_hub_test"],
        proposed_diff="alembic upgrade head",
        reversible=True,
        owner_user_id="user_sec",
    )

    appr = pg_db.get_approval(appr_id, owner_user_id="user_sec")
    assert appr is not None
    assert appr["status"] == "pending"

    # Atualiza decisão
    updated = pg_db.update_approval_decision(
        approval_id=appr_id,
        status="approved",
        decided_by="admin_sec",
        decision_reason="Testes aprovados",
    )
    assert updated is True

    # Consome aprovação
    consumed = pg_db.consume_approved_approval(appr_id, owner_user_id="user_sec")
    assert consumed is True
    # Segunda tentativa de consumo deve retornar False
    assert pg_db.consume_approved_approval(appr_id, owner_user_id="user_sec") is False


def test_postgres_devices_and_sessions(pg_db):
    dev_id = "dev_pg_01"
    token_hash = "hash_token_abc_123"
    pg_db.save_device(
        device_id=dev_id,
        device_name="Pixel 9 Pro",
        token_hash=token_hash,
        scopes=["chat:read", "tasks:write"],
        owner_user_id="user_dev",
    )

    dev = pg_db.get_device(dev_id)
    assert dev is not None
    assert dev["device_name"] == "Pixel 9 Pro"
    assert dev["token_hash"] == token_hash

    # Sessions
    ses_id = "usr_ses_pg_01"
    now = datetime.now(UTC)
    pg_db.save_session(
        session_id=ses_id,
        user_id="user_dev",
        role="developer",
        scopes=["all"],
        expires_at=now + timedelta(hours=8),
    )

    session = pg_db.get_session(ses_id)
    assert session is not None
    assert session["user_id"] == "user_dev"
    assert session["is_revoked"] == 0


def test_postgres_cached_inference_and_settings(pg_db):
    prompt_hash = "phash_pg_999"
    pg_db.set_cached_inference(
        prompt_hash=prompt_hash,
        prompt="Qual a vantagem do PostgreSQL?",
        model_name="qwen2.5:7b",
        response="Resposta cacheada com PostgreSQL",
    )

    cached = pg_db.get_cached_inference(prompt_hash)
    assert cached == "Resposta cacheada com PostgreSQL"

    # Settings
    pg_db.set_setting("theme_mode", {"theme": "cyberpunk"}, owner_user_id="user_cfg")
    val = pg_db.get_setting("theme_mode", owner_user_id="user_cfg")
    assert val == {"theme": "cyberpunk"}
    assert pg_db.get_setting("theme_mode", owner_user_id="other_cfg") is None
