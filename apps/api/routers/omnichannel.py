"""Router para Integrações Omnicanal (Telegram, Discord, Webhooks) - OpenBot / CopilotKit."""

from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
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
async def telegram_webhook(request: Request):
    """Endpoint compatível com Telegram Bot Webhook."""
    try:
        body = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="JSON inválido.") from exc

    msg = body.get("message", {})
    text = msg.get("text", "").strip()
    if not text:
        return {"ok": True, "note": "Mensagem ignorada (sem texto)."}

    chat_id = str(msg.get("chat", {}).get("id", "unknown"))
    sender_name = msg.get("from", {}).get("username") or msg.get("from", {}).get(
        "first_name", "user"
    )

    result = await omnichannel_gateway.handle_inbound_message(
        channel="telegram",
        sender_id=chat_id,
        sender_name=sender_name,
        text=text,
    )
    return {"ok": True, "reply": result.get("reply")}


@router.post("/api/v1/omnichannel/discord-webhook")
async def discord_webhook(request: Request):
    """Endpoint compatível com Discord Bot Webhook."""
    try:
        body = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="JSON inválido.") from exc

    # Ping de verificação Discord
    if body.get("type") == 1:
        return {"type": 1}

    content = body.get("content", "").strip()
    author = body.get("author", {})
    user_id = str(author.get("id", "unknown"))
    user_name = author.get("username", "discord_user")

    if not content:
        return {"ok": True, "note": "Sem conteúdo de texto."}

    result = await omnichannel_gateway.handle_inbound_message(
        channel="discord",
        sender_id=user_id,
        sender_name=user_name,
        text=content,
    )
    return {"ok": True, "reply": result.get("reply")}
