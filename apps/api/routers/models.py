import json
import logging
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from apps.api.schemas import (
    HybridConfigRequest,
    HybridTestRequest,
    HFInstallPayload,
)
from apps.api.deps import (
    hybrid_router,
    key_vault,
    model_manager,
    security_core,
    build_online_adapter,
    save_hybrid_config_to_disk,
    HYBRID_CONFIG_PATH,
    CURATED_HUGGINGFACE_MODELS,
    search_huggingface_hub,
    AGENT_MODEL_RECOMMENDATIONS,
    stream_ollama_pull,
    PROVIDER_PRESETS,
    UniversalOnlineAdapter,
    AuditEventSeverity,
    inference_tracker,
)

logger = logging.getLogger("jarvis.api.models")
router = APIRouter(tags=["models"])


@router.get("/api/v1/models")
@router.get("/api/v1/models/status")
async def list_models_endpoint():
    cfg = hybrid_router.online_config

    installed_local = []
    try:
        raw_models = await model_manager.adapter.list_models()
        for rm in raw_models:
            role_desc = "Especialista Local"
            low_name = rm.name.lower()
            if "llama" in low_name:
                role_desc = "Master, Orquestração e JSON"
            elif "coder" in low_name or "starcoder" in low_name:
                role_desc = "Fullstack Coding, Refatoração e Diffs"
            elif "qwen" in low_name:
                role_desc = "Arquitetura, Raciocínio Complexo e QA"
            elif "deepseek" in low_name:
                role_desc = "Raciocínio R1 e Matemática"

            installed_local.append({
                "name": rm.name,
                "role": role_desc,
                "speed": "Ativo",
                "context": rm.context_length,
                "status": "ready",
                "parameter_size": rm.parameter_size,
            })
    except Exception as exc:
        logger.debug("Não foi possível atualizar o inventário local de modelos: %s", exc)

    if not installed_local:
        installed_local = [
            {
                "name": "llama3.2:3b",
                "role": "Master, Orquestração e JSON",
                "speed": "10.29 t/s",
                "context": 131072,
                "status": "ready",
            },
            {
                "name": "qwen2.5-coder:7b",
                "role": "Fullstack Coding, Refatoração e Diffs",
                "speed": "4.80 t/s",
                "context": 32768,
                "status": "ready",
            },
            {
                "name": "qwen2.5:7b",
                "role": "Arquitetura, Raciocínio Complexo e QA",
                "speed": "4.50 t/s",
                "context": 32768,
                "status": "ready",
            },
        ]

    # Modelos online disponíveis e configurados no Model Manager
    online_models = []
    if cfg.default_model:
        online_models.append({
            "name": cfg.default_model,
            "provider": cfg.provider_name,
            "is_default": True,
            "label": f"{cfg.default_model} ({cfg.provider_name.upper()} — Ativo no Gateway)",
        })
    for preset in PROVIDER_PRESETS:
        p_id = preset.get("id")
        def_m = preset.get("default_model")
        if def_m and def_m != cfg.default_model:
            online_models.append({
                "name": def_m,
                "provider": p_id,
                "is_default": False,
                "label": f"{def_m} ({preset.get('name')})",
            })

    return {
        "models": installed_local,
        "online_models": online_models,
        "concurrency_limit": 1,
        "queue_status": {
            "active": model_manager.queue.active_count,
            "waiting": model_manager.queue.waiting_count,
        },
        "hybrid_gateway": {
            "enabled": cfg.enabled,
            "provider": cfg.provider_name,
            "model": cfg.default_model,
            "has_api_key": bool(cfg.key_id and key_vault.get_key(cfg.key_id)),
            "max_budget_usd": cfg.max_budget_usd,
            "current_spend_usd": cfg.current_spend_usd,
            "fallback_route": "ollama_local",
        },
    }


@router.get("/api/v1/system/model-metrics")
async def get_model_metrics_endpoint():
    """Retorna métricas de inferência: latência média, velocidade t/s e economia acumulada."""
    return inference_tracker.get_metrics_summary()


@router.get("/api/v1/models/hybrid-config")
async def get_hybrid_config_endpoint():
    cfg = hybrid_router.online_config
    return {
        "provider_name": cfg.provider_name,
        "enabled": cfg.enabled,
        "has_api_key": bool(cfg.key_id and key_vault.get_key(cfg.key_id)),
        "masked_api_key": (lambda p: (f"{p.api_key[:4]}...{p.api_key[-4:]}" if p and len(p.api_key) > 8 else ("***" if p else None)))(key_vault.get_key(cfg.key_id) if cfg.key_id else None),
        "base_url": cfg.base_url,
        "default_model": cfg.default_model,
        "max_budget_usd": cfg.max_budget_usd,
        "current_spend_usd": cfg.current_spend_usd,
        "presets": PROVIDER_PRESETS,
    }


@router.post("/api/v1/models/hybrid-config")
async def update_hybrid_config_endpoint(payload: HybridConfigRequest):
    cfg = hybrid_router.online_config
    cfg.provider_name = payload.provider_name.lower()
    cfg.enabled = payload.enabled
    cfg.max_budget_usd = payload.max_budget_usd

    if payload.base_url is not None:
        cfg.base_url = payload.base_url.strip() if payload.base_url.strip() else None
    if payload.default_model:
        cfg.default_model = payload.default_model.strip()

    # Segredos são gravados exclusivamente no KeyVault cifrado.
    if payload.api_key and payload.api_key.strip():
        key_id = cfg.key_id or "hybrid_primary"
        key_vault.save_key(
            key_id=key_id,
            label=f"{cfg.provider_name.upper()} — Gateway Híbrido",
            provider=cfg.provider_name,
            api_key=payload.api_key.strip(),
            base_url=cfg.base_url,
            default_model=cfg.default_model,
            is_active=True,
        )
        cfg.key_id = key_id
    elif cfg.key_id:
        existing = key_vault.get_key(cfg.key_id)
        if existing and existing.provider.lower() != cfg.provider_name.lower():
            raise HTTPException(
                status_code=400,
                detail="O provedor foi alterado. Informe uma nova chave para o provedor selecionado.",
            )

    cfg.api_key = None
    hybrid_router.online_adapter = build_online_adapter(cfg, key_vault)
    if cfg.enabled and hybrid_router.online_adapter is None:
        cfg.enabled = False

    save_hybrid_config_to_disk(cfg, HYBRID_CONFIG_PATH)

    security_core.audit.record_event(
        operation="HYBRID_GATEWAY_CONFIG_UPDATED",
        status="SUCCESS",
        parameters={
            "provider": cfg.provider_name,
            "enabled": cfg.enabled,
            "model": cfg.default_model,
            "max_budget": cfg.max_budget_usd,
        },
        severity=AuditEventSeverity.INFO,
    )

    return {
        "status": "updated",
        "config": {
            "provider_name": cfg.provider_name,
            "enabled": cfg.enabled,
            "has_api_key": bool(cfg.key_id and key_vault.get_key(cfg.key_id)),
            "masked_api_key": (lambda p: (f"{p.api_key[:4]}...{p.api_key[-4:]}" if p and len(p.api_key) > 8 else ("***" if p else None)))(key_vault.get_key(cfg.key_id) if cfg.key_id else None),
            "base_url": cfg.base_url,
            "default_model": cfg.default_model,
            "max_budget_usd": cfg.max_budget_usd,
            "current_spend_usd": cfg.current_spend_usd,
        },
    }


@router.post("/api/v1/models/hybrid-config/test")
async def test_hybrid_connection_endpoint(payload: HybridTestRequest):
    # Usa a chave fornecida ou recupera a chave descriptografada do KeyVault.
    api_key = (payload.api_key or "").strip()
    if not api_key and hybrid_router.online_config.key_id:
        profile = key_vault.get_key(hybrid_router.online_config.key_id)
        api_key = profile.api_key if profile and profile.is_active else ""

    if not api_key:
        raise HTTPException(status_code=400, detail="Nenhuma chave de API informada ou previamente configurada no KeyVault.")

    adapter = UniversalOnlineAdapter(
        api_key=api_key,
        provider_name=payload.provider_name,
        base_url=payload.base_url,
        default_model=payload.default_model,
        timeout_seconds=12.0,
    )
    result = await adapter.test_connection()
    return result


@router.get("/api/v1/models/huggingface/curated")
async def get_huggingface_curated():
    """Retorna modelos curados e homologados para a CPU Intel do usuário."""
    return CURATED_HUGGINGFACE_MODELS


@router.get("/api/v1/models/huggingface/search")
async def search_huggingface_endpoint(q: str = "", limit: int = 10):
    """Pesquisa modelos GGUF no Hugging Face Hub."""
    return await search_huggingface_hub(query=q, limit=limit)


@router.get("/api/v1/models/agent-recommendations")
async def get_agent_recommendations_endpoint():
    """Retorna a matriz de modelo ótimo do Hugging Face para cada um dos 26 especialistas."""
    return AGENT_MODEL_RECOMMENDATIONS


@router.post("/api/v1/models/huggingface/install")
async def install_huggingface_model_endpoint(payload: HFInstallPayload):
    """Inicia o download e registro de um modelo via Ollama em background com streaming SSE."""
    async def event_generator():
        async for chunk in stream_ollama_pull(payload.model_tag):
            yield f"data: {json.dumps(chunk)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# --- Endpoints do Cofre de Múltiplas Chaves (KeyVault) ---

class KeyProfilePayload(BaseModel):
    key_id: str
    label: str
    provider: str
    api_key: str
    base_url: str | None = None
    default_model: str | None = None
    is_active: bool = True


@router.get("/api/v1/models/vault")
async def list_vault_keys_endpoint():
    """Lista todas as chaves cadastradas no cofre com máscaras de segurança."""
    from apps.api.deps import key_vault
    return key_vault.list_keys()


@router.post("/api/v1/models/vault")
async def save_vault_key_endpoint(payload: KeyProfilePayload):
    """Cadastra ou atualiza uma chave de API nomeada no cofre."""
    from apps.api.deps import key_vault
    prof = key_vault.save_key(
        key_id=payload.key_id,
        label=payload.label,
        provider=payload.provider,
        api_key=payload.api_key,
        base_url=payload.base_url,
        default_model=payload.default_model,
        is_active=payload.is_active,
    )
    return {"status": "saved", "key_id": prof.key_id, "label": prof.label}


@router.delete("/api/v1/models/vault/{key_id}")
async def delete_vault_key_endpoint(key_id: str):
    """Exclui uma chave de API do cofre."""
    from apps.api.deps import key_vault
    deleted = key_vault.delete_key(key_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Chave não encontrada no cofre.")
    return {"status": "deleted", "key_id": key_id}


@router.post("/api/v1/models/vault/{key_id}/test")
async def test_vault_key_endpoint(key_id: str):
    """Testa a conectividade de uma chave específica com o provedor correspondente."""
    from apps.api.deps import key_vault
    res = await key_vault.test_key_connectivity(key_id)
    return res

