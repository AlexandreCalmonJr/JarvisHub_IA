from types import SimpleNamespace

import pytest

from services.model_runtime import InferenceRequest, MockAdapter, ModelManager
from services.model_runtime.types import ModelMetadata
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


class OnlineCatalog:
    async def list_models(self):
        return [
            ModelMetadata(
                name="cloud-coder",
                size_bytes=0,
                parameter_size="Cloud API",
                quantization="FP16",
                family="openai",
                context_length=128000,
            )
        ]


class EnabledHybridRouter:
    def __init__(self):
        self.online_config = SimpleNamespace(
            enabled=True,
            provider_name="openai",
            cost_per_1k_input=0.00015,
            cost_per_1k_output=0.00060,
        )
        self.online_adapter = OnlineCatalog()


@pytest.mark.asyncio
async def test_auto_mode_remains_local_even_when_hybrid_gateway_is_enabled():
    manager = ModelManager(adapter=MockAdapter(), hybrid_router=EnabledHybridRouter())
    selected = await manager._prepare_model_selection(
        InferenceRequest(
            prompt="implement code",
            model_name="auto",
            owner_user_id="account-local",
            agent_role="developer",
        ),
        has_external_data_approval=False,
    )
    assert selected.model_name == "mock-model"
    assert selected.force_local is True


@pytest.mark.asyncio
async def test_auto_hybrid_can_include_online_model_when_gateway_is_enabled():
    manager = ModelManager(adapter=MockAdapter(), hybrid_router=EnabledHybridRouter())
    selected = await manager._prepare_model_selection(
        InferenceRequest(
            prompt="implement code",
            model_name="auto_hybrid",
            owner_user_id="account-hybrid",
            agent_role="developer",
        ),
        has_external_data_approval=False,
    )
    assert selected.model_name == "cloud-coder"
    assert selected.force_local is False
