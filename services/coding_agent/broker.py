"""Ponte entre o runtime assíncrono do agente e o motor de aprovação humana.

O :class:`ApprovalEngine` é síncrono (pensado para o fluxo do ``JarvisMaster``),
enquanto o agente de código precisa *pausar* o loop de ferramentas até que um
humano decida. Este broker cria o pedido no motor (para que ele apareça em
``/api/v1/approvals``) e mantém um ``asyncio.Event`` por pedido.

Regra de segurança inegociável: o broker **não** aprova nada sozinho. Ele apenas
espera e entrega a decisão tomada por um humano através da API.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any

from packages.contracts.approval import ApprovalRequest, ApprovalStatus
from services.security_core import ApprovalEngine

logger = logging.getLogger("jarvis.coding.approvals")


@dataclass
class ApprovalTicket:
    """Pedido de aprovação em espera, associado a um evento assíncrono."""

    request: ApprovalRequest
    event: asyncio.Event = field(default_factory=asyncio.Event)
    approved: bool | None = None
    decided_by: str | None = None
    reason: str | None = None
    timed_out: bool = False

    @property
    def request_id(self) -> str:
        return self.request.id

    @property
    def resolved(self) -> bool:
        return self.event.is_set()


class ApprovalBroker:
    """Cria, espera e resolve aprovações do agente de código."""

    def __init__(self, approval_engine: ApprovalEngine, audit_trail: Any | None = None):
        self.approval_engine = approval_engine
        self.audit_trail = audit_trail
        self._tickets: dict[str, ApprovalTicket] = {}

    # ------------------------------------------------------------------
    # Ciclo de vida
    # ------------------------------------------------------------------
    def create(
        self,
        *,
        task_id: str,
        agent_role: str,
        operation: str,
        impact_summary: str,
        affected_resources: list[str] | None = None,
        proposed_diff: str | None = None,
        reversible: bool = True,
        owner_user_id: str | None = None,
    ) -> ApprovalTicket:
        request = self.approval_engine.create_request(
            task_id=task_id,
            agent_role=agent_role,
            operation=operation,
            impact_summary=impact_summary,
            affected_resources=affected_resources or [],
            proposed_diff=proposed_diff,
            reversible=reversible,
            owner_user_id=owner_user_id,
        )
        ticket = ApprovalTicket(request=request)
        self._tickets[request.id] = ticket
        return ticket

    async def wait(self, ticket: ApprovalTicket, timeout_seconds: float = 900.0) -> ApprovalTicket:
        """Aguarda a decisão humana; expira e rejeita automaticamente no timeout."""
        try:
            await asyncio.wait_for(ticket.event.wait(), timeout=max(1.0, timeout_seconds))
            return ticket
        except TimeoutError:
            ticket.timed_out = True
            ticket.approved = False
            ticket.reason = "Tempo limite de aprovação expirado."
            try:
                if ticket.request.status == ApprovalStatus.PENDING:
                    self.approval_engine.reject_request(
                        request_id=ticket.request_id,
                        decided_by="system_timeout",
                        reason=ticket.reason,
                    )
            except Exception as exc:  # pragma: no cover - defensivo
                logger.warning("Falha ao expirar aprovação %s: %s", ticket.request_id, exc)
            ticket.event.set()
            return ticket

    def resolve(
        self,
        request_id: str,
        *,
        approved: bool,
        decided_by: str = "local_developer",
        reason: str | None = None,
    ) -> bool:
        """Sinaliza a decisão para o runtime que está bloqueado à espera.

        Não altera o estado no ``ApprovalEngine``; quem chama a API já o fez.
        Retorna ``True`` se havia um ticket em espera.
        """
        ticket = self._tickets.get(request_id)
        if ticket is None:
            return False
        if not ticket.event.is_set():
            ticket.approved = approved
            ticket.decided_by = decided_by
            ticket.reason = reason
            ticket.event.set()
        return True

    def has_ticket(self, request_id: str) -> bool:
        """Indica se a aprovação pertence a uma execução do Coding Agent."""
        return request_id in self._tickets

    def decide(
        self,
        request_id: str,
        *,
        approved: bool,
        decided_by: str,
        reason: str | None = None,
        owner_user_id: str | None = None,
    ) -> ApprovalRequest:
        """Decide via broker atualizando o motor e libertando o runtime.

        É tolerante a decisões já aplicadas (por exemplo, pelo endpoint legado
        ``/api/v1/approvals/{id}/decide``), evitando erros duplicados.
        """
        request = self.approval_engine.get_request(request_id, owner_user_id=owner_user_id)
        if request is None:
            raise ValueError(f"Pedido de aprovação '{request_id}' não encontrado.")

        if request.status == ApprovalStatus.PENDING:
            if approved:
                request = self.approval_engine.approve_request(
                    request_id=request_id,
                    decided_by=decided_by,
                    decision_reason=reason,
                    owner_user_id=owner_user_id,
                )
            else:
                request = self.approval_engine.reject_request(
                    request_id=request_id,
                    decided_by=decided_by,
                    reason=reason or "Rejeitado pelo utilizador.",
                    owner_user_id=owner_user_id,
                )

        self.resolve(
            request_id,
            approved=approved,
            decided_by=decided_by,
            reason=reason,
        )
        return request

    def cancel_ticket(self, request_id: str, reason: str = "Execução cancelada.") -> None:
        """Cancela um pedido pendente quando o cliente desconecta ou o loop morre."""
        ticket = self._tickets.get(request_id)
        if ticket is None:
            return
        if ticket.request.status == ApprovalStatus.PENDING:
            try:
                self.approval_engine.reject_request(
                    request_id=request_id,
                    decided_by="system_cancelled",
                    reason=reason,
                )
            except Exception:
                logger.debug("Falha ao rejeitar ticket cancelado %s.", request_id, exc_info=True)
        if not ticket.event.is_set():
            ticket.approved = False
            ticket.reason = reason
            ticket.event.set()

    # ------------------------------------------------------------------
    # Consulta
    # ------------------------------------------------------------------
    def list_pending(self, owner_user_id: str | None = None) -> list[dict[str, Any]]:
        pending: list[dict[str, Any]] = []
        for request in self.approval_engine.list_pending_requests(owner_user_id=owner_user_id):
            ticket = self._tickets.get(request.id)
            pending.append(
                {
                    "id": request.id,
                    "task_id": request.task_id,
                    "agent_role": request.agent_role,
                    "operation": request.operation,
                    "impact_summary": request.impact_summary,
                    "affected_resources": request.affected_resources,
                    "proposed_diff": request.proposed_diff,
                    "reversible": request.reversible,
                    "status": request.status.value
                    if hasattr(request.status, "value")
                    else str(request.status),
                    "requested_at": request.requested_at.isoformat()
                    if request.requested_at
                    else None,
                    "waiting_for_runtime": bool(ticket and not ticket.resolved),
                }
            )
        return pending

    def cleanup_finished(self) -> int:
        """Remove tickets já resolvidos, mantendo a memória do processo limitada."""
        finished = [rid for rid, t in self._tickets.items() if t.resolved]
        for rid in finished:
            self._tickets.pop(rid, None)
        return len(finished)
