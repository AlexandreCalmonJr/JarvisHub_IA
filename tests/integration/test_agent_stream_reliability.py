import asyncio
import json

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.auth import Principal
from apps.api.main import app
from apps.api.schemas import AutonomousAgentRunRequest
from services.coding_agent import ProviderError


def _events(response):
    return [
        json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("failure", "expected_code"),
    [
        (ProviderError("connection refused by provider"), "provider_unavailable"),
        (TimeoutError("provider request timed out"), "timeout"),
    ],
)
async def test_agent_stream_emits_first_token_classifies_failure_and_releases_lock(
    monkeypatch, failure, expected_code
):
    import apps.api.routers.agents as agents_router

    class FlakyRuntime:
        def __init__(self):
            self.calls = 0

        async def run_stream(self, _config):
            self.calls += 1
            if self.calls == 1:
                raise failure
            yield {"type": "start"}
            yield {"type": "assistant", "content": "primeiro token"}
            yield {"type": "final", "summary": "resposta", "is_completed": True}

    runtime = FlakyRuntime()
    monkeypatch.setattr(agents_router, "autonomous_agent_runtime", runtime)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.post(
            "/api/v1/agents/qa_engineer/stream",
            json={"prompt": "teste", "mode": "plan", "session_id": "rel-sse-flaky"},
        )
        second = await client.post(
            "/api/v1/agents/qa_engineer/stream",
            json={"prompt": "teste", "mode": "plan", "session_id": "rel-sse-flaky"},
        )

    first_events = _events(first)
    second_events = _events(second)
    assert first.status_code == second.status_code == 200
    assert first_events[-1]["type"] == "error"
    assert first_events[-1]["code"] == expected_code
    assert any(event.get("content") == "primeiro token" for event in second_events)
    assert second_events[-1]["type"] == "final"


@pytest.mark.asyncio
async def test_agent_stream_cancellation_releases_session_lock(monkeypatch):
    import apps.api.routers.agents as agents_router

    started = asyncio.Event()

    class HangingRuntime:
        async def run_stream(self, _config):
            yield {"type": "start"}
            started.set()
            await asyncio.Event().wait()

    principal = Principal(
        subject_id="stream-cancel-owner",
        kind="human",
        role="developer",
        scopes=frozenset({"agents:use"}),
    )
    request = AutonomousAgentRunRequest(
        prompt="teste de cancelamento",
        mode="plan",
        session_id="stream-cancel-lock-release",
    )
    monkeypatch.setattr(agents_router, "autonomous_agent_runtime", HangingRuntime())
    response = await agents_router.stream_agent_execution_endpoint(
        "qa_engineer", request, principal
    )
    iterator = response.body_iterator.__aiter__()

    async def read_until_provider_waits():
        await anext(iterator)
        await anext(iterator)

    stream_task = asyncio.create_task(read_until_provider_waits())
    await started.wait()
    stream_task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await stream_task

    class ReadyRuntime:
        async def run_stream(self, _config):
            yield {"type": "final", "summary": "lock liberado", "is_completed": True}

    monkeypatch.setattr(agents_router, "autonomous_agent_runtime", ReadyRuntime())
    retry_response = await agents_router.stream_agent_execution_endpoint(
        "qa_engineer", request, principal
    )
    retry_events = []
    async for chunk in retry_response.body_iterator:
        retry_events.extend(
            json.loads(line[6:]) for line in chunk.splitlines() if line.startswith("data: ")
        )
    assert retry_events[-1]["type"] == "final"


@pytest.mark.asyncio
async def test_agent_task_uses_standard_provider_error_response(monkeypatch):
    import apps.api.routers.agents as agents_router

    class FailedRuntime:
        async def run_task(self, _config):
            raise ProviderError("model provider unavailable")

    monkeypatch.setattr(agents_router, "autonomous_agent_runtime", FailedRuntime())
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/agents/qa_engineer/task",
            json={"prompt": "teste", "mode": "plan"},
        )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "provider_unavailable"
