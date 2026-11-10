import uuid
from datetime import UTC, datetime
from typing import Any

from packages.contracts.security import AuditEvent, AuditEventSeverity

from .redaction import redact_data


class AuditTrail:
    """
    Registo auditável e protegido de todos os eventos do sistema.
    Aplica redação automática a parâmetros e previne ocultação de incidentes.
    """

    def __init__(self):
        self._events: list[AuditEvent] = []

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
