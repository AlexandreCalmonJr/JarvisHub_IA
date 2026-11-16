import json

import httpx
import pytest

from services.memory.database import DatabaseManager
from services.proactive_operations.webhook_service import WebhookNotificationService


def _service(tmp_path, handler):
    db = DatabaseManager(db_path=str(tmp_path / "webhooks.db"))
    return WebhookNotificationService(db, transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_webhook_dispatch_covers_discord_and_telegram(tmp_path):
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        if request.url.host == "discord.com":
            return httpx.Response(204)
        if request.url.host == "api.telegram.org":
            return httpx.Response(200, json={"ok": True})
        return httpx.Response(404)

    service = _service(tmp_path, handler)
    saved = service.save_config(
        {
            "enabled": True,
            "discord_webhook_url": (
                "https://discord.com/api/webhooks/123456789/abcdefghijklmnopqrstuvwxyz"
            ),
            "telegram_bot_token": "123456789:ABCDEF_secret_token_here",
            "telegram_chat_id": "-100123456789",
            "notify_on_export": True,
            "notify_on_dockerize": True,
            "notify_on_long_task": True,
        }
    )

    assert saved["enabled"] is True
    assert "..." in saved["discord_webhook_url"]
    assert "..." in saved["telegram_bot_token"]

    result = await service.test_webhook()

    assert result == {"sent": True, "channels": ["discord", "telegram"], "errors": []}
    assert len(captured) == 2

    discord_request, telegram_request = captured
    assert discord_request.url.path.startswith("/api/webhooks/")
    discord_payload = json.loads(discord_request.content)
    embed = discord_payload["embeds"][0]
    assert "JARVIS AI Hub" in embed["title"]
    assert "Teste de Notificação" in embed["title"]
    assert embed["footer"]["text"] == "Evento: test | 100% Local-First"

    assert telegram_request.url.path.endswith("/sendMessage")
    telegram_payload = json.loads(telegram_request.content)
    assert telegram_payload["chat_id"] == "-100123456789"
    assert telegram_payload["parse_mode"] == "Markdown"
    assert "Teste de Notificação" in telegram_payload["text"]
    assert "Evento: test" in telegram_payload["text"]


@pytest.mark.asyncio
async def test_webhook_disabled_does_not_dispatch(tmp_path):
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(204)

    service = _service(tmp_path, handler)
    service.save_config({"enabled": False})

    result = await service.test_webhook()

    assert result["sent"] is False
    assert "desativadas" in result["reason"]
    assert calls == []
