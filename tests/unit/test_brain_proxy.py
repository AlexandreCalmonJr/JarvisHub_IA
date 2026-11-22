import asyncio
from datetime import datetime, timezone
import http.server
import threading
from typing import Any

from fastapi.testclient import TestClient
import httpx
import pytest

from apps.api.auth import auth_service
from apps.api.main import app
from apps.api.routers.brain_proxy import check_brain_connectivity


@pytest.fixture
def auth_headers():
    session = auth_service.create_session("admin", "admin")
    return {"Authorization": f"Bearer {session.session_id}"}


@pytest.mark.asyncio
async def test_mascot_and_pwa_assets_served_successfully():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
        # Mascots
        for mascot_file in [
            "mascot_maestro_orange_1795113331453.jpg",
            "mascot_sentinel_owl_1795113318479.jpg",
            "mascot_scholar_fox_1795113396443.jpg",
            "mascot_creator_cat_1795113321092.jpg",
            "mascot_coder_slime_1795113330060.jpg",
        ]:
            resp = await client.get(f"/src/assets/images/{mascot_file}")
            assert resp.status_code == 200
            assert len(resp.content) > 0

        # PWA Icon
        pwa_resp = await client.get("/pwa-192x192.png")
        assert pwa_resp.status_code == 200
        assert pwa_resp.headers["content-type"] == "image/png"


@pytest.mark.asyncio
async def test_virtual_agent_chat_sessions_return_200(auth_headers):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
        # Sessão padrão
        resp_default = await client.get("/api/v1/chat/sessions/default", headers=auth_headers)
        assert resp_default.status_code == 200
        assert resp_default.json() == {"session_id": "default", "tasks": [], "messages": []}

        # Atalho de agente não inicializado
        resp_ux = await client.get("/api/v1/chat/sessions/agent_ux_ui_designer", headers=auth_headers)
        assert resp_ux.status_code == 200
        assert resp_ux.json() == {"session_id": "agent_ux_ui_designer", "tasks": [], "messages": []}

        # Sessão inexistente aleatória deve retornar 404
        resp_404 = await client.get("/api/v1/chat/sessions/custom_missing_session_abc", headers=auth_headers)
        assert resp_404.status_code == 404


@pytest.mark.asyncio
async def test_brain_proxy_fallback_when_server_offline(auth_headers):
    # Garante que connectivity cache reconhece offline
    await check_brain_connectivity(force=True)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
        # GET endpoints retornam 200 com payload fallback
        endpoints = [
            ("/api/v1/spreadsheets", "items"),
            ("/api/v1/media/assets", "assets"),
            ("/api/v1/devices", "devices"),
            ("/api/v1/brain/info", "status"),
            ("/api/v1/brain/profiles", "profiles"),
            ("/api/v1/brain/schema", "tables"),
            ("/api/v1/brain/memories", "memories"),
            ("/api/v1/companion/state", "state"),
            ("/api/v1/push/config", "enabled"),
            ("/api/v1/ide/workspace", "files"),
            ("/api/v1/workflows", "workflows"),
            ("/api/v1/github/history", "history"),
            ("/api/v1/office/state", "sessions"),
            ("/api/v1/apps", "apps"),
            ("/api/v1/models/hardware", "profiles"),
        ]
        for route, expected_key in endpoints:
            res = await client.get(route, headers=auth_headers)
            assert res.status_code == 200, f"Falha na rota {route}"
            assert expected_key in res.json(), f"Chave {expected_key} ausente em {route}"

        # POST endpoints offline retornam 503 (serviço indisponível), não 405
        post_endpoints = [
            "/api/v1/spreadsheets/generate",
            "/api/v1/media/images",
            "/api/v1/media/videos",
            "/api/v1/android-app/preview",
            "/api/v1/android-app/package.zip",
            "/api/v1/brain/bundle/preview",
            "/api/v1/brain/bundle.zip",
            "/api/v1/workflows",
            "/api/v1/github/inspect",
            "/api/v1/office/roundtable",
            "/api/v1/apps/scaffold",
        ]
        for post_route in post_endpoints:
            res = await client.post(post_route, headers=auth_headers, json={})
            assert res.status_code == 503, f"Esperado 503 para {post_route}, obtido {res.status_code}"


def test_realtime_websocket_handshake():
    client = TestClient(app)
    with client.websocket_connect("/ws") as ws:
        frame = ws.receive_json()
        assert frame.get("type") == "connected"
        assert frame.get("payload", {}).get("status") == "ready"

        ws.send_text("ping")
        reply = ws.receive_text()
        assert reply == "pong"


class _MockBrainServer(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        if self.path == "/api/v1/spreadsheets":
            self.wfile.write(b'{"presets": [{"id": "financeiro"}], "items": [{"id": "sheet-active-1"}]}')
        elif self.path == "/api/v1/system/health/details":
            self.wfile.write(b'{"status": "healthy"}')
        else:
            self.wfile.write(b'{"status": "mock-ok"}')

    def do_POST(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status": "created-by-brain", "job_id": "job-777"}')

    def log_message(self, *args, **kwargs):
        pass


@pytest.mark.asyncio
async def test_proxy_forwarding_when_upstream_brain_is_online(auth_headers):
    # Inicia mock server na porta 3001
    server = http.server.HTTPServer(("127.0.0.1", 3001), _MockBrainServer)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

    try:
        await check_brain_connectivity(force=True)

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
            # GET deve encaminhar para 3001 e receber a resposta do mock
            get_res = await client.get("/api/v1/spreadsheets", headers=auth_headers)
            assert get_res.status_code == 200
            data = get_res.json()
            assert data["items"][0]["id"] == "sheet-active-1"

            # POST deve encaminhar para 3001 e receber 200
            post_res = await client.post("/api/v1/spreadsheets/generate", headers=auth_headers, json={"prompt": "teste"})
            assert post_res.status_code == 200
            assert post_res.json()["status"] == "created-by-brain"
    finally:
        server.shutdown()
        server.server_close()
        await check_brain_connectivity(force=True)
