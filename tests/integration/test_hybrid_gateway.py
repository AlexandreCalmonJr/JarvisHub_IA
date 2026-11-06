import pytest

from packages.contracts.security import AuditEventSeverity
from services.model_runtime import (
    HybridModelRouter,
    InferenceRequest,
    InferenceResponse,
    MockAdapter,
    OnlineProviderConfig,
)
from services.security_core import AuditTrail


class FailingAdapter(MockAdapter):
    """Adaptador simulado que simula falha de conexão de rede ou erro na API."""

    async def generate(self, request: InferenceRequest) -> InferenceResponse:
        raise ConnectionError("Simulated network/provider unreachable 503")


@pytest.mark.asyncio
async def test_hybrid_router_defaults_to_local():
    local_mock = MockAdapter(default_response="Local Ollama response")
    router = HybridModelRouter(local_adapter=local_mock)

    req = InferenceRequest(prompt="Hello local")
    res, provider = await router.route_inference(req)

    assert res.content == "Local Ollama response"
    assert provider == "ollama_local"


@pytest.mark.asyncio
async def test_hybrid_router_routes_to_online_when_enabled():
    local_mock = MockAdapter(default_response="Local response")
    online_mock = MockAdapter(default_response="Online cloud response")
    cfg = OnlineProviderConfig(
        provider_name="openai",
        enabled=True,
        api_key="sk-test-key",
        max_budget_usd=1.0,
    )
    router = HybridModelRouter(
        local_adapter=local_mock,
        online_adapter=online_mock,
        online_config=cfg,
    )

    req = InferenceRequest(prompt="Draft complex architecture")
    res, provider = await router.route_inference(req)

    assert res.content == "Online cloud response"
    assert "online_gateway" in provider
    assert cfg.current_spend_usd > 0.0


@pytest.mark.asyncio
async def test_hybrid_router_sensitive_data_containment():
    local_mock = MockAdapter(default_response="Local safe response")
    online_mock = MockAdapter(default_response="Online cloud response")
    audit = AuditTrail()
    cfg = OnlineProviderConfig(provider_name="openai", enabled=True, max_budget_usd=1.0)

    router = HybridModelRouter(
        local_adapter=local_mock,
        online_adapter=online_mock,
        online_config=cfg,
        audit_trail=audit,
    )

    # 1. Without approval -> Contained locally
    req = InferenceRequest(prompt="Private proprietary code", contains_sensitive_data=True)
    res, provider = await router.route_inference(req, has_external_data_approval=False)
    assert res.content == "Local safe response"
    assert "retidos no local" in provider

    events = audit.list_events()
    assert any(e.operation == "SENSITIVE_DATA_LOCAL_CONTAINMENT" for e in events)

    # 2. With human approval -> Allowed to use online
    res2, provider2 = await router.route_inference(req, has_external_data_approval=True)
    assert res2.content == "Online cloud response"
    assert "online_gateway" in provider2


@pytest.mark.asyncio
async def test_hybrid_router_fallback_on_budget_exceeded():
    local_mock = MockAdapter(default_response="Local budget fallback")
    online_mock = MockAdapter(default_response="Online cloud response")
    audit = AuditTrail()
    cfg = OnlineProviderConfig(
        provider_name="openai",
        enabled=True,
        max_budget_usd=0.005,
        current_spend_usd=0.006,  # Budget already exceeded
    )

    router = HybridModelRouter(
        local_adapter=local_mock,
        online_adapter=online_mock,
        online_config=cfg,
        audit_trail=audit,
    )

    req = InferenceRequest(prompt="Any prompt")
    res, provider = await router.route_inference(req)

    assert res.content == "Local budget fallback"
    assert "fallback orçamento" in provider


@pytest.mark.asyncio
async def test_hybrid_router_resilient_fallback_on_network_outage():
    local_mock = MockAdapter(default_response="Local resilience fallback")
    failing_online = FailingAdapter()
    audit = AuditTrail()
    cfg = OnlineProviderConfig(provider_name="anthropic", enabled=True, max_budget_usd=5.0)

    router = HybridModelRouter(
        local_adapter=local_mock,
        online_adapter=failing_online,
        online_config=cfg,
        audit_trail=audit,
    )

    req = InferenceRequest(prompt="Perform critical task during outage")
    res, provider = await router.route_inference(req)

    # Must NOT raise exception; must cleanly execute locally
    assert res.content == "Local resilience fallback"
    assert "fallback resiliência" in provider

    events = audit.list_events()
    outage_events = [e for e in events if e.operation == "ONLINE_GATEWAY_OUTAGE_FALLBACK"]
    assert len(outage_events) == 1
    assert outage_events[0].severity == AuditEventSeverity.WARNING
