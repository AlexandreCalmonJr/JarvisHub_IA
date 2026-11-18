"""Regressões do catálogo de provedores e do mapeamento agente → modelo local."""

from __future__ import annotations

from typing import ClassVar, Self

import pytest

from packages.contracts.agent import AgentRole
from services.coding_agent.providers import AnthropicChatProvider
from services.coding_agent.types import ChatTurn
from services.model_runtime.huggingface_service import AGENT_MODEL_RECOMMENDATIONS
from services.model_runtime.provider_catalog import (
    LOCAL_MODEL_NAMES,
    get_provider,
    supports_sampling,
)
from services.model_runtime.provider_defaults import RETIRED_MODELS, normalize_model_for_provider


def test_anthropic_default_model_is_current() -> None:
    spec = get_provider("anthropic")
    assert spec is not None
    assert spec.default_model == "claude-haiku-5-5"


def test_sampling_flags_are_omitted_only_for_anthropic_5x() -> None:
    assert not supports_sampling("anthropic", "claude-haiku-5-5")
    assert not supports_sampling("anthropic", "claude-sonnet-5-5")
    assert supports_sampling("anthropic", "claude-haiku-4-5-20251001")
    assert supports_sampling("anthropic", None)
    # Outros provedores nunca são afetados pela regra da Anthropic.
    assert supports_sampling("openai", "claude-haiku-5-5")
    assert supports_sampling(None, "claude-haiku-5-5")


def test_retired_anthropic_models_map_to_current_ids() -> None:
    assert normalize_model_for_provider("anthropic", "claude-3-5-haiku-20241022") == (
        "claude-haiku-5-5"
    )
    assert "claude-3-5-haiku-20241022" in RETIRED_MODELS["anthropic"]
    # Um modelo personalizado válido nunca é substituído.
    assert normalize_model_for_provider("anthropic", "claude-opus-5-5") == "claude-opus-5-5"


def test_agent_recommendations_cover_every_real_role_and_known_model() -> None:
    assert set(AGENT_MODEL_RECOMMENDATIONS) == {role.value for role in AgentRole}
    for role, recommendation in AGENT_MODEL_RECOMMENDATIONS.items():
        assert recommendation["model"] in LOCAL_MODEL_NAMES, role
        assert recommendation["reason"].strip(), role


class _FakeResponse:
    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return {
            "content": [{"type": "text", "text": "ok"}],
            "usage": {"input_tokens": 1, "output_tokens": 1},
            "stop_reason": "stop",
        }


class _FakeAsyncClient:
    payloads: ClassVar[list[dict]] = []

    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *exc_info: object) -> bool:
        return False

    async def post(self, *args: object, **kwargs: object) -> _FakeResponse:
        payload = kwargs.get("json")
        assert isinstance(payload, dict)
        type(self).payloads.append(payload)
        return _FakeResponse()


@pytest.mark.asyncio
async def test_anthropic_5x_request_omits_temperature(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeAsyncClient.payloads = []
    monkeypatch.setattr("services.coding_agent.providers.httpx.AsyncClient", _FakeAsyncClient)
    provider = AnthropicChatProvider(api_key="test-key")

    await provider.complete(
        turns=[ChatTurn(role="user", content="olá")],
        tools=[],
        model=None,
        temperature=0.7,
        max_tokens=64,
        timeout_seconds=5,
    )

    payload = _FakeAsyncClient.payloads[-1]
    assert payload["model"] == "claude-haiku-5-5"
    assert "temperature" not in payload
