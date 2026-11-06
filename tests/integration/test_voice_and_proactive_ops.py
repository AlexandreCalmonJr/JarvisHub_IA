import pytest

from services.proactive_operations import (
    ProactiveBudgetExceededError,
    ProactivePolicy,
    ProactiveSupervisor,
)
from services.security_core import ApprovalEngine, AuditTrail
from services.voice_runtime import VoiceConfig, VoiceEngine


def test_voice_engine_disabled_by_default():
    voice = VoiceEngine()
    assert voice.config.enabled is False

    trans = voice.process_incoming_speech(b"test audio bytes")
    assert trans.text == ""

    synth = voice.speak_response("Olá utilizador")
    assert synth.is_spoken is False


def test_voice_engine_enabled_local_pipeline():
    cfg = VoiceConfig(enabled=True)
    voice = VoiceEngine(config=cfg)

    # 1. STT local
    trans = voice.process_incoming_speech(b"RIFF dummy speech data")
    assert trans.text != ""
    assert "jarvis" in trans.text

    # 2. TTS local
    synth = voice.speak_response("Comando compreendido e em execução.")
    assert synth.is_spoken is True
    assert synth.audio_bytes.startswith(b"RIFF")


def test_proactive_supervisor_generates_approval_and_enforces_budget():
    audit = AuditTrail()
    approval_engine = ApprovalEngine(audit_trail=audit)
    policy = ProactivePolicy(max_inspections_per_day=1)
    supervisor = ProactiveSupervisor(
        approval_engine=approval_engine,
        policy=policy,
        audit_trail=audit,
    )

    # First check: passes and generates approval request for proposed patch
    findings = supervisor.run_proactive_check(project_id="demo_flutter_app")
    assert len(findings) == 1
    finding = findings[0]
    assert finding.approval_request_id is not None

    pending_approvals = approval_engine.list_pending_requests()
    assert any(a.id == finding.approval_request_id for a in pending_approvals)
    assert pending_approvals[0].operation == "PROACTIVE_CODE_PATCH_APPLICATION"

    # Second check: must fail because budget of 1 inspection per day was reached
    with pytest.raises(ProactiveBudgetExceededError):
        supervisor.run_proactive_check(project_id="demo_flutter_app")
