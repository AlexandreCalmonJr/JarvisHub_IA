"""Módulo de Busca Web Segura (Safe Web Search Engine).

Fornece capacidades de pesquisa na web para enriquecer as respostas dos agentes e do chat,
com blindagens rigorosas de cibersegurança:
- Blindagem anti-SSRF (Server-Side Request Forgery) com validação de IP e DNS;
- Confinamento contra redes privadas (RFC 1918), loopback, link-local e metadados de nuvem;
- DLP (Data Loss Prevention) para sanitização de credenciais e dados sensíveis antes de consultas;
- Timeout restrito (máximo 4.5 segundos) e degradação suave contra falhas de rede.
"""

from __future__ import annotations

import html
import ipaddress
import logging
import os
import re
import socket
import time
import urllib.parse
from dataclasses import dataclass
from datetime import UTC, datetime
from html.parser import HTMLParser
from typing import ClassVar

import httpx

from services.security_core.cyber_shield import cyber_shield

logger = logging.getLogger("jarvis.security.web_search")


# ---------------------------------------------------------------------------
# Estruturas de Dados
# ---------------------------------------------------------------------------
@dataclass
class SearchResult:
    """Resultado individual sanitizado de busca web."""

    title: str
    url: str
    snippet: str
    source: str = "web"
    retrieved_at: str = ""

    def to_dict(self) -> dict[str, str]:
        return {
            "title": self.title,
            "url": self.url,
            "snippet": self.snippet,
            "source": self.source,
            "retrieved_at": self.retrieved_at,
        }


class SearchUnavailableError(RuntimeError):
    """Pesquisa externa não pôde ser concluída; não representa zero resultados."""


# ---------------------------------------------------------------------------
# Leitura segura de pÃ¡ginas
# ---------------------------------------------------------------------------
class PageReadUnavailableError(RuntimeError):
    """Leitura de pÃ¡gina bloqueada por polÃ­tica ou indisponÃ­vel."""


@dataclass
class PageReadResult:
    url: str
    title: str
    text: str
    truncated: bool
    retrieved_at: str

    def to_dict(self) -> dict[str, str | bool]:
        return {
            "url": self.url,
            "title": self.title,
            "text": self.text,
            "truncated": self.truncated,
            "retrieved_at": self.retrieved_at,
        }


class _PageTextParser(HTMLParser):
    _SKIP_TAGS: ClassVar[set[str]] = {
        "script",
        "style",
        "noscript",
        "svg",
        "nav",
        "header",
        "footer",
    }

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.title_parts: list[str] = []
        self._skip_depth = 0
        self._in_title = False

    def handle_starttag(self, tag: str, _attrs):
        tag = tag.casefold()
        if tag in self._SKIP_TAGS:
            self._skip_depth += 1
        elif tag == "title":
            self._in_title = True
        elif tag in {"p", "br", "div", "li", "h1", "h2", "h3", "tr"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str):
        tag = tag.casefold()
        if tag in self._SKIP_TAGS and self._skip_depth:
            self._skip_depth -= 1
        elif tag == "title":
            self._in_title = False
        elif tag in {"p", "div", "li", "h1", "h2", "h3", "tr"}:
            self.parts.append("\n")

    def handle_data(self, data: str):
        if self._skip_depth:
            return
        if self._in_title:
            self.title_parts.append(data)
        else:
            self.parts.append(data)

    @property
    def title(self) -> str:
        return " ".join(" ".join(self.title_parts).split())[:300]

    @property
    def text(self) -> str:
        return " ".join("".join(self.parts).split())


# ---------------------------------------------------------------------------
# SSRF Guard (Blindagem de Rede Estrita)
# ---------------------------------------------------------------------------
_BLOCKED_HOSTNAMES = {
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "metadata.google.internal",
    "instance-data",
}

_BLOCKED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),  # Loopback IPv4
    ipaddress.ip_network("10.0.0.0/8"),  # Privada Classe A
    ipaddress.ip_network("172.16.0.0/12"),  # Privada Classe B
    ipaddress.ip_network("192.168.0.0/16"),  # Privada Classe C
    ipaddress.ip_network("169.254.0.0/16"),  # Link-Local / Cloud Metadata (169.254.169.254)
    ipaddress.ip_network("::1/128"),  # Loopback IPv6
    ipaddress.ip_network("fe80::/10"),  # Link-Local IPv6
    ipaddress.ip_network("fc00::/7"),  # Unique Local Address (ULA) IPv6
]


def is_safe_public_url(target_url: str) -> bool:
    """Valida se uma URL aponta para um endereço público e seguro na Internet.

    Rejeita esquemas não-HTTP(S), hostnames locais e IPs privados/reservados.
    """
    try:
        parsed = urllib.parse.urlsplit(target_url)
        if parsed.scheme not in {"http", "https"}:
            return False
        if parsed.username is not None or parsed.password is not None:
            return False
        if parsed.port not in {None, 80, 443}:
            return False

        hostname = (parsed.hostname or "").strip().lower()
        if not hostname or hostname in _BLOCKED_HOSTNAMES:
            return False

        # Verifica resolução de DNS para todos os IPs associados
        addr_infos = socket.getaddrinfo(
            hostname, parsed.port or (443 if parsed.scheme == "https" else 80)
        )
        if not addr_infos:
            return False
        for item in addr_infos:
            ip_str = item[4][0]
            try:
                ip_obj = ipaddress.ip_address(ip_str)
                if (
                    not ip_obj.is_global
                    or ip_obj.is_private
                    or ip_obj.is_loopback
                    or ip_obj.is_link_local
                    or ip_obj.is_reserved
                ):
                    return False
                for net in _BLOCKED_NETWORKS:
                    if ip_obj in net:
                        return False
            except ValueError:
                return False

        return True
    except Exception as exc:
        logger.debug("Falha na validação SSRF da URL %s: %s", target_url, exc)
        return False


# ---------------------------------------------------------------------------
# DLP & Sanitização de Dados
# ---------------------------------------------------------------------------
_SENSITIVE_PATTERNS = [
    r"gsk_[a-zA-Z0-9_-]{20,}",  # Groq API Key
    r"sk-[a-zA-Z0-9_-]{20,}",  # OpenAI API Key
    r"sk-ant-[a-zA-Z0-9_-]{20,}",  # Anthropic API Key
    r"bearer\s+[a-zA-Z0-9_\-\.]{20,}",  # Authorization Tokens
    r"password\s*=\s*['\"][^'\"]+['\"]",  # Senhas explícitas
    r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b",  # CPF brasileiro
    r"\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b",  # Cartão de crédito
]


def sanitize_search_query(query: str) -> str:
    """Remove credenciais, segredos e dados sensíveis antes de enviar para a web."""
    clean = query.strip()
    for pattern in _SENSITIVE_PATTERNS:
        clean = re.sub(pattern, "[REDACTED]", clean, flags=re.IGNORECASE)

    # Limita o comprimento para evitar payloads abusivos
    return clean[:200].strip()


def _strip_html(raw_html: str) -> str:
    """Remove marcação HTML e converte entidades de texto para formato limpo."""
    no_tags = re.sub(r"<[^>]+>", " ", raw_html)
    unescaped = html.unescape(no_tags)
    return " ".join(unescaped.split())


# ---------------------------------------------------------------------------
# Motor de Busca Seguro (SafeWebSearchEngine)
# ---------------------------------------------------------------------------
class SafeWebSearchEngine:
    """Motor de busca web soberano, seguro e resiliente.

    Utiliza endpoints de busca HTML acessíveis com timeout curto, proteção SSRF e
    extração limpa de snippets, sem depender de chaves de API pagas de terceiros.
    """

    SEARCH_ENDPOINT = "https://lite.duckduckgo.com/lite/"
    DEFAULT_TIMEOUT_SECONDS = 4.5
    MAX_SNIPPET_LENGTH = 320
    CACHE_TTL_SECONDS = 12 * 60
    MAX_PAGE_BYTES = 512_000
    MAX_PAGE_CHARS = 20_000
    MAX_PAGE_REDIRECTS = 3
    MAX_PAGE_TIMEOUT_SECONDS = 8.0

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None):
        self._cache: dict[str, tuple[float, list[SearchResult]]] = {}
        self._transport = transport

    @staticmethod
    def _page_allowed_hosts() -> set[str]:
        configured = os.getenv("JARVIS_WEB_READ_ALLOWED_HOSTS", "")
        hosts: set[str] = set()
        for item in configured.split(","):
            host = item.strip().lower().rstrip(".")
            if host:
                try:
                    hosts.add(host.encode("idna").decode("ascii"))
                except UnicodeError:
                    continue
        return hosts

    def _validate_page_target(self, target_url: str, allowed_hosts: set[str]) -> str:
        if not allowed_hosts:
            raise PageReadUnavailableError(
                "Leitura de páginas desativada: configure JARVIS_WEB_READ_ALLOWED_HOSTS."
            )
        if not is_safe_public_url(target_url):
            raise PageReadUnavailableError("URL bloqueada pela política de rede segura.")
        parsed = urllib.parse.urlsplit(target_url)
        host = (parsed.hostname or "").lower().rstrip(".")
        try:
            host = host.encode("idna").decode("ascii")
        except UnicodeError as exc:
            raise PageReadUnavailableError("Host inválido.") from exc
        if not any(host == allowed or host.endswith("." + allowed) for allowed in allowed_hosts):
            raise PageReadUnavailableError("Host fora da allowlist de leitura web.")
        return urllib.parse.urlunsplit(
            (parsed.scheme, parsed.netloc, parsed.path or "/", parsed.query, "")
        )

    async def read_page(
        self,
        url: str,
        *,
        timeout_seconds: float = MAX_PAGE_TIMEOUT_SECONDS,
        max_bytes: int = MAX_PAGE_BYTES,
    ) -> PageReadResult:
        """Fetch a small public HTML/text page from explicitly allowed hosts."""
        if cyber_shield.network_isolated:
            cyber_shield.blocked_outbound_attempts += 1
            raise PermissionError("Leitura de página bloqueada: isolamento de rede ativo.")

        allowed_hosts = self._page_allowed_hosts()
        current_url = self._validate_page_target(url.strip(), allowed_hosts)
        timeout = max(0.5, min(float(timeout_seconds), self.MAX_PAGE_TIMEOUT_SECONDS))
        byte_limit = max(1024, min(int(max_bytes), self.MAX_PAGE_BYTES))
        headers = {
            "User-Agent": "JARVIS-AI-Hub/3.0 (safe page reader)",
            "Accept": "text/html,application/xhtml+xml,text/plain",
        }

        try:
            async with httpx.AsyncClient(
                timeout=timeout,
                follow_redirects=False,
                trust_env=False,
                transport=self._transport,
            ) as client:
                for redirect_index in range(self.MAX_PAGE_REDIRECTS + 1):
                    current_url = self._validate_page_target(current_url, allowed_hosts)
                    async with client.stream("GET", current_url, headers=headers) as response:
                        if response.status_code in {301, 302, 303, 307, 308}:
                            location = response.headers.get("location")
                            if not location or redirect_index == self.MAX_PAGE_REDIRECTS:
                                raise PageReadUnavailableError(
                                    "A página excedeu o limite de redirecionamentos."
                                )
                            current_url = urllib.parse.urljoin(current_url, location)
                            continue
                        if response.status_code != 200:
                            raise PageReadUnavailableError(
                                f"Leitura da página indisponível (HTTP {response.status_code})."
                            )
                        media_type = (
                            response.headers.get("content-type", "").split(";")[0].strip().lower()
                        )
                        if media_type not in {"text/html", "application/xhtml+xml", "text/plain"}:
                            raise PageReadUnavailableError("Tipo de conteúdo não permitido.")
                        content_length = response.headers.get("content-length", "")
                        truncated = content_length.isdigit() and int(content_length) > byte_limit
                        body = bytearray()
                        async for chunk in response.aiter_bytes():
                            room = byte_limit - len(body)
                            if len(chunk) > room:
                                body.extend(chunk[:room])
                                truncated = True
                                break
                            body.extend(chunk)
                        encoding = response.encoding or "utf-8"
                        raw_text = bytes(body).decode(encoding, errors="replace")
                        if media_type == "text/plain":
                            title = ""
                            text = " ".join(raw_text.split())
                        else:
                            parser = _PageTextParser()
                            parser.feed(raw_text)
                            title = parser.title
                            text = parser.text
                        if len(text) > self.MAX_PAGE_CHARS:
                            text = text[: self.MAX_PAGE_CHARS]
                            truncated = True
                        if not text:
                            raise PageReadUnavailableError("A página não contém texto legível.")
                        return PageReadResult(
                            url=current_url,
                            title=title,
                            text=text,
                            truncated=truncated,
                            retrieved_at=datetime.now(UTC).isoformat(),
                        )
        except PageReadUnavailableError:
            raise
        except (httpx.TimeoutException, TimeoutError) as exc:
            raise PageReadUnavailableError("Tempo limite na leitura da página.") from exc
        except httpx.HTTPError as exc:
            raise PageReadUnavailableError("Falha de conexão ao ler a página.") from exc
        raise PageReadUnavailableError("A página não foi encontrada após redirecionamentos.")

    async def search(
        self,
        query: str,
        max_results: int = 4,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> list[SearchResult]:
        if cyber_shield.network_isolated:
            cyber_shield.blocked_outbound_attempts += 1
            raise PermissionError("Busca bloqueada: o isolamento de rede está ativo.")
        sanitized_query = sanitize_search_query(query)
        if not sanitized_query or len(sanitized_query) < 2:
            return []
        cache_key = " ".join(sanitized_query.casefold().split())
        cached = self._cache.get(cache_key)
        if cached and cached[0] > time.monotonic():
            return [SearchResult(**item.to_dict()) for item in cached[1]]
        if cached:
            self._cache.pop(cache_key, None)

        # Validação SSRF do endpoint de busca
        if not is_safe_public_url(self.SEARCH_ENDPOINT):
            logger.warning(
                "Endpoint de busca rejeitado pela política SSRF: %s", self.SEARCH_ENDPOINT
            )
            raise SearchUnavailableError(
                "Busca indisponível: o endpoint foi bloqueado pela política de rede."
            )

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        }
        data = {"q": sanitized_query}

        try:
            async with httpx.AsyncClient(timeout=timeout_seconds, follow_redirects=True) as client:
                response = await client.post(self.SEARCH_ENDPOINT, data=data, headers=headers)
                if response.status_code != 200:
                    logger.debug(
                        "Busca retornou HTTP %s para a query '%s'",
                        response.status_code,
                        sanitized_query,
                    )
                    raise SearchUnavailableError(
                        f"Busca indisponível (HTTP {response.status_code})."
                    )

                results = self._parse_lite_results(response.text, max_results=max_results)
                self._cache[cache_key] = (
                    time.monotonic() + self.CACHE_TTL_SECONDS,
                    [SearchResult(**item.to_dict()) for item in results],
                )
                return results
        except (httpx.TimeoutException, TimeoutError):
            logger.info(
                "Timeout na busca web (%ss) para query: '%s'", timeout_seconds, sanitized_query
            )
            raise SearchUnavailableError("Busca indisponível: tempo limite excedido.")
        except httpx.HTTPError as exc:
            logger.info("Falha de rede na busca web: %s", exc)
            raise SearchUnavailableError("Busca indisponível: falha de conexão.") from exc
        except SearchUnavailableError:
            raise
        except Exception as exc:
            logger.warning("Erro inesperado ao consultar busca web: %s", exc)
            raise SearchUnavailableError("Busca indisponível: erro inesperado.") from exc

    def _parse_lite_results(self, html_text: str, max_results: int = 4) -> list[SearchResult]:
        """Extrai resultados estruturados do layout Lite do DuckDuckGo."""
        results: list[SearchResult] = []

        # Padrão flexível para links com classe result-link (independente da ordem de class e href)
        link_pattern = re.compile(
            r"<a\s+[^>]*?class=['\"][^'\"]*result-link[^'\"]*['\"][^>]*?href=['\"]([^'\"]+)['\"][^>]*>(.*?)</a>|"
            r"<a\s+[^>]*?href=['\"]([^'\"]+)['\"][^>]*?class=['\"][^'\"]*result-link[^'\"]*['\"][^>]*>(.*?)</a>",
            re.DOTALL | re.IGNORECASE,
        )
        snippet_pattern = re.compile(
            r"<td[^>]+class=['\"][^'\"]*result-snippet[^'\"]*['\"][^>]*>(.*?)</td>",
            re.DOTALL | re.IGNORECASE,
        )

        raw_links = link_pattern.findall(html_text)
        snippets = snippet_pattern.findall(html_text)

        extracted_pairs: list[tuple[str, str]] = []
        for match_tuple in raw_links:
            u1, t1, u2, t2 = match_tuple
            url = u1 or u2
            title = t1 or t2
            if url and title:
                extracted_pairs.append((url, title))

        for i, (raw_url, raw_title) in enumerate(extracted_pairs[:max_results]):
            clean_title = _strip_html(raw_title)
            raw_snip = snippets[i] if i < len(snippets) else ""
            clean_snippet = _strip_html(raw_snip)[: self.MAX_SNIPPET_LENGTH]

            # Sanitização de URL
            target_url = raw_url.strip()
            if "uddg=" in target_url:
                try:
                    match = re.search(r"uddg=([^&]+)", target_url)
                    if match:
                        target_url = urllib.parse.unquote(match.group(1))
                except Exception as exc:
                    logger.debug("Falha ao decodificar redirect duckduckgo: %s", exc)

            if target_url.startswith("//"):
                target_url = "https:" + target_url

            if clean_title:
                results.append(
                    SearchResult(
                        title=clean_title,
                        url=target_url,
                        snippet=clean_snippet or clean_title,
                        retrieved_at=datetime.now(UTC).isoformat(),
                    )
                )

        return results


# Instância global reutilizável
safe_web_search = SafeWebSearchEngine()
SafeWebSearchClient = SafeWebSearchEngine
