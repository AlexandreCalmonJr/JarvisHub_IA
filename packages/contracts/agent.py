from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone


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
    tokens_prompt: Optional[int] = 0
    tokens_completion: Optional[int] = 0
    duration_ms: Optional[float] = 0.0


class AgentOutputContract(BaseModel):
    """
    Contrato padronizado obrigatório para resposta de todos os 26 agentes:
    Objetivo, resumo, evidências, ações executadas, arquivos afetados,
    testes, riscos, bloqueios, uso de recursos e próxima recomendação.
    """
    agent_role: AgentRole
    objective: str = Field(..., description="Objetivo específico atribuído à execução")
    summary: str = Field(..., description="Resumo executivo do trabalho realizado")
    evidence: List[str] = Field(default_factory=list, description="Fatos, linhas de código e dados verificáveis")
    actions_taken: List[str] = Field(default_factory=list, description="Ações concretas executadas pelo agente")
    affected_files: List[str] = Field(default_factory=list, description="Caminhos de arquivos lidos, analisados ou alterados")
    tests_executed: List[str] = Field(default_factory=list, description="Testes unitários/integração ou verificações realizadas")
    risks: List[str] = Field(default_factory=list, description="Riscos técnicos, de segurança ou de regressão identificados")
    blockers: List[str] = Field(default_factory=list, description="Bloqueios ou necessidades de autorização humana pendente")
    resource_usage: ResourceUsage = Field(default_factory=lambda: ResourceUsage(model_name="unknown"))
    next_recommendation: str = Field(..., description="Próximo passo recomendado para o JARVIS Master ou utilizador")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AgentTaskRequest(BaseModel):
    task_id: str
    session_id: str
    agent_role: AgentRole
    user_prompt: str
    project_id: Optional[str] = None
    project_path: Optional[str] = None
    allowed_tools: List[str] = Field(default_factory=list)
    context_data: Dict[str, Any] = Field(default_factory=dict)
