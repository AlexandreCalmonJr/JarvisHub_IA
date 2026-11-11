"""
JARVIS AI HUB - Webhook Notification Service
Envia notificações em tempo real para Discord e Telegram quando tarefas demoradas
(exportações, dockerização, download de modelos ou auditorias de segurança) forem concluídas.
"""

import json
import logging
from typing import Any
import httpx

logger = logging.getLogger("jarvis.webhooks")


class WebhookNotificationService:
    def __init__(self, db_manager: Any):
        self.db = db_manager

    def get_raw_config(self) -> dict[str, Any]:
        """Recupera a configuração bruta de webhooks do banco SQLite."""
        if not self.db:
            return {}
        with self.db._get_connection() as conn:
            row = conn.execute(
                "SELECT value_json FROM user_settings WHERE key = 'notification_webhooks'"
            ).fetchone()
            if row:
                try:
                    return json.loads(row["value_json"])
                except Exception:
                    logger.debug("Configuração de webhooks inválida no banco; a usar predefinições.", exc_info=True)
        return {
            "enabled": False,
            "discord_webhook_url": "",
            "telegram_bot_token": "",
            "telegram_chat_id": "",
            "notify_on_export": True,
            "notify_on_dockerize": True,
            "notify_on_long_task": True,
        }

    def get_safe_config(self) -> dict[str, Any]:
        """Retorna configuração com tokens ofuscados para visualização segura no dashboard."""
        cfg = self.get_raw_config()
        safe = dict(cfg)
        tg_token = safe.get("telegram_bot_token", "")
        if tg_token and len(tg_token) > 8:
            safe["telegram_bot_token"] = tg_token[:4] + "..." + tg_token[-4:]
        disc_url = safe.get("discord_webhook_url", "")
        if disc_url and len(disc_url) > 25:
            safe["discord_webhook_url"] = disc_url[:20] + "..." + disc_url[-8:]
        return safe

    def save_config(self, new_cfg: dict[str, Any]) -> dict[str, Any]:
        """Salva preferências de webhooks no SQLite."""
        current = self.get_raw_config()

        # Preserva credenciais se o usuário enviou o valor ofuscado de volta
        if "telegram_bot_token" in new_cfg and "..." in new_cfg["telegram_bot_token"]:
            new_cfg["telegram_bot_token"] = current.get("telegram_bot_token", "")
        if "discord_webhook_url" in new_cfg and "..." in new_cfg["discord_webhook_url"]:
            new_cfg["discord_webhook_url"] = current.get("discord_webhook_url", "")

        merged = {**current, **new_cfg}
        val_str = json.dumps(merged)
        from datetime import datetime, UTC
        now = datetime.now(UTC).isoformat()

        if self.db:
            with self.db._get_connection() as conn:
                conn.execute(
                    """
                    INSERT INTO user_settings (key, value_json, updated_at)
                    VALUES ('notification_webhooks', ?, ?)
                    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
                    """,
                    (val_str, now),
                )
        return self.get_safe_config()

    async def send_notification(self, title: str, message: str, event_type: str = "general") -> dict[str, Any]:
        """Dispara notificações assíncronas para Discord e/ou Telegram se configurados."""
        cfg = self.get_raw_config()
        if not cfg.get("enabled", False):
            return {"sent": False, "reason": "Notificações desativadas nas configurações"}

        dispatched = []
        errors = []

        # 1. Envio para Discord Webhook
        discord_url = cfg.get("discord_webhook_url", "").strip()
        if discord_url and discord_url.startswith("https://discord.com/api/webhooks"):
            try:
                embed = {
                    "title": f"🤖 JARVIS AI Hub • {title}",
                    "description": message,
                    "color": 0x38BDF8,  # Azul claro JARVIS
                    "footer": {"text": f"Evento: {event_type} | 100% Local-First"},
                }
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.post(discord_url, json={"embeds": [embed]})
                    if resp.status_code in (200, 204):
                        dispatched.append("discord")
                    else:
                        errors.append(f"Discord retornou status {resp.status_code}")
            except Exception as e:
                errors.append(f"Falha ao conectar com Discord: {e}")

        # 2. Envio para Telegram Bot
        tg_token = cfg.get("telegram_bot_token", "").strip()
        tg_chat_id = cfg.get("telegram_chat_id", "").strip()
        if tg_token and tg_chat_id:
            try:
                tg_url = f"https://api.telegram.org/bot{tg_token}/sendMessage"
                tg_text = f"🤖 *JARVIS AI Hub*\n\n*{title}*\n{message}\n\n_Evento: {event_type}_"
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.post(
                        tg_url,
                        json={"chat_id": tg_chat_id, "text": tg_text, "parse_mode": "Markdown"},
                    )
                    if resp.status_code == 200:
                        dispatched.append("telegram")
                    else:
                        errors.append(f"Telegram retornou status {resp.status_code}")
            except Exception as e:
                errors.append(f"Falha ao conectar com Telegram: {e}")

        return {
            "sent": len(dispatched) > 0,
            "channels": dispatched,
            "errors": errors,
        }

    async def test_webhook(self) -> dict[str, Any]:
        """Envia uma mensagem de teste para validar credenciais."""
        return await self.send_notification(
            title="Teste de Notificação",
            message="Sua conexão de Webhook com o JARVIS AI Hub está ativa e operacional!",
            event_type="test",
        )
