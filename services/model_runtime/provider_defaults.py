"""Modelos predefinidos por provedor e substituições de modelos descontinuados.

A lista de modelos é mantida num único local para evitar que o wizard, o cofre,
o adaptador e os agentes divirjam. A Groq descontinuou os modelos Llama para os
planos Free/Developer em 16/08/2026; pedidos a esses IDs devolvem
``model_not_found``. Os equivalentes atuais são aplicados automaticamente.
"""

from __future__ import annotations

DEFAULT_MODELS: dict[str, str] = {
    "openai": "gpt-4o-mini",
    "gemini": "gemini-2.5-flash",
    "groq": "openai/gpt-oss-120b",
    "deepseek": "deepseek-chat",
    "anthropic": "claude-3-5-haiku-20241022",
    "openrouter": "meta-llama/llama-3.3-70b-instruct",
    "custom": "gpt-4o-mini",
}

# Groq: https://console.groq.com/docs/deprecations
RETIRED_MODELS: dict[str, dict[str, str]] = {
    "groq": {
        "llama-3.3-70b-versatile": "openai/gpt-oss-120b",
        "llama-3.1-8b-instant": "openai/gpt-oss-20b",
        "qwen/qwen3.6-27b": "qwen/qwen3.8-27b",
    },
}


def default_model_for_provider(provider: str | None) -> str:
    """Devolve o modelo predefinido atual para o provedor indicado."""
    return DEFAULT_MODELS.get((provider or "").lower().strip(), "gpt-4o-mini")


def normalize_model_for_provider(provider: str | None, model: str | None) -> str | None:
    """Substitui IDs descontinuados; preserva modelos personalizados válidos."""
    if model is None:
        return None
    retired = RETIRED_MODELS.get((provider or "").lower().strip(), {})
    return retired.get(model.strip(), model)
