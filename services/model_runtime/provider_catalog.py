"""Fonte única de provedores, endpoints e modelos do JARVIS AI Hub.

Antes desta tabela, o modelo predefinido de cada provedor estava replicado em
`provider_defaults.py`, `hybrid_router.PROVIDER_PRESETS`, `key_vault.save_key`,
`vision_engine` e nos literais da UI — e divergia entre eles (incluindo IDs que
não existem em nenhum provedor). Qualquer novo provedor ou troca de modelo deve
acontecer **apenas aqui**.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ProviderSpec:
    """Especificação de um provedor de inferência."""

    id: str
    name: str
    # ``None`` significa "tem de ser configurado pelo operador".
    base_url: str | None
    # ``None`` significa "tem de ser configurado pelo operador".
    default_model: str | None
    # Modelo multimodal servido pelo mesmo endpoint OpenAI-compatível.
    # ``None`` = o provedor não serve visão por este caminho.
    vision_model: str | None
    openai_compatible: bool
    cost_per_1k_input: float
    cost_per_1k_output: float


PROVIDERS: tuple[ProviderSpec, ...] = (
    ProviderSpec(
        id="openai",
        name="OpenAI (GPT-4o / GPT-4o-mini)",
        base_url="https://api.openai.com/v1",
        default_model="gpt-4o-mini",
        vision_model="gpt-4o-mini",
        openai_compatible=True,
        cost_per_1k_input=0.00015,
        cost_per_1k_output=0.00060,
    ),
    ProviderSpec(
        id="gemini",
        name="Google Gemini (2.5 Flash)",
        base_url="https://generativelanguage.googleapis.com/v1beta/openai",
        default_model="gemini-2.5-flash",
        vision_model="gemini-2.5-flash",
        openai_compatible=True,
        cost_per_1k_input=0.000075,
        cost_per_1k_output=0.00030,
    ),
    ProviderSpec(
        id="groq",
        name="Groq (GPT-OSS 120B · LPU)",
        base_url="https://api.groq.com/openai/v1",
        default_model="openai/gpt-oss-120b",
        # A Groq não expõe modelo de visão no endpoint de chat: o motor de visão
        # deve declarar indisponibilidade em vez de inventar descrições.
        vision_model=None,
        openai_compatible=True,
        cost_per_1k_input=0.00015,
        cost_per_1k_output=0.00060,
    ),
    ProviderSpec(
        id="deepseek",
        name="DeepSeek (V3 / Reasoner)",
        base_url="https://api.deepseek.com/v1",
        default_model="deepseek-chat",
        vision_model=None,
        openai_compatible=True,
        cost_per_1k_input=0.00014,
        cost_per_1k_output=0.00028,
    ),
    ProviderSpec(
        id="openrouter",
        name="OpenRouter (multi-modelo)",
        base_url="https://openrouter.ai/api/v1",
        default_model="meta-llama/llama-3.3-70b-instruct",
        vision_model="openai/gpt-4o-mini",
        openai_compatible=True,
        cost_per_1k_input=0.00020,
        cost_per_1k_output=0.00080,
    ),
    ProviderSpec(
        id="anthropic",
        name="Anthropic Claude (Haiku 5.5 / Sonnet)",
        base_url="https://api.anthropic.com/v1",
        default_model="claude-haiku-5-5",
        # Protocolo próprio (x-api-key + /messages); não passa pelo motor de
        # visão OpenAI-compatível.
        vision_model=None,
        openai_compatible=False,
        cost_per_1k_input=0.0001,
        cost_per_1k_output=0.0005,
    ),
    ProviderSpec(
        id="custom",
        name="Personalizado / Compatível OpenAI",
        base_url=None,
        default_model=None,
        vision_model=None,
        openai_compatible=True,
        cost_per_1k_input=0.00100,
        cost_per_1k_output=0.00200,
    ),
)

PROVIDERS_BY_ID: dict[str, ProviderSpec] = {p.id: p for p in PROVIDERS}

#: Nomes de modelos locais usados como fallback por papel. Não são enviados a
#: provedores de nuvem: o adaptador substitui-os pelo modelo predefinido do
#: provedor activo.
LOCAL_MODEL_NAMES: frozenset[str] = frozenset(
    {
        "llama3.2:3b",
        "qwen2.5:7b",
        "qwen2.5-coder:7b",
        "starcoder2:3b",
        "mock-model",
    }
)


def get_provider(provider_id: str | None) -> ProviderSpec | None:
    """Devolve a especificação do provedor ou ``None`` se desconhecido."""
    if not provider_id:
        return None
    return PROVIDERS_BY_ID.get(provider_id.strip().lower())


def provider_presets() -> list[dict[str, Any]]:
    """Formato serializável consumido pela UI e pela configuração híbrida."""
    return [
        {
            "id": p.id,
            "name": p.name,
            "default_model": p.default_model,
            "base_url": p.base_url,
            "vision_model": p.vision_model,
            "openai_compatible": p.openai_compatible,
            "cost_per_1k_input": p.cost_per_1k_input,
            "cost_per_1k_output": p.cost_per_1k_output,
        }
        for p in PROVIDERS
    ]


def resolve_base_url(provider_id: str | None, fallback: str | None = None) -> str | None:
    """URL base efetiva; nunca inventa um destino para provedor personalizado."""
    spec = get_provider(provider_id)
    if fallback and fallback.strip():
        return fallback.strip()
    return spec.base_url if spec else None


def resolve_model(provider_id: str | None, fallback: str | None = None) -> str | None:
    """Modelo predefinido do provedor; ``None`` quando exige configuração."""
    if fallback and fallback.strip():
        return fallback.strip()
    spec = get_provider(provider_id)
    return spec.default_model if spec else None


#: A geração 5.x da Anthropic removeu os parâmetros de amostragem
#: (temperature/top_p/top_k); enviá-los devolve HTTP 400.
_ANTHROPIC_NO_SAMPLING = re.compile(
    r"^claude-(?:haiku|sonnet|opus|fable|mythos)-5(?:[.\-]|$)", re.IGNORECASE
)


def supports_sampling(provider_id: str | None, model: str | None) -> bool:
    """Indica se o provedor/modelo aceita ``temperature`` e afins."""
    if (provider_id or "").strip().lower() != "anthropic":
        return True
    return not bool(_ANTHROPIC_NO_SAMPLING.match((model or "").strip()))


def vision_endpoint(provider_id: str | None) -> tuple[str | None, str | None]:
    """``(base_url, model)`` para visão, ou ``(None, None)`` se não suportado."""
    spec = get_provider(provider_id)
    if not spec or not spec.openai_compatible or not spec.vision_model or not spec.base_url:
        return None, None
    return spec.base_url, spec.vision_model
