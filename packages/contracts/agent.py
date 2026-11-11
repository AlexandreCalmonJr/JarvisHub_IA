from datetime import UTC, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class AgentRole(str, Enum):
    JARVIS_MASTER = "jarvis_master"
    SOFTWARE_ARCHITECT = "software_architect"
    PROJECT_MANAGER = "project_manager"
    RESEARCH_ANALYST = "research_analyst"
    PROJECT_DESIGNER_PLANNER = "project_designer_planner"
    UX_UI_DESIGNER = "ux_ui_designer"
    FRONTEND_MOBILE_DEVELOPER = "frontend_mobile_developer"
    BACKEND_DEVELOPER = "backend_developer"
    QA_ENGINEER = "qa_engineer"
    CODE_REVIEWER = "code_reviewer"
    DATA_SCIENTIST = "data_scientist"
    BUSINESS_INTELLIGENCE = "business_intelligence"
    DATA_ENGINEERING_INTELLIGENCE = "data_engineering_intelligence"
    DATA_ENGINEER_PIPELINES = "data_engineer_pipelines"
    DEVOPS_ENGINEER = "devops_engineer"
    NETWORK_INFRASTRUCTURE_ENGINEER = "network_infrastructure_engineer"
    CYBERSECURITY_ENGINEER = "cybersecurity_engineer"
    AUTOMATION_ENGINEER = "automation_engineer"
    THREAT_MODELING_SECURITY_ARCHITECT = "threat_modeling_security_architect"
    SECURE_CODE_AUDITOR = "secure_code_auditor"
    API_SECURITY_SPECIALIST = "api_security_specialist"
    IDENTITY_ACCESS_MANAGEMENT = "identity_access_management"
    SOFTWARE_SUPPLY_CHAIN_SECURITY = "software_supply_chain_security"
    SOC_INCIDENT_RESPONSE = "soc_incident_response"
    AI_SECURITY_RED_TEAM = "ai_security_red_team"
    PRIVACY_DATA_PROTECTION = "privacy_data_protection"


class ResourceUsage(BaseModel):
    model_name: str
    tokens_prompt: int | None = 0
    tokens_completion: int | None = 0
    duration_ms: float | None = 0.0


class AgentOutputContract(BaseModel):
    """
    Contrato padronizado obrigatório para resposta de todos os 26 agentes:
    Objetivo, resumo, evidências, ações executadas, arquivos afetados,
    testes, riscos, bloqueios, uso de recursos e próxima recomendação.
    """

    agent_role: AgentRole
    objective: str = Field(..., description="Objetivo específico atribuído à execução")
    summary: str = Field(..., description="Resumo executivo do trabalho realizado")
    evidence: list[str] = Field(
        default_factory=list, description="Fatos, linhas de código e dados verificáveis"
    )
    actions_taken: list[str] = Field(
        default_factory=list, description="Ações concretas executadas pelo agente"
    )
    affected_files: list[str] = Field(
        default_factory=list, description="Caminhos de arquivos lidos, analisados ou alterados"
    )
    tests_executed: list[str] = Field(
        default_factory=list, description="Testes unitários/integração ou verificações realizadas"
    )
    risks: list[str] = Field(
        default_factory=list,
        description="Riscos técnicos, de segurança ou de regressão identificados",
    )
    blockers: list[str] = Field(
        default_factory=list, description="Bloqueios ou necessidades de autorização humana pendente"
    )
    resource_usage: ResourceUsage = Field(
        default_factory=lambda: ResourceUsage(model_name="unknown")
    )
    next_recommendation: str = Field(
        ..., description="Próximo passo recomendado para o JARVIS Master ou utilizador"
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AgentTaskRequest(BaseModel):
    task_id: str
    session_id: str
    agent_role: AgentRole
    user_prompt: str
    project_id: str | None = None
    project_path: str | None = None
    allowed_tools: list[str] = Field(default_factory=list)
    context_data: dict[str, Any] = Field(default_factory=dict)


class InterAgentMessage(BaseModel):
    """Mensagem tipada para comunicação estruturada entre agentes com controle de ciclos."""

    id: str
    task_id: str
    sender: AgentRole
    recipient: AgentRole
    event_type: str
    context_summary: str
    expected_output: str
    cycle: int = 1
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AutonomousAgentMode(str, Enum):
    """Modos de operação do especialista autônomo."""

    PLAN = "plan"
    ASK = "ask"
    AUTO = "auto"


class AgentEventType(str, Enum):
    """Tipos de eventos emitidos durante a execução de um especialista autônomo."""

    THOUGHT = "thought"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    TOKEN = "token"
    APPROVAL_REQUIRED = "approval_required"
    FINAL_RESPONSE = "final_response"
    ERROR = "error"


class AgentEvent(BaseModel):
    """Evento emitido no streaming de execução do especialista."""

    event_type: AgentEventType
    agent_role: AgentRole
    content: str = ""
    tool_name: str | None = None
    tool_call_id: str | None = None
    parameters: dict[str, Any] = Field(default_factory=dict)
    approval_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AutonomousAgentRunConfig(BaseModel):
    """Configuração de execução para qualquer especialista autônomo."""

    agent_role: AgentRole
    prompt: str
    session_id: str = Field(default_factory=lambda: f"session-{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}")
    project_id: str | None = None
    owner_user_id: str | None = None
    mode: AutonomousAgentMode = AutonomousAgentMode.ASK
    max_iterations: int = 15
    temperature: float = 0.3
    max_tokens: int = 2048
    timeout_seconds: float = 180.0
    include_history: bool = True

