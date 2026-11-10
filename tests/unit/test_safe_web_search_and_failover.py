import pytest
import httpx
from services.tool_gateway.web_search import is_safe_public_url, sanitize_search_query, SearchResult
from services.coding_agent.providers import (
    ChatProvider,
    ProviderReply,
    ProviderError,
    ResilientChatProvider,
)
from services.coding_agent import ChatTurn


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
