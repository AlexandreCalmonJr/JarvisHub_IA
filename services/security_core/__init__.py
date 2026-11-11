from .approval_engine import ApprovalEngine, UnauthorizedApprovalError
from .audit_trail import AuditTrail
from .cve_scanner import CVEScannerService
from .cyber_shield import CyberShield, cyber_shield
from .device_auth import DeviceAuthManager, DeviceRegistration
from .kill_switch import KillSwitch
from .permission_engine import (
    CRITICAL_OPERATIONS,
    READ_ONLY_ROLES,
    PermissionDeniedError,
    PermissionEngine,
)
from .pipeline_types import (
    FindingSeverity,
    FindingStatus,
    PipelineGateResult,
    SecurityFinding,
    StackType,
)
from .policy_generator import SecurityPolicyGenerator
from .qa_security_pipeline import QASecurityPipeline
from .red_team_sandbox import RedTeamSandboxService
from .redaction import contains_sensitive_data, redact_data, redact_string
from .session_manager import SessionManager, UserRole, UserSession


class SecurityCore:
    """
    Fachada unificada do Núcleo de Segurança do JARVIS AI HUB.
    Ponto de entrada obrigatório para validação de permissões, auditoria, aprovações e kill switch.
    """

    def __init__(self, workspace_service=None, auth_dir=None, db_manager=None):
        self.db_manager = db_manager
        self.audit = AuditTrail(db_manager=db_manager)
        self.sessions = SessionManager(db_manager=db_manager)
        self.kill_switch = KillSwitch(audit_trail=self.audit)
        self.approval_engine = ApprovalEngine(audit_trail=self.audit, db_manager=db_manager)
        self.permission_engine = PermissionEngine(audit_trail=self.audit)
        self.pipeline = QASecurityPipeline(audit_trail=self.audit)
        device_store = None
        if auth_dir is not None:
            from pathlib import Path

            device_store = Path(auth_dir) / "devices.json"
        self.device_auth = DeviceAuthManager(
            audit_trail=self.audit, store_path=device_store, db_manager=db_manager
        )
        self.cyber_shield = cyber_shield
        self.cve_scanner = CVEScannerService()
        self.red_team = RedTeamSandboxService(workspace_service=workspace_service)
        self.policy_generator = SecurityPolicyGenerator(workspace_service=workspace_service)

    def set_db_manager(self, db_manager) -> None:
        """Vincula o gerenciador de banco de dados SQLite a todos os subsistemas do SecurityCore."""
        self.db_manager = db_manager
        if hasattr(self.audit, "set_db_manager"):
            self.audit.set_db_manager(db_manager)
        if hasattr(self.sessions, "set_db_manager"):
            self.sessions.set_db_manager(db_manager)
        if hasattr(self.approval_engine, "set_db_manager"):
            self.approval_engine.set_db_manager(db_manager)
        if hasattr(self.device_auth, "set_db_manager"):
            self.device_auth.set_db_manager(db_manager)


__all__ = [
    "CRITICAL_OPERATIONS",
    "READ_ONLY_ROLES",
    "ApprovalEngine",
    "AuditTrail",
    "CVEScannerService",
    "CyberShield",
    "DeviceAuthManager",
    "DeviceRegistration",
    "FindingSeverity",
    "FindingStatus",
    "KillSwitch",
    "PermissionDeniedError",
    "PermissionEngine",
    "PipelineGateResult",
    "QASecurityPipeline",
    "RedTeamSandboxService",
    "SecurityCore",
    "SecurityFinding",
    "SecurityPolicyGenerator",
    "SessionManager",
    "StackType",
    "UnauthorizedApprovalError",
    "UserRole",
    "UserSession",
    "cyber_shield",
    "contains_sensitive_data",
    "redact_data",
    "redact_string",
]
