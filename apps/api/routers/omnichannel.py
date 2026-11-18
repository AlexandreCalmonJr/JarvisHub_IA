"""Router para Integrações Omnicanal (Telegram, Discord, Webhooks) - OpenBot / CopilotKit.

Os endpoints de webhook são públicos por natureza (o provedor chama o servidor),
por isso a autenticidade é verificada criptograficamente antes de qualquer
processamento: segredo partilhado do Telegram e assinatura Ed25519 do Discord.
Sem credencial configurada o endpoint falha em modo fechado (503).
"""

from __future__ import annotations

import hmac
import json
import logging
import os
from typing import Annotated, Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from apps.api.auth import Principal, get_principal
from apps.api.deps import omnichannel_gateway

logger = logging.getLogger("jarvis.api.omnichannel")
router = APIRouter(tags=["omnichannel"])


class OmnichannelInboundRequest(BaseModel):
    channel: str = Field(default="generic", max_length=64)
    sender_id: str = Field(min_length=1, max_length=128)
    sender_name: str = Field(default="user", max_length=128)
    text: str = Field(min_length=1, max_length=4000)
    extra_data: dict[str, Any] | None = None


def _configured_secret(env_name: str) -> str:
    return os.environ.get(env_name, "").strip()


def _require_configured(env_name: str, channel: str) -> str:
    value = _configured_secret(env_name)
    if not value:
        logger.warning("Webhook %s rejeitado: %s não está configurado.", channel, env_name)
        raise HTTPException(
            status_code=503,
            detail=(
                f"Webhook {channel} não configurado. Defina {env_name} para aceitar "
                "mensagens deste canal."
            ),
        )
    return value


def _verify_telegram_secret(provided: str | None, expected: str) -> bool:
    candidate = (provided or "").strip()
    if not candidate:
        return False
    return hmac.compare_digest(candidate.encode("utf-8"), expected.encode("utf-8"))


def _verify_discord_signature(
    public_key_hex: str,
    signature_hex: str | None,
    timestamp: str | None,
    body: bytes,
) -> bool:
    """Valida a assinatura Ed25519 exigida pelo Discord Interactions."""
    if not signature_hex or not timestamp:
        return False
    try:
        public_key = Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_key_hex))
        public_key.verify(bytes.fromhex(signature_hex), timestamp.encode("utf-8") + body)
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


def _audit_rejection(operation: str, reason: str, channel: str, client: str) -> None:
    from apps.api.deps import security_core

    try:
        security_core.audit.record_event(
            operation=operation,
            status="DENIED",
            user_id="anonymous",
            parameters={"channel": channel, "client": client},
            reason=reason,
        )
    except Exception:  # pragma: no cover - auditoria nunca derruba o webhook
        logger.debug("Falha ao auditar rejeição de webhook.", exc_info=True)


@router.post("/api/v1/omnichannel/inbound")
async def inbound_message(
    payload: OmnichannelInboundRequest,
    principal: Annotated[Principal, Depends(get_principal)],
):
    """Recebe mensagens de canais externos (CopilotKit / OpenBot) com autenticação e governança."""
    result = await omnichannel_gateway.handle_inbound_message(
        channel=payload.channel,
        sender_id=payload.sender_id,
        sender_name=payload.sender_name,
        text=payload.text,
        principal=principal,
        extra_data=payload.extra_data,
    )
    return result


@router.post("/api/v1/omnichannel/telegram-webhook")
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: Annotated[str | None, Header()] = None,
):
    """Endpoint compatível com Telegram Bot Webhook (segredo partilhado obrigatório)."""
    expected = _require_configured("JARVIS_TELEGRAM_WEBHOOK_SECRET", "telegram")
    client = request.client.host if request.client else "unknown"
    if not _verify_telegram_secret(x_telegram_bot_api_secret_token, expected):
        _audit_rejection(
            "OMNICHANNEL_TELEGRAM_UNAUTHORIZED",
            "Segredo do webhook Telegram ausente ou inválido.",
            "telegram",
            client,
        )
        raise HTTPException(status_code=401, detail="Assinatura do webhook inválida.")

    try:
        body = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="JSON inválido.") from exc

    msg = body.get("message", {})
    text = str(msg.get("text", "")).strip()
    if not text:
        return {"ok": True, "note": "Mensagem ignorada (sem texto)."}

    chat_id = str(msg.get("chat", {}).get("id", "unknown"))
    sender_name = msg.get("from", {}).get("username") or msg.get("from", {}).get(
        "first_name", "user"
    )

    result = await omnichannel_gateway.handle_inbound_message(
        channel="telegram",
        sender_id=chat_id,
        sender_name=str(sender_name),
        text=text,
    )
    return {"ok": True, "reply": result.get("reply")}


@router.post("/api/v1/omnichannel/discord-webhook")
async def discord_webhook(
    request: Request,
    x_signature_ed25519: Annotated[str | None, Header()] = None,
    x_signature_timestamp: Annotated[str | None, Header()] = None,
):
    """Endpoint compatível com Discord Interactions (Ed25519 obrigatório)."""
    public_key = _require_configured("JARVIS_DISCORD_PUBLIC_KEY", "discord")
    client = request.client.host if request.client else "unknown"
    raw_body = await request.body()

    if not _verify_discord_signature(
        public_key, x_signature_ed25519, x_signature_timestamp, raw_body
    ):
        _audit_rejection(
            "OMNICHANNEL_DISCORD_UNAUTHORIZED",
            "Assinatura Ed25519 do Discord ausente ou inválida.",
            "discord",
            client,
        )
        raise HTTPException(status_code=401, detail="Assinatura do webhook inválida.")

    try:
        body = json.loads(raw_body or b"{}")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="JSON inválido.") from exc

    # Ping de verificação Discord (já autenticado acima)
    if body.get("type") == 1:
        return {"type": 1}

    content = str(body.get("content", "")).strip()
    author = body.get("author", {})
    user_id = str(author.get("id", "unknown"))
    user_name = str(author.get("username", "discord_user"))

    if not content:
        return {"ok": True, "note": "Sem conteúdo de texto."}

    result = await omnichannel_gateway.handle_inbound_message(
        channel="discord",
        sender_id=user_id,
        sender_name=user_name,
        text=content,
    )
    return {"ok": True, "reply": result.get("reply")}
