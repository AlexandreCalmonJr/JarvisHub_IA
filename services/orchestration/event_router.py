import uuid

from packages.contracts.agent import AgentRole, InterAgentMessage
from packages.contracts.security import AuditEventSeverity
from services.security_core import AuditTrail

EVENT_TO_AGENTS_MAP: dict[str, list[AgentRole]] = {
    "CODE_CHANGED": [AgentRole.QA_ENGINEER, AgentRole.CODE_REVIEWER],
    "DEPENDENCY_ADDED": [
        AgentRole.SOFTWARE_SUPPLY_CHAIN_SECURITY,
        AgentRole.CYBERSECURITY_ENGINEER,
    ],
    "API_ENDPOINT_CREATED": [AgentRole.API_SECURITY_SPECIALIST, AgentRole.BACKEND_DEVELOPER],
    "DATA_SCHEMA_CHANGED": [
        AgentRole.DATA_ENGINEERING_INTELLIGENCE,
        AgentRole.DATA_ENGINEER_PIPELINES,
    ],
    "PRIVACY_SENSITIVE_DATA_FOUND": [AgentRole.PRIVACY_DATA_PROTECTION],
    "INFRA_CONFIG_UPDATED": [AgentRole.DEVOPS_ENGINEER, AgentRole.NETWORK_INFRASTRUCTURE_ENGINEER],
}


class CycleLimitExceededError(Exception):
    pass


class EventRouter:
    """
    Roteador de eventos e barramento de comunicação estruturada interagentes.
    Aciona especialistas por evento e impõe limites rígidos contra ciclos infinitos.
    """

    def __init__(
        self,
        audit_trail: AuditTrail | None = None,
        max_cycles: int = 3,
        max_messages_per_task: int = 10,
    ):
        self.audit_trail = audit_trail
        self.max_cycles = max_cycles
        self.max_messages_per_task = max_messages_per_task
        # task_id -> list[InterAgentMessage]
        self._message_history: dict[str, list[InterAgentMessage]] = {}

    def get_recipients_for_event(self, event_type: str) -> list[AgentRole]:
        return EVENT_TO_AGENTS_MAP.get(event_type, [])

    def dispatch_event(
        self,
        event_type: str,
        task_id: str,
        sender: AgentRole,
        context_summary: str,
        cycle: int = 1,
    ) -> list[InterAgentMessage]:
        if cycle > self.max_cycles:
            if self.audit_trail:
                self.audit_trail.record_event(
                    operation="INTER_AGENT_CYCLE_LIMIT_HIT",
                    status="BLOCKED",
                    agent_role=sender.value,
                    parameters={"task_id": task_id, "cycle": cycle},
                    severity=AuditEventSeverity.WARNING,
                    reason="Limite máximo de ciclos interagentes atingido. Interrompendo para evitar loop infinito.",
                )
            raise CycleLimitExceededError(
                f"Limite máximo de ciclos interagentes excedido ({self.max_cycles})."
            )

        history = self._message_history.setdefault(task_id, [])
        if len(history) >= self.max_messages_per_task:
            raise CycleLimitExceededError(
                f"Limite máximo de mensagens para a tarefa '{task_id}' excedido."
            )

        recipients = self.get_recipients_for_event(event_type)
        dispatched: list[InterAgentMessage] = []

        for recipient in recipients:
            msg = InterAgentMessage(
                id=f"msg-{uuid.uuid4().hex[:8]}",
                task_id=task_id,
                sender=sender,
                recipient=recipient,
                event_type=event_type,
                context_summary=context_summary,
                expected_output=f"Parecer técnico do especialista {recipient.value} para {event_type}",
                cycle=cycle,
            )
            history.append(msg)
            dispatched.append(msg)

            if self.audit_trail:
                self.audit_trail.record_event(
                    operation="INTER_AGENT_MESSAGE_DISPATCHED",
                    status="SENT",
                    agent_role=sender.value,
                    parameters={
                        "msg_id": msg.id,
                        "recipient": recipient.value,
                        "event_type": event_type,
                        "cycle": cycle,
                    },
                    severity=AuditEventSeverity.INFO,
                )

        return dispatched

    def get_task_messages(self, task_id: str) -> list[InterAgentMessage]:
        return self._message_history.get(task_id, [])
