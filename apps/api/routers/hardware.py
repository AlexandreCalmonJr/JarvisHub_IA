import logging

from fastapi import APIRouter, Depends

from apps.api.auth import Principal, require_admin
from apps.api.deps import (
    AGENT_PROFILES,
    agent_registry,
    db_manager,
    generate_recommendations,
    hardware_performance_manager,
    scan_hardware,
)
from apps.api.schemas import PerformanceModePayload

logger = logging.getLogger("jarvis.api.hardware")
router = APIRouter(tags=["hardware"])

# Especialistas cujo trabalho é raciocínio/orquestração e que devem usar o
# modelo leve. Todos os restantes (código, dados, infra, segurança) usam o
# modelo de código. Valores reais de ``AgentRole``.
ORCHESTRATION_ROLES: frozenset[str] = frozenset(
    {
        "jarvis_master",
        "research_analyst",
        "project_manager",
        "project_designer_planner",
        "ux_ui_designer",
        "business_intelligence",
        "privacy_data_protection",
        "identity_access_management",
    }
)

# Alguns perfis são estritamente analíticos e nunca devem ganhar ferramentas de
# escrita por efeito colateral desta otimização.
ALWAYS_READ_ONLY_ROLES: frozenset[str] = frozenset(
    {
        "research_analyst",
        "code_reviewer",
        "threat_modeling_security_architect",
        "privacy_data_protection",
    }
)


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
    master_model = opt.get("master_agent_model", "llama3.2:3b")
    coder_model = opt.get("heavy_code_model", "qwen2.5-coder:7b")

    updated_roles: list[str] = []
    light_roles: list[str] = []
    for profile in AGENT_PROFILES.values():
        role = profile.role.value if hasattr(profile.role, "value") else str(profile.role)
        if role in ORCHESTRATION_ROLES:
            profile.preferred_model = master_model
            light_roles.append(role)
        else:
            profile.preferred_model = coder_model
        if role in ALWAYS_READ_ONLY_ROLES:
            profile.is_read_only = True
        db_manager.set_agent_config(
            role=role,
            system_prompt=profile.system_prompt,
            preferred_model=profile.preferred_model,
            allowed_tools=profile.allowed_tools,
            # Preserva a política de escrita do catálogo em vez de deixar o
            # schema aplicar o default histórico (read-only).
            is_read_only=profile.is_read_only,
        )
        # Mantém o registry (usado pelo runtime autónomo) alinhado com o catálogo.
        try:
            agent_registry.register_profile(profile)
        except Exception:  # pragma: no cover - defensivo
            logger.warning("Falha ao sincronizar o perfil %s no registry.", role, exc_info=True)
        updated_roles.append(role)

    return {
        "status": "applied",
        "updated_agents": len(updated_roles),
        "updated_roles": updated_roles,
        "light_model_roles": light_roles,
        "optimal_config": opt,
        "message": (
            f"Otimização aplicada em {len(updated_roles)} especialistas: "
            f"{len(light_roles)} em {master_model} (raciocínio) e "
            f"{len(updated_roles) - len(light_roles)} em {coder_model} (código)."
        ),
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
