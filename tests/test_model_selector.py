import pytest

from services.model_runtime.model_selector import ModelSelector
from services.model_runtime.types import ModelMetadata


class EmptyTelemetry:
    def performance_by_model_for_owner(self, owner):
        return []


def metadata(name, family="unknown", cloud=False, context=8192):
    return ModelMetadata(
        name=name,
        size_bytes=0,
        parameter_size="Cloud API" if cloud else "7B",
        quantization="FP16",
        family=family,
        context_length=context,
    )


def select(models, capability="general", sensitive=False, approval=False, allow_external=False):
    return ModelSelector().select(
        models=models,
        owner_user_id="account-1",
        agent_role="developer",
        task_capability=capability,
        telemetry_store=EmptyTelemetry(),
        allow_external=allow_external,
        contains_sensitive_data=sensitive,
        has_external_data_approval=approval,
    )


def test_selector_prefers_code_specialist_and_local_first():
    result = select(
        [metadata("llama-general"), metadata("qwen2.5-coder:7b", family="qwen2")],
        capability="code",
    )
    assert result.candidate.model_name == "qwen2.5-coder:7b"
    assert result.candidate.local is True
    assert "especialização em código" in result.reason


def test_selector_excludes_external_models_for_sensitive_data_without_approval():
    result = select(
        [metadata("local-coder"), metadata("cloud-code", family="openai", cloud=True)],
        capability="code",
        sensitive=True,
        approval=False,
        allow_external=True,
    )
    assert result.candidate.model_name == "local-coder"
    assert result.candidate.local is True


def test_selector_allows_external_candidate_only_when_policy_inputs_allow_it():
    result = select(
        [metadata("cloud-coder", family="openai", cloud=True)],
        capability="code",
        sensitive=True,
        approval=True,
        allow_external=True,
    )
    assert result.candidate.provider == "online_gateway (openai)"
    assert result.candidate.local is False


def test_selector_refuses_vision_when_no_candidate_has_visual_capability():
    with pytest.raises(RuntimeError, match="Nenhum modelo disponível"):
        select([metadata("llama-general")], capability="vision")


def test_selector_maps_developer_role_to_code_capability():
    result = ModelSelector().select(
        models=[metadata("general-llama"), metadata("deepseek-coder", family="deepseek")],
        owner_user_id="account-1",
        agent_role="developer",
        task_capability=None,
        telemetry_store=EmptyTelemetry(),
        allow_external=False,
        contains_sensitive_data=False,
        has_external_data_approval=False,
    )
    assert result.candidate.model_name == "deepseek-coder"
    assert "especialização em código" in result.reason


def test_selector_prefers_lower_estimated_cost_between_external_candidates():
    result = ModelSelector().select(
        models=[
            metadata("model-openai", family="openai", cloud=True),
            metadata("model-gemini", family="gemini", cloud=True),
        ],
        owner_user_id="account-1",
        agent_role="research_analyst",
        task_capability="general",
        telemetry_store=EmptyTelemetry(),
        allow_external=True,
        contains_sensitive_data=False,
        has_external_data_approval=False,
        pricing_by_provider={
            "openai": (0.001, 0.002),
            "gemini": (0.0001, 0.0002),
        },
        prompt_text="x" * 4000,
        max_tokens=1000,
    )
    assert result.candidate.model_name == "model-gemini"
    assert result.estimated_cost_usd < 0.001
    assert "custo estimado" in result.reason


def test_selector_uses_owner_historical_cost_when_live_price_is_unknown():
    class HistoricalTelemetry:
        def performance_by_model_for_owner(self, owner):
            assert owner == "account-1"
            return [
                {
                    "model_name": "model-a",
                    "provider": "online_gateway (provider-a)",
                    "agent_role": "research_analyst",
                    "total_inferences": 5,
                    "sample_sufficient": True,
                    "success_rate": 1.0,
                    "average_latency_ms": 100,
                    "average_cost_usd": 0.002,
                },
                {
                    "model_name": "model-b",
                    "provider": "online_gateway (provider-b)",
                    "agent_role": "research_analyst",
                    "total_inferences": 5,
                    "sample_sufficient": True,
                    "success_rate": 1.0,
                    "average_latency_ms": 100,
                    "average_cost_usd": 0.001,
                },
            ]

    result = ModelSelector().select(
        models=[
            metadata("model-a", family="provider-a", cloud=True),
            metadata("model-b", family="provider-b", cloud=True),
        ],
        owner_user_id="account-1",
        agent_role="research_analyst",
        task_capability="general",
        telemetry_store=HistoricalTelemetry(),
        allow_external=True,
        contains_sensitive_data=False,
        has_external_data_approval=False,
    )
    assert result.candidate.model_name == "model-b"
    assert result.estimated_cost_usd == 0.001
