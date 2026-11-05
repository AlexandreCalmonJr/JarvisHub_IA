from .redaction import redact_string, redact_data
from .audit_trail import AuditTrail
from .kill_switch import KillSwitch
from .approval_engine import ApprovalEngine, UnauthorizedApprovalError
from .permission_engine import PermissionEngine, PermissionDeniedError, CRITICAL_OPERATIONS, READ_ONLY_ROLES


class SecurityCore:
    """
    Fachada unificada do Núcleo de Segurança do JARVIS AI HUB.
    Ponto de entrada obrigatório para validação de permissões, auditoria, aprovações e kill switch.
    """

    def __init__(self):
        self.audit = AuditTrail()
        self.kill_switch = KillSwitch(audit_trail=self.audit)
        self.approval_engine = ApprovalEngine(audit_trail=self.audit)
        self.permission_engine = PermissionEngine(audit_trail=self.audit)


__all__ = [
    "SecurityCore",
    "AuditTrail",
    "KillSwitch",
    "ApprovalEngine",
    "PermissionEngine",
    "UnauthorizedApprovalError",
    "PermissionDeniedError",
    "CRITICAL_OPERATIONS",
    "READ_ONLY_ROLES",
    "redact_string",
    "redact_data",
]
