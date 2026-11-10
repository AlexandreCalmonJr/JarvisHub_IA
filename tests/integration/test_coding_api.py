"""Testes de integração da API do Coding Agent (sem chamar modelos externos)."""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.deps import coding_broker
from apps.api.main import app, db_manager


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_coding_tools_endpoint_lists_modes_and_tools(client):
    resp = await client.get("/api/v1/coding/tools")
    assert resp.status_code == 200
    data = resp.json()

    assert [mode["id"] for mode in data["modes"]] == ["plan", "ask", "auto"]
    tool_names = {tool["name"] for tool in data["tools"]}
    assert {
        "read_file",
        "write_file",
        "edit_file",
        "grep",
        "run_command",
        "git_status",
        "git_diff",
    } <= tool_names
    assert all("risk" in tool for tool in data["tools"])
    assert "name" in data["provider"]


@pytest.mark.asyncio
async def test_coding_session_history_roundtrip(client):
    session_id = f"test-coding-{uuid.uuid4().hex[:8]}"
    db_manager.add_chat_message(
        session_id=session_id,
        role="user",
        content="Analise o projeto.",
    )
    db_manager.add_chat_message(
        session_id=session_id,
        role="assistant",
        content="Vou começar lendo o README.",
    )

    resp = await client.get(f"/api/v1/coding/sessions/{session_id}/messages")
    assert resp.status_code == 200
    messages = resp.json()["messages"]
    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert messages[1]["content"].startswith("Vou começar")

    resp = await client.delete(f"/api/v1/coding/sessions/{session_id}/messages")
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 2

    resp = await client.get(f"/api/v1/coding/sessions/{session_id}/messages")
    assert resp.json()["messages"] == []


@pytest.mark.asyncio
async def test_coding_approval_requires_human_decision(client):
    ticket = coding_broker.create(
        task_id=f"task-{uuid.uuid4().hex[:8]}",
        agent_role="backend_developer",
        operation="write_file",
        impact_summary="Alterar app.py",
        affected_resources=["app.py"],
        proposed_diff="--- a/app.py\n+++ b/app.py\n",
    )

    pending = await client.get("/api/v1/coding/approvals")
    assert pending.status_code == 200
    assert any(item["id"] == ticket.request_id for item in pending.json())

    resp = await client.post(
        f"/api/v1/coding/approvals/{ticket.request_id}/decide",
        json={"action": "approve", "decided_by": "local_developer"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "approved"
    assert body["approval_id"] == ticket.request_id

    # O runtime bloqueado é libertado imediatamente.
    assert ticket.resolved is True
    assert ticket.approved is True

    decided = await client.get("/api/v1/coding/approvals")
    assert not any(item["id"] == ticket.request_id for item in decided.json())


@pytest.mark.asyncio
async def test_coding_approval_rejects_invalid_action_and_unknown_id(client):
    resp = await client.post(
        "/api/v1/coding/approvals/does-not-exist/decide",
        json={"action": "maybe", "decided_by": "local_developer"},
    )
    assert resp.status_code == 400

    resp = await client.post(
        "/api/v1/coding/approvals/does-not-exist/decide",
        json={"action": "approve", "decided_by": "local_developer"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_coding_approval_forbids_agent_self_approval(client):
    ticket = coding_broker.create(
        task_id=f"task-{uuid.uuid4().hex[:8]}",
        agent_role="backend_developer",
        operation="run_command",
        impact_summary="Executar testes",
        affected_resources=["pytest"],
    )

    resp = await client.post(
        f"/api/v1/coding/approvals/{ticket.request_id}/decide",
        json={"action": "approve", "decided_by": "agent_backend_developer"},
    )
    assert resp.status_code == 403
    assert ticket.resolved is False

    # Limpa o pedido pendente para não vazar estado entre testes.
    coding_broker.cancel_ticket(ticket.request_id, reason="teste concluído")
