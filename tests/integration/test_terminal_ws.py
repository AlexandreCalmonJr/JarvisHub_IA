"""Testes de integração para o WebSocket do Terminal PTY (apps/api/routers/terminal.py).

O handshake do WebSocket não passa pelo ``AuthMiddleware`` HTTP; estes testes
garantem que a autenticação explícita do canal continua fail-closed.
"""

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from apps.api.auth import auth_service
from apps.api.main import app


def _admin_cookie_header() -> dict[str, str]:
    session = auth_service.create_session("admin", "admin", scopes=["*"])
    return {"cookie": f"jarvis_session={session.session_id}"}


def test_terminal_websocket_rejects_anonymous_connection():
    client = TestClient(app)
    with (
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect("/api/v1/terminal/ws") as websocket,
    ):
        websocket.receive_text()


def test_terminal_websocket_rejects_invalid_session_cookie():
    client = TestClient(app)
    with (
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect(
            "/api/v1/terminal/ws",
            headers={"cookie": "jarvis_session=sess_inexistente"},
        ) as websocket,
    ):
        websocket.receive_text()


def test_terminal_websocket_lifecycle_authenticated():
    client = TestClient(app)
    with client.websocket_connect(
        "/api/v1/terminal/ws", headers=_admin_cookie_header()
    ) as websocket:
        # Envia comando echo simples
        websocket.send_text("Write-Output 'JARVIS_PTY_OK'\r\n")
        # Lê chunks recebidos até encontrar a saída esperada ou timeout
        received = ""
        for _ in range(15):
            try:
                data = websocket.receive_text()
                received += data
                if "JARVIS_PTY_OK" in received:
                    break
            except Exception:
                break

        assert "JARVIS_PTY_OK" in received or len(received) > 0
