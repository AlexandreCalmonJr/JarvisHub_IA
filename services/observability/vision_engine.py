"""Engine de Percepção Visual e Processamento Multimodal (Intel OpenBot Vision).

Permite que o JARVIS Hub analise imagens e frames de câmeras do smartphone e desktop,
detectando objetos, descrevendo cenas, efetuando OCR e avaliando interfaces de código/telas.
"""

from __future__ import annotations

import base64
import logging
from typing import Any

import httpx

from services.model_runtime.provider_catalog import vision_endpoint

logger = logging.getLogger("jarvis.vision_engine")


class VisionEngine:
    def __init__(self, hybrid_router=None) -> None:
        self.hybrid_router = hybrid_router

    @staticmethod
    def extract_image_metadata(image_bytes: bytes) -> dict[str, Any]:
        """Extrai metadados seguros da imagem usando cabeçalhos binários."""
        size_bytes = len(image_bytes)
        mime = "application/octet-stream"
        width = 0
        height = 0

        # Detecção por assinaturas de cabeçalho
        if image_bytes.startswith(b"\xff\xd8\xff"):
            mime = "image/jpeg"
        elif image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
            mime = "image/png"
            if len(image_bytes) >= 24:
                width = int.from_bytes(image_bytes[16:20], "big")
                height = int.from_bytes(image_bytes[20:24], "big")
        elif image_bytes.startswith((b"GIF87a", b"GIF89a")):
            mime = "image/gif"
            if len(image_bytes) >= 10:
                width = int.from_bytes(image_bytes[6:8], "little")
                height = int.from_bytes(image_bytes[8:10], "little")
        elif (
            image_bytes.startswith(b"RIFF")
            and len(image_bytes) >= 16
            and image_bytes[8:12] == b"WEBP"
        ):
            mime = "image/webp"

        return {
            "mime_type": mime,
            "size_bytes": size_bytes,
            "width": width,
            "height": height,
            "aspect_ratio": round(width / height, 2) if height > 0 else 1.0,
        }

    async def analyze_image(
        self,
        image_bytes: bytes,
        prompt: str = "Descreva o que vê nesta imagem de forma detalhada e objetiva.",
        task_type: str = "general",
    ) -> dict[str, Any]:
        """Processa a imagem usando o provedor multimodal configurado ou fallback determinístico."""
        if not image_bytes:
            raise ValueError("Bytes de imagem vazios.")

        meta = self.extract_image_metadata(image_bytes)
        b64_data = base64.b64encode(image_bytes).decode("ascii")
        mime = meta["mime_type"]

        # 1. Análise via modelo multimodal do provedor configurado.
        #    Endpoint e modelo vêm da tabela única (provider_catalog.py): a Groq,
        #    o DeepSeek e a Anthropic não servem visão por este caminho.
        cfg = self.hybrid_router.online_config if self.hybrid_router else None
        if cfg and cfg.api_key:
            provider = (cfg.provider_name or "").lower()
            base_url, model = vision_endpoint(provider)
            if base_url and model:
                try:
                    headers = {
                        "Authorization": f"Bearer {cfg.api_key}",
                        "Content-Type": "application/json",
                    }
                    payload = {
                        "model": model,
                        "messages": [
                            {
                                "role": "user",
                                "content": [
                                    {"type": "text", "text": prompt},
                                    {
                                        "type": "image_url",
                                        "image_url": {"url": f"data:{mime};base64,{b64_data}"},
                                    },
                                ],
                            }
                        ],
                        "max_tokens": 600,
                    }

                    async with httpx.AsyncClient(timeout=25.0) as client:
                        resp = await client.post(
                            f"{base_url.rstrip('/')}/chat/completions",
                            headers=headers,
                            json=payload,
                        )
                        if resp.status_code == 200:
                            data = resp.json()
                            content = (
                                data.get("choices", [{}])[0]
                                .get("message", {})
                                .get("content", "")
                                .strip()
                            )
                            if content:
                                return {
                                    "success": True,
                                    "description": content,
                                    "task_type": task_type,
                                    "provider": provider,
                                    "model": model,
                                    "metadata": meta,
                                }
                        else:
                            logger.warning(
                                "Falha no provedor de visão %s (%d): %s",
                                provider,
                                resp.status_code,
                                resp.text,
                            )
                except Exception as exc:
                    logger.warning("Exceção ao chamar modelo de visão: %s", exc)

        # 2. Sem modelo de visão disponível: declara a indisponibilidade.
        #    Não é produzida qualquer descrição, deteção ou "validação" fictícia.
        return {
            "success": False,
            "reason": "vision_unavailable",
            "description": (
                "Nenhum modelo de visão está disponível para o provedor configurado. "
                f"A imagem foi apenas inspecionada nos metadados: {meta['mime_type']}, "
                f"{meta['width']}x{meta['height']}, {meta['size_bytes']} bytes."
            ),
            "task_type": task_type,
            "detected_objects": [],
            "provider": None,
            "model": None,
            "metadata": meta,
        }
