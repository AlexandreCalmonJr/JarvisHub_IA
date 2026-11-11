import pytest

from services.model_runtime import InferenceRequest, ModelManager, MockAdapter
from services.observability.telemetry_store import SqliteTelemetryStore


@pytest.mark.asyncio
async def test_auto_model_selection_uses_inventory_and_records_owner_decision(tmp_path):
    store = SqliteTelemetryStore(tmp_path / "telemetry.db")
    manager = ModelManager(adapter=MockAdapter(), telemetry_store=store)

    response = await manager.generate(
        InferenceRequest(
            prompt="select a model",
            model_name="auto",
            owner_user_id="account-auto",
            task_id="task-auto",
            agent_role="developer",
            task_capability="code",
        )
    )

    assert response.model_name == "mock-model"
    decisions = store.list_model_selections_for_owner("account-auto")
    assert len(decisions) == 1
    assert decisions[0]["selected_model"] == "mock-model"
    assert decisions[0]["selected_provider"] == "ollama_local"
    assert decisions[0]["task_capability"] == "code"
    assert len(store.list_for_owner("account-auto")) == 1
