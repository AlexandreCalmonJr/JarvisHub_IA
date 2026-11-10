"""Testes do runtime de chat unificado (memória + streaming)."""

from __future__ import annotations

import pytest

from services.coding_agent import ChatAgentRuntime, ChatRunConfig, ChatTurn, ProviderReply
from services.coding_agent.providers import ChatProvider
from services.memory import DatabaseManager


class StreamingProvider:
    name = "fake"
    default_model = "fake-chat-1"

    def __init__(self):
        self.received: list[list[ChatTurn]] = []

    def resolve_model(self, requested: str | None) -> str:
        return (requested or "").strip() or self.default_model

    async def stream(self, *, turns, tools, model, temperature, max_tokens, timeout_seconds):
        self.received.append(list(turns))
        for part in ["Olá", ", ", "mundo", "!"]:
            yield part

    async def complete(self, *, turns, tools, model, temperature, max_tokens, timeout_seconds):
        self.received.append(list(turns))
        return ProviderReply(content="Olá, mundo!", model=self.default_model)


class CompletionOnlyProvider(ChatProvider):
    name = "completion-only"
    default_model = "fake-2"

    async def complete(self, *, turns, tools, model, temperature, max_tokens, timeout_seconds):
        return ProviderReply(content="resposta única", model=self.default_model)


async def _collect(agen):
    return [event async for event in agen]


@pytest.mark.asyncio
async def test_chat_streams_and_persists_history(tmp_path):
    db = DatabaseManager(db_path=str(tmp_path / "chat.db"))
    provider = StreamingProvider()
    runtime = ChatAgentRuntime(provider_factory=lambda: provider, db_manager=db)

    events = await _collect(
        runtime.run(
            ChatRunConfig(prompt="Qual é a arquitetura?", session_id="s1", project_id=None)
        )
    )

    assert events[0]["type"] == "start"
    text = "".join(e["chunk"] for e in events if e["type"] == "token")
    assert text == "Olá, mundo!"
    assert events[-1]["type"] == "done"
    assert events[-1]["final_summary"] == "Olá, mundo!"

    # Histórico persistido por mensagem
    stored = db.list_chat_messages("s1")
    assert [(m["role"], m["content"]) for m in stored] == [
        ("user", "Qual é a arquitetura?"),
        ("assistant", "Olá, mundo!"),
    ]

    # Segunda execução envia o histórico ao modelo
    await _collect(
        runtime.run(ChatRunConfig(prompt="E os módulos?", session_id="s1"))
    )
    second_turns = provider.received[-1]
    roles = [turn.role for turn in second_turns]
    assert roles[0] == "system"
    assert ("user", "Qual é a arquitetura?") in [
        (turn.role, turn.content) for turn in second_turns
    ]
    assert ("assistant", "Olá, mundo!") in [
        (turn.role, turn.content) for turn in second_turns
    ]
    assert second_turns[-1].content == "E os módulos?"


@pytest.mark.asyncio
async def test_chat_uses_fallback_streaming_when_provider_lacks_stream(tmp_path):
    db = DatabaseManager(db_path=str(tmp_path / "chat.db"))
    runtime = ChatAgentRuntime(provider_factory=CompletionOnlyProvider, db_manager=db)

    events = await _collect(runtime.run(ChatRunConfig(prompt="Oi", session_id="s2")))
    text = "".join(e["chunk"] for e in events if e["type"] == "token")
    assert text == "resposta única"
    assert events[-1]["final_summary"] == "resposta única"


@pytest.mark.asyncio
async def test_chat_complete_returns_task_state_shape(tmp_path):
    db = DatabaseManager(db_path=str(tmp_path / "chat.db"))
    provider = StreamingProvider()
    runtime = ChatAgentRuntime(provider_factory=lambda: provider, db_manager=db)

    result = await runtime.complete(ChatRunConfig(prompt="Resuma", session_id="s3"))
    assert result["engine"] == "agent"
    assert result["final_summary"] == "Olá, mundo!"
    assert result["is_completed"] is True
