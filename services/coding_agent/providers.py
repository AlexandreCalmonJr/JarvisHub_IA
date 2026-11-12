"""Provedores de chat com suporte a *tool calling* para o agente de código.

O runtime é agnóstico de fornecedor: este módulo traduz o histórico interno
(:class:`ChatTurn`) e as especificações de ferramentas (:class:`ToolSpec`) para
os três protocolos suportados:

* **Ollama** — ``POST /api/chat`` (local-first, padrão do JARVIS);
* **OpenAI-compatível** — ``POST /chat/completions`` (OpenAI, Groq, DeepSeek,
  Gemini via endpoint compatível, OpenRouter, servidores locais);
* **Anthropic** — ``POST /messages`` com blocos ``tool_use`` / ``tool_result``.

Todos os provedores retornam um :class:`ProviderReply` normalizado.
"""

from __future__ import annotations

import json
import logging
import uuid
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator, Iterator
from types import SimpleNamespace
from typing import Any

import httpx

from services.model_runtime.provider_defaults import default_model_for_provider

from .types import ChatTurn, ProviderReply, ToolCall, ToolSpec

logger = logging.getLogger("jarvis.coding_agent.providers")

STREAM_CHUNK_CHARS = 64


def _fallback_chunks(text: str, size: int = STREAM_CHUNK_CHARS) -> Iterator[str]:
    """Divide um texto em blocos para simular streaming quando o provedor não suporta."""
    for index in range(0, len(text), size):
        yield text[index : index + size]


class ProviderError(RuntimeError):
    """Erro legível de comunicação com o provedor de modelo."""


# ---------------------------------------------------------------------------
# Conversão de histórico
# ---------------------------------------------------------------------------
def _parse_arguments(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return {"_raw": raw}
    return {}


def to_openai_messages(turns: list[ChatTurn]) -> list[dict[str, Any]]:
    """Converte o histórico interno para o formato OpenAI/Ollama chat."""
    messages: list[dict[str, Any]] = []
    for turn in turns:
        if turn.role == "tool":
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": turn.tool_call_id or turn.tool_name or "tool",
                    "content": turn.content,
                }
            )
            continue
        if turn.role == "assistant" and turn.tool_calls:
            messages.append(
                {
                    "role": "assistant",
                    "content": turn.content or "",
                    "tool_calls": [
                        {
                            "id": call.id,
                            "type": "function",
                            "function": {
                                "name": call.name,
                                "arguments": json.dumps(call.arguments, ensure_ascii=False),
                            },
                        }
                        for call in turn.tool_calls
                    ],
                }
            )
            continue
        messages.append({"role": turn.role, "content": turn.content})
    return messages


def to_ollama_messages(turns: list[ChatTurn]) -> list[dict[str, Any]]:
    """Formato aceito pelo endpoint ``/api/chat`` do Ollama."""
    messages: list[dict[str, Any]] = []
    for turn in turns:
        if turn.role == "tool":
            messages.append(
                {
                    "role": "tool",
                    "content": turn.content,
                    "tool_name": turn.tool_name or "tool",
                }
            )
            continue
        if turn.role == "assistant" and turn.tool_calls:
            messages.append(
                {
                    "role": "assistant",
                    "content": turn.content or "",
                    "tool_calls": [
                        {"function": {"name": c.name, "arguments": c.arguments}}
                        for c in turn.tool_calls
                    ],
                }
            )
            continue
        messages.append({"role": turn.role, "content": turn.content})
    return messages


def to_anthropic_messages(
    turns: list[ChatTurn],
) -> tuple[str | None, list[dict[str, Any]]]:
    """Retorna ``(system_prompt, messages)`` no formato da Anthropic.

    A API exige alternância ``user``/``assistant``; blocos consecutivos do mesmo
    papel são mesclados para manter a conversa válida após várias ferramentas.
    """
    system_parts: list[str] = []
    messages: list[dict[str, Any]] = []

    def _append(role: str, blocks: list[dict[str, Any]]) -> None:
        if messages and messages[-1]["role"] == role:
            messages[-1]["content"].extend(blocks)
        else:
            messages.append({"role": role, "content": list(blocks)})

    for turn in turns:
        if turn.role == "system":
            if turn.content:
                system_parts.append(turn.content)
            continue
        if turn.role == "assistant":
            blocks: list[dict[str, Any]] = []
            if turn.content:
                blocks.append({"type": "text", "text": turn.content})
            for call in turn.tool_calls:
                blocks.append(
                    {
                        "type": "tool_use",
                        "id": call.id,
                        "name": call.name,
                        "input": call.arguments,
                    }
                )
            if not blocks:
                blocks.append({"type": "text", "text": "(sem conteúdo)"})
            _append("assistant", blocks)
            continue
        if turn.role == "tool":
            _append(
                "user",
                [
                    {
                        "type": "tool_result",
                        "tool_use_id": turn.tool_call_id or turn.tool_name or "tool",
                        "content": turn.content,
                    }
                ],
            )
            continue
        _append("user", [{"type": "text", "text": turn.content}])

    system = "\n\n".join(part for part in system_parts if part.strip()) or None
    return system, messages


# ---------------------------------------------------------------------------
# Interface base
# ---------------------------------------------------------------------------
class ChatProvider(ABC):
    """Contrato mínimo de um provedor de chat com ferramentas."""

    name: str = "base"
    default_model: str = ""

    @abstractmethod
    async def complete(
        self,
        *,
        turns: list[ChatTurn],
        tools: list[ToolSpec],
        model: str | None,
        temperature: float,
        max_tokens: int,
        timeout_seconds: float,
    ) -> ProviderReply:
        raise NotImplementedError

    def resolve_model(self, requested: str | None) -> str:
        cleaned = (requested or "").strip()
        if cleaned and cleaned not in {"mock-model"}:
            return cleaned
        return self.default_model

    async def stream(
        self,
        *,
        turns: list[ChatTurn],
        tools: list[ToolSpec],
        model: str | None,
        temperature: float,
        max_tokens: int,
        timeout_seconds: float,
    ) -> AsyncIterator[str]:
        """Streaming de texto. Provedores sem suporte real usam blocos do resultado."""
        reply = await self.complete(
            turns=turns,
            tools=tools,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout_seconds=timeout_seconds,
        )
        for chunk in _fallback_chunks(reply.content):
            yield chunk


# ---------------------------------------------------------------------------
# Ollama
# ---------------------------------------------------------------------------
class OllamaChatProvider(ChatProvider):
    """Cliente do endpoint nativo ``/api/chat`` do Ollama (suporta tools)."""

    name = "ollama"

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:11434",
        default_model: str = "llama3.2:3b",
    ):
        self.base_url = base_url.rstrip("/")
        self.default_model = default_model

    async def complete(
        self,
        *,
        turns: list[ChatTurn],
        tools: list[ToolSpec],
        model: str | None,
        temperature: float,
        max_tokens: int,
        timeout_seconds: float,
    ) -> ProviderReply:
        target_model = self.resolve_model(model)
        payload: dict[str, Any] = {
            "model": target_model,
            "messages": to_ollama_messages(turns),
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        }
        if tools:
            payload["tools"] = [spec.to_openai_schema() for spec in tools]

        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                response = await client.post(f"{self.base_url}/api/chat", json=payload)
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as exc:
            detail = ""
            try:
                detail = exc.response.text[:300]
            except Exception:
                detail = str(exc)
            raise ProviderError(
                f"Ollama respondeu HTTP {exc.response.status_code}: {detail}"
            ) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(
                f"Não foi possível contactar o Ollama em '{self.base_url}'. "
                f"Verifique se o serviço está em execução. Detalhe: {exc}"
            ) from exc

        message = data.get("message") or {}
        content = message.get("content") or data.get("response") or ""
        raw_calls = message.get("tool_calls") or []
        tool_calls = [
            ToolCall(
                id=str(item.get("id") or f"call_{uuid.uuid4().hex[:10]}"),
                name=(item.get("function") or {}).get("name", ""),
                arguments=_parse_arguments((item.get("function") or {}).get("arguments")),
            )
            for item in raw_calls
            if (item.get("function") or {}).get("name")
        ]
        return ProviderReply(
            content=content,
            tool_calls=tool_calls,
            model=target_model,
            prompt_tokens=int(data.get("prompt_eval_count") or 0),
            completion_tokens=int(data.get("eval_count") or 0),
            finish_reason="tool_calls" if tool_calls else str(data.get("done_reason") or "stop"),
        )

    async def stream(
        self,
        *,
        turns: list[ChatTurn],
        tools: list[ToolSpec],
        model: str | None,
        temperature: float,
        max_tokens: int,
        timeout_seconds: float,
    ) -> AsyncIterator[str]:
        target_model = self.resolve_model(model)
        payload: dict[str, Any] = {
            "model": target_model,
            "messages": to_ollama_messages(turns),
            "stream": True,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        if tools:
            payload["tools"] = [spec.to_openai_schema() for spec in tools]

        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                async with client.stream(
                    "POST", f"{self.base_url}/api/chat", json=payload
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            data = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        text = (data.get("message") or {}).get("content") or ""
                        if text:
                            yield text
        except httpx.HTTPStatusError as exc:
            detail = ""
            try:
                detail = exc.response.text[:300]
            except Exception:
                detail = str(exc)
            raise ProviderError(
                f"Ollama respondeu HTTP {exc.response.status_code}: {detail}"
            ) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(
                f"Não foi possível contactar o Ollama em '{self.base_url}'. "
                f"Verifique se o serviço está em execução. Detalhe: {exc}"
            ) from exc


# ---------------------------------------------------------------------------
# OpenAI-compatível
# ---------------------------------------------------------------------------
class OpenAICompatibleChatProvider(ChatProvider):
    """Cliente genérico para qualquer API compatível com OpenAI."""

    name = "openai_compatible"

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.openai.com/v1",
        default_model: str = "gpt-4o-mini",
        provider_name: str = "openai",
    ):
        self.api_key = (api_key or "").strip()
        self.base_url = base_url.rstrip("/")
        self.default_model = default_model
        self.name = (provider_name or "openai").lower()

    async def complete(
        self,
        *,
        turns: list[ChatTurn],
        tools: list[ToolSpec],
        model: str | None,
        temperature: float,
        max_tokens: int,
        timeout_seconds: float,
    ) -> ProviderReply:
        if not self.api_key:
            raise ProviderError(
                f"Chave de API não configurada para o provedor '{self.name}'."
            )

        target_model = self.resolve_model(model)
        messages = to_openai_messages(turns)
        payload: dict[str, Any] = {
            "model": target_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if tools:
            payload["tools"] = [spec.to_openai_schema() for spec in tools]
            payload["tool_choice"] = "auto"

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            detail = ""
            try:
                detail = exc.response.text[:300]
            except Exception:
                detail = str(exc)
            raise ProviderError(
                f"Provedor '{self.name}' respondeu HTTP {status}: {detail}"
            ) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(
                f"Falha de conexão com o provedor '{self.name}': {exc}"
            ) from exc

        choices = data.get("choices") or []
        choice = choices[0] if choices else {}
        message = choice.get("message") or {}
        content = message.get("content") or ""
        tool_calls = [
            ToolCall(
                id=str(item.get("id") or f"call_{uuid.uuid4().hex[:10]}"),
                name=(item.get("function") or {}).get("name", ""),
                arguments=_parse_arguments((item.get("function") or {}).get("arguments")),
            )
            for item in (message.get("tool_calls") or [])
            if (item.get("function") or {}).get("name")
        ]
        usage = data.get("usage") or {}
        return ProviderReply(
            content=content,
            tool_calls=tool_calls,
            model=data.get("model") or target_model,
            prompt_tokens=int(usage.get("prompt_tokens") or 0),
            completion_tokens=int(usage.get("completion_tokens") or 0),
            finish_reason=str(choice.get("finish_reason") or ("tool_calls" if tool_calls else "stop")),
        )

    async def stream(
        self,
        *,
        turns: list[ChatTurn],
        tools: list[ToolSpec],
        model: str | None,
        temperature: float,
        max_tokens: int,
        timeout_seconds: float,
    ) -> AsyncIterator[str]:
        if not self.api_key:
            raise ProviderError(
                f"Chave de API não configurada para o provedor '{self.name}'."
            )

        target_model = self.resolve_model(model)
        payload: dict[str, Any] = {
            "model": target_model,
            "messages": to_openai_messages(turns),
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        if tools:
            payload["tools"] = [spec.to_openai_schema() for spec in tools]
            payload["tool_choice"] = "auto"

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[5:].strip()
                        if not data_str or data_str == "[DONE]":
                            continue
                        try:
                            chunk = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        choices = chunk.get("choices") or []
                        if not choices:
                            continue
                        text = (choices[0].get("delta") or {}).get("content") or ""
                        if text:
                            yield text
        except httpx.HTTPStatusError as exc:
            detail = ""
            try:
                detail = exc.response.text[:300]
            except Exception:
                detail = str(exc)
            raise ProviderError(
                f"Provedor '{self.name}' respondeu HTTP {exc.response.status_code}: {detail}"
            ) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(
                f"Falha de conexão com o provedor '{self.name}': {exc}"
            ) from exc


# ---------------------------------------------------------------------------
# Anthropic
# ---------------------------------------------------------------------------
class AnthropicChatProvider(ChatProvider):
    """Cliente da Messages API da Anthropic com suporte a ``tool_use``."""

    name = "anthropic"

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.anthropic.com/v1",
        default_model: str = "claude-3-5-sonnet-20241022",
    ):
        self.api_key = (api_key or "").strip()
        self.base_url = base_url.rstrip("/")
        self.default_model = default_model

    async def complete(
        self,
        *,
        turns: list[ChatTurn],
        tools: list[ToolSpec],
        model: str | None,
        temperature: float,
        max_tokens: int,
        timeout_seconds: float,
    ) -> ProviderReply:
        if not self.api_key:
            raise ProviderError("Chave de API não configurada para o provedor 'anthropic'.")

        target_model = self.resolve_model(model)
        system, messages = to_anthropic_messages(turns)
        if not messages:
            messages = [{"role": "user", "content": [{"type": "text", "text": "(sem pedido)"}]}]

        payload: dict[str, Any] = {
            "model": target_model,
            "max_tokens": max_tokens,
            "messages": messages,
            "temperature": temperature,
        }
        if system:
            payload["system"] = system
        if tools:
            payload["tools"] = [spec.to_anthropic_schema() for spec in tools]

        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                response = await client.post(
                    f"{self.base_url}/messages", headers=headers, json=payload
                )
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            detail = ""
            try:
                detail = exc.response.text[:300]
            except Exception:
                detail = str(exc)
            raise ProviderError(
                f"Anthropic respondeu HTTP {status}: {detail}"
            ) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(f"Falha de conexão com a Anthropic: {exc}") from exc

        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        for block in data.get("content") or []:
            block_type = block.get("type")
            if block_type == "text":
                text_parts.append(block.get("text", ""))
            elif block_type == "tool_use":
                tool_calls.append(
                    ToolCall(
                        id=str(block.get("id") or f"call_{uuid.uuid4().hex[:10]}"),
                        name=str(block.get("name") or ""),
                        arguments=_parse_arguments(block.get("input")),
                    )
                )
        usage = data.get("usage") or {}
        return ProviderReply(
            content="".join(text_parts),
            tool_calls=tool_calls,
            model=data.get("model") or target_model,
            prompt_tokens=int(usage.get("input_tokens") or 0),
            completion_tokens=int(usage.get("output_tokens") or 0),
            finish_reason=str(data.get("stop_reason") or ("tool_calls" if tool_calls else "stop")),
        )

    async def stream(
        self,
        *,
        turns: list[ChatTurn],
        tools: list[ToolSpec],
        model: str | None,
        temperature: float,
        max_tokens: int,
        timeout_seconds: float,
    ) -> AsyncIterator[str]:
        if not self.api_key:
            raise ProviderError("Chave de API não configurada para o provedor 'anthropic'.")

        target_model = self.resolve_model(model)
        system, messages = to_anthropic_messages(turns)
        if not messages:
            messages = [{"role": "user", "content": [{"type": "text", "text": "(sem pedido)"}]}]

        payload: dict[str, Any] = {
            "model": target_model,
            "max_tokens": max_tokens,
            "messages": messages,
            "temperature": temperature,
            "stream": True,
        }
        if system:
            payload["system"] = system
        if tools:
            payload["tools"] = [spec.to_anthropic_schema() for spec in tools]

        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                async with client.stream(
                    "POST", f"{self.base_url}/messages", headers=headers, json=payload
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[5:].strip()
                        if not data_str:
                            continue
                        try:
                            event = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        event_type = event.get("type")
                        if event_type == "content_block_delta":
                            delta = event.get("delta") or {}
                            if delta.get("type") == "text_delta":
                                text = delta.get("text") or ""
                                if text:
                                    yield text
                        elif event_type == "error":
                            detail = (event.get("error") or {}).get("message", "erro desconhecido")
                            raise ProviderError(f"Anthropic interrompeu o streaming: {detail}")
        except httpx.HTTPStatusError as exc:
            detail = ""
            try:
                detail = exc.response.text[:300]
            except Exception:
                detail = str(exc)
            raise ProviderError(
                f"Anthropic respondeu HTTP {exc.response.status_code}: {detail}"
            ) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(f"Falha de conexão com a Anthropic: {exc}") from exc


# ---------------------------------------------------------------------------
# Provedor Resiliente com Failover Automático
# ---------------------------------------------------------------------------
class ResilientChatProvider(ChatProvider):
    """Provedor composto com failover automático e transparente.

    Tenta prioritariamente o provedor primário configurado (ex: Groq, OpenAI, Anthropic).
    Se o provedor primário falhar por erro de autenticação (HTTP 401), rate limit (HTTP 429),
    queda de rede externa ou indisponibilidade, redireciona transparentemente a requisição
    para o modelo local soberano (Ollama), assegurando 100% de disponibilidade conversacional.
    """

    def __init__(self, primary: ChatProvider, fallback: ChatProvider):
        self.primary = primary
        self.fallback = fallback
        self.name = f"{primary.name}->{fallback.name}"
        self.default_model = primary.default_model or fallback.default_model

    def resolve_model(self, requested: str | None) -> str:
        res = self.primary.resolve_model(requested)
        if res:
            return res
        return self.fallback.resolve_model(requested)

    async def complete(
        self,
        *,
        turns: list[ChatTurn],
        tools: list[ToolSpec],
        model: str | None,
        temperature: float,
        max_tokens: int,
        timeout_seconds: float,
    ) -> ProviderReply:
        try:
            return await self.primary.complete(
                turns=turns,
                tools=tools,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
            )
        except Exception as exc:
            logger.warning(
                "Provedor primário '%s' falhou (%s). Acionando failover local para '%s'.",
                self.primary.name,
                exc,
                self.fallback.name,
            )
            return await self.fallback.complete(
                turns=turns,
                tools=tools,
                model=self.fallback.default_model,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
            )

    async def stream(
        self,
        *,
        turns: list[ChatTurn],
        tools: list[ToolSpec],
        model: str | None,
        temperature: float,
        max_tokens: int,
        timeout_seconds: float,
    ) -> AsyncIterator[str]:
        emitted_any = False
        try:
            async for chunk in self.primary.stream(
                turns=turns,
                tools=tools,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
            ):
                emitted_any = True
                yield chunk
        except Exception as exc:
            if not emitted_any:
                logger.warning(
                    "Provedor primário '%s' falhou no streaming (%s). Acionando failover local para '%s'.",
                    self.primary.name,
                    exc,
                    self.fallback.name,
                )
                async for chunk in self.fallback.stream(
                    turns=turns,
                    tools=tools,
                    model=self.fallback.default_model,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    timeout_seconds=timeout_seconds,
                ):
                    yield chunk
            else:
                logger.error("Streaming interrompido após envio parcial de tokens: %s", exc)
                raise ProviderError(f"Streaming interrompido pelo provedor: {exc}") from exc


class GovernedChatProvider(ResilientChatProvider):
    """Provedor de chat que só permite egresso externo via HybridModelRouter.

    Reaproveita o failover do :class:`ResilientChatProvider`, mas toda a chamada
    ao provedor primário passa antes pela política central (dados sensíveis,
    orçamento e auditoria). Se a política negar, o pedido é servido localmente.
    """

    def __init__(
        self,
        primary: ChatProvider,
        fallback: ChatProvider,
        router: Any,
        has_external_data_approval: bool = False,
    ):
        super().__init__(primary=primary, fallback=fallback)
        self.router = router
        self.has_external_data_approval = has_external_data_approval
        self.name = f"governed({self.name})"

    @staticmethod
    def _turns_text(turns: list[ChatTurn]) -> str:
        return "\n".join(turn.content or "" for turn in turns)

    async def complete(
        self,
        *,
        turns: list[ChatTurn],
        tools: list[ToolSpec],
        model: str | None,
        temperature: float,
        max_tokens: int,
        timeout_seconds: float,
    ) -> ProviderReply:
        text = self._turns_text(turns)
        decision = await self.router.authorize_chat_egress(
            provider_name=self.primary.name,
            model_name=model,
            text=text,
            has_external_data_approval=self.has_external_data_approval,
            max_tokens=max_tokens,
        )
        if not decision.allowed:
            logger.warning(
                "Egresso externo negado (%s). Executando em provedor local '%s'.",
                decision.reason,
                self.fallback.name,
            )
            return await self.fallback.complete(
                turns=turns,
                tools=tools,
                model=self.fallback.default_model,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
            )

        try:
            reply = await self.primary.complete(
                turns=turns,
                tools=tools,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
            )
        except Exception as exc:
            self.router.release_chat_egress(decision.reservation_usd)
            logger.warning(
                "Provedor primário '%s' falhou (%s). Failover local para '%s'.",
                self.primary.name,
                exc,
                self.fallback.name,
            )
            return await self.fallback.complete(
                turns=turns,
                tools=tools,
                model=self.fallback.default_model,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
            )

        prompt_tokens = reply.prompt_tokens or max(1, len(text) // 4)
        completion_tokens = reply.completion_tokens or max(1, len(reply.content) // 4)
        self.router.settle_chat_egress(
            decision.reservation_usd,
            provider_name=self.primary.name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )
        return reply

    async def stream(
        self,
        *,
        turns: list[ChatTurn],
        tools: list[ToolSpec],
        model: str | None,
        temperature: float,
        max_tokens: int,
        timeout_seconds: float,
    ) -> AsyncIterator[str]:
        text = self._turns_text(turns)
        decision = await self.router.authorize_chat_egress(
            provider_name=self.primary.name,
            model_name=model,
            text=text,
            has_external_data_approval=self.has_external_data_approval,
            max_tokens=max_tokens,
        )
        if not decision.allowed:
            async for chunk in self.fallback.stream(
                turns=turns,
                tools=tools,
                model=self.fallback.default_model,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
            ):
                yield chunk
            return

        emitted_any = False
        emitted_chars = 0
        try:
            async for chunk in self.primary.stream(
                turns=turns,
                tools=tools,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
            ):
                emitted_any = True
                emitted_chars += len(chunk)
                yield chunk
        except Exception as exc:
            self.router.release_chat_egress(decision.reservation_usd)
            if emitted_any:
                logger.warning("Streaming externo interrompido: %s", exc)
                return
            logger.warning(
                "Provedor primário '%s' falhou no streaming (%s). Failover local.",
                self.primary.name,
                exc,
            )
            async for chunk in self.fallback.stream(
                turns=turns,
                tools=tools,
                model=self.fallback.default_model,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
            ):
                yield chunk
            return

        self.router.settle_chat_egress(
            decision.reservation_usd,
            provider_name=self.primary.name,
            prompt_tokens=max(1, len(text) // 4),
            completion_tokens=max(1, emitted_chars // 4),
            route="chat_stream_estimated",
        )


# ---------------------------------------------------------------------------
# Fábrica
# ---------------------------------------------------------------------------
def resolve_chat_provider(
    online_config: Any | None = None,
    local_provider: ChatProvider | None = None,
) -> ChatProvider:
    """Escolhe o provedor adequado com base na configuração híbrida persistida.

    Sempre prefere o Ollama local quando o gateway online está desativado, sem
    chave de API, com mock key ou quando o utilizador escolheu explicitamente o modo local.
    Quando uma chave online válida está ativa, encapsula em um ResilientChatProvider
    para garantir failover transparente para o Ollama local em caso de falha de conexão.
    """
    local = local_provider or OllamaChatProvider(default_model="llama3.2:3b")

    if online_config is None:
        return local
    if not getattr(online_config, "enabled", False):
        return local

    api_key = (getattr(online_config, "api_key", "") or "").strip()
    if not api_key or "mock" in api_key.lower():
        # Chaves de teste ou ausentes não tentam conexão externa inútil
        return local

    provider_name = (getattr(online_config, "provider_name", "openai") or "openai").lower()
    base_url = getattr(online_config, "base_url", None)
    default_model = getattr(online_config, "default_model", None)

    if provider_name == "anthropic" or "anthropic.com" in (base_url or ""):
        primary = AnthropicChatProvider(
            api_key=api_key,
            base_url=base_url or "https://api.anthropic.com/v1",
            default_model=default_model or "claude-3-5-sonnet-20241022",
        )
    else:
        primary = OpenAICompatibleChatProvider(
            api_key=api_key,
            base_url=base_url or "https://api.openai.com/v1",
            default_model=default_model or default_model_for_provider(provider_name),
            provider_name=provider_name,
        )

    return ResilientChatProvider(primary=primary, fallback=local)


def resolve_governed_chat_provider(
    online_config: Any | None,
    router: Any,
    local_provider: ChatProvider | None = None,
    has_external_data_approval: bool = False,
    key_id: str | None = None,
    owner_user_id: str | None = None,
) -> ChatProvider:
    """Resolve o provedor de chat e aplica a política central do HybridRouter.

    Quando ``key_id`` ou ``owner_user_id`` são indicados, a credencial da conta
    tem prioridade sobre o gateway global. Isto permite que cada especialista
    use a chave e o modelo atribuídos à conta autenticada.
    """
    effective_config = online_config
    vault = getattr(router, "key_vault", None) if router is not None else None

    account_profile = None
    if vault is not None and (key_id or owner_user_id):
        try:
            if key_id:
                account_profile = vault.get_key_for_request(key_id, owner_user_id)
            else:
                account_profile = vault.resolve_active_key(owner_user_id)
        except Exception as exc:
            logger.warning("Falha ao resolver a chave da conta: %s", exc)

    if (
        account_profile is not None
        and account_profile.is_active
        and account_profile.api_key
    ):
        # Segredo recuperado em memória apenas para criar o provider;
        # nunca é persistido na configuração de agentes.
        effective_config = SimpleNamespace(
            enabled=True,
            api_key=account_profile.api_key,
            provider_name=account_profile.provider,
            base_url=account_profile.base_url,
            default_model=account_profile.default_model,
        )
    elif (
        online_config is not None
        and getattr(online_config, "enabled", False)
        and not (getattr(online_config, "api_key", None) or "").strip()
        and getattr(online_config, "key_id", None)
        and vault is not None
    ):
        profile = vault.get_key(online_config.key_id)
        if profile and profile.is_active and profile.api_key:
            # Segredo recuperado em memória apenas para criar o provider;
            # o JSON de configuração contém somente o identificador da chave.
            effective_config = SimpleNamespace(
                enabled=True,
                api_key=profile.api_key,
                provider_name=profile.provider,
                base_url=profile.base_url,
                default_model=profile.default_model,
            )

    provider = resolve_chat_provider(effective_config, local_provider)
    if isinstance(provider, ResilientChatProvider) and router is not None:
        return GovernedChatProvider(
            primary=provider.primary,
            fallback=provider.fallback,
            router=router,
            has_external_data_approval=has_external_data_approval,
        )
    return provider
