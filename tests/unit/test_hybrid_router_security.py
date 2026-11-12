"""Testes da política unificada de segurança do roteamento híbrido de modelos."""

import asyncio
from unittest.mock import patch

import httpx
import pytest

from packages.contracts.security import AuditEventSeverity
from services.model_runtime import (
    HybridModelRouter,
    InferenceRequest,
    MockAdapter,
    ModelManager,
    OnlineProviderConfig,
    UniversalOnlineAdapter,
)
from services.model_runtime.key_vault import KeyProfile
from services.security_core import AuditTrail


class FakeKeyVault:
    """Cofre determinístico em memória para isolar os testes de disco/credenciais reais."""

    def __init__(self, profiles: dict[str, KeyProfile]):
        self._profiles = profiles

    def get_key(self, key_id: str) -> KeyProfile | None:
        return self._profiles.get(key_id)


class RecordingAdapter(MockAdapter):
    """Adaptador simulado que registra chamadas e permite falha/bloqueio controlados."""

    def __init__(
        self,
        default_response: str,
        *,
        fail: bool = False,
        gate: asyncio.Event | None = None,
    ):
        super().__init__(default_response)
        self.calls: list[InferenceRequest] = []
        self.fail = fail
        self.gate = gate

    async def generate(self, request: InferenceRequest):
        self.calls.append(request)
        if self.gate is not None:
            await self.gate.wait()
        if self.fail:
            raise ConnectionError("provedor externo indisponível (simulado)")
        return await super().generate(request)


class StreamingAdapter(MockAdapter):
    """Adaptador de streaming com usage opcional e falha controlada."""

    def __init__(
        self,
        chunks: list[str],
        *,
        usage: dict[str, int] | None = None,
        fail: bool = False,
        fail_after_first: bool = False,
    ):
        super().__init__("".join(chunks))
        self.chunks = chunks
        self.usage = usage
        self.fail = fail
        self.fail_after_first = fail_after_first
        self.last_stream_usage: dict[str, int] | None = None
        self.calls: list[InferenceRequest] = []

    async def generate_stream(self, request: InferenceRequest):
        self.calls.append(request)
        self.last_stream_usage = None
        if self.fail:
            raise ConnectionError("provedor externo indisponível (simulado)")
        for index, chunk in enumerate(self.chunks):
            if self.fail_after_first and index == 1:
                raise ConnectionError("streaming interrompido (simulado)")
            yield chunk
        if self.usage is not None:
            self.last_stream_usage = dict(self.usage)


def _profile(
    key_id: str = "agent_key",
    provider: str = "openai",
    model: str = "gpt-4o-mini",
) -> KeyProfile:
    return KeyProfile(
        key_id=key_id,
        label="Chave do Agente",
        provider=provider,
        api_key="sk-test-only-not-a-real-key",
        base_url="https://api.openai.com/v1",
        default_model=model,
    )


def _router(
    *,
    local: MockAdapter | None = None,
    online: RecordingAdapter | StreamingAdapter | None = None,
    vault: RecordingAdapter | StreamingAdapter | None = None,
    audit: AuditTrail | None = None,
    config: OnlineProviderConfig | None = None,
) -> HybridModelRouter:
    profiles = {"agent_key": _profile()}
    router = HybridModelRouter(
        local_adapter=local or MockAdapter(default_response="resposta local segura"),
        online_config=config or OnlineProviderConfig(enabled=False),
        online_adapter=online,
        audit_trail=audit,
        key_vault=FakeKeyVault(profiles),
    )
    if vault is not None:
        # Injeta o adaptador simulado no cache do cofre sem tocar em credenciais reais.
        router._vault_adapters["agent_key"] = vault
    return router


async def _collect(stream) -> list[str]:
    return [chunk async for chunk in stream]


async def _wait_until(predicate, timeout: float = 2.0) -> None:
    elapsed = 0.0
    while not predicate():
        if elapsed >= timeout:
            raise AssertionError("condição não satisfeita dentro do timeout")
        await asyncio.sleep(0.01)
        elapsed += 0.01


@pytest.mark.asyncio
async def test_vault_key_sensitive_data_without_approval_stays_local():
    local = MockAdapter(default_response="resposta local segura")
    vault = RecordingAdapter("resposta externa indevida")
    audit = AuditTrail()
    router = _router(local=local, vault=vault, audit=audit)

    request = InferenceRequest(
        prompt="código proprietário da empresa",
        contains_sensitive_data=True,
        key_id="agent_key",
    )
    response, provider = await router.route_inference(request, has_external_data_approval=False)

    assert response.content == "resposta local segura"
    assert "dados sensíveis retidos no local" in provider
    assert vault.calls == []
    assert router.online_config.current_spend_usd == 0.0

    containment = [
        e for e in audit.list_events() if e.operation == "SENSITIVE_DATA_LOCAL_CONTAINMENT"
    ]
    assert len(containment) == 1
    assert containment[0].severity == AuditEventSeverity.WARNING
    assert containment[0].parameters_redacted["provider"] == "openai"
    assert containment[0].parameters_redacted["route"] == "vault_key"
    assert containment[0].parameters_redacted["vault_ref"] == "agent_key"


@pytest.mark.asyncio
async def test_vault_key_sensitive_data_with_approval_uses_vault_and_audits():
    vault = RecordingAdapter("resposta externa autorizada")
    audit = AuditTrail()
    router = _router(vault=vault, audit=audit)

    request = InferenceRequest(
        prompt="código proprietário da empresa",
        contains_sensitive_data=True,
        key_id="agent_key",
    )
    response, provider = await router.route_inference(request, has_external_data_approval=True)

    assert response.content == "resposta externa autorizada"
    assert provider == "vault_key (agent_key - openai)"
    assert len(vault.calls) == 1

    authorized = [e for e in audit.list_events() if e.operation == "EXTERNAL_INFERENCE_AUTHORIZED"]
    completed = [e for e in audit.list_events() if e.operation == "ONLINE_INFERENCE_COMPLETED"]
    assert len(authorized) == 1
    assert authorized[0].parameters_redacted["human_approval"] is True
    assert len(completed) == 1
    assert completed[0].parameters_redacted["provider"] == "openai"
    assert completed[0].parameters_redacted["route"] == "vault_key"


@pytest.mark.asyncio
async def test_vault_key_uses_provider_rates_without_double_charging():
    vault = RecordingAdapter("ok")
    router = _router(vault=vault)

    request = InferenceRequest(prompt="pergunta curta", key_id="agent_key")
    await router.route_inference(request)

    # MockAdapter reporta 10 tokens de prompt e 20 de completion.
    expected = round((10 / 1000.0) * 0.00015 + (20 / 1000.0) * 0.00060, 6)
    assert router.online_config.current_spend_usd == pytest.approx(expected, abs=1e-9)
    assert router._reserved_spend_usd == 0.0


@pytest.mark.asyncio
async def test_vault_key_budget_exhausted_falls_back_local():
    local = MockAdapter(default_response="local por orçamento")
    vault = RecordingAdapter("não deveria executar")
    audit = AuditTrail()
    config = OnlineProviderConfig(enabled=False, max_budget_usd=0.000001)
    router = _router(local=local, vault=vault, audit=audit, config=config)

    request = InferenceRequest(prompt="x" * 400, max_tokens=2048, key_id="agent_key")
    response, provider = await router.route_inference(request)

    assert response.content == "local por orçamento"
    assert "fallback orçamento" in provider
    assert vault.calls == []

    budget_events = [
        e for e in audit.list_events() if e.operation == "ONLINE_BUDGET_EXCEEDED_FALLBACK"
    ]
    assert len(budget_events) == 1
    assert budget_events[0].parameters_redacted["provider"] == "openai"
    assert budget_events[0].parameters_redacted["route"] == "vault_key"


@pytest.mark.asyncio
async def test_vault_key_provider_failure_falls_back_local_and_releases_reservation():
    local = MockAdapter(default_response="local após falha externa")
    vault = RecordingAdapter("falha", fail=True)
    audit = AuditTrail()
    router = _router(local=local, vault=vault, audit=audit)

    request = InferenceRequest(prompt="tarefa crítica", key_id="agent_key")
    response, provider = await router.route_inference(request)

    assert response.content == "local após falha externa"
    assert "fallback resiliência" in provider
    assert router.online_config.current_spend_usd == 0.0
    assert router._reserved_spend_usd == 0.0

    outages = [e for e in audit.list_events() if e.operation == "ONLINE_GATEWAY_OUTAGE_FALLBACK"]
    assert len(outages) == 1
    assert outages[0].parameters_redacted["route"] == "vault_key"
    assert outages[0].parameters_redacted["provider"] == "openai"


@pytest.mark.asyncio
async def test_gateway_conventional_remains_protected_and_audited():
    online = RecordingAdapter("resposta do gateway")
    audit = AuditTrail()
    config = OnlineProviderConfig(provider_name="deepseek", enabled=True, max_budget_usd=1.0)
    router = _router(online=online, audit=audit, config=config)

    request = InferenceRequest(prompt="pergunta sem segredos")
    response, provider = await router.route_inference(request)

    assert response.content == "resposta do gateway"
    assert provider == "online_gateway (deepseek)"
    completed = [e for e in audit.list_events() if e.operation == "ONLINE_INFERENCE_COMPLETED"]
    assert len(completed) == 1
    assert completed[0].parameters_redacted["provider"] == "deepseek"
    assert completed[0].parameters_redacted["route"] == "online_gateway"


@pytest.mark.asyncio
async def test_concurrent_calls_cannot_exceed_budget_by_reservation():
    gate = asyncio.Event()
    online = RecordingAdapter("resposta online lenta", gate=gate)
    local = MockAdapter(default_response="local sem orçamento")
    config = OnlineProviderConfig(
        provider_name="openai",
        enabled=True,
        max_budget_usd=0.0002,
        cost_per_1k_input=0.001,
        cost_per_1k_output=0.001,
    )
    router = _router(local=local, online=online, config=config)

    first = InferenceRequest(prompt="a" * 100, max_tokens=100)
    second = InferenceRequest(prompt="b" * 100, max_tokens=100)

    task_one = asyncio.create_task(router.route_inference(first))
    await _wait_until(lambda: len(online.calls) == 1)
    task_two = asyncio.create_task(router.route_inference(second))

    response_two, provider_two = await task_two
    assert response_two.content == "local sem orçamento"
    assert "fallback orçamento" in provider_two
    assert len(online.calls) == 1

    gate.set()
    response_one, provider_one = await task_one
    assert response_one.content == "resposta online lenta"
    assert provider_one.startswith("online_gateway")
    assert router._reserved_spend_usd == 0.0


@pytest.mark.asyncio
async def test_stream_sensitive_without_approval_stays_local():
    local = MockAdapter(default_response="stream local seguro")
    vault = StreamingAdapter(chunks=["stream externo indevido"])
    audit = AuditTrail()
    router = _router(local=local, vault=vault, audit=audit)

    request = InferenceRequest(
        prompt="dados privados",
        contains_sensitive_data=True,
        key_id="agent_key",
    )
    chunks = await _collect(router.route_inference_stream(request))

    assert "".join(chunks) == "stream local seguro"
    assert vault.calls == []
    assert any(e.operation == "SENSITIVE_DATA_LOCAL_CONTAINMENT" for e in audit.list_events())


@pytest.mark.asyncio
async def test_stream_with_approval_uses_vault_and_records_provider_usage():
    vault = StreamingAdapter(
        chunks=["Olá ", "mundo"],
        usage={"prompt_tokens": 12, "completion_tokens": 30},
    )
    audit = AuditTrail()
    router = _router(vault=vault, audit=audit)

    request = InferenceRequest(
        prompt="dados aprovados",
        contains_sensitive_data=True,
        key_id="agent_key",
    )
    chunks = await _collect(router.route_inference_stream(request, has_external_data_approval=True))

    assert "".join(chunks) == "Olá mundo"
    assert len(vault.calls) == 1
    expected = round((12 / 1000.0) * 0.00015 + (30 / 1000.0) * 0.00060, 6)
    assert router.online_config.current_spend_usd == pytest.approx(expected, abs=1e-9)
    assert router._reserved_spend_usd == 0.0

    completed = [e for e in audit.list_events() if e.operation == "ONLINE_INFERENCE_COMPLETED"]
    assert len(completed) == 1
    assert completed[0].parameters_redacted["streaming"] is True
    assert completed[0].parameters_redacted["usage_source"] == "provider_reported"
    assert completed[0].parameters_redacted["route"] == "vault_key"


@pytest.mark.asyncio
async def test_stream_without_usage_records_explicit_estimate():
    vault = StreamingAdapter(chunks=["abcd", "efgh"], usage=None)
    audit = AuditTrail()
    router = _router(vault=vault, audit=audit)

    request = InferenceRequest(prompt="abcd", key_id="agent_key")
    chunks = await _collect(router.route_inference_stream(request))

    assert "".join(chunks) == "abcdefgh"
    assert router.online_config.current_spend_usd > 0.0

    limitations = [e for e in audit.list_events() if e.operation == "STREAM_USAGE_UNAVAILABLE"]
    assert len(limitations) == 1
    assert limitations[0].parameters_redacted["prompt_units_estimate"] == 1
    assert limitations[0].parameters_redacted["completion_units_estimate"] == 2

    completed = [e for e in audit.list_events() if e.operation == "ONLINE_INFERENCE_COMPLETED"]
    assert completed[0].parameters_redacted["usage_source"] == "estimated_from_stream_text"


@pytest.mark.asyncio
async def test_stream_budget_exhausted_stays_local():
    local = MockAdapter(default_response="stream local por orçamento")
    vault = StreamingAdapter(chunks=["não deveria executar"])
    config = OnlineProviderConfig(enabled=False, max_budget_usd=0.01, current_spend_usd=0.01)
    router = _router(local=local, vault=vault, config=config)

    chunks = await _collect(
        router.route_inference_stream(InferenceRequest(prompt="teste", key_id="agent_key"))
    )

    assert "".join(chunks) == "stream local por orçamento"
    assert vault.calls == []


@pytest.mark.asyncio
async def test_stream_provider_failure_falls_back_local():
    local = MockAdapter(default_response="stream local de resiliência")
    vault = StreamingAdapter(chunks=["falha"], fail=True)
    audit = AuditTrail()
    router = _router(local=local, vault=vault, audit=audit)

    chunks = await _collect(
        router.route_inference_stream(InferenceRequest(prompt="teste", key_id="agent_key"))
    )

    assert "".join(chunks) == "stream local de resiliência"
    assert router._reserved_spend_usd == 0.0
    assert any(e.operation == "ONLINE_GATEWAY_OUTAGE_FALLBACK" for e in audit.list_events())


@pytest.mark.asyncio
async def test_stream_does_not_fallback_after_partial_output():
    local = MockAdapter(default_response="conteúdo local duplicado")
    vault = StreamingAdapter(chunks=["parcial", "restante"], fail_after_first=True)
    audit = AuditTrail()
    router = _router(local=local, vault=vault, audit=audit)

    chunks = await _collect(
        router.route_inference_stream(InferenceRequest(prompt="teste", key_id="agent_key"))
    )

    assert chunks == ["parcial"]
    assert router._reserved_spend_usd == 0.0
    assert any(e.operation == "ONLINE_STREAM_INTERRUPTED" for e in audit.list_events())


@pytest.mark.asyncio
async def test_stream_gateway_conventional_uses_online_and_audits():
    online = StreamingAdapter(
        chunks=["gateway ", "ok"],
        usage={"prompt_tokens": 5, "completion_tokens": 6},
    )
    audit = AuditTrail()
    config = OnlineProviderConfig(provider_name="deepseek", enabled=True, max_budget_usd=1.0)
    router = _router(online=online, audit=audit, config=config)

    chunks = await _collect(router.route_inference_stream(InferenceRequest(prompt="oi")))

    assert "".join(chunks) == "gateway ok"
    completed = [e for e in audit.list_events() if e.operation == "ONLINE_INFERENCE_COMPLETED"]
    assert len(completed) == 1
    assert completed[0].parameters_redacted["provider"] == "deepseek"
    assert completed[0].parameters_redacted["route"] == "online_gateway"
    assert completed[0].parameters_redacted["usage_source"] == "provider_reported"


@pytest.mark.asyncio
async def test_model_manager_audits_provider_resolved_by_router():
    online = RecordingAdapter("resposta do gateway")
    audit = AuditTrail()
    config = OnlineProviderConfig(provider_name="openai", enabled=True, max_budget_usd=1.0)
    router = _router(online=online, audit=audit, config=config)
    manager = ModelManager(adapter=MockAdapter(), hybrid_router=router, audit_trail=audit)

    await manager.generate(InferenceRequest(prompt="pergunta"))

    events = [e for e in audit.list_events() if e.operation == "INFERENCE_COMPLETED"]
    assert len(events) == 1
    assert events[0].parameters_redacted["provider"] == "online_gateway (openai)"


@pytest.mark.asyncio
async def test_model_manager_routes_key_vault_when_online_config_disabled():
    vault = RecordingAdapter("resposta externa via vault")
    audit = AuditTrail()
    # Gateway global desabilitado
    config = OnlineProviderConfig(enabled=False)
    router = _router(vault=vault, audit=audit, config=config)
    manager = ModelManager(
        adapter=MockAdapter(default_response="resposta local segura"),
        hybrid_router=router,
        audit_trail=audit,
    )

    # 1. Sem aprovação para dados sensíveis -> deve conter localmente mesmo com key_id
    req_sensitive = InferenceRequest(
        prompt="dados sensíveis proprietários",
        contains_sensitive_data=True,
        key_id="agent_key",
    )
    res = await manager.generate(req_sensitive, has_external_data_approval=False)
    assert res.content == "resposta local segura"
    assert vault.calls == []
    containment = [
        e for e in audit.list_events() if e.operation == "SENSITIVE_DATA_LOCAL_CONTAINMENT"
    ]
    assert len(containment) == 1

    # 2. Com aprovação para dados sensíveis -> encaminha para o vault
    res_ok = await manager.generate(req_sensitive, has_external_data_approval=True)
    assert res_ok.content == "resposta externa via vault"
    assert len(vault.calls) == 1

    # 3. Streaming com key_id e config desabilitada
    vault_stream = StreamingAdapter(chunks=["stream ", "vault"])
    router._vault_adapters["agent_key"] = vault_stream
    chunks = []
    async for chunk in manager.generate_stream(
        InferenceRequest(prompt="teste stream", key_id="agent_key")
    ):
        chunks.append(chunk)
    assert "".join(chunks) == "stream vault"


class _FakeStreamResponse:
    def __init__(self, lines: list[str]):
        self._lines = lines

    def raise_for_status(self) -> None:
        return None

    async def aiter_lines(self):
        for line in self._lines:
            yield line


class _FakeStreamContext:
    def __init__(self, lines: list[str]):
        self._lines = lines

    async def __aenter__(self) -> _FakeStreamResponse:
        return _FakeStreamResponse(self._lines)

    async def __aexit__(self, *args) -> bool:
        return False


@pytest.mark.asyncio
async def test_universal_adapter_captures_openai_stream_usage():
    adapter = UniversalOnlineAdapter(
        api_key="sk-test-only-not-a-real-key",
        provider_name="openai",
        base_url="https://api.openai.com/v1",
    )
    lines = [
        'data: {"choices":[{"delta":{"content":"Olá"}}]}',
        'data: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":9}}',
        "data: [DONE]",
    ]

    with patch.object(httpx.AsyncClient, "stream", lambda self, *a, **k: _FakeStreamContext(lines)):
        chunks = await _collect(adapter.generate_stream(InferenceRequest(prompt="oi")))

    assert "".join(chunks) == "Olá"
    assert adapter.last_stream_usage == {"prompt_tokens": 7, "completion_tokens": 9}


@pytest.mark.asyncio
async def test_universal_adapter_captures_anthropic_stream_usage():
    adapter = UniversalOnlineAdapter(
        api_key="sk-test-only-not-a-real-key",
        provider_name="anthropic",
        base_url="https://api.anthropic.com/v1",
    )
    lines = [
        'data: {"type":"message_start","message":{"usage":{"input_tokens":11,"output_tokens":1}}}',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Oi"}}',
        'data: {"type":"message_delta","usage":{"output_tokens":5}}',
    ]

    with patch.object(httpx.AsyncClient, "stream", lambda self, *a, **k: _FakeStreamContext(lines)):
        chunks = await _collect(adapter.generate_stream(InferenceRequest(prompt="oi")))

    assert "".join(chunks) == "Oi"
    assert adapter.last_stream_usage == {"prompt_tokens": 11, "completion_tokens": 5}
