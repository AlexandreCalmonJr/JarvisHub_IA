"""Isolamento do cofre privado por conta e uso da chave predefinida."""

import pytest

from services.model_runtime.adapter import MockAdapter
from services.model_runtime.hybrid_router import HybridModelRouter, OnlineProviderConfig
from services.model_runtime.key_vault import KeyVaultService
from services.model_runtime.model_manager import ModelManager
from services.model_runtime.types import InferenceRequest, InferenceResponse


def _vault(tmp_path) -> KeyVaultService:
    return KeyVaultService(vault_path=tmp_path / "account-vault.json")


def test_account_keys_are_isolated_and_masked(tmp_path):
    vault = _vault(tmp_path)
    vault.save_key("primary", "Alice", "openai", "sk-alice-secret-key", owner_user_id="alice")
    vault.save_key("primary", "Bob", "groq", "gsk-bob-secret-key", owner_user_id="bob")
    vault.save_key("global", "Global", "openai", "sk-global-secret-key")

    alice = vault.list_keys(owner_user_id="alice")
    assert [item["key_id"] for item in alice] == ["primary"]
    assert all(item["owner_user_id"] == "alice" for item in alice)
    assert "api_key" not in alice[0]

    assert vault.get_key("primary", "alice").provider == "openai"
    assert vault.get_key("primary", "bob").provider == "groq"
    # O âmbito global nunca resolve chaves privadas de uma conta.
    assert vault.get_key("primary") is None

    admin_view = vault.list_keys(owner_user_id="alice", include_global=True)
    assert {item["key_id"] for item in admin_view} == {"primary", "global"}


def test_default_key_resolution_and_deletion_scope(tmp_path):
    vault = _vault(tmp_path)
    vault.save_key("one", "One", "openai", "sk-one-secret-key", owner_user_id="alice")
    assert vault.resolve_active_key("alice").key_id == "one"

    vault.save_key("two", "Two", "groq", "gsk-two-secret-key", owner_user_id="alice")
    # A primeira chave continua a ser a predefinida até ser substituída.
    assert vault.resolve_active_key("alice").key_id == "one"
    assert vault.set_default_key("two", "alice")
    assert vault.resolve_active_key("alice").key_id == "two"

    assert not vault.delete_key("two", owner_user_id="bob")
    assert vault.delete_key("two", owner_user_id="alice")
    assert vault.resolve_active_key("alice").key_id == "one"


@pytest.mark.asyncio
async def test_model_manager_uses_account_default_key_for_inference(tmp_path):
    vault = _vault(tmp_path)
    vault.save_key(
        "account_key",
        "Conta",
        "openai",
        "sk-account-secret",
        base_url="https://api.openai.com/v1",
        default_model="gpt-4o-mini",
        owner_user_id="alice",
        is_default=True,
    )
    calls: list[InferenceRequest] = []

    class RecordingAdapter:
        async def generate(self, request: InferenceRequest):
            calls.append(request)
            return InferenceResponse(content="ok", model_name=request.model_name)

    router = HybridModelRouter(
        local_adapter=MockAdapter(),
        online_config=OnlineProviderConfig(enabled=False),
        key_vault=vault,
    )
    router._vault_adapters["alice::account_key"] = RecordingAdapter()
    manager = ModelManager(
        adapter=MockAdapter(default_response="resposta local"), hybrid_router=router
    )

    response = await manager.generate(
        InferenceRequest(
            prompt="olá",
            owner_user_id="alice",
            model_name="llama3.2:3b",
            timeout_seconds=5.0,
        )
    )
    assert response.content == "ok"
    assert len(calls) == 1
    assert calls[0].key_id == "account_key"
    assert calls[0].model_name == "gpt-4o-mini"


@pytest.mark.asyncio
async def test_model_manager_keeps_local_inference_for_account_without_key(tmp_path):
    vault = _vault(tmp_path)
    router = HybridModelRouter(
        local_adapter=MockAdapter(),
        online_config=OnlineProviderConfig(enabled=False),
        key_vault=vault,
    )
    manager = ModelManager(
        adapter=MockAdapter(default_response="resposta local"), hybrid_router=router
    )

    response = await manager.generate(
        InferenceRequest(prompt="olá", owner_user_id="bob", timeout_seconds=5.0)
    )
    assert response.content == "resposta local"
