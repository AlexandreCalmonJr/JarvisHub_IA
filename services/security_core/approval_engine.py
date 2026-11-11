import threading
import uuid
from datetime import UTC, datetime
from typing import Any

from packages.contracts.agent import AgentRole
from packages.contracts.approval import ApprovalRequest, ApprovalStatus
from packages.contracts.security import AuditEventSeverity

from .audit_trail import AuditTrail


class UnauthorizedApprovalError(Exception):
    pass


class ApprovalEngine:
    """
    Motor central de aprovação humana.
    Garante que qualquer ação de alto impacto (escrita, execução, exclusão, Git)
    seja pausada e somente executada após autorização explícita de um utilizador humano.
    Agentes NUNCA podem autoaprovar solicitações.
    Suporta persistência via DatabaseManager (SQLite) com recuperação controlada de estado.
    """

    def __init__(self, audit_trail: AuditTrail | None = None, db_manager: Any | None = None):
        self._requests: dict[str, ApprovalRequest] = {}
        self._consume_lock = threading.RLock()
        self._audit_trail = audit_trail
        self._db_manager = db_manager
        if self._db_manager:
            self._load_from_db()

    def set_db_manager(self, db_manager: Any) -> None:
        """Vincula o gerenciador de persistência SQLite e sincroniza o estado."""
        self._db_manager = db_manager
        self._load_from_db()
        for req in self._requests.values():
            self._save_to_db(req)

    def _load_from_db(self) -> None:
        if not self._db_manager:
            return
        try:
            rows = self._db_manager.list_approvals()
            for row in rows:
                req_id = row["id"]
                req_at = (
                    datetime.fromisoformat(row["requested_at"])
                    if isinstance(row.get("requested_at"), str)
                    else (row.get("requested_at") or datetime.now(UTC))
                )
                dec_at = (
                    datetime.fromisoformat(row["decided_at"])
                    if isinstance(row.get("decided_at"), str)
                    else row.get("decided_at")
                )
                raw_status = row.get("status", "pending")
                try:
                    status = ApprovalStatus(raw_status)
                except Exception:
                    status = ApprovalStatus.PENDING

                req = ApprovalRequest(
                    id=req_id,
                    task_id=row.get("task_id", ""),
                    agent_role=row.get("agent_role", "unknown"),
                    operation=row.get("operation", "unknown"),
                    impact_summary=row.get("impact_summary", ""),
                    affected_resources=list(row.get("affected_resources") or []),
                    proposed_diff=row.get("proposed_diff"),
                    reversible=bool(row.get("reversible", True)),
                    status=status,
                    requested_at=req_at,
                    decided_at=dec_at,
                    decided_by=row.get("decided_by"),
                    decision_reason=row.get("decision_reason"),
                )
                self._requests[req_id] = req
        except Exception:
            pass

    def _save_to_db(self, request: ApprovalRequest) -> None:
        if not self._db_manager:
            return
        try:
            status_val = (
                request.status.value
                if hasattr(request.status, "value")
                else str(request.status)
            )
            self._db_manager.save_approval(
                id=request.id,
                task_id=request.task_id,
                agent_role=request.agent_role,
                operation=request.operation,
                impact_summary=request.impact_summary,
                affected_resources=request.affected_resources,
                proposed_diff=request.proposed_diff,
                reversible=request.reversible,
                status=status_val,
                requested_at=request.requested_at,
                decided_at=request.decided_at,
                decided_by=request.decided_by,
                decision_reason=request.decision_reason,
            )
        except Exception:
            pass

    def create_request(
        self,
        task_id: str,
        agent_role: str,
        operation: str,
        impact_summary: str,
        affected_resources: list[str],
        proposed_diff: str | None = None,
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
        self._save_to_db(request)

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

    def get_request(self, request_id: str) -> ApprovalRequest | None:
        req = self._requests.get(request_id)
        if not req and self._db_manager:
            try:
                row = self._db_manager.get_approval(request_id)
                if row:
                    req_at = (
                        datetime.fromisoformat(row["requested_at"])
                        if isinstance(row.get("requested_at"), str)
                        else (row.get("requested_at") or datetime.now(UTC))
                    )
                    dec_at = (
                        datetime.fromisoformat(row["decided_at"])
                        if isinstance(row.get("decided_at"), str)
                        else row.get("decided_at")
                    )
                    raw_status = row.get("status", "pending")
                    try:
                        status = ApprovalStatus(raw_status)
                    except Exception:
                        status = ApprovalStatus.PENDING

                    req = ApprovalRequest(
                        id=row["id"],
                        task_id=row.get("task_id", ""),
                        agent_role=row.get("agent_role", "unknown"),
                        operation=row.get("operation", "unknown"),
                        impact_summary=row.get("impact_summary", ""),
                        affected_resources=list(row.get("affected_resources") or []),
                        proposed_diff=row.get("proposed_diff"),
                        reversible=bool(row.get("reversible", True)),
                        status=status,
                        requested_at=req_at,
                        decided_at=dec_at,
                        decided_by=row.get("decided_by"),
                        decision_reason=row.get("decision_reason"),
                    )
                    self._requests[req.id] = req
            except Exception:
                pass
        return req

    def consume_approved_request(
        self,
        request_id: str,
        *,
        operation: str,
        task_id: str,
        resource: str,
    ) -> ApprovalRequest:
        """Valida o escopo e consome uma aprovação exatamente uma vez.

        A atualização condicional no SQLite é a autoridade entre processos;
        o lock local também evita corridas dentro da mesma instância.
        """
        with self._consume_lock:
            request = self.get_request(request_id)
            if (
                not request
                or request.status != ApprovalStatus.APPROVED
                or request.operation != operation
                or request.task_id != task_id
                or resource not in request.affected_resources
            ):
                raise ValueError(
                    "Aprovação ausente, já utilizada ou não correspondente à operação e ao recurso."
                )

            if self._db_manager and not self._db_manager.consume_approved_approval(request_id):
                raise ValueError("A aprovação já foi utilizada ou deixou de estar válida.")

            request.status = ApprovalStatus.CONSUMED
            if self._audit_trail:
                self._audit_trail.record_event(
                    operation="APPROVAL_REQUEST_CONSUMED",
                    status="CONSUMED",
                    user_id=request.decided_by,
                    agent_role=request.agent_role,
                    parameters={
                        "request_id": request_id,
                        "operation": operation,
                        "task_id": task_id,
                        "resource": resource,
                    },
                    severity=AuditEventSeverity.WARNING,
                    reason="Aprovação de uso único consumida pela execução autorizada.",
                )
            return request

    def list_pending_requests(self) -> list[ApprovalRequest]:
        return [r for r in self._requests.values() if r.status == ApprovalStatus.PENDING]

    def approve_request(
        self,
        request_id: str,
        decided_by: str,
        decision_reason: str | None = None,
    ) -> ApprovalRequest:
        request = self.get_request(request_id)
        if not request:
            raise ValueError(f"Pedido de aprovação '{request_id}' não encontrado.")

        if request.status != ApprovalStatus.PENDING:
            raise ValueError(f"Pedido '{request_id}' já se encontra no estado '{request.status}'.")

        # Regra de Segurança Crítica: Agente NUNCA pode aprovar operações!
        known_agents = [r.value for r in AgentRole]
        if (
            decided_by in known_agents
            or decided_by.lower().startswith("agent_")
            or not decided_by.strip()
        ):
            if self._audit_trail:
                self._audit_trail.record_event(
                    operation="SELF_APPROVAL_ATTEMPT_BLOCKED",
                    status="DENIED",
                    agent_role=decided_by,
                    parameters={"request_id": request_id},
                    severity=AuditEventSeverity.SECURITY_ALERT,
                    reason="Tentativa proibida de autoaprovação por perfil de agente.",
                )
            raise UnauthorizedApprovalError(
                "Agentes de IA não possuem permissão para autoaprovar pedidos!"
            )

        request.status = ApprovalStatus.APPROVED
        request.decided_at = datetime.now(UTC)
        request.decided_by = decided_by
        request.decision_reason = decision_reason
        self._save_to_db(request)

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
        request = self.get_request(request_id)
        if not request:
            raise ValueError(f"Pedido de aprovação '{request_id}' não encontrado.")

        request.status = ApprovalStatus.REJECTED
        request.decided_at = datetime.now(UTC)
        request.decided_by = decided_by
        request.decision_reason = reason
        self._save_to_db(request)

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
