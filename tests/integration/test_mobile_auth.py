import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.main import app, security_core


@pytest.mark.asyncio
async def test_mobile_pairing_and_revocation_flow():
    # 1. Reset state
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 2. Pair a new device
        pair_resp = await ac.post("/api/v1/mobile/pair", json={"device_name": "OnePlus 11"})
        assert pair_resp.status_code == 200
        pair_data = pair_resp.json()
        assert pair_data["status"] == "paired"
        device_id = pair_data["device_id"]
        token = pair_data["device_token"]
        assert token.startswith("jrv_m_")

        # 3. List devices
        list_resp = await ac.get("/api/v1/mobile/devices")
        assert list_resp.status_code == 200
        devices = list_resp.json()
        assert any(d["device_id"] == device_id and not d["is_revoked"] for d in devices)

        # 4. Validate token via security_core.device_auth
        validated = security_core.device_auth.validate_token(token)
        assert validated.device_id == device_id

        # 5. Revoke the device
        revoke_resp = await ac.post(
            "/api/v1/mobile/revoke",
            json={"device_id": device_id, "reason": "Teste de segurança revogação"},
        )
        assert revoke_resp.status_code == 200
        assert revoke_resp.json()["status"] == "revoked"

        # 6. Validate token again must raise PermissionError
        with pytest.raises(PermissionError, match="revogado"):
            security_core.device_auth.validate_token(token)
