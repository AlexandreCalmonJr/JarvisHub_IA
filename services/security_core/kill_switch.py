from typing import Set, Optional
from .audit_trail import AuditTrail
from packages.contracts.security import AuditEventSeverity


class KillSwitch:
    """
    Kill Switch central do JARVIS AI HUB.
    Capaz de cancelar tarefas instantaneamente, bloquear ferramentas comprometidas
    ou suspender totalmente as operações do sistema.
    """

    def __init__(self, audit_trail: Optional[AuditTrail] = None):
        self._global_kill: bool = False
        self._cancelled_tasks: Set[str] = set()
        self._blocked_tools: Set[str] = set()
        self._audit_trail = audit_trail

    def trigger_global_kill(self, reason: str = "Intervenção manual de emergência") -> None:
        self._global_kill = True
        if self._audit_trail:
            self._audit_trail.record_event(
                operation="KILL_SWITCH_TRIGGER_GLOBAL",
                status="TRIGGERED",
                severity=AuditEventSeverity.CRITICAL,
                reason=reason,
            )

    def reset_global_kill(self, authorized_by: str) -> None:
        self._global_kill = False
        if self._audit_trail:
            self._audit_trail.record_event(
                operation="KILL_SWITCH_RESET_GLOBAL",
                status="RESET",
                user_id=authorized_by,
                severity=AuditEventSeverity.WARNING,
                reason="Reativação manual pelo administrador",
            )

    def is_global_killed(self) -> bool:
        return self._global_kill

    def cancel_task(self, task_id: str, reason: str = "Cancelamento pelo utilizador") -> None:
        self._cancelled_tasks.add(task_id)
        if self._audit_trail:
            self._audit_trail.record_event(
                operation="TASK_CANCELLED",
                status="CANCELLED",
                severity=AuditEventSeverity.WARNING,
                parameters={"task_id": task_id},
                reason=reason,
            )

    def is_task_cancelled(self, task_id: str) -> bool:
        return self._global_kill or (task_id in self._cancelled_tasks)

    def block_tool(self, tool_name: str, reason: str = "Bloqueio de segurança") -> None:
        self._blocked_tools.add(tool_name)
        if self._audit_trail:
            self._audit_trail.record_event(
                operation="TOOL_BLOCKED",
                tool_name=tool_name,
                status="BLOCKED",
                severity=AuditEventSeverity.SECURITY_ALERT,
                reason=reason,
            )

    def unblock_tool(self, tool_name: str) -> None:
        self._blocked_tools.discard(tool_name)

    def is_tool_blocked(self, tool_name: str) -> bool:
        return self._global_kill or (tool_name in self._blocked_tools)
