import httpx
import pytest

from services.coding_agent import ChatTurn
from services.coding_agent.providers import (
    ChatProvider,
    ProviderError,
    ProviderReply,
    ResilientChatProvider,
)
from services.security_core.cyber_shield import cyber_shield
from services.tool_gateway.web_search import (
    SafeWebSearchEngine,
    SearchUnavailableError,
    is_safe_public_url,
    sanitize_search_query,
)


def test_ssrf_protection_blocks_internal_and_reserved_ips():
    # Localhost e loopback
    assert not is_safe_public_url("http://127.0.0.1:8000/api/chat")
    assert not is_safe_public_url("http://localhost:11434")
    assert not is_safe_public_url("http://0.0.0.0:8000")

    # Metadata de provedores de nuvem (AWS/GCP/Azure)
    assert not is_safe_public_url("http://169.254.169.254/latest/meta-data")

    # Esquemas não autorizados
    assert not is_safe_public_url("file:///etc/passwd")
    assert not is_safe_public_url("ftp://ftp.example.com")


def test_dlp_query_sanitization():
    # Mascara chaves de API conhecidas
    query_with_key = "como usar a chave gsk_123456789012345678901234 para testar?"
    sanitized = sanitize_search_query(query_with_key)
    assert "gsk_123456789012345678901234" not in sanitized
    assert "[REDACTED]" in sanitized

    # Query normal permanece limpa
    normal_query = "como aprender ingles sozinho"
    assert sanitize_search_query(normal_query) == "como aprender ingles sozinho"


@pytest.mark.asyncio
async def test_search_fails_closed_when_network_is_isolated(monkeypatch):
    monkeypatch.setattr(cyber_shield, "network_isolated", True)

    async def unexpected_http(*args, **kwargs):
        raise AssertionError("HTTP não deveria ser chamado")

    monkeypatch.setattr("httpx.AsyncClient", unexpected_http)
    with pytest.raises(PermissionError, match="isolamento de rede"):
        await SafeWebSearchEngine().search("consulta segura")


@pytest.mark.asyncio
async def test_search_fixture_parsing_and_normalized_query_cache(monkeypatch):
    monkeypatch.setattr(cyber_shield, "network_isolated", False)
    monkeypatch.setattr("services.tool_gateway.web_search.is_safe_public_url", lambda _url: True)
    calls = []
    body = """<a class="result-link" href="https://example.org/page">Fonte de teste</a>
      <td class="result-snippet">Trecho de fixture local</td>"""

    class FakeResponse:
        status_code = 200
        text = body

    class FakeClient:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            pass

        async def post(self, *_args, **_kwargs):
            calls.append(1)
            return FakeResponse()

    monkeypatch.setattr("httpx.AsyncClient", FakeClient)
    engine = SafeWebSearchEngine()
    first = await engine.search("  Jarvis   local  ")
    second = await engine.search("jarvis local")
    assert len(calls) == 1
    assert first[0].title == "Fonte de teste"
    assert first[0].url == "https://example.org/page"
    assert first[0].retrieved_at
    assert second[0].retrieved_at == first[0].retrieved_at


@pytest.mark.asyncio
async def test_search_network_failure_is_explicit(monkeypatch):
    monkeypatch.setattr(cyber_shield, "network_isolated", False)
    monkeypatch.setattr("services.tool_gateway.web_search.is_safe_public_url", lambda _url: True)

    class FailingClient:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            pass

        async def post(self, *_args, **_kwargs):
            raise httpx.ConnectError("offline")

    monkeypatch.setattr("httpx.AsyncClient", FailingClient)
    with pytest.raises(SearchUnavailableError, match="Busca indisponível"):
        await SafeWebSearchEngine().search("Jarvis local")


class MockFailingProvider(ChatProvider):
    name = "mock_failing"
    default_model = "mock-fail-model"

    async def complete(self, **kwargs) -> ProviderReply:
        raise ProviderError("Erro 401: Unauthorized")

    async def stream(self, **kwargs):
        raise ProviderError("Erro 401: Unauthorized")
        yield ""  # pragma: no cover


class MockSuccessProvider(ChatProvider):
    name = "mock_success"
    default_model = "mock-ok-model"

    async def complete(self, **kwargs) -> ProviderReply:
        return ProviderReply(
            content="Resposta de sucesso do modelo local soberano",
            model=self.default_model,
        )

    async def stream(self, **kwargs):
        yield "Resposta "
        yield "local "
        yield "soberana"


@pytest.mark.asyncio
async def test_resilient_provider_automatic_failover():
    primary = MockFailingProvider()
    fallback = MockSuccessProvider()
    resilient = ResilientChatProvider(primary=primary, fallback=fallback)

    # Teste de complete
    reply = await resilient.complete(
        turns=[ChatTurn(role="user", content="teste")],
        tools=[],
        model=None,
        temperature=0.3,
        max_tokens=50,
        timeout_seconds=5.0,
    )
    assert "sucesso do modelo local" in reply.content
    assert reply.model == "mock-ok-model"

    # Teste de stream
    chunks = []
    async for chunk in resilient.stream(
        turns=[ChatTurn(role="user", content="teste stream")],
        tools=[],
        model=None,
        temperature=0.3,
        max_tokens=50,
        timeout_seconds=5.0,
    ):
        chunks.append(chunk)

    assert "".join(chunks) == "Resposta local soberana"
