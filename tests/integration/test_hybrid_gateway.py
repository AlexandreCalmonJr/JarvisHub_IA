import pytest

from packages.contracts.security import AuditEventSeverity
from services.model_runtime import (
    HybridModelRouter,
    InferenceRequest,
    InferenceResponse,
    MockAdapter,
    OnlineProviderConfig,
    UniversalOnlineAdapter,
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


@pytest.mark.asyncio
async def test_universal_online_adapter_masking_and_config():
    cfg = OnlineProviderConfig(
        provider_name="gemini",
        enabled=True,
        api_key="AIzaSy1234567890abcdefghijklmnopqrst",
        max_budget_usd=3.0,
    )
    assert cfg.masked_api_key() == "AIza...qrst"

    adapter = UniversalOnlineAdapter(
        api_key=cfg.api_key,
        provider_name="gemini",
    )
    assert "generativelanguage.googleapis.com" in adapter.base_url
    assert adapter.default_model == "gemini-2.5-flash"


@pytest.mark.asyncio
async def test_hybrid_api_endpoints():
    from httpx import ASGITransport, AsyncClient

    from apps.api.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Obter config inicial
        res = await client.get("/api/v1/models/hybrid-config")
        assert res.status_code == 200
        data = res.json()
        assert "presets" in data
        assert any(p["id"] == "gemini" for p in data["presets"])
        assert any(p["id"] == "groq" for p in data["presets"])
        groq_preset = next(p for p in data["presets"] if p["id"] == "groq")
        # A Groq descontinuou os modelos Llama para os planos Free/Developer.
        assert groq_preset["default_model"] == "openai/gpt-oss-120b"
        assert any(p["id"] == "deepseek" for p in data["presets"])

        # 2. Atualizar config
        update_payload = {
            "provider_name": "groq",
            "enabled": True,
            "api_key": "gsk-mockkey123456789",
            "default_model": "openai/gpt-oss-120b",
            "base_url": "https://api.groq.com/openai/v1",
            "max_budget_usd": 10.0,
        }
        post_res = await client.post("/api/v1/models/hybrid-config", json=update_payload)
        assert post_res.status_code == 200
        cfg_data = post_res.json()["config"]
        assert cfg_data["provider_name"] == "groq"
        assert cfg_data["enabled"] is True
        assert cfg_data["masked_api_key"] == "gsk-...6789"
        assert cfg_data["max_budget_usd"] == 10.0

        # 3. Modelos no inventário mostram o status do hybrid_gateway atualizado
        models_res = await client.get("/api/v1/models")
        assert models_res.status_code == 200
        gateway_status = models_res.json()["hybrid_gateway"]
        assert gateway_status["enabled"] is True
        assert gateway_status["provider"] == "groq"
        assert gateway_status["has_api_key"] is True

        # 4. Teste de conexão com chave mock retorna erro amigável sem quebrar o servidor
        test_res = await client.post(
            "/api/v1/models/hybrid-config/test",
            json={"provider_name": "groq", "api_key": "invalid_test_key"},
        )
        assert test_res.status_code == 200
        test_data = test_res.json()
        assert test_data["success"] is False
        assert "error" in test_data
