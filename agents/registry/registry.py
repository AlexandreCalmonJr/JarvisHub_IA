from agents.profiles.catalog import AGENT_PROFILES
from packages.agent_sdk.base_agent import AgentProfile
from packages.contracts.agent import AgentRole


class AgentRegistry:
    """
    Registo central de perfis e especializações de agentes.
    Controla ferramentas permitidas, modelo de IA sugerido e permissões.
    """

    def __init__(self):
        self._profiles: dict[AgentRole, AgentProfile] = {
            role: profile.model_copy(deep=True) for role, profile in AGENT_PROFILES.items()
        }

    def get_profile(self, role: AgentRole) -> AgentProfile | None:
        return self._profiles.get(role)

    def register_profile(self, profile: AgentProfile) -> None:
        self._profiles[profile.role] = profile

    def list_agents(self) -> list[AgentProfile]:
        return list(self._profiles.values())

    def get_allowed_tools(self, role: AgentRole) -> list[str]:
        profile = self.get_profile(role)
        return profile.allowed_tools if profile else []
