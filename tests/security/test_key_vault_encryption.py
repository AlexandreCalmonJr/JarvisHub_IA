from services.coding_agent.providers import GovernedChatProvider, resolve_governed_chat_provider
from services.model_runtime.hybrid_router import OnlineProviderConfig
from services.model_runtime.key_vault import KeyVaultService


def test_hybrid_config_serialization_never_contains_provider_secret():
    secret = "sk-test-never-persist-this-secret"
    cfg = OnlineProviderConfig(enabled=True, api_key=secret)
    serialized = cfg.model_dump_json()
    assert secret not in serialized
    assert '"api_key"' not in serialized


def test_key_vault_encrypts_secrets_at_rest_and_masks_list_output(tmp_path):
    secret = "sk-live-very-sensitive-example-key"
    vault_path = tmp_path / "api_keys_vault.json"
    vault = KeyVaultService(vault_path=vault_path)
    vault.save_key(
        key_id="primary",
        label="Primary provider",
        provider="openai",
        api_key=secret,
        base_url="https://api.openai.com/v1",
        default_model="gpt-4o-mini",
    )

    persisted = vault_path.read_bytes()
    assert secret.encode() not in persisted

    listed = vault.list_keys()
    assert len(listed) == 1
    assert "api_key" not in listed[0]
    assert listed[0]["masked_key"] != secret
    assert listed[0]["has_api_key"] is True

    reopened = KeyVaultService(vault_path=vault_path)
    profile = reopened.get_key("primary")
    assert profile is not None
    assert profile.api_key == secret


def test_governed_chat_provider_resolves_key_from_vault_without_config_plaintext(tmp_path):
    secret = "sk-chat-provider-secret"
    vault = KeyVaultService(vault_path=tmp_path / "chat-vault.json")
    vault.save_key(
        key_id="chat-primary",
        label="Chat primary",
        provider="openai",
        api_key=secret,
        base_url="https://api.openai.com/v1",
        default_model="gpt-4o-mini",
    )
    cfg = OnlineProviderConfig(enabled=True, key_id="chat-primary")
    router = type("Router", (), {"key_vault": vault})()

    provider = resolve_governed_chat_provider(cfg, router)
    assert isinstance(provider, GovernedChatProvider)
    assert provider.primary.api_key == secret
    assert cfg.api_key is None
