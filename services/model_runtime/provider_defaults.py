"""Modelos predefinidos por provedor.

A tabela real vive em :mod:`services.model_runtime.provider_catalog`; este
módulo mantém a API pública usada pelo adaptador, pelo cofre e pelos agentes e
apenas aplica as substituições de IDs descontinuados.
"""

from __future__ import annotations

from .provider_catalog import PROVIDERS_BY_ID, get_provider, resolve_base_url, resolve_model

# Compatibilidade: mapa simples provider -> modelo predefinido.
DEFAULT_MODELS: dict[str, str] = {
    spec.id: spec.default_model for spec in PROVIDERS_BY_ID.values() if spec.default_model
}

#: IDs que deixaram de ser servidos e o seu substituto atual.
#: Só entram aqui IDs verificados; nunca inventar versões de modelo.
RETIRED_MODELS: dict[str, dict[str, str]] = {
    "groq": {
        "llama-3.3-70b-versatile": "openai/gpt-oss-120b",
        "llama-3.1-8b-instant": "openai/gpt-oss-20b",
    },
    "anthropic": {
        "claude-3-5-haiku-20241022": "claude-haiku-5-5",
        "claude-3-5-sonnet-20241022": "claude-sonnet-5-5",
    },
}


def default_model_for_provider(provider: str | None) -> str | None:
    """Modelo predefinido do provedor; ``None`` quando exige configuração."""
    return resolve_model(provider)


def normalize_model_for_provider(provider: str | None, model: str | None) -> str | None:
    """Substitui IDs descontinuados; preserva modelos personalizados válidos."""
    if model is None:
        return None
    retired = RETIRED_MODELS.get((provider or "").lower().strip(), {})
    return retired.get(model.strip(), model)


__all__ = [
    "DEFAULT_MODELS",
    "RETIRED_MODELS",
    "default_model_for_provider",
    "get_provider",
    "normalize_model_for_provider",
    "resolve_base_url",
    "resolve_model",
]
