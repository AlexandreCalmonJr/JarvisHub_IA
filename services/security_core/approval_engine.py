import uuid
from typing import Dict, Optional, List
from datetime import datetime, timezone
from packages.contracts.approval import ApprovalRequest, ApprovalStatus
from packages.contracts.agent import AgentRole
from .audit_trail import AuditTrail
from packages.contracts.security import AuditEventSeverity


class UnauthorizedApprovalError(Exception):
    pass


class ApprovalEngine:
    """
    Motor central de aprovação humana.
    Garante que qualquer ação de alto impacto (escrita, execução, exclusão, Git)
    seja pausada e somente executada após autorização explícita de um utilizador humano.
    Agentes NUNCA podem autoaprovar solicitações.
    """

    def __init__(self, audit_trail: Optional[AuditTrail] = None):
        self._requests: Dict[str, ApprovalRequest] = {}
        self._audit_trail = audit_trail

    def create_request(
        self,
        task_id: str,
        agent_role: str,
        operation: str,
        impact_summary: str,
        affected_resources: List[str],
        proposed_diff: Optional[str] = None,
        reversible: bool = True,
    ) -> ApprovalRequest:
        req_id = f"appr-{uuid.uuid4().hex[:10]}"
        request = ApprovalRequest(
            id=req_id,
            task_id=task_id,
            agent_role=agent_role,
            operation=operation,
            impact_summary=impact_summary,
            affected_resources=affected_resources,
            proposed_diff=proposed_diff,
            reversible=reversible,
            status=ApprovalStatus.PENDING,
        )
        self._requests[req_id] = request

        if self._audit_trail:
            self._audit_trail.record_event(
                operation="APPROVAL_REQUEST_CREATED",
                status="PENDING",
                agent_role=agent_role,
                parameters={
                    "request_id": req_id,
                    "task_id": task_id,
                    "operation": operation,
                    "resources": affected_resources,
                },
                severity=AuditEventSeverity.INFO,
            )
        return request

    def get_request(self, request_id: str) -> Optional[ApprovalRequest]:
        return self._requests.get(request_id)

    def list_pending_requests(self) -> List[ApprovalRequest]:
        return [r for r in self._requests.values() if r.status == ApprovalStatus.PENDING]

    def approve_request(
        self,
        request_id: str,
        decided_by: str,
        decision_reason: Optional[str] = None,
    ) -> ApprovalRequest:
        request = self._requests.get(request_id)
        if not request:
            raise ValueError(f"Pedido de aprovação '{request_id}' não encontrado.")

        if request.status != ApprovalStatus.PENDING:
            raise ValueError(f"Pedido '{request_id}' já se encontra no estado '{request.status}'.")

        # Regra de Segurança Crítica: Agente NUNCA pode aprovar operações!
        known_agents = [r.value for r in AgentRole]
        if decided_by in known_agents or decided_by.lower().startswith("agent_") or not decided_by.strip():
            if self._audit_trail:
                self._audit_trail.record_event(
                    operation="SELF_APPROVAL_ATTEMPT_BLOCKED",
                    status="DENIED",
                    agent_role=decided_by,
                    parameters={"request_id": request_id},
                    severity=AuditEventSeverity.SECURITY_ALERT,
                    reason="Tentativa proibida de autoaprovação por perfil de agente.",
                )
            raise UnauthorizedApprovalError("Agentes de IA não possuem permissão para autoaprovar pedidos!")

        request.status = ApprovalStatus.APPROVED
        request.decided_at = datetime.now(timezone.utc)
        request.decided_by = decided_by
        request.decision_reason = decision_reason

        if self._audit_trail:
            self._audit_trail.record_event(
                operation="APPROVAL_REQUEST_APPROVED",
                status="APPROVED",
                user_id=decided_by,
                agent_role=request.agent_role,
                parameters={"request_id": request_id, "operation": request.operation},
                severity=AuditEventSeverity.INFO,
                reason=decision_reason,
            )
        return request

    def reject_request(
        self,
        request_id: str,
        decided_by: str,
        reason: str,
    ) -> ApprovalRequest:
        request = self._requests.get(request_id)
        if not request:
            raise ValueError(f"Pedido de aprovação '{request_id}' não encontrado.")

        request.status = ApprovalStatus.REJECTED
        request.decided_at = datetime.now(timezone.utc)
        request.decided_by = decided_by
        request.decision_reason = reason

        if self._audit_trail:
            self._audit_trail.record_event(
                operation="APPROVAL_REQUEST_REJECTED",
                status="REJECTED",
                user_id=decided_by,
                agent_role=request.agent_role,
                parameters={"request_id": request_id, "operation": request.operation},
                severity=AuditEventSeverity.INFO,
                reason=reason,
            )
        return request
