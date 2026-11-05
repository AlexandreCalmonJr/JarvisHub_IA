import pytest
from pathlib import Path
from packages.contracts.agent import AgentRole
from packages.contracts.approval import ApprovalStatus
from packages.contracts.security import ProjectWorkMode, AuditEventSeverity
from services.security_core import (
    SecurityCore,
    PermissionDeniedError,
    UnauthorizedApprovalError,
    redact_data,
    redact_string,
)


@pytest.fixture
def security():
    return SecurityCore()


def test_redaction_secrets():
    raw_text = "Chave de acesso: sk-abcdef123456789012345678 e token: ghp_123456789012345678901234567890123456"
    sanitized = redact_string(raw_text)
    assert "sk-" not in sanitized
    assert "ghp_" not in sanitized
    assert "[REDACTED_SECRET]" in sanitized

    raw_dict = {
        "user": "developer",
        "api_key": "super_secret_key_123",
        "nested": {"password": "admin_password", "info": "public"},
    }
    redacted_dict = redact_data(raw_dict)
    assert redacted_dict["api_key"] == "[REDACTED_SECRET]"
    assert redacted_dict["nested"]["password"] == "[REDACTED_SECRET]"
    assert redacted_dict["nested"]["info"] == "public"


def test_path_traversal_prevention(security, tmp_path):
    project_root = tmp_path / "my_project"
    project_root.mkdir()
    secret_dir = tmp_path / "system_secrets"
    secret_dir.mkdir()
    secret_file = secret_dir / "passwords.txt"
    secret_file.write_text("secret")

    security.permission_engine.register_project("proj-1", str(project_root))

    # Acesso a arquivo legítimo dentro do projeto deve ser permitido
    valid_file = project_root / "src" / "main.py"
    valid_file.parent.mkdir()
    valid_file.write_text("print('hello')")
    resolved = security.permission_engine.validate_path_access("proj-1", "src/main.py")
    assert resolved == valid_file.resolve()

    # Tentativa de path traversal fora da raiz do projeto deve ser bloqueada
    with pytest.raises(PermissionDeniedError):
        security.permission_engine.validate_path_access("proj-1", "../system_secrets/passwords.txt")

    # Verifica que o evento de bloqueio foi auditado
    events = security.audit.list_events(project_id="proj-1")
    assert any(e.operation == "PATH_TRAVERSAL_BLOCKED" and e.severity == AuditEventSeverity.SECURITY_ALERT for e in events)


def test_read_only_agent_cannot_write(security, tmp_path):
    project_root = tmp_path / "demo_proj"
    project_root.mkdir()
    security.permission_engine.register_project("proj-read", str(project_root), mode=ProjectWorkMode.EDIT_APPROVED)

    # Code Reviewer (perfil analítico) não pode fazer escrita
    with pytest.raises(PermissionDeniedError, match="perfil estritamente de leitura"):
        security.permission_engine.check_operation_permission(
            agent_role=AgentRole.CODE_REVIEWER,
            project_id="proj-read",
            operation="file_write",
        )


def test_read_only_project_mode_blocks_modification(security, tmp_path):
    project_root = tmp_path / "protected_proj"
    project_root.mkdir()
    security.permission_engine.register_project("proj-prot", str(project_root), mode=ProjectWorkMode.READ_ONLY)

    # Mesmo um Developer é bloqueado se o projeto estiver em modo READ_ONLY
    with pytest.raises(PermissionDeniedError, match="Operações de alteração de arquivos estão desativadas"):
        security.permission_engine.check_operation_permission(
            agent_role=AgentRole.BACKEND_DEVELOPER,
            project_id="proj-prot",
            operation="file_write",
            has_human_approval=True,
        )


def test_agent_cannot_change_project_mode(security, tmp_path):
    project_root = tmp_path / "proj"
    project_root.mkdir()
    security.permission_engine.register_project("p1", str(project_root), mode=ProjectWorkMode.READ_ONLY)

    # Agente tentando mudar modo de projeto é rejeitado
    with pytest.raises(PermissionDeniedError, match="Agentes de IA não têm permissão"):
        security.permission_engine.set_project_mode("p1", ProjectWorkMode.EDIT_APPROVED, authorized_by=AgentRole.JARVIS_MASTER.value)


def test_approval_lifecycle_and_agent_self_approval_blocked(security):
    req = security.approval_engine.create_request(
        task_id="task-01",
        agent_role=AgentRole.BACKEND_DEVELOPER.value,
        operation="file_write",
        impact_summary="Criar novo endpoint de métricas",
        affected_resources=["apps/api/metrics.py"],
    )
    assert req.status == ApprovalStatus.PENDING

    # Tentativa de autoaprovação por agente de IA DEVE ser bloqueada!
    with pytest.raises(UnauthorizedApprovalError, match="Agentes de IA não possuem permissão"):
        security.approval_engine.approve_request(req.id, decided_by=AgentRole.JARVIS_MASTER.value)

    # Aprovação por utilizador humano legítimo é aceite
    approved_req = security.approval_engine.approve_request(req.id, decided_by="admin_user", decision_reason="Autorizado pelo arquiteto")
    assert approved_req.status == ApprovalStatus.APPROVED
    assert approved_req.decided_by == "admin_user"


def test_kill_switch_task_and_global(security):
    assert security.kill_switch.is_global_killed() is False

    # Cancelamento de tarefa pontual
    security.kill_switch.cancel_task("task-99", reason="Abortado pelo utilizador")
    assert security.kill_switch.is_task_cancelled("task-99") is True
    assert security.kill_switch.is_task_cancelled("task-100") is False

    # Disparo global de emergência
    security.kill_switch.trigger_global_kill(reason="Paragem de emergência")
    assert security.kill_switch.is_global_killed() is True
    assert security.kill_switch.is_task_cancelled("task-100") is True
    assert security.kill_switch.is_tool_blocked("git_push") is True

    # Reativação pelo administrador
    security.kill_switch.reset_global_kill(authorized_by="admin_user")
    assert security.kill_switch.is_global_killed() is False
