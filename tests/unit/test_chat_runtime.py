"""Testes do runtime de chat unificado (memória + streaming)."""

from __future__ import annotations

import asyncio

import pytest

from services.coding_agent import ChatAgentRuntime, ChatRunConfig, ChatTurn, ProviderReply
from services.coding_agent.providers import ChatProvider
from services.memory import DatabaseManager
from services.tool_gateway.web_search import SearchResult, SearchUnavailableError


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
        runtime.run(ChatRunConfig(prompt="Qual é a arquitetura?", session_id="s1", project_id=None))
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
    await _collect(runtime.run(ChatRunConfig(prompt="E os módulos?", session_id="s1")))
    second_turns = provider.received[-1]
    roles = [turn.role for turn in second_turns]
    assert roles[0] == "system"
    assert ("user", "Qual é a arquitetura?") in [(turn.role, turn.content) for turn in second_turns]
    assert ("assistant", "Olá, mundo!") in [(turn.role, turn.content) for turn in second_turns]
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


@pytest.mark.asyncio
async def test_chat_includes_search_sources_for_ui_citations(monkeypatch, tmp_path):
    async def search(*_args, **_kwargs):
        return [
            SearchResult(
                title="Fonte de teste",
                url="https://example.org",
                snippet="Dado recente",
                retrieved_at="2026-11-12T00:00:00+00:00",
            )
        ]

    monkeypatch.setattr("services.tool_gateway.web_search.safe_web_search.search", search)
    runtime = ChatAgentRuntime(provider_factory=StreamingProvider)
    events = await _collect(
        runtime.run(
            ChatRunConfig(
                prompt="Pesquise na web sobre um tópico atual", session_id="search-source"
            )
        )
    )
    assert events[0]["sources"][0]["url"] == "https://example.org"
    assert events[-1]["sources"][0]["retrieved_at"].startswith("2026-11-12")


@pytest.mark.asyncio
async def test_chat_explicitly_marks_search_failure_in_context(monkeypatch, tmp_path):
    async def unavailable(*_args, **_kwargs):
        raise SearchUnavailableError("Busca indisponível: sem rede")

    monkeypatch.setattr("services.tool_gateway.web_search.safe_web_search.search", unavailable)
    provider = StreamingProvider()
    runtime = ChatAgentRuntime(provider_factory=lambda: provider)
    await _collect(
        runtime.run(
            ChatRunConfig(prompt="Pesquise na web sobre algo atual", session_id="search-error")
        )
    )
    assert "A busca web falhou" in provider.received[0][0].content


@pytest.mark.asyncio
async def test_chat_cancellation_propagates_to_provider():
    started = asyncio.Event()

    class HangingProvider(StreamingProvider):
        async def stream(self, **_kwargs):
            yield "primeiro"
            started.set()
            await asyncio.Event().wait()

    runtime = ChatAgentRuntime(provider_factory=HangingProvider)

    async def consume():
        return [
            event async for event in runtime.run(ChatRunConfig(prompt="oi", session_id="cancel"))
        ]

    task = asyncio.create_task(consume())
    await started.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
