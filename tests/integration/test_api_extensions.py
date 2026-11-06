import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.main import app, db_manager


@pytest.mark.asyncio
async def test_api_resources_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/system/resources")
        assert resp.status_code == 200
        data = resp.json()
        assert "cpu_percent" in data
        assert "ram_percent" in data
        assert "disk_free_gb" in data
        assert "inference_queue_active" in data
        assert data["offline_mode_active"] is True


@pytest.mark.asyncio
async def test_api_models_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/models")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["models"]) == 3
        assert data["concurrency_limit"] == 1
        assert any(m["name"] == "llama3.2:3b" for m in data["models"])


@pytest.mark.asyncio
async def test_api_skills_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/skills")
        assert resp.status_code == 200
        skills = resp.json()
        assert len(skills) >= 23
        assert any(s["id"] == "fastapi_secure_backend" for s in skills)
        assert any(s["id"] == "ecc_clean_architecture" for s in skills)
        assert any(s["id"] == "ecc_prompt_injection_defense" for s in skills)


@pytest.mark.asyncio
async def test_api_agents_and_skill_assignment():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Testa listagem de agentes
        resp = await ac.get("/api/v1/agents")
        assert resp.status_code == 200
        agents = resp.json()
        assert len(agents) == 26
        assert any(a["role"] == "jarvis_master" for a in agents)
        assert any(a["role"] == "cybersecurity_engineer" for a in agents)

        # Testa atribuição personalizada de agentes a uma skill
        payload = {"agent_roles": ["backend_developer", "software_architect", "secure_code_auditor"]}
        assign_resp = await ac.post("/api/v1/skills/ecc_clean_architecture/assign-agents", json=payload)
        assert assign_resp.status_code == 200
        data = assign_resp.json()
        assert data["status"] == "updated"
        assert "secure_code_auditor" in data["skill"]["assigned_agents"]


@pytest.mark.asyncio
async def test_api_tasks_and_database_retention_and_export():
    db_manager.register_project("proj_audit", "Audit Project", "workspace/proj_audit")
    db_manager.save_task(
        task_id="task_audit_001",
        session_id="sess_001",
        prompt="Auditar projeto",
        state_dict={"classified_intent": "audit", "is_completed": True},
        project_id="proj_audit",
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/tasks")
        assert resp.status_code == 200
        tasks = resp.json()
        assert any(t["id"] == "task_audit_001" for t in tasks)

    # Test export
    exported = db_manager.export_project_data("proj_audit")
    assert exported["project"]["id"] == "proj_audit"
    assert len(exported["tasks"]) >= 1

    # Test retention purge (purging with days_retention = 999 should delete 0 items from today)
    purged = db_manager.purge_old_tasks(days_retention=999)
    assert purged == 0
