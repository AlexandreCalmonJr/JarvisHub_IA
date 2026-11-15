import json

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api import deps
from apps.api.main import app
from services.coding_agent.providers import ChatProvider
from services.coding_agent.types import ChatTurn, ProviderReply, ToolCall, ToolSpec


class _StubChatProvider(ChatProvider):
    """Provider determinístico para não depender do Ollama nos testes de API."""

    name = "stub"
    default_model = "stub-model"

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
        return ProviderReply(
            content="Resposta sintética e determinística do especialista.",
            model=self.resolve_model(model),
            prompt_tokens=12,
            completion_tokens=9,
            finish_reason="stop",
        )


class _ToolThenAnswerProvider(_StubChatProvider):
    """Simula uma chamada ReAct: lê o ficheiro e só depois responde."""

    name = "stub-tools"

    def __init__(self) -> None:
        self.calls = 0

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
        self.calls += 1
        if self.calls == 1:
            return ProviderReply(
                content="Vou inspecionar o ficheiro do projeto.",
                tool_calls=[
                    ToolCall(
                        id="call-read-app",
                        name="read_file",
                        arguments={"path": "app.py"},
                    )
                ],
                model=self.resolve_model(model),
                prompt_tokens=20,
                completion_tokens=8,
                finish_reason="tool_calls",
            )
        return ProviderReply(
            content="O app.py define duas rotas: /health e /items.",
            model=self.resolve_model(model),
            prompt_tokens=30,
            completion_tokens=12,
            finish_reason="stop",
        )


@pytest.fixture(autouse=True)
def stub_autonomous_agent_provider(monkeypatch):
    """Evita chamadas reais ao modelo nos testes de integração da API."""
    from apps.api.routers import agents as agents_router

    provider = _StubChatProvider()
    runtime = agents_router.autonomous_agent_runtime
    monkeypatch.setattr(runtime, "provider_factory", lambda: provider)
    monkeypatch.setattr(
        runtime,
        "routed_provider_factory",
        lambda key_id, owner_user_id: provider,
    )


@pytest.mark.asyncio
async def test_autonomous_agent_history_api():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/agents/data_scientist/history?session_id=ses-test-history")
        assert resp.status_code == 200
        data = resp.json()
        assert data["agent_role"] == "data_scientist"
        assert data["session_id"] == "ses-test-history"
        assert "messages" in data


@pytest.mark.asyncio
async def test_autonomous_agent_task_api():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {
            "prompt": "Elabore um plano de arquitetura de dados",
            "mode": "plan",
            "session_id": "ses-task-ds",
        }
        resp = await ac.post("/api/v1/agents/data_scientist/task", json=payload)
        assert resp.status_code == 200
        contract = resp.json()
        assert contract["agent_role"] == "data_scientist"
        assert "summary" in contract
        assert "evidence" in contract
        assert "actions_taken" in contract
        assert "resource_usage" in contract


@pytest.mark.asyncio
async def test_autonomous_agent_stream_api():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {
            "prompt": "Revise o schema de segurança",
            "mode": "plan",
            "session_id": "ses-stream-sec",
        }
        resp = await ac.post("/api/v1/agents/cybersecurity_engineer/stream", json=payload)
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")

        events = []
        for line in resp.text.split("\n"):
            line = line.strip()
            if line.startswith("data: "):
                raw_json = line[6:]
                try:
                    events.append(json.loads(raw_json))
                except json.JSONDecodeError:
                    continue

        types = [e.get("type") for e in events]
        assert "start" in types
        assert "final" in types


@pytest.mark.asyncio
async def test_autonomous_agent_invalid_role_or_mode():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Papel inexistente -> 404
        resp404 = await ac.post(
            "/api/v1/agents/papel_inexistente_xyz/task", json={"prompt": "teste"}
        )
        assert resp404.status_code == 404

        # Modo inválido -> 400
        resp400 = await ac.post(
            "/api/v1/agents/data_scientist/task", json={"prompt": "teste", "mode": "invalido"}
        )
        assert resp400.status_code == 400


@pytest.mark.asyncio
async def test_react_tool_harness_reads_project_file(tmp_path, monkeypatch):
    """QUAL-06: o caminho autenticado com project_id executa ferramentas reais."""
    from apps.api.routers import agents as agents_router

    project_id = "proj-api-tools"
    project_dir = tmp_path / project_id
    project_dir.mkdir()
    (project_dir / "app.py").write_text(
        "from fastapi import FastAPI\n\n"
        "app = FastAPI()\n\n\n"
        "@app.get('/health')\ndef health():\n    return {'status': 'ok'}\n\n\n"
        "@app.get('/items')\ndef items():\n    return []\n",
        encoding="utf-8",
    )
    deps.db_manager.register_project(
        project_id=project_id,
        name="Projeto do harness ReAct",
        root_path=str(project_dir),
        owner_user_id="admin",
    )
    monkeypatch.setattr(deps.workspace_service, "base_dir", tmp_path)

    provider = _ToolThenAnswerProvider()
    runtime = agents_router.autonomous_agent_runtime
    monkeypatch.setattr(runtime, "provider_factory", lambda: provider)
    monkeypatch.setattr(
        runtime,
        "routed_provider_factory",
        lambda key_id, owner_user_id: provider,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/api/v1/agents/backend_developer/stream",
            json={
                "prompt": "Leia app.py e diga quantas rotas existem.",
                "mode": "plan",
                "session_id": "ses-react-tools",
                "project_id": project_id,
                "max_iterations": 2,
                "max_tokens": 512,
                "timeout_seconds": 30,
                "include_history": False,
            },
        )
        assert response.status_code == 200

    events = []
    for line in response.text.splitlines():
        if line.startswith("data: "):
            events.append(json.loads(line[6:]))

    calls = [event for event in events if event.get("type") == "tool_call"]
    results = [event for event in events if event.get("type") == "tool_result"]
    final = next(event for event in events if event.get("type") == "final")

    assert [call["name"] for call in calls] == ["read_file"]
    assert results[0]["success"] is True
    assert "routes" not in results[0]["output"]  # conteúdo real, não inventado
    assert "/health" in results[0]["output"]
    assert final["is_completed"] is True
    assert final["tool_calls"] == 1
    assert "duas rotas" in final["summary"]
    assert any("read_file" in action for action in final["contract"]["actions_taken"])
