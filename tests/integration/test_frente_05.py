import io
import zipfile
import pytest
from httpx import AsyncClient, ASGITransport
from apps.api.main import app, workspace_service, db_manager


@pytest.mark.asyncio
async def test_frente_05_export_clean_project_zip():
    """Valida a exportação em pacote ZIP limpo excluindo pastas pesadas e dependências."""
    proj_id = "test_frente5_zip_project"
    workspace_service.delete_project(proj_id)

    proj_dir = workspace_service.get_project_dir(proj_id)
    proj_dir.mkdir(parents=True, exist_ok=True)

    # 1. Cria arquivos válidos
    (proj_dir / "main.py").write_text("print('App principal')\n", encoding="utf-8")
    (proj_dir / "requirements.txt").write_text("fastapi>=0.100.0\n", encoding="utf-8")

    # 2. Cria pastas que DEVEM ser excluídas do ZIP limpo
    (proj_dir / "node_modules").mkdir()
    (proj_dir / "node_modules" / "junk.js").write_text("console.log('pesado');\n", encoding="utf-8")

    (proj_dir / ".venv").mkdir()
    (proj_dir / ".venv" / "activate.bat").write_text("@echo off\n", encoding="utf-8")

    (proj_dir / "__pycache__").mkdir()
    (proj_dir / "__pycache__" / "cached.pyc").write_bytes(b"\x00\x01\x02")

    db_manager.register_project(
        proj_id, "Front 5 ZIP Test", str(proj_dir), owner_user_id="admin"
    )

    # 3. Chama o endpoint de exportação ZIP
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get(f"/api/v1/workspace/projects/{proj_id}/export-zip")
        assert resp.status_code == 200
        assert "application/zip" in resp.headers.get("content-type", "")

        # 4. Inspeciona o conteúdo interno do ZIP gerado
        zip_buf = io.BytesIO(resp.content)
        with zipfile.ZipFile(zip_buf, "r") as z:
            names = z.namelist()

            # Arquivos do código devem estar presentes
            assert any(n.endswith("main.py") for n in names)
            assert any(n.endswith("requirements.txt") for n in names)

            # Dependências e caches devem estar 100% ausentes
            assert not any("node_modules" in n for n in names)
            assert not any(".venv" in n for n in names)
            assert not any("__pycache__" in n for n in names)
            assert not any(".git" in n for n in names)

    # Limpeza
    workspace_service.delete_project(proj_id)


@pytest.mark.asyncio
async def test_frente_05_dockerize_project():
    """Valida a dockerização em 1 clique com geração multi-stage de Dockerfile e compose."""
    proj_id = "test_frente5_docker_project"
    workspace_service.delete_project(proj_id)

    proj_dir = workspace_service.get_project_dir(proj_id)
    proj_dir.mkdir(parents=True, exist_ok=True)
    (proj_dir / "main.py").write_text("from fastapi import FastAPI\napp = FastAPI()\n", encoding="utf-8")
    (proj_dir / "requirements.txt").write_text("fastapi\nuvicorn\n", encoding="utf-8")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(f"/api/v1/workspace/projects/{proj_id}/dockerize")
        assert resp.status_code == 200
        pending = resp.json()
        assert pending["status"] == "approval_required"
        assert not (proj_dir / "Dockerfile").exists()
        decision = await ac.post(
            f"/api/v1/approvals/{pending['approval_id']}/decide",
            json={"action": "approve", "reason": "Dockerização aprovada no teste"},
        )
        assert decision.status_code == 200
        resp = await ac.post(
            f"/api/v1/workspace/projects/{proj_id}/dockerize?approval_id={pending['approval_id']}"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "dockerized"
        assert "Python" in data["stack"]

        # 1. Verifica arquivos gerados fisicamente no disco
        assert (proj_dir / "Dockerfile").exists()
        assert (proj_dir / "docker-compose.yml").exists()
        assert (proj_dir / ".dockerignore").exists()

        df_content = (proj_dir / "Dockerfile").read_text(encoding="utf-8")
        assert "FROM python:3.12-slim" in df_content
        assert "EXPOSE 8000" in df_content

        compose_content = (proj_dir / "docker-compose.yml").read_text(encoding="utf-8")
        assert f"{proj_id}-app" in compose_content
        assert "8000:8000" in compose_content

        ignore_content = (proj_dir / ".dockerignore").read_text(encoding="utf-8")
        assert ".venv" in ignore_content
        assert "__pycache__" in ignore_content

    # Limpeza
    workspace_service.delete_project(proj_id)


@pytest.mark.asyncio
async def test_frente_05_webhooks_config_and_test():
    """Valida a persistência e ofuscação de webhooks para Discord e Telegram."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Consulta inicial
        get_resp = await ac.get("/api/v1/system/webhooks")
        assert get_resp.status_code == 200
        initial_cfg = get_resp.json()
        assert "enabled" in initial_cfg

        # 2. Salva nova configuração com token de Telegram e Webhook Discord
        post_resp = await ac.post(
            "/api/v1/system/webhooks",
            json={
                "enabled": True,
                "discord_webhook_url": "https://discord.com/api/webhooks/123456789/abcdefghij1234567890",
                "telegram_bot_token": "123456789:ABCDEF_secret_token_here",
                "telegram_chat_id": "-100123456789",
                "notify_on_export": True,
                "notify_on_dockerize": True,
                "notify_on_long_task": True,
            },
        )
        assert post_resp.status_code == 200
        saved_cfg = post_resp.json()
        assert saved_cfg["enabled"] is True
        # As credenciais devem estar ofuscadas para exibição no dashboard
        assert "..." in saved_cfg["telegram_bot_token"]
        assert "..." in saved_cfg["discord_webhook_url"]

        # 3. Dispara teste
        test_resp = await ac.post("/api/v1/system/webhooks/test")
        assert test_resp.status_code == 200
        test_data = test_resp.json()
        assert "sent" in test_data
        assert "channels" in test_data

        # Restaura configuração desativada
        await ac.post(
            "/api/v1/system/webhooks",
            json={
                "enabled": False,
                "discord_webhook_url": "",
                "telegram_bot_token": "",
                "telegram_chat_id": "",
            },
        )
