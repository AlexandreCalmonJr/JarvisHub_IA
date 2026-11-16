"""Router para Percepção Visual e Visão Computacional (Intel OpenBot Vision)."""

from __future__ import annotations

import base64
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from apps.api.auth import Principal, get_principal
from apps.api.deps import security_core, vision_engine

logger = logging.getLogger("jarvis.api.vision")
router = APIRouter(tags=["vision"])

MAX_IMAGE_BYTES = 15 * 1024 * 1024  # 15 MB


class VisionAnalyzeRequest(BaseModel):
    image_base64: str = Field(min_length=10)
    prompt: str = Field(
        default="Descreva o que vê nesta imagem de forma detalhada e objetiva.",
        max_length=2000,
    )
    task_type: str = Field(default="general", max_length=64)
    device_id: str = Field(default="mobile-openbot", max_length=128)
    session_id: str | None = Field(default=None, max_length=128)


@router.post("/api/v1/vision/analyze")
async def analyze_vision_frame(
    payload: VisionAnalyzeRequest,
    principal: Annotated[Principal, Depends(get_principal)],
):
    """Analisa frame de câmera ou imagem enviada pelo dispositivo (OpenBot)."""
    raw_b64 = payload.image_base64.strip()
    if "," in raw_b64:
        raw_b64 = raw_b64.split(",", 1)[1]

    try:
        image_bytes = base64.b64decode(raw_b64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Formato de imagem base64 inválido.") from exc

    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Tamanho de imagem excede o limite de 15 MB.")
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Bytes de imagem vazios.")

    result = await vision_engine.analyze_image(
        image_bytes=image_bytes,
        prompt=payload.prompt,
        task_type=payload.task_type,
    )

    security_core.audit.record_event(
        operation="VISION_INSPECTION",
        status="COMPLETED",
        user_id=principal.subject_id,
        project_id=None,
        tool_name="vision.analyze",
        parameters={
            "device_id": payload.device_id,
            "session_id": payload.session_id,
            "task_type": payload.task_type,
            "mime_type": result.get("metadata", {}).get("mime_type"),
            "size_bytes": result.get("metadata", {}).get("size_bytes"),
        },
        reason="Análise multimodal de imagem / frame de câmera do OpenBot.",
    )

    return result
