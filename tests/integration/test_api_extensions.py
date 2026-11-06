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
        assert len(skills) >= 7
        assert any(s["id"] == "fastapi_secure_backend" for s in skills)


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
