import json
import logging
import os
import sys
from pathlib import Path

from agents.profiles.catalog import AGENT_PROFILES  # noqa: F401
from agents.registry import AgentRegistry
from packages.contracts.security import AuditEventSeverity  # noqa: F401
from services.autonomous_agent import AutonomousAgentRuntime
from services.backend_studio import MockServerService, SQLPlaygroundService
from services.coding_agent import (
    ApprovalBroker,
    ChatAgentRuntime,
    CodingAgentRuntime,
    CodingToolExecutor,
    resolve_chat_provider,
)
from services.design_studio import DesignStudioService
from services.engineering_intelligence import EngineeringIntelligenceService
from services.hardware import (
    HardwarePerformanceManager,
    generate_recommendations,  # noqa: F401
    scan_hardware,  # noqa: F401
)
from services.knowledge.knowledge_vault import KnowledgeVaultService
from services.mcp import McpService
from services.memory import DatabaseManager
from services.model_runtime import (
    PROVIDER_PRESETS,  # noqa: F401
    HybridModelRouter,
    InferenceRequest,  # noqa: F401
    ModelManager,
    OllamaAdapter,
    OnlineProviderConfig,
    UniversalOnlineAdapter,
    load_hybrid_config_from_disk,
    save_hybrid_config_to_disk,  # noqa: F401
)
from services.model_runtime.huggingface_service import (
    AGENT_MODEL_RECOMMENDATIONS,  # noqa: F401
    CURATED_HUGGINGFACE_MODELS,  # noqa: F401
    search_huggingface_hub,  # noqa: F401
    stream_ollama_pull,  # noqa: F401
)
from services.observability import (
    attach_server_logging,  # noqa: F401
    inference_tracker,  # noqa: F401
    log_buffer,  # noqa: F401
)
from services.orchestration import JarvisMaster
from services.orchestration.graph import build_specialist_prompt  # noqa: F401
from services.proactive_operations import WebhookNotificationService
from services.project_workspace import ProjectWorkspaceService
from services.quality_studio import QualityStudioService
from services.resource_manager import ResourceManager
from services.security_core import SecurityCore, UnauthorizedApprovalError, cyber_shield  # noqa: F401
from services.skills_manager import SkillMetadata, SkillsCatalog
from services.skills_manager.validator import SkillValidator
from services.tool_gateway import SubprocessSandbox, ToolExecutionRequest, ToolGateway  # noqa: F401

logger = logging.getLogger("jarvis.api")


def get_base_dir() -> Path:
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass)
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent.parent.parent


def resolve_data_dir() -> Path:
    if getattr(sys, "frozen", False):
        local_app_data = os.environ.get("LOCALAPPDATA")
        if local_app_data:
            d = Path(local_app_data) / "JarvisAIHub" / "data"
            d.mkdir(parents=True, exist_ok=True)
            return d
    d = get_base_dir() / "data"
    d.mkdir(parents=True, exist_ok=True)
    return d


def resolve_frontend_dist() -> Path | None:
    candidates: list[Path] = []
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        candidates.append(Path(meipass) / "apps" / "dashboard" / "dist")
        candidates.append(Path(meipass) / "dist")

    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).parent
        candidates.append(exe_dir / "_internal" / "apps" / "dashboard" / "dist")
        candidates.append(exe_dir / "_internal" / "dist")
        candidates.append(exe_dir / "apps" / "dashboard" / "dist")
        candidates.append(exe_dir / "dist")

    base = get_base_dir()
    candidates.append(base / "apps" / "dashboard" / "dist")
    candidates.append(Path.cwd() / "apps" / "dashboard" / "dist")
    candidates.append(base / "_internal" / "apps" / "dashboard" / "dist")
    candidates.append(base / "dist")
    candidates.append(Path.cwd() / "dist")

    for p in candidates:
        if p.exists() and (p / "index.html").exists():
            return p.resolve()
    return None


def resolve_workspace_dir() -> Path:
    if getattr(sys, "frozen", False):
        local_app_data = os.environ.get("LOCALAPPDATA")
        if local_app_data:
            w = Path(local_app_data) / "JarvisAIHub" / "workspace"
            w.mkdir(parents=True, exist_ok=True)
            return w
    w = (get_base_dir() / "workspace").resolve()
    w.mkdir(parents=True, exist_ok=True)
    return w


# Configuração e inicialização do Gateway Híbrido
data_dir = resolve_data_dir()
HYBRID_CONFIG_PATH = data_dir / "hybrid_gateway_config.json"
hybrid_config = load_hybrid_config_from_disk(HYBRID_CONFIG_PATH)


def build_online_adapter(cfg: OnlineProviderConfig) -> UniversalOnlineAdapter | None:
    if cfg.api_key:
        return UniversalOnlineAdapter(
            api_key=cfg.api_key,
            provider_name=cfg.provider_name,
            base_url=cfg.base_url,
            default_model=cfg.default_model,
        )
    return None


online_adapter = build_online_adapter(hybrid_config)

# Inicialização dos serviços centrais
security_core = SecurityCore()
workspace_root = resolve_workspace_dir()
workspace_service = ProjectWorkspaceService(security_core=security_core, base_dir=workspace_root)
tool_gateway = ToolGateway(security_core=security_core)

# Registra projetos de workspace/ no motor de permissões do núcleo de segurança
if workspace_root.exists():
    for p_dir in workspace_root.iterdir():
        if p_dir.is_dir() and not p_dir.name.startswith("."):
            security_core.permission_engine.register_project(
                project_id=p_dir.name,
                root_path=str(p_dir),
            )

from services.model_runtime.key_vault import KeyVaultService

key_vault = KeyVaultService()

hybrid_router = HybridModelRouter(
    local_adapter=OllamaAdapter(),
    online_config=hybrid_config,
    online_adapter=online_adapter,
    approval_engine=security_core.approval_engine,
    audit_trail=security_core.audit,
    key_vault=key_vault,
)
model_manager = ModelManager(
    adapter=OllamaAdapter(),
    kill_switch=security_core.kill_switch,
    audit_trail=security_core.audit,
    hybrid_router=hybrid_router,
)
db_manager = DatabaseManager(db_path=str(data_dir / "jarvis.db"))
resource_manager = ResourceManager(audit_trail=security_core.audit)
skills_catalog = SkillsCatalog()
agent_registry = AgentRegistry()

# Aplica customizações persistidas de especialistas a partir do SQLite no agent_registry
try:
    saved_agent_configs = db_manager.get_agent_configs()
    for role_key, cfg in saved_agent_configs.items():
        for p in agent_registry.list_agents():
            p_role = p.role.value if hasattr(p.role, "value") else str(p.role)
            if p_role == role_key:
                if cfg.get("system_prompt"):
                    p.system_prompt = cfg["system_prompt"]
                if cfg.get("preferred_model"):
                    p.preferred_model = cfg["preferred_model"]
                if cfg.get("allowed_tools"):
                    p.allowed_tools = cfg["allowed_tools"]
                if "is_read_only" in cfg and cfg["is_read_only"] is not None:
                    p.is_read_only = bool(cfg["is_read_only"])
                if cfg.get("assigned_key_id"):
                    p.assigned_key_id = cfg["assigned_key_id"]
except Exception as exc:
    logger.warning("Falha ao sincronizar configurações customizadas de agentes: %s", exc)


def resolve_skills_dirs() -> list[Path]:
    candidates: list[Path] = []
    base = get_base_dir()
    repo_root = Path(__file__).resolve().parent.parent.parent
    possible_roots = [base, repo_root, Path.cwd()]

    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).parent
        possible_roots.extend([
            exe_dir,
            exe_dir / "_internal",
            exe_dir / "_internal" / "skills",
        ])
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            possible_roots.extend([Path(meipass), Path(meipass) / "skills"])

    for sub in ["internal", "imported", "validation"]:
        for root in possible_roots:
            d1 = (root / "skills" / sub).resolve()
            if d1.exists() and d1 not in candidates:
                candidates.append(d1)
            d2 = (root / sub).resolve()
            if d2.exists() and d2 not in candidates:
                candidates.append(d2)

    return candidates


# Popula catálogo com skills internas e importadas (ECC)
skills_dirs = resolve_skills_dirs()
for s_dir in skills_dirs:
    for f in s_dir.glob("*.json"):
        try:
            skill_dict = json.loads(f.read_text(encoding="utf-8"))
            if "name" in skill_dict and "instructions" in skill_dict:
                meta = SkillMetadata(**skill_dict)
                skills_catalog.register_skill(meta, auto_approve=True)
        except Exception as exc:
            logger.warning("Falha ao carregar skill %s: %s", f.name, exc)

# Fallback defensivo: se 0 skills foram carregadas, faz varredura recursiva
if len(skills_catalog.list_all_skills()) == 0:
    logger.info("Executando varredura recursiva de contingência por skills JSON...")
    search_dirs = [get_base_dir(), Path(__file__).resolve().parent.parent.parent, Path.cwd()]
    if getattr(sys, "frozen", False):
        search_dirs.append(Path(sys.executable).parent)
        search_dirs.append(Path(sys.executable).parent / "_internal")
    for s_root in search_dirs:
        if s_root.exists():
            for f in s_root.rglob("*.json"):
                if "skills" in f.parts and f.name != "package.json":
                    try:
                        s_data = json.loads(f.read_text(encoding="utf-8"))
                        if "instructions" in s_data and ("name" in s_data or "id" in s_data):
                            meta = SkillMetadata(**s_data)
                            skills_catalog.register_skill(meta, auto_approve=True)
                    except Exception as exc:
                        logger.debug("Falha ao registrar skill do arquivo %s: %s", f, exc)

# Carrega skills persistidas pelo usuário no SQLite
try:
    user_skills_list = db_manager.list_user_skills()
    for us in user_skills_list:
        try:
            content_hash = us.get("content_hash") or SkillValidator.compute_hash(us["instructions"], {})
            meta = SkillMetadata(
                id=us["id"],
                name=us["name"],
                version=us.get("version", "1.0.0"),
                origin=us.get("origin", "user_created"),
                license="MIT",
                description=us.get("description", ""),
                domain=us.get("domain", "backend"),
                allowed_tools=[],
                required_permissions=[],
                assigned_agents=us.get("assigned_agents", ["jarvis_master"]),
                content_hash=content_hash,
                is_approved=True,
                instructions=us["instructions"],
            )
            skills_catalog.register_skill(meta, auto_approve=True)
        except Exception as e:
            logger.warning("Falha ao registrar user_skill %s: %s", us.get("id"), e)
except Exception as e:
    logger.warning("Erro ao carregar user_skills do SQLite: %s", e)

logger.info("Catálogo ECC inicializado com %d skills registradas.", len(skills_catalog.list_all_skills()))

knowledge_vault_service = KnowledgeVaultService(db_manager=db_manager)
hardware_performance_manager = HardwarePerformanceManager(db_manager=db_manager, model_manager=model_manager)
hardware_performance_manager.apply_to_runtime()
webhook_service = WebhookNotificationService(db_manager=db_manager)
mock_server_service = MockServerService(db_manager=db_manager)
sql_playground_service = SQLPlaygroundService(workspace_service=workspace_service)
security_core.red_team.workspace_service = workspace_service
security_core.policy_generator.workspace_service = workspace_service
quality_studio_service = QualityStudioService(workspace_service=workspace_service)
design_studio_service = DesignStudioService()
engineering_intelligence_service = EngineeringIntelligenceService(workspace_service=workspace_service, db_manager=db_manager)

jarvis_master = JarvisMaster(
    security_core=security_core,
    model_manager=model_manager,
    workspace_service=workspace_service,
    agent_registry=agent_registry,
    skills_catalog=skills_catalog,
    db_manager=db_manager,
    tool_gateway=tool_gateway,
)

# ---------------------------------------------------------------------------
# Coding Agent (estilo Claude Code / OpenCode)
# ---------------------------------------------------------------------------
coding_broker = ApprovalBroker(
    approval_engine=security_core.approval_engine,
    audit_trail=security_core.audit,
)
coding_tools = CodingToolExecutor(
    security_core=security_core,
    workspace_service=workspace_service,
    sandbox=SubprocessSandbox(default_timeout_seconds=120.0),
)
coding_runtime = CodingAgentRuntime(
    security_core=security_core,
    workspace_service=workspace_service,
    tools=coding_tools,
    broker=coding_broker,
    db_manager=db_manager,
    provider_factory=lambda: resolve_chat_provider(hybrid_router.online_config),
)

# Chat conversacional com memória e streaming real (mesma camada de provedores)
chat_runtime = ChatAgentRuntime(
    provider_factory=lambda: resolve_chat_provider(hybrid_router.online_config),
    db_manager=db_manager,
    workspace_service=workspace_service,
)

# Runtime de Especialistas Autônomos (Loop ReAct para os 26 Especialistas)
autonomous_agent_runtime = AutonomousAgentRuntime(
    security_core=security_core,
    workspace_service=workspace_service,
    tools=coding_tools,
    broker=coding_broker,
    db_manager=db_manager,
    agent_registry=agent_registry,
    skills_manager=skills_catalog,
    provider_factory=lambda: resolve_chat_provider(hybrid_router.online_config),
)

# Servidores MCP opcionais (descoberta sob demanda em /api/v1/mcp/reload)
mcp_service = McpService(config_path=data_dir / "mcp_servers.json")
