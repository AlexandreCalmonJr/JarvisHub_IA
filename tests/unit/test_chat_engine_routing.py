"""Testes do roteamento do chat entre agente conversacional e orquestrador.

Cobrem o contrato de ``ChatRequest.engine`` (auto/agent/orchestrator), a
disponibilidade real do provedor e a integridade do histórico no fallback.
"""

from __future__ import annotations

import json

import httpx
import pytest
from apps.api.auth import Principal

from apps.api.routers import chat
from apps.api.schemas import ChatRequest
from services.coding_agent import ProviderError


# ---------------------------------------------------------------------------
# Helpers e duplos de teste
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def _reset_reachability_cache():
    chat._reachability.update(checked_at=0.0, ok=False, provider="")
    yield
    chat._reachability.update(checked_at=0.0, ok=False, provider="")


def _provider_available(monkeypatch, available: bool):
    calls = {"count": 0}

    async def fake_reachable() -> bool:
        calls["count"] += 1
        return available

    monkeypatch.setattr(chat, "_provider_reachable", fake_reachable)
    return calls


class FakeDB:
    def __init__(self):
        self.messages: list[dict] = []
        self.tasks: list[dict] = []
        self.projects: list[dict] = []

    def add_chat_message(
        self, session_id, role, content, project_id=None, owner_user_id=None
    ):
        self.messages.append(
            {
                "session_id": session_id,
                "role": role,
                "content": content,
                "project_id": project_id,
                "owner_user_id": owner_user_id,
            }
        )

    def register_project(self, **kwargs):
        self.projects.append(kwargs)

    def save_task(self, **kwargs):
        self.tasks.append(kwargs)


class FakeAgentRuntime:
    def __init__(self, db: FakeDB, *, fail: bool = False):
        self.db = db
        self.fail = fail
        self.complete_calls = []
        self.run_calls = []

    def _persist_user(self, config):
        self.db.add_chat_message(
            config.session_id, "user", config.prompt, config.project_id,
            owner_user_id=config.owner_user_id,
        )

    async def complete(self, config):
        self.complete_calls.append(config)
        self._persist_user(config)
        if self.fail:
            raise ProviderError("provedor offline")
        self.db.add_chat_message(
            config.session_id, "assistant", "resposta do agente", config.project_id
        )
        return {
            "engine": "agent",
            "session_id": config.session_id,
            "final_summary": "resposta do agente",
            "is_completed": True,
            "approval_required": False,
        }

    async def run(self, config):
        self.run_calls.append(config)
        session_id = config.session_id or "chat-gerado"
        self.db.add_chat_message(
            session_id, "user", config.prompt, config.project_id,
            owner_user_id=config.owner_user_id,
        )
        yield {"type": "start", "session_id": session_id, "engine": "agent"}
        if self.fail:
            yield {
                "type": "error",
                "error": "provedor offline",
                "session_id": session_id,
                "provider": "fake",
            }
            return
        self.db.add_chat_message(session_id, "assistant", "resposta do agente", config.project_id)
        yield {"type": "token", "chunk": "resposta do agente"}
        yield {
            "type": "done",
            "session_id": session_id,
            "final_summary": "resposta do agente",
            "engine": "agent",
        }


class FakeMaster:
    def __init__(self, db: FakeDB):
        self.db = db
        self.calls = []

    async def execute_task(
        self, user_prompt, session_id=None, project_id=None, owner_user_id=None
    ):
        self.calls.append(
            {
                "user_prompt": user_prompt,
                "session_id": session_id,
                "project_id": project_id,
            }
        )
        resolved_session = session_id or "sessao-orquestrador"
        return {
            "task_id": "task-1",
            "session_id": resolved_session,
            "final_summary": "resposta do maestro",
            "classified_intent": "action",
            "selected_agents": ["jarvis_master"],
            "plan_steps": [],
            "is_completed": True,
            "approval_required": False,
        }


class FakeProvider:
    def __init__(self, *, name="fake-ollama", base_url=None, api_key=""):
        self.name = name
        self.base_url = base_url
        self.api_key = api_key


class FakeProviderRuntime:
    def __init__(self, provider):
        self.provider_factory = lambda: provider


class FakeHTTPResponse:
    def __init__(self, status_code):
        self.status_code = status_code


class FakeHTTPClient:
    def __init__(self, *args, status_code=200, **kwargs):
        self.status_code = status_code

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url):
        return FakeHTTPResponse(self.status_code)


async def _read_sse(response):
    events = []
    async for raw in response.body_iterator:
        text = raw.decode() if isinstance(raw, bytes) else raw
        for line in text.strip().splitlines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
    return events


# ---------------------------------------------------------------------------
# Resolução do motor
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "prompt",
    [
        "Qual é a capital da França?",
        "Explique o que é um grafo de estados.",
        "Como funciona o streaming SSE?",
        "Me conte uma história curta sobre robôs.",
        "Podemos conversar sobre carreira?",
        "Quero entender a implementação do módulo de autenticação.",
    ],
)
async def test_auto_question_and_conversation_use_agent_when_provider_available(
    monkeypatch, prompt
):
    calls = _provider_available(monkeypatch, True)

    engine = await chat._resolve_engine(ChatRequest(prompt=prompt, engine="auto"))

    assert engine == "agent"
    assert calls["count"] == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "prompt",
    [
        "Planeje a implementação do novo módulo de autenticação.",
        "Faça um plano para criar um projeto de e-commerce.",
        "Qual o roadmap para melhorar o sistema?",
    ],
)
async def test_auto_planning_request_uses_agent_when_provider_available(monkeypatch, prompt):
    calls = _provider_available(monkeypatch, True)

    engine = await chat._resolve_engine(ChatRequest(prompt=prompt, engine="auto"))

    assert engine == "agent"
    assert calls["count"] == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "prompt",
    [
        "Crie um projeto novo chamado loja.",
        "Crie um novo módulo de pagamentos.",
        "Crie os arquivos iniciais do backend.",
        "Altere o arquivo main.py para adicionar logs.",
        "Faça uma alteração no arquivo de configuração.",
        "Implemente a autenticação no módulo de usuários.",
        "Execute o comando de build no terminal.",
        "Rode os testes do projeto.",
        "Rode a aplicação para validar a mudança.",
        "Aprove a solicitação de alteração.",
        "Faça rollback da última alteração.",
        "Inicie uma mesa redonda para decidir a arquitetura.",
        "Faça uma auditoria operacional dos agentes.",
    ],
)
async def test_auto_critical_actions_stay_on_orchestrator(monkeypatch, prompt):
    calls = _provider_available(monkeypatch, True)

    engine = await chat._resolve_engine(ChatRequest(prompt=prompt, engine="auto"))

    assert engine == "orchestrator"
    # Ações críticas não devem depender da sondagem do provedor conversacional.
    assert calls["count"] == 0


@pytest.mark.asyncio
async def test_auto_falls_back_to_orchestrator_when_provider_unavailable(monkeypatch):
    _provider_available(monkeypatch, False)

    engine = await chat._resolve_engine(
        ChatRequest(prompt="Qual é a capital da França?", engine="auto")
    )

    assert engine == "orchestrator"


@pytest.mark.asyncio
async def test_explicit_agent_ignores_provider_availability(monkeypatch):
    calls = _provider_available(monkeypatch, False)

    engine = await chat._resolve_engine(ChatRequest(prompt="Crie um projeto novo.", engine="agent"))

    assert engine == "agent"
    assert calls["count"] == 0


@pytest.mark.asyncio
async def test_explicit_orchestrator_wins_over_reachable_provider(monkeypatch):
    calls = _provider_available(monkeypatch, True)

    engine = await chat._resolve_engine(
        ChatRequest(prompt="Qual é a capital da França?", engine="orchestrator")
    )

    assert engine == "orchestrator"
    assert calls["count"] == 0


# ---------------------------------------------------------------------------
# Disponibilidade real do provedor (mecanismo existente)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_provider_reachable_when_local_ollama_responds(monkeypatch):
    provider = FakeProvider(base_url="http://127.0.0.1:11434")
    monkeypatch.setattr(chat, "chat_runtime", FakeProviderRuntime(provider))
    monkeypatch.setattr(
        httpx, "AsyncClient", lambda *args, **kwargs: FakeHTTPClient(status_code=200)
    )

    assert await chat._provider_reachable() is True


@pytest.mark.asyncio
async def test_provider_unreachable_when_local_ollama_is_down(monkeypatch):
    provider = FakeProvider(base_url="http://127.0.0.1:11434")
    monkeypatch.setattr(chat, "chat_runtime", FakeProviderRuntime(provider))
    monkeypatch.setattr(
        httpx, "AsyncClient", lambda *args, **kwargs: FakeHTTPClient(status_code=503)
    )

    assert await chat._provider_reachable() is False


@pytest.mark.asyncio
async def test_provider_reachable_when_online_credential_is_configured(monkeypatch):
    provider = FakeProvider(
        name="groq",
        base_url="https://api.groq.com/openai/v1",
        api_key="valid-key",
    )
    monkeypatch.setattr(chat, "chat_runtime", FakeProviderRuntime(provider))

    assert await chat._provider_reachable() is True


# ---------------------------------------------------------------------------
# Endpoint JSON: roteamento e histórico
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_json_endpoint_auto_conversation_uses_agent(monkeypatch):
    db = FakeDB()
    agent = FakeAgentRuntime(db)
    master = FakeMaster(db)
    monkeypatch.setattr(chat, "db_manager", db)
    monkeypatch.setattr(chat, "chat_runtime", agent)
    monkeypatch.setattr(chat, "jarvis_master", master)
    _provider_available(monkeypatch, True)

    result = await chat.chat_endpoint(
        ChatRequest(prompt="Qual é a capital da França?", engine="auto"), principal=Principal(subject_id="test-user", kind="human", role="developer")
    )

    assert result["engine"] == "agent"
    assert len(agent.complete_calls) == 1
    assert master.calls == []
    assert [(m["role"], m["content"]) for m in db.messages] == [
        ("user", "Qual é a capital da França?"),
        ("assistant", "resposta do agente"),
    ]


@pytest.mark.asyncio
async def test_json_endpoint_auto_action_uses_orchestrator(monkeypatch):
    db = FakeDB()
    agent = FakeAgentRuntime(db)
    master = FakeMaster(db)
    monkeypatch.setattr(chat, "db_manager", db)
    monkeypatch.setattr(chat, "chat_runtime", agent)
    monkeypatch.setattr(chat, "jarvis_master", master)
    _provider_available(monkeypatch, True)

    result = await chat.chat_endpoint(
        ChatRequest(prompt="Crie um projeto novo chamado loja.", engine="auto"), principal=Principal(subject_id="test-user", kind="human", role="developer")
    )

    assert result["final_summary"] == "resposta do maestro"
    assert agent.complete_calls == []
    assert len(master.calls) == 1
    assert [(m["role"], m["content"]) for m in db.messages] == [
        ("user", "Crie um projeto novo chamado loja."),
        ("assistant", "resposta do maestro"),
    ]


@pytest.mark.asyncio
async def test_json_endpoint_auto_unavailable_provider_uses_orchestrator(monkeypatch):
    db = FakeDB()
    agent = FakeAgentRuntime(db)
    master = FakeMaster(db)
    monkeypatch.setattr(chat, "db_manager", db)
    monkeypatch.setattr(chat, "chat_runtime", agent)
    monkeypatch.setattr(chat, "jarvis_master", master)
    _provider_available(monkeypatch, False)

    await chat.chat_endpoint(ChatRequest(prompt="Qual é a capital da França?", engine="auto"), principal=Principal(subject_id="test-user", kind="human", role="developer"))

    assert agent.complete_calls == []
    assert len(master.calls) == 1


@pytest.mark.asyncio
async def test_json_endpoint_explicit_agent_persists_once_and_falls_back(monkeypatch):
    db = FakeDB()
    agent = FakeAgentRuntime(db, fail=True)
    master = FakeMaster(db)
    monkeypatch.setattr(chat, "db_manager", db)
    monkeypatch.setattr(chat, "chat_runtime", agent)
    monkeypatch.setattr(chat, "jarvis_master", master)
    _provider_available(monkeypatch, False)

    result = await chat.chat_endpoint(
        ChatRequest(prompt="Qual é a capital da França?", engine="agent"), principal=Principal(subject_id="test-user", kind="human", role="developer")
    )

    assert result["final_summary"] == "resposta do maestro"
    assert len(agent.complete_calls) == 1
    assert len(master.calls) == 1
    # O fallback precisa reutilizar a sessão do agente e não repetir o turno do utilizador.
    assert master.calls[0]["session_id"] == agent.complete_calls[0].session_id
    assert [(m["role"], m["content"]) for m in db.messages] == [
        ("user", "Qual é a capital da França?"),
        ("assistant", "resposta do maestro"),
    ]


@pytest.mark.asyncio
async def test_json_endpoint_explicit_orchestrator_skips_agent(monkeypatch):
    db = FakeDB()
    agent = FakeAgentRuntime(db)
    master = FakeMaster(db)
    monkeypatch.setattr(chat, "db_manager", db)
    monkeypatch.setattr(chat, "chat_runtime", agent)
    monkeypatch.setattr(chat, "jarvis_master", master)
    _provider_available(monkeypatch, True)

    await chat.chat_endpoint(
        ChatRequest(prompt="Qual é a capital da França?", engine="orchestrator"), principal=Principal(subject_id="test-user", kind="human", role="developer")
    )

    assert agent.complete_calls == []
    assert len(master.calls) == 1


# ---------------------------------------------------------------------------
# Endpoint SSE: streaming e fallback
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_stream_endpoint_auto_conversation_streams_agent(monkeypatch):
    db = FakeDB()
    agent = FakeAgentRuntime(db)
    master = FakeMaster(db)
    monkeypatch.setattr(chat, "db_manager", db)
    monkeypatch.setattr(chat, "chat_runtime", agent)
    monkeypatch.setattr(chat, "jarvis_master", master)
    _provider_available(monkeypatch, True)

    response = await chat.chat_stream_endpoint(
        ChatRequest(prompt="Explique o que é SSE.", engine="auto"), principal=Principal(subject_id="test-user", kind="human", role="developer")
    )
    events = await _read_sse(response)

    assert events[0]["type"] == "start"
    assert events[-1]["type"] == "done"
    assert events[-1]["engine"] == "agent"
    assert master.calls == []
    assert len(agent.run_calls) == 1


@pytest.mark.asyncio
async def test_stream_endpoint_auto_action_uses_orchestrator(monkeypatch):
    db = FakeDB()
    agent = FakeAgentRuntime(db)
    master = FakeMaster(db)
    monkeypatch.setattr(chat, "db_manager", db)
    monkeypatch.setattr(chat, "chat_runtime", agent)
    monkeypatch.setattr(chat, "jarvis_master", master)
    _provider_available(monkeypatch, True)

    response = await chat.chat_stream_endpoint(
        ChatRequest(prompt="Altere o arquivo main.py.", engine="auto"), principal=Principal(subject_id="test-user", kind="human", role="developer")
    )
    events = await _read_sse(response)

    assert any(event.get("engine") == "orchestrator" for event in events)
    assert events[-1]["type"] == "done"
    assert agent.run_calls == []
    assert len(master.calls) == 1


@pytest.mark.asyncio
async def test_stream_endpoint_fallback_keeps_single_user_turn(monkeypatch):
    db = FakeDB()
    agent = FakeAgentRuntime(db, fail=True)
    master = FakeMaster(db)
    monkeypatch.setattr(chat, "db_manager", db)
    monkeypatch.setattr(chat, "chat_runtime", agent)
    monkeypatch.setattr(chat, "jarvis_master", master)
    _provider_available(monkeypatch, False)

    response = await chat.chat_stream_endpoint(
        ChatRequest(prompt="Explique o que é SSE.", engine="agent"), principal=Principal(subject_id="test-user", kind="human", role="developer")
    )
    events = await _read_sse(response)

    assert events[-1]["type"] == "done"
    assert events[-1]["engine"] == "orchestrator"
    assert len(agent.run_calls) == 1
    assert len(master.calls) == 1
    agent_session = next(e["session_id"] for e in events if e["type"] == "start")
    assert master.calls[0]["session_id"] == agent_session
    # Apenas um turno de utilizador, mesmo após o fallback, na mesma sessão.
    user_messages = [m for m in db.messages if m["role"] == "user"]
    assert len(user_messages) == 1
    assert user_messages[0]["content"] == "Explique o que é SSE."
    assert {m["session_id"] for m in db.messages} == {agent_session}
