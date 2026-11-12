from apps.api.error_codes import classify_error, classify_error_message
from services.coding_agent import ProviderError
from services.security_core.permission_engine import PermissionDeniedError


def test_error_codes_distinguish_provider_timeout_policy_and_internal():
    assert classify_error(ProviderError("connection refused by provider")) == "provider_unavailable"
    assert classify_error(ProviderError("request timed out")) == "timeout"
    assert classify_error(PermissionDeniedError("permission denied")) == "policy_denied"
    assert classify_error(RuntimeError("unexpected state")) == "internal"


def test_error_message_classification_handles_agent_runtime_events():
    assert classify_error_message("Tempo limite excedido") == "timeout"
    assert classify_error_message("Bloqueado pelo Kill Switch") == "policy_denied"
    assert classify_error_message("Falha ao comunicar com o provedor") == "provider_unavailable"
    assert classify_error_message("Falha inesperada") == "internal"
