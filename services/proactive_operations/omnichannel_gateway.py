"""Gateway Omnicanal (CopilotKit / OpenBot Channel Integrations).

Permite que o JARVIS Hub receba mensagens e comandos de múltiplos canais (Telegram, Discord,
Webhooks genéricos e interfaces externas), roteando com governança de segurança e auditoria.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from apps.api.auth import Principal

logger = logging.getLogger("jarvis.omnichannel")


class OmnichannelGateway:
    def __init__(self, webhook_service=None, security_core=None) -> None:
        self.webhook_service = webhook_service
        self.security_core = security_core

    async def handle_inbound_message(
        self,
        channel: str,
        sender_id: str,
        sender_name: str,
        text: str,
        principal: Principal | None = None,
        extra_data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Processa uma mensagem recebida de um canal omnicanal externo."""
        clean_text = text.strip()
        if not clean_text:
            return {
                "success": False,
                "reply": "Mensagem vazia recebida.",
                "channel": channel,
                "sender_id": sender_id,
            }

        if principal is None:
            from apps.api.auth import Principal

            # Canal externo autenticado criptograficamente (segredo do Telegram /
            # assinatura Ed25519 do Discord), mas SEM identidade humana: o papel
            # sintético "channel" não existe em ROLE_PERMISSIONS, portanto o
            # principal tem zero permissões em vez de um wildcard.
            effective_principal = Principal(
                subject_id=f"{channel}_{sender_id}",
                kind="human",
                role="channel",
                scopes=frozenset(),
            )
        else:
            effective_principal = principal

        from apps.api.routers.voice import VoiceCommand, voice_command

        payload = VoiceCommand(
            text=clean_text,
            device_id=f"omni-{channel}-{sender_id}",
            session_id=f"omni-session-{sender_id}",
        )

        # 1. Executa no Intent Router determinístico
        cmd_result = await voice_command(payload=payload, principal=effective_principal)

        reply = cmd_result.get("reply", "")
        intent = cmd_result.get("intent", "omni.chat")
        approval_required = cmd_result.get("approval_required", False)

        # 2. Se requerer aprovação humana, notifica via webhook se configurado
        if approval_required and self.webhook_service:
            try:
                await self.webhook_service.send_notification(
                    title="⚠️ Ação Requer Aprovação Humana",
                    message=f"Canal [{channel.upper()}] usuário @{sender_name} solicitou ação sensível:\n'{clean_text}'\nPor favor aprove no painel do JARVIS.",
                    event_type="security_approval",
                )
            except Exception as exc:
                logger.warning("Falha ao notificar webhook de aprovação: %s", exc)

        return {
            "success": True,
            "channel": channel,
            "sender_id": sender_id,
            "sender_name": sender_name,
            "reply": reply,
            "intent": intent,
            "approval_required": approval_required,
        }
