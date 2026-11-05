import pytest
import asyncio
from services.model_runtime import (
    ModelManager,
    MockAdapter,
    InferenceRequest,
    ModelRoleMapping,
    InferenceQueue,
    InferenceQueueError,
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
    assert mock_manager.select_model_for_role("jarvis_master") == ModelRoleMapping.DEFAULT_MASTER.value
    assert mock_manager.select_model_for_role("backend_developer") == ModelRoleMapping.DEFAULT_CODER.value
    assert mock_manager.select_model_for_role("threat_modeling_security_architect") == ModelRoleMapping.DEFAULT_REASONING.value


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
