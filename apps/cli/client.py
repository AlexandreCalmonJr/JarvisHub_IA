"""Cliente HTTP e streaming SSE para comunicação entre o CLI e o JARVIS Hub API."""

from __future__ import annotations

import json
import logging
import os
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger("jarvis.cli.client")


def find_default_token() -> str:
    """Procura automaticamente o token de autenticação local."""
    env_token = os.environ.get("JARVIS_TOKEN")
    if env_token:
        return env_token.strip()

    candidate = Path("data/auth/admin_token.txt")
    if candidate.exists():
        try:
            return candidate.read_text(encoding="utf-8").strip()
        except Exception as exc:
            logger.debug("Não foi possível carregar token de %s: %s", candidate, exc)
    return ""


class JarvisClient:
    """Cliente HTTP com suporte a SSE para interação com os endpoints do Hub."""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:8000",
        token: str | None = None,
        timeout: float = 120.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token or find_default_token()
        self.timeout = timeout

    @property
    def headers(self) -> dict[str, str]:
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    async def get_tools_and_provider(self) -> dict[str, Any]:
        """Obtém status dos provedores e ferramentas do Coding Agent."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                f"{self.base_url}/api/v1/coding/tools",
                headers=self.headers,
            )
            res.raise_for_status()
            return res.json()

    async def list_teammates(self) -> list[dict[str, Any]]:
        """Lista os colegas de equipe de IA (OpenBot / ACP)."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                f"{self.base_url}/api/v1/teammates",
                headers=self.headers,
            )
            res.raise_for_status()
            return res.json()

    async def decide_approval(self, approval_id: str, action: str = "approve") -> dict[str, Any]:
        """Envia decisão de aprovação humana (approve ou reject)."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                f"{self.base_url}/api/v1/coding/approvals/{approval_id}/decide",
                headers=self.headers,
                json={"action": action},
            )
            res.raise_for_status()
            return res.json()

    async def compact_session(
        self,
        session_id: str,
        keep_recent: int = 4,
        project_id: str | None = None,
    ) -> dict[str, Any]:
        """Solicita a compactação semântica da sessão atual."""
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                f"{self.base_url}/api/v1/coding/sessions/{session_id}/compact",
                headers=self.headers,
                json={"keep_recent": keep_recent, "project_id": project_id},
            )
            res.raise_for_status()
            return res.json()

    async def stream_coding_task(
        self,
        prompt: str,
        project_id: str,
        session_id: str,
        mode: str = "ask",
    ) -> AsyncIterator[dict[str, Any]]:
        """Executa tarefa de código via streaming SSE recebendo eventos em tempo real."""
        payload = {
            "prompt": prompt,
            "project_id": project_id,
            "session_id": session_id,
            "mode": mode,
            "include_history": True,
        }

        async with (
            httpx.AsyncClient(timeout=self.timeout) as client,
            client.stream(
                "POST",
                f"{self.base_url}/api/v1/coding/run/stream",
                headers=self.headers,
                json=payload,
            ) as response,
        ):
            if response.status_code != 200:
                body = await response.aread()
                yield {
                    "type": "error",
                    "error": f"HTTP {response.status_code}: {body.decode(errors='replace')}",
                }
                return

            async for line in response.aiter_lines():
                line = line.strip()
                if line.startswith("data:"):
                    raw_data = line[len("data:") :].strip()
                    if raw_data:
                        try:
                            event = json.loads(raw_data)
                            yield event
                        except json.JSONDecodeError:
                            pass
