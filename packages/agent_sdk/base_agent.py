from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

from packages.contracts.agent import AgentRole, AgentOutputContract, AgentTaskRequest, ResourceUsage
from services.model_runtime import ModelManager, InferenceRequest


class AgentProfile(BaseModel):
    role: AgentRole
    name: str
    mission: str
    allowed_tools: List[str] = Field(default_factory=list)
    system_prompt: str
    preferred_model: str = "llama3.2:3b"
    is_read_only: bool = True


class BaseAgent(ABC):
    """Classe base para execução de agentes especializados."""

    def __init__(self, profile: AgentProfile):
        self.profile = profile

    @abstractmethod
    async def run(
        self,
        task_request: AgentTaskRequest,
        model_manager: ModelManager,
    ) -> AgentOutputContract:
        pass
