import logging
from fastapi import APIRouter

from apps.api.schemas import PerformanceModePayload
from apps.api.deps import (
    scan_hardware,
    generate_recommendations,
    hardware_performance_manager,
    AGENT_PROFILES,
    db_manager,
)

logger = logging.getLogger("jarvis.api.hardware")
router = APIRouter(tags=["hardware"])


@router.get("/api/v1/system/hardware-profile")
@router.get("/api/v1/hardware/profile")
async def get_hardware_profile_endpoint():
    """Escaneia CPU, RAM, GPU e modelos locais Ollama, retornando diagnóstico e recomendações."""
    specs = scan_hardware()
    recommendations = generate_recommendations(specs)
    return {
        "specs": specs,
        "recommendations": recommendations,
    }


@router.post("/api/v1/system/apply-hardware-optimizations")
async def apply_hardware_optimizations_endpoint():
    """Aplica configuração ideal de modelos para os agentes com base no hardware real detectado."""
    specs = scan_hardware()
    recs = generate_recommendations(specs)
    opt = recs.get("optimal_config", {})
    recommended_model = opt.get("master_agent_model", "llama3.2:3b")

    updated_count = 0
    for p in AGENT_PROFILES.values():
        p_role = p.role.value if hasattr(p.role, "value") else str(p.role)
        if p_role in ("maestro", "general_assistant", "code_explanation", "requirements_analyst"):
            p.preferred_model = recommended_model
        else:
            p.preferred_model = opt.get("heavy_code_model", "qwen2.5-coder:7b")
        db_manager.set_agent_config(
            role=p_role,
            system_prompt=p.system_prompt,
            preferred_model=p.preferred_model,
            allowed_tools=p.allowed_tools,
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
async def get_hardware_performance_mode_endpoint():
    """Retorna o perfil atual de desempenho, threads de CPU e status de bateria."""
    return hardware_performance_manager.get_performance_profile()


@router.post("/api/v1/hardware/performance-mode")
@router.post("/api/v1/hardware/performance")
async def set_hardware_performance_mode_endpoint(payload: PerformanceModePayload):
    """Configura o modo de desempenho (auto, turbo, balanced, eco) e o limite dinâmico de threads."""
    return hardware_performance_manager.set_performance_profile(
        mode=payload.mode,
        cpu_threads=payload.cpu_threads,
        eco_model=payload.eco_model,
    )
