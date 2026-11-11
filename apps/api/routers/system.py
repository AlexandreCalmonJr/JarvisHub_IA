import asyncio
import json
import logging
from datetime import UTC, datetime
import os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from apps.api.auth import Principal, get_principal, require_permission, require_admin
from apps.api.schemas import (
    UserProfilePayload,
    WebhookConfigPayload,
    InferenceQualityFeedbackPayload,
)
from apps.api.deps import (
    model_manager,
    security_core,
    resource_manager,
    log_buffer,
    db_manager,
    webhook_service,
    telemetry_store,
    hybrid_config,
    data_dir,
    key_vault,
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




@router.get("/api/v1/system/inference-telemetry")
async def get_inference_telemetry(
    limit: int = 50,
    task_id: str | None = None,
    principal: Principal = Depends(require_permission("system:read")),
):
    """Retorna métricas de inferência exclusivamente da conta autenticada."""
    return {
        "summary": telemetry_store.summary_for_owner(principal.subject_id),
        "records": telemetry_store.list_for_owner(
            principal.subject_id, limit=limit, task_id=task_id
        ),
        "model_performance": telemetry_store.performance_by_model_for_owner(
            principal.subject_id
        ),
        "model_quality": telemetry_store.quality_by_model_for_owner(
            principal.subject_id
        ),
        "model_selections": telemetry_store.list_model_selections_for_owner(
            principal.subject_id
        ),
    }




@router.post("/api/v1/system/inference-feedback")
async def submit_inference_feedback(
    payload: InferenceQualityFeedbackPayload,
    principal: Principal = Depends(require_permission("system:feedback")),
):
    """Registra nota humana apenas para inferência bem-sucedida da conta autenticada."""
    saved = telemetry_store.record_quality_feedback(
        owner_user_id=principal.subject_id,
        inference_id=payload.inference_id,
        rating=payload.rating,
    )
    if not saved:
        raise HTTPException(
            status_code=404,
            detail="Inferência não encontrada nesta conta ou ainda não concluída com sucesso.",
        )
    return {"status": "recorded", "inference_id": payload.inference_id, "rating": payload.rating}

_ONBOARDING_STATE_PATH = data_dir / "onboarding_state.json"


def _read_onboarding_state() -> dict:
    try:
        state = json.loads(_ONBOARDING_STATE_PATH.read_text(encoding="utf-8"))
        return state if isinstance(state, dict) else {}
    except (OSError, ValueError, TypeError):
        return {}


@router.get("/api/v1/system/onboarding")
async def get_onboarding_status(principal: Principal = Depends(require_admin)):
    """Estado de configuração sem expor credenciais ou segredos."""
    try:
        ollama_available = bool(await model_manager.check_health())
    except Exception:
        ollama_available = False
    try:
        configured_keys = sum(1 for item in key_vault.list_keys() if item.get("is_active") and item.get("has_api_key"))
        vault_encryption_ready = os.name == "nt" or key_vault._fernet_key_path.exists()
    except Exception:
        configured_keys = 0
        vault_encryption_ready = False
    return {
        "completed": bool(_read_onboarding_state().get("completed")),
        "database_available": Path(db_manager.db_path).exists() if getattr(db_manager, "db_path", None) else True,
        "local_model_available": ollama_available,
        "active_provider_keys": configured_keys,
        "vault_encryption_ready": vault_encryption_ready,
        "hybrid_provider_enabled": bool(hybrid_config.enabled and hybrid_config.key_id and configured_keys),
        "environment": os.environ.get("JARVIS_ENVIRONMENT", os.environ.get("JARVIS_ENV", "development")),
    }


@router.post("/api/v1/system/onboarding/complete")
async def complete_onboarding(principal: Principal = Depends(require_admin)):
    """Regista a conclusão do assistente de instalação sem guardar dados secretos."""
    state = {
        "completed": True,
        "completed_by": principal.subject_id,
        "completed_at": datetime.now(UTC).isoformat(),
    }
    temporary = _ONBOARDING_STATE_PATH.with_suffix(".tmp")
    try:
        temporary.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
        if os.name != "nt":
            os.chmod(temporary, 0o600)
        os.replace(temporary, _ONBOARDING_STATE_PATH)
    except OSError as exc:
        temporary.unlink(missing_ok=True)
        logger.exception("Não foi possível persistir o estado do onboarding.")
        raise HTTPException(status_code=500, detail="Não foi possível guardar a conclusão da configuração.") from exc
    return {"status": "completed", "completed": True}


@router.get("/api/v1/system/resources")
async def system_resources(
    principal: Principal = Depends(require_permission("system:read")),
):
    return resource_manager.collect_metrics(
        queue_active=model_manager.queue.active_count,
        queue_waiting=model_manager.queue.waiting_count,
    )


@router.get("/api/v1/system/server-logs")
async def get_server_logs_endpoint(
    limit: int = 200,
    level: str | None = None,
    search: str | None = None,
    principal: Principal = Depends(require_admin),
):
    """Retorna os logs mais recentes do servidor em formato estruturado."""
    return {
        "total": len(log_buffer.buffer),
        "logs": log_buffer.get_logs(limit=limit, level=level, search=search),
    }


@router.get("/api/v1/system/server-logs/stream")
async def stream_server_logs_endpoint(
    principal: Principal = Depends(require_admin),
):
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
async def clear_server_logs_endpoint(
    principal: Principal = Depends(require_admin),
):
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
async def create_system_backup_endpoint(
    principal: Principal = Depends(require_admin),
):
    """Cria uma cópia física segura de backup do banco SQLite."""
    try:
        backup_path = db_manager.create_database_backup()
        return {"status": "created", "backup_path": backup_path}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha ao gerar backup: {exc}")


@router.get("/api/v1/system/webhooks")
async def get_webhooks_config_endpoint(
    principal: Principal = Depends(require_admin),
):
    """Retorna configurações ativas de notificações via webhook (com credenciais ofuscadas)."""
    return webhook_service.get_safe_config()


@router.post("/api/v1/system/webhooks")
async def save_webhooks_config_endpoint(
    payload: WebhookConfigPayload,
    principal: Principal = Depends(require_admin),
):
    """Salva preferências e URLs/tokens de Webhook do Discord e Telegram."""
    return webhook_service.save_config(payload.model_dump())


@router.post("/api/v1/system/webhooks/test")
async def test_webhook_endpoint(
    principal: Principal = Depends(require_admin),
):
    """Dispara mensagem de teste para os webhooks configurados."""
    return await webhook_service.test_webhook()
