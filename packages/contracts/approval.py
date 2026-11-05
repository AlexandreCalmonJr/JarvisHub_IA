from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    REVOKED = "revoked"
    EXPIRED = "expired"


class ApprovalRequest(BaseModel):
    """
    Contrato estrito para pedidos de aprovação humana.
    Um agente nunca pode autoaprovar operações sensíveis.
    """
    id: str = Field(..., description="Identificador único do pedido de aprovação")
    task_id: str = Field(..., description="ID da tarefa associada")
    agent_role: str = Field(..., description="Agente que solicitou a operação")
    operation: str = Field(..., description="Identificador da operação sensível (ex: git_commit, write_file, run_command)")
    impact_summary: str = Field(..., description="Descrição compreensível do impacto e alterações pretendidas")
    affected_resources: List[str] = Field(default_factory=list, description="Arquivos, diretórios, comandos ou tabelas afetados")
    proposed_diff: Optional[str] = Field(None, description="Diff unificado em caso de escrita ou alteração de código")
    reversible: bool = Field(True, description="Indica se a operação possui rollback automático ou facilitado")
    status: ApprovalStatus = Field(default=ApprovalStatus.PENDING)
    requested_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    decided_at: Optional[datetime] = None
    decided_by: Optional[str] = None
    decision_reason: Optional[str] = None
