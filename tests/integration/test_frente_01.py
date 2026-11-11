import pytest
from httpx import AsyncClient, ASGITransport
from apps.api.main import app, workspace_service, db_manager


@pytest.mark.asyncio
async def test_frente_01_workspace_buttons_and_files():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Garante projeto de teste no workspace
        test_proj_dir = workspace_service.get_project_dir("test_frente1_project")
        test_proj_dir.mkdir(parents=True, exist_ok=True)
        (test_proj_dir / "main.py").write_text("print('hello front 1')", encoding="utf-8")
        db_manager.register_project(
            "test_frente1_project", "Front 1 Test", str(test_proj_dir), owner_user_id="admin"
        )

        # 2. Testa endpoint de abrir pasta no Explorer
        open_folder_resp = await ac.post("/api/v1/workspace/projects/test_frente1_project/open-folder")
        assert open_folder_resp.status_code == 200
        data = open_folder_resp.json()
        assert data["status"] == "opened"
        assert "test_frente1_project" in data["path"]

        # 3. Testa endpoint de abrir raiz do workspace
        root_resp = await ac.post("/api/v1/workspace/open-root")
        assert root_resp.status_code == 200
        assert root_resp.json()["status"] == "opened"

        # 4. Testa gravação de arquivo com diff e backup
        write_resp = await ac.post(
            "/api/v1/workspace/projects/test_frente1_project/files/write",
            json={
                "path": "main.py",
                "content": "print('hello updated front 1')\n",
                "reason": "Teste de comparador e aplicador de diff",
            },
        )
        assert write_resp.status_code == 200
        write_data = write_resp.json()
        assert write_data["status"] == "approval_required"
        assert "diff" in write_data
        assert (test_proj_dir / "main.py").read_text(encoding="utf-8") == "print('hello front 1')"

        decision = await ac.post(
            f"/api/v1/approvals/{write_data['approval_id']}/decide",
            json={"action": "approve", "reason": "Aprovado no teste de integração"},
        )
        assert decision.status_code == 200
        applied = await ac.post(
            "/api/v1/workspace/projects/test_frente1_project/files/write",
            json={
                "path": "main.py",
                "content": "print('hello updated front 1')\n",
                "reason": "Teste de comparador e aplicador de diff",
                "approval_id": write_data["approval_id"],
            },
        )
        assert applied.status_code == 200
        assert applied.json()["status"] == "saved"
        assert (test_proj_dir / "main.py.bak").exists()
        assert (test_proj_dir / "main.py").read_text(encoding="utf-8") == "print('hello updated front 1')\n"
        # Limpeza
        workspace_service.delete_project("test_frente1_project")


@pytest.mark.asyncio
async def test_frente_01_ponytail_modes():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Altera nível Ponytail para senior
        resp = await ac.post("/api/v1/skills/ponytail", json={"level": "senior"})
        assert resp.status_code == 200
        assert resp.json()["level"] == "senior"

        # 2. Consulta nível atual
        get_resp = await ac.get("/api/v1/skills/ponytail")
        assert get_resp.status_code == 200
        assert get_resp.json()["level"] == "senior"
        assert get_resp.json()["active"] is True
