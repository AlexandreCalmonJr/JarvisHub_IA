import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from packages.contracts.security import AuditEvent, AuditEventSeverity

from .redaction import redact_data

logger = logging.getLogger("jarvis.security.audit_trail")


class AuditTrail:
    """
    Registo auditável e protegido de todos os eventos do sistema.
    Aplica redação automática a parâmetros e previne ocultação de incidentes.
    Suporta persistência relacional SQLite via DatabaseManager.
    """

    def __init__(self, db_manager: Any | None = None):
        self._events: list[AuditEvent] = []
        self.db_manager = db_manager

    def set_db_manager(self, db_manager: Any) -> None:
        """Vincula o gerenciador de persistência SQLite e sincroniza eventos em memória."""
        self.db_manager = db_manager
        if self.db_manager:
            for ev in self._events:
                self._save_event_to_db(ev)

    def _save_event_to_db(self, event: AuditEvent) -> None:
        if not self.db_manager:
            return
        try:
            sev_val = (
                event.severity.value if hasattr(event.severity, "value") else str(event.severity)
            )
            self.db_manager.save_audit_event(
                id=event.id,
                timestamp=event.timestamp,
                severity=sev_val,
                operation=event.operation,
                status=event.status,
                user_id=event.user_id,
                agent_role=event.agent_role,
                project_id=event.project_id,
                tool_name=event.tool_name,
                parameters_redacted=event.parameters_redacted,
                reason=event.reason,
            )
        except Exception:
            logger.warning("Falha ao persistir evento de auditoria no banco.", exc_info=True)

    def record_event(
        self,
        operation: str,
        status: str,
        agent_role: str | None = None,
        project_id: str | None = None,
        tool_name: str | None = None,
        user_id: str | None = "system",
        parameters: dict[str, Any] | None = None,
        severity: AuditEventSeverity = AuditEventSeverity.INFO,
        reason: str | None = None,
    ) -> AuditEvent:
        event_id = f"aud-{uuid.uuid4().hex[:12]}"
        redacted_params = redact_data(parameters or {})

        event = AuditEvent(
            id=event_id,
            timestamp=datetime.now(UTC),
            severity=severity,
            user_id=user_id,
            agent_role=agent_role,
            project_id=project_id,
            operation=operation,
            tool_name=tool_name,
            parameters_redacted=redacted_params,
            status=status,
            reason=reason,
        )
        self._events.append(event)
        self._save_event_to_db(event)
        return event

    def log(
        self,
        operation: str,
        user_id: str | None = "system",
        target_resource: str | None = None,
        status: str = "INFO",
        parameters: dict[str, Any] | None = None,
        agent_role: str | None = None,
        project_id: str | None = None,
        tool_name: str | None = None,
        severity: AuditEventSeverity = AuditEventSeverity.INFO,
        reason: str | None = None,
        **kwargs: Any,
    ) -> AuditEvent:
        params = dict(parameters or {})
        if target_resource:
            params["target_resource"] = target_resource
        return self.record_event(
            operation=operation,
            status=status,
            user_id=user_id,
            agent_role=agent_role,
            project_id=project_id,
            tool_name=tool_name,
            parameters=params,
            severity=severity,
            reason=reason,
        )

    def list_events(
        self,
        project_id: str | None = None,
        agent_role: str | None = None,
        severity: AuditEventSeverity | None = None,
        limit: int = 100,
    ) -> list[AuditEvent]:
        filtered = self._events
        if project_id:
            filtered = [e for e in filtered if e.project_id == project_id]
        if agent_role:
            filtered = [e for e in filtered if e.agent_role == agent_role]
        if severity:
            filtered = [e for e in filtered if e.severity == severity]
        return filtered[-limit:]

    def clear(self):
        """Apenas para testes unitários."""
        self._events.clear()
