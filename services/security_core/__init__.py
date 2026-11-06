from .approval_engine import ApprovalEngine, UnauthorizedApprovalError
from .audit_trail import AuditTrail
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
from .qa_security_pipeline import QASecurityPipeline
from .redaction import redact_data, redact_string
from .session_manager import SessionManager, UserRole, UserSession


class SecurityCore:
    """
    Fachada unificada do Núcleo de Segurança do JARVIS AI HUB.
    Ponto de entrada obrigatório para validação de permissões, auditoria, aprovações e kill switch.
    """

    def __init__(self):
        self.audit = AuditTrail()
        self.sessions = SessionManager()
        self.kill_switch = KillSwitch(audit_trail=self.audit)
        self.approval_engine = ApprovalEngine(audit_trail=self.audit)
        self.permission_engine = PermissionEngine(audit_trail=self.audit)
        self.pipeline = QASecurityPipeline(audit_trail=self.audit)


__all__ = [
    "CRITICAL_OPERATIONS",
    "READ_ONLY_ROLES",
    "ApprovalEngine",
    "AuditTrail",
    "FindingSeverity",
    "FindingStatus",
    "KillSwitch",
    "PermissionDeniedError",
    "PermissionEngine",
    "PipelineGateResult",
    "QASecurityPipeline",
    "SecurityCore",
    "SecurityFinding",
    "SessionManager",
    "StackType",
    "UnauthorizedApprovalError",
    "UserRole",
    "UserSession",
    "redact_data",
    "redact_string",
]
