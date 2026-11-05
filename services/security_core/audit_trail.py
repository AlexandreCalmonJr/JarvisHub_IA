import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from packages.contracts.security import AuditEvent, AuditEventSeverity
from .redaction import redact_data


class AuditTrail:
    """
    Registo auditável e protegido de todos os eventos do sistema.
    Aplica redação automática a parâmetros e previne ocultação de incidentes.
    """

    def __init__(self):
        self._events: List[AuditEvent] = []

    def record_event(
        self,
        operation: str,
        status: str,
        agent_role: Optional[str] = None,
        project_id: Optional[str] = None,
        tool_name: Optional[str] = None,
        user_id: Optional[str] = "system",
        parameters: Optional[Dict[str, Any]] = None,
        severity: AuditEventSeverity = AuditEventSeverity.INFO,
        reason: Optional[str] = None,
    ) -> AuditEvent:
        event_id = f"aud-{uuid.uuid4().hex[:12]}"
        redacted_params = redact_data(parameters or {})
        
        event = AuditEvent(
            id=event_id,
            timestamp=datetime.now(timezone.utc),
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

    def list_events(
        self,
        project_id: Optional[str] = None,
        agent_role: Optional[str] = None,
        severity: Optional[AuditEventSeverity] = None,
        limit: int = 100,
    ) -> List[AuditEvent]:
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
