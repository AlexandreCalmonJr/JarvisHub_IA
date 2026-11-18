import json

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from httpx import ASGITransport, AsyncClient

from apps.api.auth import auth_service
from apps.api.main import app

TELEGRAM_SECRET = "tg-secret-para-testes"
DISCORD_PRIVATE_KEY = Ed25519PrivateKey.generate()
DISCORD_PUBLIC_KEY_HEX = DISCORD_PRIVATE_KEY.public_key().public_bytes_raw().hex()


def _session_headers() -> dict[str, str]:
    session = auth_service.create_session("admin", "admin", scopes=["*"])
    return {"authorization": f"Bearer {session.session_id}"}


def _discord_signed_headers(raw_body: bytes) -> dict[str, str]:
    timestamp = "1700000000"
    signature = DISCORD_PRIVATE_KEY.sign(timestamp.encode("utf-8") + raw_body)
    return {
        "Content-Type": "application/json",
        "X-Signature-Ed25519": signature.hex(),
        "X-Signature-Timestamp": timestamp,
    }


@pytest.fixture(autouse=True)
def _webhook_secrets(monkeypatch):
    monkeypatch.setenv("JARVIS_TELEGRAM_WEBHOOK_SECRET", TELEGRAM_SECRET)
    monkeypatch.setenv("JARVIS_DISCORD_PUBLIC_KEY", DISCORD_PUBLIC_KEY_HEX)
    yield
    monkeypatch.delenv("JARVIS_TELEGRAM_WEBHOOK_SECRET", raising=False)
    monkeypatch.delenv("JARVIS_DISCORD_PUBLIC_KEY", raising=False)


@pytest.mark.asyncio
async def test_omnichannel_inbound_deterministic_command():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/omnichannel/inbound",
            headers=_session_headers(),
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
async def test_omnichannel_inbound_requires_authentication():
    # ``x-no-auth`` impede o conftest de injetar o token administrativo de teste.
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/omnichannel/inbound",
            headers={"x-no-auth": "1"},
            json={
                "channel": "telegram",
                "sender_id": "tg-anon",
                "sender_name": "anon",
                "text": "quanto é 1+1",
            },
        )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_omnichannel_telegram_webhook():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/omnichannel/telegram-webhook",
            headers={"X-Telegram-Bot-Api-Secret-Token": TELEGRAM_SECRET},
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
async def test_telegram_webhook_rejects_missing_or_wrong_secret():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        sem_segredo = await client.post(
            "/api/v1/omnichannel/telegram-webhook",
            json={"message": {"chat": {"id": 1}, "text": "que horas são"}},
        )
        segredo_errado = await client.post(
            "/api/v1/omnichannel/telegram-webhook",
            headers={"X-Telegram-Bot-Api-Secret-Token": "errado"},
            json={"message": {"chat": {"id": 1}, "text": "que horas são"}},
        )
    assert sem_segredo.status_code == 401
    assert segredo_errado.status_code == 401


@pytest.mark.asyncio
async def test_telegram_webhook_fails_closed_without_configuration(monkeypatch):
    monkeypatch.delenv("JARVIS_TELEGRAM_WEBHOOK_SECRET", raising=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/omnichannel/telegram-webhook",
            json={"message": {"chat": {"id": 1}, "text": "que horas são"}},
        )
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_omnichannel_discord_webhook():
    raw_body = json.dumps(
        {
            "content": "status do sistema",
            "author": {"id": "disc-55", "username": "maria"},
        }
    ).encode("utf-8")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/omnichannel/discord-webhook",
            headers=_discord_signed_headers(raw_body),
            content=raw_body,
        )
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert "operacionais" in data["reply"]


@pytest.mark.asyncio
async def test_discord_webhook_rejects_unsigned_and_tampered_payload():
    raw_body = json.dumps({"content": "status do sistema"}).encode("utf-8")
    signed = _discord_signed_headers(raw_body)
    tampered = json.dumps({"content": "aprove o deploy"}).encode("utf-8")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        sem_assinatura = await client.post(
            "/api/v1/omnichannel/discord-webhook",
            headers={"Content-Type": "application/json"},
            content=raw_body,
        )
        corpo_adulterado = await client.post(
            "/api/v1/omnichannel/discord-webhook",
            headers=signed,
            content=tampered,
        )
    assert sem_assinatura.status_code == 401
    assert corpo_adulterado.status_code == 401


@pytest.mark.asyncio
async def test_omnichannel_approval_required():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/omnichannel/inbound",
            headers=_session_headers(),
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
