from datetime import UTC, datetime
from enum import Enum

from pydantic import BaseModel, Field


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    REVOKED = "revoked"
    EXPIRED = "expired"
    CONSUMED = "consumed"


class ApprovalRequest(BaseModel):
    """
    Contrato estrito para pedidos de aprovação humana.
    Um agente nunca pode autoaprovar operações sensíveis.
    """

    id: str = Field(..., description="Identificador único do pedido de aprovação")
    task_id: str = Field(..., description="ID da tarefa associada")
    agent_role: str = Field(..., description="Agente que solicitou a operação")
    operation: str = Field(
        ...,
        description="Identificador da operação sensível (ex: git_commit, write_file, run_command)",
    )
    impact_summary: str = Field(
        ..., description="Descrição compreensível do impacto e alterações pretendidas"
    )
    affected_resources: list[str] = Field(
        default_factory=list, description="Arquivos, diretórios, comandos ou tabelas afetados"
    )
    proposed_diff: str | None = Field(
        None, description="Diff unificado em caso de escrita ou alteração de código"
    )
    reversible: bool = Field(
        True, description="Indica se a operação possui rollback automático ou facilitado"
    )
    status: ApprovalStatus = Field(default=ApprovalStatus.PENDING)
    requested_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    decided_at: datetime | None = None
    decided_by: str | None = None
    decision_reason: str | None = None
