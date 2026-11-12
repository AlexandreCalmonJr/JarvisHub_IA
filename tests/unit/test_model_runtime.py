import asyncio

import pytest

from services.model_runtime import (
    InferenceQueue,
    InferenceQueueError,
    InferenceRequest,
    MockAdapter,
    ModelManager,
    ModelRoleMapping,
)
from services.security_core import KillSwitch


@pytest.fixture
def mock_manager():
    adapter = MockAdapter(default_response='{"answer": "ok"}')
    kill_switch = KillSwitch()
    return ModelManager(adapter=adapter, kill_switch=kill_switch)


@pytest.mark.asyncio
async def test_model_manager_generate(mock_manager):
    req = InferenceRequest(prompt="Olá JARVIS", model_name="llama3.2:3b")
    res = await mock_manager.generate(req)
    assert res.content == '{"answer": "ok"}'
    assert res.model_name == "llama3.2:3b"
    assert res.tokens_per_second > 0


@pytest.mark.asyncio
async def test_model_manager_role_selection(mock_manager):
    assert (
        mock_manager.select_model_for_role("jarvis_master") == ModelRoleMapping.DEFAULT_MASTER.value
    )
    assert (
        mock_manager.select_model_for_role("backend_developer")
        == ModelRoleMapping.DEFAULT_CODER.value
    )
    assert (
        mock_manager.select_model_for_role("threat_modeling_security_architect")
        == ModelRoleMapping.DEFAULT_REASONING.value
    )


@pytest.mark.asyncio
async def test_kill_switch_blocks_inference(mock_manager):
    mock_manager.kill_switch.trigger_global_kill()
    req = InferenceRequest(prompt="Teste de bloqueio")
    with pytest.raises(RuntimeError, match="Kill Switch Global"):
        await mock_manager.generate(req)


@pytest.mark.asyncio
async def test_task_cancellation_blocks_inference(mock_manager):
    mock_manager.kill_switch.cancel_task("task-123")
    req = InferenceRequest(prompt="Teste", task_id="task-123")
    with pytest.raises(RuntimeError, match="foi cancelada"):
        await mock_manager.generate(req)


@pytest.mark.asyncio
async def test_inference_queue_concurrency():
    queue = InferenceQueue(max_concurrent=1)
    results = []

    async def slow_job(val: int):
        await asyncio.sleep(0.05)
        results.append(val)
        return val

    # Dispara duas tarefas simultâneas
    t1 = asyncio.create_task(queue.execute(lambda: slow_job(1)))
    t2 = asyncio.create_task(queue.execute(lambda: slow_job(2)))

    await asyncio.gather(t1, t2)
    assert len(results) == 2


@pytest.mark.asyncio
async def test_inference_queue_reports_execution_timeout():
    queue = InferenceQueue(max_concurrent=1)

    async def slow_job():
        await asyncio.sleep(0.2)
        return "ok"

    with pytest.raises(InferenceQueueError, match="tempo limite de execução"):
        await queue.execute(slow_job, timeout_seconds=0.05)

    assert queue.waiting_count == 0
    assert queue.active_count == 0


@pytest.mark.asyncio
async def test_inference_queue_reports_queue_wait_timeout():
    queue = InferenceQueue(max_concurrent=1)
    gate = asyncio.Event()

    async def held_job():
        await gate.wait()
        return "held"

    first = asyncio.create_task(queue.execute(held_job))
    await asyncio.sleep(0.01)

    with pytest.raises(InferenceQueueError, match="espera na fila"):
        await queue.execute(lambda: asyncio.sleep(0, result="segundo"), timeout_seconds=0.05)

    gate.set()
    assert await first == "held"
    assert queue.waiting_count == 0
