"""E2E: bootstrap emitido por outro processo, login e chamada autenticada."""

import os

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.auth import AuthService, auth_service
from apps.api.main import app


@pytest.mark.asyncio
async def test_bootstrap_exchange_creates_authenticated_session_across_services():
    # Simula a CLI emitindo o token num processo/instância diferente do servidor.
    os.environ["JARVIS_ISSUE_BOOTSTRAP"] = "0"
    issuer = AuthService(auth_service.security, auth_service.auth_dir)
    token = issuer.issue_bootstrap_token(ttl_seconds=60, persist=True)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        exchange = await client.post(
            "/api/v1/auth/bootstrap/exchange",
            json={"token": token},
            headers={"x-no-auth": "1"},
        )
        assert exchange.status_code == 200
        assert exchange.json()["status"] == "authenticated"
        assert "jarvis_session" in client.cookies

        # A sessão criada pelo bootstrap deve autenticar uma rota protegida.
        me = await client.get("/api/v1/auth/me")
        assert me.status_code == 200
        assert me.json()["role"] == "admin"

        # O bootstrap é de uso único: uma segunda troca deve ser recusada.
        replay = await client.post(
            "/api/v1/auth/bootstrap/exchange",
            json={"token": token},
            headers={"x-no-auth": "1"},
        )
        assert replay.status_code == 401
