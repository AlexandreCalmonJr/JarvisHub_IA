import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.main import app
from packages.contracts.agent import AgentRole


@pytest.mark.asyncio
async def test_api_health_check():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/system/health")
        assert res.status_code == 200
        data = res.json()
        assert "components" in data
        assert data["components"]["security_core"] == "operational"


@pytest.mark.asyncio
async def test_api_chat_analysis_planning():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {"prompt": "Analisar a arquitetura de módulos e diagramas do projeto"}
        res = await client.post("/api/v1/chat", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["classified_intent"] == "architecture_analysis"
        assert AgentRole.SOFTWARE_ARCHITECT.value in data["selected_agents"]
        assert len(data["plan_steps"]) > 0
        assert data["is_completed"] is True


@pytest.mark.asyncio
async def test_api_chat_code_modification_creates_approval():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {"prompt": "Alterar o endpoint de autenticação para adicionar novo header"}
        res = await client.post("/api/v1/chat", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["classified_intent"] == "code_modification"
        assert data["approval_required"] is True
        assert data["is_completed"] is False
        approval_id = data["approval_id"]
        assert approval_id is not None

        # Lista de aprovações pendentes
        approvals_res = await client.get("/api/v1/approvals")
        assert approvals_res.status_code == 200
        pending = approvals_res.json()
        assert any(a["id"] == approval_id for a in pending)

        # Tentativa proibida de autoaprovação por agente via API (403 Forbidden)
        forbidden_res = await client.post(
            f"/api/v1/approvals/{approval_id}/decide",
            json={"action": "approve", "decided_by": AgentRole.JARVIS_MASTER.value},
        )
        assert forbidden_res.status_code == 403

        # Aprovação legítima por utilizador humano
        valid_res = await client.post(
            f"/api/v1/approvals/{approval_id}/decide",
            json={
                "action": "approve",
                "decided_by": "tech_lead_user",
                "reason": "Aprovado em code review",
            },
        )
        assert valid_res.status_code == 200
        assert valid_res.json()["status"] == "approved"
