import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.main import app, workspace_service
from packages.contracts.agent import AgentRole


@pytest.mark.asyncio
async def test_api_serves_dashboard_html():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/")
        assert res.status_code == 200
        assert "JARVIS AI HUB" in res.text


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
        project_id = "site-auth-approval"
        workspace_service.delete_project(project_id)
        workspace_service.scaffold_project(
            project_id=project_id,
            name="Site Auth Approval",
            project_type="web",
            files={"index.html": "<html><head><title>Antigo</title></head><body>Login</body></html>"},
        )
        payload = {"prompt": "Alterar o endpoint de autenticação no projeto site-auth-approval e mudar o título para Login Seguro", "project_id": project_id}
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
        assert "<title>Login Seguro</title>" in (
            workspace_service.get_project_dir(project_id) / "index.html"
        ).read_text(encoding="utf-8")
        workspace_service.delete_project(project_id)


@pytest.mark.asyncio
async def test_api_chat_create_website_and_modify_file():
    from pathlib import Path

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_payload = {"prompt": "cria um site simples de cafeteria para mim com index.html e style.css"}
        create_res = await client.post("/api/v1/chat", json=create_payload)
        assert create_res.status_code == 200
        data = create_res.json()
        assert data["classified_intent"] == "project_creation"
        assert data["approval_required"] is True
        assert data["is_completed"] is False
        assert "site-cafeteria" in data["final_summary"]

        site_dir = Path("workspace/site-cafeteria")
        assert not site_dir.exists()
        create_decision = await client.post(
            f"/api/v1/approvals/{data['approval_id']}/decide",
            json={"action": "approve", "reason": "Criação aprovada no teste E2E"},
        )
        assert create_decision.status_code == 200
        assert site_dir.exists()
        assert (site_dir / "index.html").exists()
        assert (site_dir / "style.css").exists()
        assert (site_dir / "app.js").exists()
        assert (site_dir / "README.md").exists()

        mod_payload = {
            "prompt": "no site da cafeteria mude o título para Café Imperial Especial",
            "project_id": "site-cafeteria",
        }
        mod_res = await client.post("/api/v1/chat", json=mod_payload)
        assert mod_res.status_code == 200
        mod_data = mod_res.json()
        assert mod_data["classified_intent"] == "code_modification"
        assert mod_data["approval_required"] is True
        assert mod_data["is_completed"] is False

        mod_decision = await client.post(
            f"/api/v1/approvals/{mod_data['approval_id']}/decide",
            json={"action": "approve", "reason": "Alteração aprovada no teste E2E"},
        )
        assert mod_decision.status_code == 200
        updated_html = (site_dir / "index.html").read_text(encoding="utf-8")
        assert "<title>Café Imperial Especial</title>" in updated_html
        assert (site_dir / "index.html.bak").exists()
        workspace_service.delete_project("site-cafeteria")
