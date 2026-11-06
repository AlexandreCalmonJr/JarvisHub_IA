from typing import Dict, List, Optional
from packages.contracts.agent import AgentRole
from packages.agent_sdk.base_agent import AgentProfile
from agents.profiles.catalog import AGENT_PROFILES


class AgentRegistry:
    """
    Registo central de perfis e especializações de agentes.
    Controla ferramentas permitidas, modelo de IA sugerido e permissões.
    """

    def __init__(self):
        self._profiles: Dict[AgentRole, AgentProfile] = dict(AGENT_PROFILES)

    def get_profile(self, role: AgentRole) -> Optional[AgentProfile]:
        return self._profiles.get(role)

    def register_profile(self, profile: AgentProfile) -> None:
        self._profiles[profile.role] = profile

    def list_agents(self) -> List[AgentProfile]:
        return list(self._profiles.values())

    def get_allowed_tools(self, role: AgentRole) -> List[str]:
        profile = self.get_profile(role)
        return profile.allowed_tools if profile else []
