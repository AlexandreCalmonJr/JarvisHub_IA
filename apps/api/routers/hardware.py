import logging

from fastapi import APIRouter, Depends

from apps.api.auth import Principal, require_admin
from apps.api.deps import (
    AGENT_PROFILES,
    db_manager,
    generate_recommendations,
    hardware_performance_manager,
    scan_hardware,
)
from apps.api.schemas import PerformanceModePayload

logger = logging.getLogger("jarvis.api.hardware")
router = APIRouter(tags=["hardware"])


@router.get("/api/v1/system/hardware-profile")
@router.get("/api/v1/hardware/profile")
async def get_hardware_profile_endpoint(
    _principal: Principal = Depends(require_admin),
):
    """Diagnóstico global da máquina anfitriã, disponível apenas para administradores."""
    specs = scan_hardware()
    recommendations = generate_recommendations(specs)
    return {
        "specs": specs,
        "recommendations": recommendations,
    }


@router.post("/api/v1/system/apply-hardware-optimizations")
async def apply_hardware_optimizations_endpoint(
    _principal: Principal = Depends(require_admin),
):
    """Altera modelos globais dos agentes; operação administrativa."""
    specs = scan_hardware()
    recs = generate_recommendations(specs)
    opt = recs.get("optimal_config", {})
    recommended_model = opt.get("master_agent_model", "llama3.2:3b")

    updated_count = 0
    for profile in AGENT_PROFILES.values():
        role = profile.role.value if hasattr(profile.role, "value") else str(profile.role)
        if role in ("maestro", "general_assistant", "code_explanation", "requirements_analyst"):
            profile.preferred_model = recommended_model
        else:
            profile.preferred_model = opt.get("heavy_code_model", "qwen2.5-coder:7b")
        db_manager.set_agent_config(
            role=role,
            system_prompt=profile.system_prompt,
            preferred_model=profile.preferred_model,
            allowed_tools=profile.allowed_tools,
        )
        updated_count += 1

    return {
        "status": "applied",
        "updated_agents": updated_count,
        "optimal_config": opt,
        "message": f"Otimização aplicada com sucesso! Maestro e triagem configurados para {recommended_model}.",
    }


@router.get("/api/v1/hardware/performance-mode")
@router.get("/api/v1/hardware/performance")
async def get_hardware_performance_mode_endpoint(
    _principal: Principal = Depends(require_admin),
):
    """Retorna o perfil global de desempenho, disponível apenas para administradores."""
    return hardware_performance_manager.get_performance_profile()


@router.post("/api/v1/hardware/performance-mode")
@router.post("/api/v1/hardware/performance")
async def set_hardware_performance_mode_endpoint(
    payload: PerformanceModePayload,
    _principal: Principal = Depends(require_admin),
):
    """Altera o perfil global de desempenho; operação administrativa."""
    return hardware_performance_manager.set_performance_profile(
        mode=payload.mode,
        cpu_threads=payload.cpu_threads,
        eco_model=payload.eco_model,
    )
