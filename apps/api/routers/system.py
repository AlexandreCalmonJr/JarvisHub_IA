import asyncio
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from apps.api.auth import Principal, get_principal, require_permission
from apps.api.schemas import (
    UserProfilePayload,
    WebhookConfigPayload,
)
from apps.api.deps import (
    model_manager,
    security_core,
    resource_manager,
    log_buffer,
    db_manager,
    webhook_service,
    hybrid_config,
    save_hybrid_config_to_disk,
    HYBRID_CONFIG_PATH,
)

logger = logging.getLogger("jarvis.api.system")
router = APIRouter(tags=["system"])


@router.get("/api")
async def root():
    return {
        "name": "JARVIS AI HUB 3.0",
        "version": "3.0.0",
        "mode": "local-first",
        "status": "operational",
    }


@router.get("/api/v1/system/health")
async def health_check(request: Request):
    """Disponibilidade básica para anônimos; estado detalhado com componentes quando autenticado."""
    ollama_ok = await model_manager.check_health()
    status_str = "healthy" if ollama_ok else "degraded"
    principal = getattr(request.state, "principal", None)
    if principal is not None:
        return {
            "status": status_str,
            "components": {
                "security_core": "operational",
                "approval_engine": "operational",
                "model_runtime": "operational" if ollama_ok else "offline",
                "inference_queue": {
                    "active": model_manager.queue.active_count,
                    "waiting": model_manager.queue.waiting_count,
                },
                "kill_switch": {"global_killed": security_core.kill_switch.is_global_killed()},
            },
        }
    return {"status": status_str}


@router.get("/api/v1/system/health/details")
async def health_details(
    principal: Principal = Depends(require_permission("system:read")),
):
    """Estado detalhado dos componentes, apenas para utilizadores autenticados."""
    ollama_ok = await model_manager.check_health()
    return {
        "status": "healthy" if ollama_ok else "degraded",
        "components": {
            "security_core": "operational",
            "approval_engine": "operational",
            "model_runtime": "operational" if ollama_ok else "offline",
            "inference_queue": {
                "active": model_manager.queue.active_count,
                "waiting": model_manager.queue.waiting_count,
            },
            "kill_switch": {"global_killed": security_core.kill_switch.is_global_killed()},
        },
    }


@router.get("/api/v1/system/resources")
async def system_resources():
    return resource_manager.collect_metrics(
        queue_active=model_manager.queue.active_count,
        queue_waiting=model_manager.queue.waiting_count,
    )


@router.get("/api/v1/system/server-logs")
async def get_server_logs_endpoint(limit: int = 200, level: str | None = None, search: str | None = None):
    """Retorna os logs mais recentes do servidor em formato estruturado."""
    return {
        "total": len(log_buffer.buffer),
        "logs": log_buffer.get_logs(limit=limit, level=level, search=search),
    }


@router.get("/api/v1/system/server-logs/stream")
async def stream_server_logs_endpoint():
    """Streaming SSE em tempo real dos logs do servidor para o console do frontend."""
    queue = await log_buffer.subscribe()

    async def event_generator():
        try:
            while True:
                entry = await queue.get()
                yield f"data: {json.dumps(entry)}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            log_buffer.unsubscribe(queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/api/v1/system/server-logs/clear")
async def clear_server_logs_endpoint():
    """Limpa o buffer de logs em memória."""
    log_buffer.clear()
    return {"status": "cleared"}


@router.get("/api/v1/user/profile")
async def get_user_profile_endpoint(
    principal: Principal = Depends(get_principal),
):
    """Retorna apenas o perfil privado da conta autenticada."""
    return db_manager.get_user_profile(owner_user_id=principal.subject_id)


@router.post("/api/v1/user/profile")
async def save_user_profile_endpoint(
    payload: UserProfilePayload, principal: Principal = Depends(get_principal)
):
    """Salva configurações e diretrizes no espaço privado da conta."""
    profile_dict = payload.model_dump()
    db_manager.set_user_profile(profile_dict, owner_user_id=principal.subject_id)
    return {"status": "saved", "profile": profile_dict}


@router.post("/api/v1/system/backup")
async def create_system_backup_endpoint():
    """Cria uma cópia física segura de backup do banco SQLite."""
    try:
        backup_path = db_manager.create_database_backup()
        return {"status": "created", "backup_path": backup_path}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha ao gerar backup: {exc}")


@router.get("/api/v1/system/webhooks")
async def get_webhooks_config_endpoint():
    """Retorna configurações ativas de notificações via webhook (com credenciais ofuscadas)."""
    return webhook_service.get_safe_config()


@router.post("/api/v1/system/webhooks")
async def save_webhooks_config_endpoint(payload: WebhookConfigPayload):
    """Salva preferências e URLs/tokens de Webhook do Discord e Telegram."""
    return webhook_service.save_config(payload.model_dump())


@router.post("/api/v1/system/webhooks/test")
async def test_webhook_endpoint():
    """Dispara mensagem de teste para os webhooks configurados."""
    return await webhook_service.test_webhook()
