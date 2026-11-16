"""Router para Gestão de AI Teammates e Protocolo ACP (OpenBot Workspace)."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from apps.api.auth import Principal, get_principal
from apps.api.deps import teammate_manager

logger = logging.getLogger("jarvis.api.teammates")
router = APIRouter(tags=["teammates"])


class SpawnTeammateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=64)
    role: str = Field(min_length=2, max_length=64)
    project_id: str | None = Field(default=None, max_length=128)
    isolate_worktree: bool = Field(default=False, description="Criar Git Worktree isolado")


class DispatchTaskRequest(BaseModel):
    task: str = Field(min_length=3, max_length=4000)


@router.post("/api/v1/teammates/spawn")
async def spawn_teammate(
    payload: SpawnTeammateRequest,
    principal: Annotated[Principal, Depends(get_principal)],
):
    """Cria um novo AI Teammate persistente no workspace."""
    teammate = teammate_manager.spawn_teammate(
        name=payload.name,
        role=payload.role,
        project_id=payload.project_id,
        isolate_worktree=payload.isolate_worktree,
    )
    return teammate.to_dict()


@router.get("/api/v1/teammates")
async def list_teammates(
    principal: Annotated[Principal, Depends(get_principal)],
    project_id: str | None = None,
):
    """Lista todos os AI Teammates ativos no workspace."""
    items = teammate_manager.list_teammates(project_id=project_id)
    return [t.to_dict() for t in items]


@router.get("/api/v1/teammates/{teammate_id}")
async def get_teammate(
    teammate_id: str,
    principal: Annotated[Principal, Depends(get_principal)],
):
    """Obtém detalhes e histórico de logs de um teammate específico."""
    teammate = teammate_manager.get_teammate(teammate_id)
    if not teammate:
        raise HTTPException(status_code=404, detail="Teammate não encontrado.")
    return teammate.to_dict()


@router.post("/api/v1/teammates/{teammate_id}/dispatch")
async def dispatch_task(
    teammate_id: str,
    payload: DispatchTaskRequest,
    principal: Annotated[Principal, Depends(get_principal)],
):
    """Atribui uma tarefa assíncrona ao teammate especificado."""
    try:
        result = teammate_manager.dispatch_task(teammate_id, payload.task)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/api/v1/teammates/{teammate_id}")
async def terminate_teammate(
    teammate_id: str,
    principal: Annotated[Principal, Depends(get_principal)],
):
    """Encerra um AI Teammate do workspace."""
    success = teammate_manager.terminate_teammate(teammate_id)
    if not success:
        raise HTTPException(status_code=404, detail="Teammate não encontrado.")
    return {"success": True, "message": f"Teammate '{teammate_id}' encerrado com sucesso."}
