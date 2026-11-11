"""API do Coding Agent (runtime de ferramentas estilo Claude Code / OpenCode)."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from apps.api.auth import Principal, get_principal
from apps.api.deps import coding_broker, coding_runtime, coding_tools, security_core
from apps.api.schemas import CodingApprovalDecision, CodingRunRequest
from services.coding_agent import AgentMode, AgentRunConfig
from services.security_core import UnauthorizedApprovalError

logger = logging.getLogger("jarvis.api.coding")
router = APIRouter(tags=["coding"])

# Evita duas execuções simultâneas na mesma sessão (histórico consistente).
_session_locks: dict[str, asyncio.Lock] = {}

MODE_LABELS = {
    AgentMode.PLAN: {
        "label": "Planejar",
        "description": "Somente leitura: analisa e propõe mudanças sem escrever nem executar.",
    },
    AgentMode.ASK: {
        "label": "Assistido",
        "description": "Pede aprovação humana antes de cada escrita ou comando.",
    },
    AgentMode.AUTO: {
        "label": "Automático",
        "description": "Executa tarefas de leitura sem pausas; toda escrita ou comando exige aprovação humana.",
    },
}



def _private_owner(principal: Principal) -> str:
    if principal.kind != "human":
        raise HTTPException(
            status_code=403,
            detail="Dispositivos precisam ser associados a uma conta antes de acessar dados privados.",
        )
    return principal.subject_id

def _provider_info() -> dict[str, Any]:
    try:
        provider = coding_runtime.provider_factory()
        return {
            "name": provider.name,
            "model": provider.resolve_model(None),
            "local_first": provider.name == "ollama",
        }
    except Exception as exc:  # pragma: no cover - defensivo
        return {"name": "indisponível", "model": "", "error": str(exc)}


@router.get("/api/v1/coding/tools")
async def list_coding_tools():
    """Lista ferramentas, modos e provedor ativo do Coding Agent."""
    return {
        "modes": [
            {"id": mode.value, **MODE_LABELS[mode]}
            for mode in (AgentMode.PLAN, AgentMode.ASK, AgentMode.AUTO)
        ],
        "tools": [
            {
                "name": spec.name,
                "description": spec.description,
                "risk": spec.risk.value,
                "requires_approval": spec.requires_approval,
                "parameters": spec.parameters,
            }
            for spec in coding_tools.list_specs()
        ],
        "provider": _provider_info(),
    }


@router.get("/api/v1/coding/sessions/{session_id}/messages")
async def list_coding_messages(
    session_id: str, limit: int = 200,
    principal: Principal = Depends(get_principal),
):
    """Histórico fiel da sessão (mensagens, chamadas e resultados de ferramentas)."""
    from apps.api.deps import db_manager

    return {
        "session_id": session_id,
        "messages": db_manager.list_chat_messages(
            session_id, limit=limit, owner_user_id=_private_owner(principal)
        ),
    }


@router.delete("/api/v1/coding/sessions/{session_id}/messages")
async def clear_coding_messages(
    session_id: str, principal: Principal = Depends(get_principal)
):
    from apps.api.deps import db_manager

    deleted = db_manager.clear_session_messages(
        session_id, owner_user_id=_private_owner(principal)
    )
    return {"session_id": session_id, "deleted": deleted}


@router.post("/api/v1/coding/run/stream")
async def run_coding_agent_stream(
    payload: CodingRunRequest, principal: Principal = Depends(get_principal)
):
    """Executa o agente e transmite cada evento do loop por SSE."""
    try:
        mode = AgentMode(payload.mode.lower().strip())
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Modo inválido. Use 'plan', 'ask' ou 'auto'.",
        )

    owner_user_id = _private_owner(principal)
    session_id = payload.session_id or f"coding-{uuid.uuid4().hex[:10]}"
    lock_key = f"{owner_user_id}:{session_id}"
    lock = _session_locks.setdefault(lock_key, asyncio.Lock())
    if lock.locked():
        raise HTTPException(
            status_code=409,
            detail="Já existe uma execução em andamento nesta sessão. Aguarde a conclusão.",
        )

    config = AgentRunConfig(
        prompt=payload.prompt.strip(),
        project_id=payload.project_id,
        session_id=session_id,
        owner_user_id=owner_user_id,
        task_id=payload.task_id,
        mode=mode,
        model=payload.model,
        agent_role=payload.agent_role,
        max_iterations=payload.max_iterations,
        temperature=payload.temperature,
        max_tokens=payload.max_tokens,
        timeout_seconds=payload.timeout_seconds,
        approval_timeout_seconds=payload.approval_timeout_seconds,
        include_history=payload.include_history,
    )

    async def event_generator():
        await lock.acquire()
        try:
            async for event in coding_runtime.run(config):
                yield f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"
        except asyncio.CancelledError:
            logger.info("Cliente desconectou da execução do Coding Agent (%s).", session_id)
            raise
        except Exception as exc:  # pragma: no cover - defensivo
            logger.exception("Falha no Coding Agent: %s", exc)
            error = json.dumps(
                {"type": "error", "error": f"Falha interna do agente: {exc}"},
                ensure_ascii=False,
            )
            yield f"data: {error}\n\n"
        finally:
            if lock.locked():
                lock.release()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/api/v1/coding/approvals")
async def list_coding_approvals(
    principal: Principal = Depends(get_principal),
):
    """Lista aprovações pendentes somente da conta autenticada."""
    return coding_broker.list_pending(owner_user_id=_private_owner(principal))


@router.post("/api/v1/coding/approvals/{approval_id}/decide")
async def decide_coding_approval(
    approval_id: str,
    payload: CodingApprovalDecision,
    principal: Principal = Depends(get_principal),
):
    """Aprova ou rejeita uma operação e liberta imediatamente o runtime."""
    owner_user_id = _private_owner(principal)
    action = payload.action.strip().lower()
    if action not in {"approve", "reject"}:
        raise HTTPException(status_code=400, detail="Ação inválida. Use 'approve' ou 'reject'.")

    # Rejeita imediatamente tentativa de aprovação por agentes de IA
    from packages.contracts.agent import AgentRole
    known_agents = {r.value for r in AgentRole}
    candidate = (payload.decided_by or "").lower().strip()
    if candidate and (candidate in known_agents or candidate.startswith("agent_") or candidate.startswith("agent")):
        raise HTTPException(
            status_code=403,
            detail="Agentes de IA não possuem permissão para aprovar operações.",
        )
    if principal.subject_id in known_agents or principal.subject_id.lower().startswith("agent"):
        raise HTTPException(
            status_code=403,
            detail="Agentes de IA não possuem permissão para aprovar operações.",
        )

    # Identidade validada pelo servidor, ignorando campos de payload forjados
    actor = principal.display_id

    try:
        decided = coding_broker.decide(
            approval_id,
            approved=action == "approve",
            decided_by=actor,
            reason=payload.reason,
            owner_user_id=owner_user_id,
        )
    except UnauthorizedApprovalError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    # Auditoria adicional específica do Coding Agent
    try:
        security_core.audit.log(
            operation="CODING_APPROVAL_DECIDED",
            user_id=actor,
            target_resource=approval_id,
            status="APPROVED" if action == "approve" else "REJECTED",
            parameters={"task_id": decided.task_id, "operation": decided.operation},
        )
    except Exception:
        pass

    return {
        "status": "approved" if action == "approve" else "rejected",
        "approval_id": approval_id,
        "task_id": decided.task_id,
        "operation": decided.operation,
        "reason": payload.reason,
    }
