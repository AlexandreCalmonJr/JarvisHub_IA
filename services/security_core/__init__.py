from .approval_engine import ApprovalEngine, UnauthorizedApprovalError
from .audit_trail import AuditTrail
from .kill_switch import KillSwitch
from .permission_engine import (
    CRITICAL_OPERATIONS,
    READ_ONLY_ROLES,
    PermissionDeniedError,
    PermissionEngine,
)
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


__all__ = [
    "CRITICAL_OPERATIONS",
    "READ_ONLY_ROLES",
    "ApprovalEngine",
    "AuditTrail",
    "KillSwitch",
    "PermissionDeniedError",
    "PermissionEngine",
    "SecurityCore",
    "SessionManager",
    "UnauthorizedApprovalError",
    "UserRole",
    "UserSession",
    "redact_data",
    "redact_string",
]
