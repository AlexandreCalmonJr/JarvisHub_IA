"""Shared public error codes for chat and specialist streaming APIs."""

from __future__ import annotations

import asyncio

from services.coding_agent.providers import ProviderError
from services.security_core.permission_engine import PermissionDeniedError


def classify_error_message(message: str) -> str:
    normalized = message.casefold()
    if any(
        term in normalized for term in ("timeout", "timed out", "tempo limite", "excedeu o tempo")
    ):
        return "timeout"
    if any(
        term in normalized
        for term in ("permission", "denied", "policy", "política", "kill switch", "não autorizado")
    ):
        return "policy_denied"
    if any(
        term in normalized
        for term in (
            "provider",
            "provedor",
            "ollama",
            "openai",
            "anthropic",
            "connection",
            "conexão",
        )
    ):
        return "provider_unavailable"
    return "internal"


def classify_error(exc: Exception) -> str:
    if isinstance(exc, PermissionDeniedError):
        return "policy_denied"
    if isinstance(exc, (TimeoutError, asyncio.TimeoutError)):
        return "timeout"
    if isinstance(exc, ProviderError):
        return (
            "timeout" if classify_error_message(str(exc)) == "timeout" else "provider_unavailable"
        )
    return classify_error_message(str(exc))


def http_status_for_error_code(code: str) -> int:
    return {
        "policy_denied": 403,
        "timeout": 504,
        "provider_unavailable": 503,
        "internal": 500,
    }.get(code, 500)
