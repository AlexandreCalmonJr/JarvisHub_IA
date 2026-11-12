"""Defaults atuais dos provedores e migração de modelos Groq descontinuados."""

import json

from services.model_runtime.hybrid_router import load_hybrid_config_from_disk
from services.model_runtime.key_vault import KeyVaultService
from services.model_runtime.provider_defaults import (
    default_model_for_provider,
    normalize_model_for_provider,
)


def test_groq_uses_current_production_model():
    assert default_model_for_provider("groq") == "openai/gpt-oss-120b"
    assert (
        normalize_model_for_provider("groq", "llama-3.3-70b-versatile")
        == "openai/gpt-oss-120b"
    )
    assert (
        normalize_model_for_provider("groq", "llama-3.1-8b-instant")
        == "openai/gpt-oss-20b"
    )
    assert (
        normalize_model_for_provider("groq", "openai/gpt-oss-120b")
        == "openai/gpt-oss-120b"
    )
    # A substituição é específica da Groq e não altera outros provedores.
    assert (
        normalize_model_for_provider("openai", "llama-3.3-70b-versatile")
        == "llama-3.3-70b-versatile"
    )


def test_vault_save_normalizes_retired_groq_model(tmp_path):
    vault = KeyVaultService(vault_path=tmp_path / "vault.json")
    profile = vault.save_key(
        "groq_primary",
        "Groq principal",
        "groq",
        "gsk-test-secret",
        default_model="llama-3.3-70b-versatile",
    )
    assert profile.default_model == "openai/gpt-oss-120b"

    reopened = KeyVaultService(vault_path=tmp_path / "vault.json")
    assert reopened.get_key("groq_primary").default_model == "openai/gpt-oss-120b"


def test_vault_load_migrates_legacy_groq_key(tmp_path):
    path = tmp_path / "legacy-vault.json"
    path.write_text(
        json.dumps(
            {
                "groq_primary": {
                    "key_id": "groq_primary",
                    "label": "Groq legado",
                    "provider": "groq",
                    "api_key": "gsk-legacy-secret",
                    "base_url": "https://api.groq.com/openai/v1",
                    "default_model": "llama-3.3-70b-versatile",
                    "is_active": True,
                    "created_at": "",
                    "owner_user_id": None,
                    "is_default": False,
                }
            }
        ),
        encoding="utf-8",
    )

    vault = KeyVaultService(vault_path=path)
    assert vault.get_key("groq_primary").default_model == "openai/gpt-oss-120b"
    # O cofre legado em texto puro é reescrito cifrado e sem o ID descontinuado.
    persisted = path.read_text(encoding="utf-8")
    assert "llama-3.3-70b-versatile" not in persisted
    assert "gsk-legacy-secret" not in persisted


def test_hybrid_config_load_normalizes_retired_groq_model(tmp_path):
    path = tmp_path / "hybrid_gateway_config.json"
    path.write_text(
        json.dumps(
            {
                "provider_name": "groq",
                "default_model": "llama-3.3-70b-versatile",
            }
        ),
        encoding="utf-8",
    )

    cfg = load_hybrid_config_from_disk(path)
    assert cfg.provider_name == "groq"
    assert cfg.default_model == "openai/gpt-oss-120b"
