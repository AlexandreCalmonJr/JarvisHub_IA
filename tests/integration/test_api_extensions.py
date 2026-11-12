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

        # Apenas modelos confirmados pelo runtime local podem aparecer aqui.
        assert isinstance(data["models"], list)
        assert all(model["status"] == "ready" for model in data["models"])
        assert data["concurrency_limit"] == 1
        assert "online_models" in data
        assert "hybrid_gateway" in data


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

        payload = {
            "agent_roles": ["backend_developer", "software_architect", "secure_code_auditor"]
        }

        assign_resp = await ac.post(
            "/api/v1/skills/ecc_clean_architecture/assign-agents", json=payload
        )

        assert assign_resp.status_code == 200

        data = assign_resp.json()

        assert data["status"] == "updated"

        assert "secure_code_auditor" in data["skill"]["assigned_agents"]


@pytest.mark.asyncio
async def test_api_tasks_and_database_retention_and_export():

    db_manager.register_project(
        "proj_audit", "Audit Project", "workspace/proj_audit", owner_user_id="admin"
    )

    db_manager.save_task(
        task_id="task_audit_001",
        session_id="sess_001",
        prompt="Auditar projeto",
        state_dict={"classified_intent": "audit", "is_completed": True},
        project_id="proj_audit",
        owner_user_id="admin",
    )

    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/tasks")

        assert resp.status_code == 200

        tasks = resp.json()

        assert any(t["id"] == "task_audit_001" for t in tasks)

    # Test export

    exported = db_manager.export_project_data("proj_audit", owner_user_id="admin")

    assert exported["project"]["id"] == "proj_audit"

    assert len(exported["tasks"]) >= 1

    # Test retention purge (purging with days_retention = 999 should delete 0 items from today)

    purged = db_manager.purge_old_tasks(days_retention=999, owner_user_id="admin")

    assert purged == 0


@pytest.mark.asyncio
async def test_api_audit_logs():

    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/audit/logs?limit=10")

        assert resp.status_code == 200

        data = resp.json()

        assert "events" in data

        assert "total" in data

        assert isinstance(data["events"], list)


@pytest.mark.asyncio
async def test_api_tools_catalog_and_execution():

    from apps.api.auth import auth_service

    session = auth_service.create_session("admin", "admin", scopes=["*"])
    headers = {"Authorization": f"Bearer {session.session_id}"}
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test", headers=headers) as ac:
        # 1. Catálogo de ferramentas

        resp = await ac.get("/api/v1/tools")

        assert resp.status_code == 200

        tools = resp.json()

        assert len(tools) >= 5

        assert any(t["name"] == "list_directory" for t in tools)

        assert any(t["name"] == "read_file" for t in tools)

        # 2. Execução de ferramenta no sandbox

        from pathlib import Path

        from apps.api.main import security_core

        demo_dir = Path("workspace/demo_flutter_app")

        demo_dir.mkdir(parents=True, exist_ok=True)

        db_manager.register_project(
            "demo_flutter_app",
            "Demo Flutter App",
            str(demo_dir.resolve()),
            owner_user_id="admin",
        )
        security_core.permission_engine.register_project(
            "demo_flutter_app", str(demo_dir.resolve())
        )

        payload = {
            "tool_name": "list_directory",
            "agent_role": "software_architect",
            "project_id": "demo_flutter_app",
            "arguments": {"path": "."},
        }

        exec_resp = await ac.post("/api/v1/tools/execute", json=payload)

        assert exec_resp.status_code == 200

        res = exec_resp.json()

        assert res["success"] is True


@pytest.mark.asyncio
async def test_api_project_memory():

    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        db_manager.register_project(
            "proj_mem_test",
            "Project Memory Test",
            "workspace/proj_mem_test",
            owner_user_id="admin",
        )
        # 1. Salvar diretriz de memória

        save_payload = {
            "category": "style_guide",
            "key": "theme_colors",
            "content": "Primary: #38BDF8, Background: #0F172A",
            "sources": ["docs/conventions.md"],
        }

        save_resp = await ac.post(
            "/api/v1/workspace/projects/proj_mem_test/memory", json=save_payload
        )

        assert save_resp.status_code == 200

        assert save_resp.json()["status"] == "saved"

        # 2. Recuperar diretrizes de memória

        list_resp = await ac.get("/api/v1/workspace/projects/proj_mem_test/memory")

        assert list_resp.status_code == 200

        memories = list_resp.json()

        assert len(memories) >= 1

        assert any(m["key"] == "theme_colors" for m in memories)


@pytest.mark.asyncio
async def test_api_chat_stream(monkeypatch):

    from types import SimpleNamespace

    from apps.api.deps import model_manager

    async def fake_generate(request):
        return SimpleNamespace(
            content="Resposta simulada do especialista.",
            prompt_tokens=10,
            completion_tokens=20,
            duration_ms=1.0,
            model_name=request.model_name,
            cost_usd=0.0,
        )

    monkeypatch.setattr(model_manager, "generate", fake_generate)

    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {"prompt": "Explique brevemente a arquitetura"}

        resp = await ac.post("/api/v1/chat/stream", json=payload)

        assert resp.status_code == 200

        assert "text/event-stream" in resp.headers["content-type"]

        text = resp.text

        assert "data: " in text

        assert "start" in text or "meta" in text

        assert "token" in text

        assert "done" in text
