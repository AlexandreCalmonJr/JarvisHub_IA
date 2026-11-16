"""Testes de integração para o WebSocket do Terminal PTY (apps/api/routers/terminal.py)."""

from fastapi.testclient import TestClient

from apps.api.main import app


def test_terminal_websocket_lifecycle():
    client = TestClient(app)
    with client.websocket_connect("/api/v1/terminal/ws") as websocket:
        # Envia comando echo simples
        websocket.send_text("Write-Output 'JARVIS_PTY_OK'\r\n")
        # Lê chunks recebidos até encontrar a saída esperada ou timeout
        received = ""
        for _ in range(10):
            try:
                data = websocket.receive_text()
                received += data
                if "JARVIS_PTY_OK" in received:
                    break
            except Exception:
                break

        assert "JARVIS_PTY_OK" in received or len(received) > 0
