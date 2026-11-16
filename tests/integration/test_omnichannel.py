import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.main import app


@pytest.mark.asyncio
async def test_omnichannel_inbound_deterministic_command():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/omnichannel/inbound",
            json={
                "channel": "telegram",
                "sender_id": "tg-123",
                "sender_name": "alex",
                "text": "quanto é 15% de 240",
            },
        )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "36" in data["reply"]
    assert data["intent"] == "calc.eval"
    assert data["channel"] == "telegram"


@pytest.mark.asyncio
async def test_omnichannel_telegram_webhook():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/omnichannel/telegram-webhook",
            json={
                "message": {
                    "chat": {"id": 9999},
                    "from": {"username": "pedro"},
                    "text": "que horas são",
                }
            },
        )
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert "Agora são" in data["reply"]


@pytest.mark.asyncio
async def test_omnichannel_discord_webhook():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/omnichannel/discord-webhook",
            json={
                "content": "status do sistema",
                "author": {"id": "disc-55", "username": "maria"},
            },
        )
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert "operacionais" in data["reply"]


@pytest.mark.asyncio
async def test_omnichannel_approval_required():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/omnichannel/inbound",
            json={
                "channel": "discord",
                "sender_id": "disc-99",
                "sender_name": "carlos",
                "text": "aprove o deploy",
            },
        )
    assert response.status_code == 200
    data = response.json()
    assert data["approval_required"] is True
    assert "painel" in data["reply"]
