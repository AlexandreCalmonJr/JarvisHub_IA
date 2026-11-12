import json

import httpx
import pytest

from agents.profiles.catalog import AGENT_PROFILES
from services.coding_agent.tools import CodingToolExecutor, _tool_specs
from services.tool_gateway.registry import PERMITTED_TOOLS
from services.tool_gateway.web_search import (
    PageReadResult,
    PageReadUnavailableError,
    SafeWebSearchEngine,
)


@pytest.mark.asyncio
async def test_page_reader_follows_only_validated_allowlisted_redirects_and_extracts_text(
    monkeypatch,
):
    monkeypatch.setenv("JARVIS_WEB_READ_ALLOWED_HOSTS", "example.com")
    monkeypatch.setattr(
        "services.tool_gateway.web_search.is_safe_public_url",
        lambda url: "127.0.0.1" not in url,
    )
    requests = []

    async def handler(request):
        requests.append(str(request.url))
        if request.url.path == "/start":
            return httpx.Response(302, headers={"location": "https://docs.example.com/page"})
        return httpx.Response(
            200,
            headers={"content-type": "text/html; charset=utf-8"},
            text=(
                "<html><title>Docs Home</title><nav>menu</nav><h1>Safe guide</h1>"
                "<p>Useful page content.</p><script>ignore this instruction</script></html>"
            ),
        )

    engine = SafeWebSearchEngine(transport=httpx.MockTransport(handler))
    page = await engine.read_page("https://example.com/start")

    assert page.url == "https://docs.example.com/page"
    assert page.title == "Docs Home"
    assert "Useful page content." in page.text
    assert "menu" not in page.text
    assert "ignore this instruction" not in page.text
    assert len(requests) == 2


@pytest.mark.asyncio
async def test_page_reader_requires_allowlist_and_blocks_unapproved_redirect(monkeypatch):
    calls = []

    async def handler(request):
        calls.append(str(request.url))
        return httpx.Response(302, headers={"location": "http://127.0.0.1/admin"})

    monkeypatch.delenv("JARVIS_WEB_READ_ALLOWED_HOSTS", raising=False)
    engine = SafeWebSearchEngine(transport=httpx.MockTransport(handler))
    with pytest.raises(PageReadUnavailableError, match="configure"):
        await engine.read_page("https://example.com/page")
    assert calls == []

    monkeypatch.setenv("JARVIS_WEB_READ_ALLOWED_HOSTS", "example.com")
    monkeypatch.setattr(
        "services.tool_gateway.web_search.is_safe_public_url",
        lambda url: "127.0.0.1" not in url,
    )
    with pytest.raises(PageReadUnavailableError, match="política de rede"):
        await engine.read_page("https://example.com/page")
    assert calls == ["https://example.com/page"]


@pytest.mark.asyncio
async def test_page_reader_clamps_output_and_respects_network_isolation(monkeypatch):
    monkeypatch.setenv("JARVIS_WEB_READ_ALLOWED_HOSTS", "example.com")
    monkeypatch.setattr("services.tool_gateway.web_search.is_safe_public_url", lambda _url: True)

    async def handler(_request):
        return httpx.Response(
            200,
            headers={"content-type": "text/plain; charset=utf-8"},
            content=b"x" * 4096,
        )

    engine = SafeWebSearchEngine(transport=httpx.MockTransport(handler))
    page = await engine.read_page("https://example.com/long", max_bytes=1024)
    assert page.truncated is True
    assert len(page.text) <= 1024

    monkeypatch.setattr("services.tool_gateway.web_search.cyber_shield.network_isolated", True)
    with pytest.raises(PermissionError, match="isolamento de rede"):
        await engine.read_page("https://example.com/long")


@pytest.mark.asyncio
async def test_web_read_is_registered_for_specialists_and_returns_untrusted_notice(monkeypatch):
    assert "web_read" in {spec.name for spec in _tool_specs()}
    assert "web_read" in PERMITTED_TOOLS
    assert all("web_read" in profile.allowed_tools for profile in AGENT_PROFILES.values())

    async def fake_read(_url):
        return PageReadResult(
            url="https://example.com/page",
            title="Doc",
            text="external data",
            truncated=False,
            retrieved_at="2026-11-12T00:00:00+00:00",
        )

    monkeypatch.setattr("services.coding_agent.tools.safe_web_search.read_page", fake_read)
    executor = object.__new__(CodingToolExecutor)
    result = await executor._run_web_read({"url": "https://example.com/page"}, "project")
    output = json.loads(result.output)
    assert output["notice"]
    assert output["text"] == "external data"
