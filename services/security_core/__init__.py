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
from .redaction import redact_data, redact_string
from .session_manager import SessionManager, UserRole, UserSession


class SecurityCore:
    """
    Fachada unificada do Núcleo de Segurança do JARVIS AI HUB.
    Ponto de entrada obrigatório para validação de permissões, auditoria, aprovações e kill switch.
    """

    def __init__(self, workspace_service=None):
        self.audit = AuditTrail()
        self.sessions = SessionManager()
        self.kill_switch = KillSwitch(audit_trail=self.audit)
        self.approval_engine = ApprovalEngine(audit_trail=self.audit)
        self.permission_engine = PermissionEngine(audit_trail=self.audit)
        self.pipeline = QASecurityPipeline(audit_trail=self.audit)
        self.device_auth = DeviceAuthManager(audit_trail=self.audit)
        self.cyber_shield = cyber_shield
        self.cve_scanner = CVEScannerService()
        self.red_team = RedTeamSandboxService(workspace_service=workspace_service)
        self.policy_generator = SecurityPolicyGenerator(workspace_service=workspace_service)


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
    "redact_data",
    "redact_string",
]
