import json
import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from apps.api.auth import get_principal, require_admin
from apps.api.deps import (
    AGENT_MODEL_RECOMMENDATIONS,
    CURATED_HUGGINGFACE_MODELS,
    HYBRID_CONFIG_PATH,
    PROVIDER_PRESETS,
    AuditEventSeverity,
    UniversalOnlineAdapter,
    build_online_adapter,
    hybrid_router,
    inference_tracker,
    key_vault,
    model_manager,
    save_hybrid_config_to_disk,
    search_huggingface_hub,
    security_core,
    stream_ollama_pull,
)
from apps.api.schemas import (
    HFInstallPayload,
    HybridConfigRequest,
    HybridTestRequest,
)

logger = logging.getLogger("jarvis.api.models")
router = APIRouter(tags=["models"])


def _mask_api_key(profile) -> str | None:
    if not profile:
        return None
    return f"{profile.api_key[:4]}...{profile.api_key[-4:]}" if len(profile.api_key) > 8 else "***"


@router.get("/api/v1/models")
@router.get("/api/v1/models/status")
async def list_models_endpoint(principal=Depends(get_principal)):
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

            installed_local.append(
                {
                    "name": rm.name,
                    "role": role_desc,
                    "speed": "Ativo",
                    "context": rm.context_length,
                    "status": "ready",
                    "parameter_size": rm.parameter_size,
                }
            )
    except Exception as exc:
        logger.debug("Não foi possível atualizar o inventário local de modelos: %s", exc)

    # Lista vazia significa que nenhum modelo local foi confirmado como instalado.

    # Só anuncia um modelo online quando o gateway está ativo e a credencial correspondente existe.
    online_models = []
    active_key = key_vault.get_key(cfg.key_id) if cfg.key_id else None
    owner_key = (
        key_vault.resolve_active_key(principal.subject_id)
        if getattr(principal, "kind", None) == "human"
        else None
    )
    gateway_active = bool(
        cfg.enabled
        and active_key
        and active_key.is_active
        and hybrid_router.online_adapter is not None
    )
    account_key_active = bool(owner_key and owner_key.is_active)
    if (gateway_active or account_key_active) and (owner_key or cfg.default_model):
        if owner_key:
            online_name = owner_key.default_model
            online_provider = owner_key.provider
            online_label = f"{online_name} ({online_provider.upper()} — cofre da conta)"
        else:
            online_name = cfg.default_model
            online_provider = cfg.provider_name
            online_label = f"{online_name} ({online_provider.upper()} — configurado e ativo)"
        online_models.append(
            {
                "name": online_name,
                "provider": online_provider,
                "is_default": True,
                "label": online_label,
            }
        )

    response = {
        "models": installed_local,
        "online_models": online_models,
        # Chat clients need only the active route and model name; budget,
        # spend, credential state and global queue telemetry are admin-only.
        "hybrid_gateway": {
            "enabled": gateway_active or account_key_active,
            "provider": (owner_key.provider if owner_key else cfg.provider_name),
            "model": (owner_key.default_model if owner_key else cfg.default_model),
            "fallback_route": "ollama_local",
        },
    }
    if principal.kind == "human" and principal.role == "admin":
        response["concurrency_limit"] = 1
        response["queue_status"] = {
            "active": model_manager.queue.active_count,
            "waiting": model_manager.queue.waiting_count,
        }
        response["hybrid_gateway"].update(
            {
                "has_api_key": bool(active_key and active_key.is_active),
                "max_budget_usd": cfg.max_budget_usd,
                "current_spend_usd": cfg.current_spend_usd,
            }
        )
    return response


@router.get("/api/v1/system/model-metrics")
async def get_model_metrics_endpoint(principal=Depends(require_admin)):
    """Retorna métricas de inferência: latência média, velocidade t/s e economia acumulada."""
    return inference_tracker.get_metrics_summary()


@router.get("/api/v1/models/hybrid-config")
async def get_hybrid_config_endpoint(principal=Depends(require_admin)):
    cfg = hybrid_router.online_config
    return {
        "provider_name": cfg.provider_name,
        "enabled": cfg.enabled,
        "has_api_key": bool(cfg.key_id and key_vault.get_key(cfg.key_id)),
        "masked_api_key": _mask_api_key(key_vault.get_key(cfg.key_id) if cfg.key_id else None),
        "base_url": cfg.base_url,
        "default_model": cfg.default_model,
        "max_budget_usd": cfg.max_budget_usd,
        "current_spend_usd": cfg.current_spend_usd,
        "presets": PROVIDER_PRESETS,
    }


@router.post("/api/v1/models/hybrid-config")
async def update_hybrid_config_endpoint(
    payload: HybridConfigRequest, principal=Depends(require_admin)
):
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
            "masked_api_key": _mask_api_key(key_vault.get_key(cfg.key_id) if cfg.key_id else None),
            "base_url": cfg.base_url,
            "default_model": cfg.default_model,
            "max_budget_usd": cfg.max_budget_usd,
            "current_spend_usd": cfg.current_spend_usd,
        },
    }


@router.post("/api/v1/models/hybrid-config/test")
async def test_hybrid_connection_endpoint(
    payload: HybridTestRequest, principal=Depends(require_admin)
):
    # Usa a chave fornecida ou recupera a chave descriptografada do KeyVault.
    api_key = (payload.api_key or "").strip()
    if not api_key and hybrid_router.online_config.key_id:
        profile = key_vault.get_key(hybrid_router.online_config.key_id)
        api_key = profile.api_key if profile and profile.is_active else ""

    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Nenhuma chave de API informada ou previamente configurada no KeyVault.",
        )

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
async def get_huggingface_curated(principal=Depends(get_principal)):
    """Retorna modelos curados e homologados para a CPU Intel do usuário."""
    return CURATED_HUGGINGFACE_MODELS


@router.get("/api/v1/models/huggingface/search")
async def search_huggingface_endpoint(
    q: str = "", limit: int = 10, principal=Depends(get_principal)
):
    """Pesquisa modelos GGUF no Hugging Face Hub."""
    return await search_huggingface_hub(query=q, limit=limit)


@router.get("/api/v1/models/agent-recommendations")
async def get_agent_recommendations_endpoint(principal=Depends(get_principal)):
    """Retorna recomendações de modelos para os papéis de agente registados."""
    return AGENT_MODEL_RECOMMENDATIONS


@router.post("/api/v1/models/huggingface/install")
async def install_huggingface_model_endpoint(
    payload: HFInstallPayload, principal=Depends(require_admin)
):
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
    # "account" isola a credencial na conta autenticada; "global" exige admin.
    scope: Literal["account", "global"] = "account"
    is_default: bool = False


def _vault_account(principal) -> str:
    if getattr(principal, "kind", None) != "human":
        raise HTTPException(
            status_code=403,
            detail="O cofre privado exige uma conta humana autenticada.",
        )
    return principal.subject_id


def _vault_scope_owner(principal, scope: str) -> str | None:
    if scope == "global":
        if getattr(principal, "role", None) != "admin":
            raise HTTPException(
                status_code=403,
                detail="Apenas administradores podem gerir credenciais globais.",
            )
        return None
    return _vault_account(principal)


@router.get("/api/v1/models/vault")
async def list_vault_keys_endpoint(principal=Depends(get_principal)):
    """Lista as chaves privadas da conta (e, para admin, também as globais)."""
    owner = _vault_account(principal)
    include_global = getattr(principal, "role", None) == "admin"
    return key_vault.list_keys(owner_user_id=owner, include_global=include_global)


@router.post("/api/v1/models/vault")
async def save_vault_key_endpoint(payload: KeyProfilePayload, principal=Depends(get_principal)):
    """Cadastra ou atualiza uma chave no cofre privado da conta autenticada."""
    owner = _vault_scope_owner(principal, payload.scope)
    prof = key_vault.save_key(
        key_id=payload.key_id,
        label=payload.label,
        provider=payload.provider,
        api_key=payload.api_key,
        base_url=payload.base_url,
        default_model=payload.default_model,
        is_active=payload.is_active,
        owner_user_id=owner,
        is_default=payload.is_default,
    )
    return {
        "status": "saved",
        "key_id": prof.key_id,
        "scope": "global" if prof.owner_user_id is None else "account",
    }


@router.post("/api/v1/models/vault/{key_id}/default")
async def set_default_vault_key_endpoint(key_id: str, principal=Depends(get_principal)):
    """Define a chave da conta usada automaticamente nas suas inferências."""
    owner = _vault_account(principal)
    if not key_vault.set_default_key(key_id, owner):
        raise HTTPException(status_code=404, detail="Chave não encontrada no cofre da conta.")
    return {"status": "default", "key_id": key_id}


@router.delete("/api/v1/models/vault/{key_id}")
async def delete_vault_key_endpoint(
    key_id: str,
    scope: Literal["account", "global"] = "account",
    principal=Depends(get_principal),
):
    """Exclui uma chave do cofre privado da conta (ou global, se admin)."""
    owner = _vault_scope_owner(principal, scope)
    deleted = key_vault.delete_key(key_id, owner_user_id=owner)
    if not deleted:
        raise HTTPException(status_code=404, detail="Chave não encontrada no cofre.")
    return {"status": "deleted", "key_id": key_id}


@router.post("/api/v1/models/vault/{key_id}/test")
async def test_vault_key_endpoint(
    key_id: str,
    scope: Literal["account", "global"] = "account",
    principal=Depends(get_principal),
):
    """Testa a conectividade de uma chave do cofre da conta."""
    owner = _vault_scope_owner(principal, scope)
    res = await key_vault.test_key_connectivity(key_id, owner_user_id=owner)
    return res
