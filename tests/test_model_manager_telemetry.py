import pytest

from services.model_runtime import InferenceRequest, ModelManager, MockAdapter
from services.observability.telemetry_store import SqliteTelemetryStore


@pytest.mark.asyncio
async def test_model_manager_records_successful_inference_for_owner(tmp_path):
    store = SqliteTelemetryStore(tmp_path / "telemetry.db")
    manager = ModelManager(adapter=MockAdapter(), telemetry_store=store)

    await manager.generate(
        InferenceRequest(
            prompt="private prompt must not be persisted",
            model_name="mock-model",
            task_id="task-123",
            owner_user_id="account-123",
            agent_role="software_architect",
        )
    )

    records = store.list_for_owner("account-123")
    assert len(records) == 1
    assert records[0]["task_id"] == "task-123"
    assert records[0]["agent_role"] == "software_architect"
    assert records[0]["status"] == "success"
    assert records[0]["prompt_tokens"] == 10
    assert records[0]["completion_tokens"] == 20


@pytest.mark.asyncio
async def test_model_manager_records_failed_inference_without_leaking_error_text(tmp_path):
    class FailingAdapter(MockAdapter):
        async def generate(self, request):
            raise TimeoutError("sensitive provider response must not be stored")

    store = SqliteTelemetryStore(tmp_path / "telemetry.db")
    manager = ModelManager(adapter=FailingAdapter(), telemetry_store=store)

    with pytest.raises(TimeoutError):
        await manager.generate(
            InferenceRequest(
                prompt="private prompt",
                model_name="mock-model",
                owner_user_id="account-456",
            )
        )

    records = store.list_for_owner("account-456")
    assert len(records) == 1
    assert records[0]["status"] == "failed"
    assert records[0]["error_type"] == "TimeoutError"
    assert "sensitive" not in str(records[0])
