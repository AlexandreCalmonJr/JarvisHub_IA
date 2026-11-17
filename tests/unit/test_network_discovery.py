import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.main import app
from apps.api.services.network_discovery import get_discovery_info, get_local_ip


def test_get_local_ip_returns_valid_ip():
    ip = get_local_ip()
    assert isinstance(ip, str)
    assert len(ip) >= 7
    assert "." in ip


def test_get_discovery_info():
    info = get_discovery_info(api_port=8000, dashboard_port=5173)
    assert info["service"] == "jarvis-hub"
    assert info["version"] == "3.0.1"
    assert info["status"] == "online"
    assert info["api_port"] == 8000
    assert info["dashboard_port"] == 5173
    assert info["server_url"].startswith("http://")
    assert info["pairing_endpoint"] == "/api/v1/mobile/pair"


@pytest.mark.asyncio
async def test_system_discovery_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/system/discovery")
        assert resp.status_code == 200
        data = resp.json()
        assert data["service"] == "jarvis-hub"
        assert data["version"] == "3.0.1"
        assert data["status"] == "online"
