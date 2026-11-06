from .types import SkillMetadata
from .validator import SkillValidationError, SkillValidator

DEFAULT_DOMAIN_AGENTS: dict[str, list[str]] = {
    "backend": ["backend_developer", "software_architect", "code_reviewer"],
    "qa": ["qa_engineer", "code_reviewer"],
    "security": [
        "cybersecurity_engineer",
        "secure_code_auditor",
        "threat_modeling_security_architect",
        "api_security_specialist",
        "ai_security_red_team",
    ],
    "flutter": ["frontend_mobile_developer", "ux_ui_designer"],
    "web": ["frontend_mobile_developer", "ux_ui_designer", "software_architect"],
    "data": [
        "data_scientist",
        "data_engineer_pipelines",
        "data_engineering_intelligence",
        "business_intelligence",
    ],
    "ops": [
        "devops_engineer",
        "automation_engineer",
        "network_infrastructure_engineer",
        "soc_incident_response",
    ],
    "management": ["jarvis_master", "project_manager", "project_designer_planner"],
}


class SkillsCatalog:
    """
    Catálogo central de skills aprovadas e versionadas.
    Permite busca por relevância, controle de versão, rollback e revogação.
    """

    def __init__(self, validator: SkillValidator | None = None):
        self.validator = validator or SkillValidator()
        # id -> SkillMetadata (versão ativa)
        self._skills: dict[str, SkillMetadata] = {}
        # id -> list[SkillMetadata] (histórico de versões para rollback)
        self._history: dict[str, list[SkillMetadata]] = {}

    def register_skill(self, skill: SkillMetadata, auto_approve: bool = False) -> SkillMetadata:
        is_valid, violations = self.validator.validate(skill)
        if not is_valid:
            raise SkillValidationError(
                f"Falha na validação da skill '{skill.id}': {'; '.join(violations)}"
            )

        skill.is_approved = auto_approve

        # Atribui agentes padrão do domínio se nenhum estiver associado
        if not skill.assigned_agents:
            skill.assigned_agents = DEFAULT_DOMAIN_AGENTS.get(skill.domain, ["jarvis_master"])

        # Guarda no histórico para suporte a rollback
        if skill.id not in self._history:
            self._history[skill.id] = []
        self._history[skill.id].append(skill.model_copy())

        self._skills[skill.id] = skill
        return skill

    def approve_skill(self, skill_id: str) -> SkillMetadata:
        skill = self._skills.get(skill_id)
        if not skill:
            raise ValueError(f"Skill '{skill_id}' não encontrada.")
        skill.is_approved = True
        skill.is_revoked = False
        return skill

    def revoke_skill(self, skill_id: str, reason: str = "Revogação manual") -> SkillMetadata:
        skill = self._skills.get(skill_id)
        if not skill:
            raise ValueError(f"Skill '{skill_id}' não encontrada.")
        skill.is_approved = False
        skill.is_revoked = True
        return skill

    def assign_agents(self, skill_id: str, agent_roles: list[str]) -> SkillMetadata:
        skill = self._skills.get(skill_id)
        if not skill:
            raise ValueError(f"Skill '{skill_id}' não encontrada.")
        skill.assigned_agents = agent_roles
        return skill

    def get_skills_for_agent(self, agent_role: str) -> list[SkillMetadata]:
        """Retorna todas as skills ativas associadas a um agente específico."""
        return [
            s
            for s in self._skills.values()
            if s.is_approved and not s.is_revoked and agent_role in s.assigned_agents
        ]

    def rollback_skill(self, skill_id: str) -> SkillMetadata:
        history = self._history.get(skill_id, [])
        if len(history) < 2:
            raise ValueError(
                f"Não há versões anteriores disponíveis para rollback da skill '{skill_id}'."
            )

        # Remove versão atual e restaura a anterior
        history.pop()
        previous = history[-1].model_copy()
        self._skills[skill_id] = previous
        return previous

    def get_skill(self, skill_id: str) -> SkillMetadata | None:
        skill = self._skills.get(skill_id)
        if skill and skill.is_approved and not skill.is_revoked:
            return skill
        return None

    def get_relevant_skills(self, domain: str, limit: int = 3) -> list[SkillMetadata]:
        """Recupera apenas skills relevantes e aprovadas para o domínio da tarefa, limitando o contexto."""
        matches = [
            s
            for s in self._skills.values()
            if s.domain == domain and s.is_approved and not s.is_revoked
        ]
        return matches[:limit]

    def list_all_skills(self) -> list[SkillMetadata]:
        return list(self._skills.values())
