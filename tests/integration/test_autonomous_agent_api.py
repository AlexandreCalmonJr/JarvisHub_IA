import json

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.main import app


@pytest.mark.asyncio
async def test_autonomous_agent_history_api():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/agents/data_scientist/history?session_id=ses-test-history")
        assert resp.status_code == 200
        data = resp.json()
        assert data["agent_role"] == "data_scientist"
        assert data["session_id"] == "ses-test-history"
        assert "messages" in data


@pytest.mark.asyncio
async def test_autonomous_agent_task_api():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {
            "prompt": "Elabore um plano de arquitetura de dados",
            "mode": "plan",
            "session_id": "ses-task-ds",
        }
        resp = await ac.post("/api/v1/agents/data_scientist/task", json=payload)
        assert resp.status_code == 200
        contract = resp.json()
        assert contract["agent_role"] == "data_scientist"
        assert "summary" in contract
        assert "evidence" in contract
        assert "actions_taken" in contract
        assert "resource_usage" in contract


@pytest.mark.asyncio
async def test_autonomous_agent_stream_api():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {
            "prompt": "Revise o schema de segurança",
            "mode": "plan",
            "session_id": "ses-stream-sec",
        }
        resp = await ac.post("/api/v1/agents/cybersecurity_engineer/stream", json=payload)
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")

        events = []
        for line in resp.text.split("\n"):
            line = line.strip()
            if line.startswith("data: "):
                raw_json = line[6:]
                try:
                    events.append(json.loads(raw_json))
                except json.JSONDecodeError:
                    continue

        types = [e.get("type") for e in events]
        assert "start" in types
        assert "final" in types


@pytest.mark.asyncio
async def test_autonomous_agent_invalid_role_or_mode():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Papel inexistente -> 404
        resp404 = await ac.post("/api/v1/agents/papel_inexistente_xyz/task", json={"prompt": "teste"})
        assert resp404.status_code == 404

        # Modo inválido -> 400
        resp400 = await ac.post("/api/v1/agents/data_scientist/task", json={"prompt": "teste", "mode": "invalido"})
        assert resp400.status_code == 400
