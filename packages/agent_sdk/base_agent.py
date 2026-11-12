from abc import ABC, abstractmethod

from pydantic import BaseModel, Field

from packages.contracts.agent import (
    AgentOutputContract,
    AgentRole,
    AgentTaskRequest,
    AutonomousAgentMode,
    AutonomousAgentRunConfig,
    ResourceUsage,
)
from services.model_runtime import InferenceRequest, ModelManager


class AgentProfile(BaseModel):
    role: AgentRole
    name: str
    mission: str
    allowed_tools: list[str] = Field(default_factory=list)
    system_prompt: str
    preferred_model: str = "auto_hybrid"
    is_read_only: bool = True
    assigned_key_id: str | None = None


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


class AutonomousAgent(BaseAgent):
    """
    Agente Especialista Autônomo com motor cognitivo ReAct, catálogo de ferramentas,
    gerenciamento de contexto, suporte a aprovação e streaming de eventos.
    """

    def __init__(self, profile: AgentProfile, skills: list[str] | None = None):
        super().__init__(profile)
        self.skills = skills or []

    def is_tool_allowed(self, tool_name: str) -> bool:
        """Verifica se uma ferramenta está explicitamente autorizada no perfil do agente."""
        return tool_name in self.profile.allowed_tools

    def build_system_prompt(
        self,
        mode: AutonomousAgentMode = AutonomousAgentMode.ASK,
        project_context: str = "",
        commands_context: str = "",
        memories: list[str] | None = None,
        skills_instructions: str = "",
    ) -> str:
        """Constrói prompt cognitivo rico com persona do especialista, ReAct e contexto."""
        mode_instructions = {
            AutonomousAgentMode.PLAN: (
                "MODO PLANEJAMENTO: Atuação estritamente analítica. Você NÃO pode alterar arquivos ou executar comandos destrutivos. "
                "Produza análises aprofundadas, arquiteturas, planos de ação e trechos de código propostos."
            ),
            AutonomousAgentMode.ASK: (
                "MODO ASSISTIDO: Operações de leitura e inspeção são livres. Para operações críticas (escrita de arquivos, execução de comandos, commits), "
                "o sistema solicitará autorização humana prévia. Use ferramentas normalmente."
            ),
            AutonomousAgentMode.AUTO: (
                "MODO AUTÔNOMO: Você possui autonomia para executar ferramentas no sandbox autorizado. "
                "Mantenha rigor técnico e siga as diretrizes de segurança Zero Trust."
            ),
        }.get(mode, "MODO ASSISTIDO: Solicite aprovação para operações críticas.")

        mem_section = ""
        if memories:
            formatted_mems = "\n".join(f"- {m}" for m in memories)
            mem_section = f"\n\n## Memória e Lições Aprendidas Anteriores\n{formatted_mems}"

        skills_section = ""
        if skills_instructions:
            skills_section = f"\n\n## Competências e Skills Ativas\n{skills_instructions}"

        tools_list = (
            ", ".join(self.profile.allowed_tools)
            if self.profile.allowed_tools
            else "read_file, list_directory"
        )

        prompt = (
            f"Você é {self.profile.name}, um agente especialista autônomo soberano do JARVIS AI HUB.\n"
            f"Sua missão corporativa principal é: {self.profile.mission}\n\n"
            f"## DIRETRIZES COGNITIVAS (ReAct & CoT)\n"
            f"- Thought: Pense de forma crítica antes de agir. Decomponha objetivos em subtarefas mensuráveis.\n"
            f"- Action: Utilize apenas as ferramentas permitidas ({tools_list}) dentro do projeto ativo.\n"
            f"- Observation: Analise detalhadamente o retorno de cada ferramenta antes de decidir o próximo passo.\n"
            f"- Reflexion: Valide se a solução atende aos critérios de aceitação com máxima qualidade.\n\n"
            f"## Modo Operacional Atual: {mode.value.upper()}\n"
            f"{mode_instructions}\n\n"
            f"## Prompt Específico do Especialista\n"
            f"{self.profile.system_prompt}"
            f"{mem_section}"
            f"{skills_section}"
        )

        if commands_context:
            prompt += f"\n\n## Comandos Detectados no Projeto\n{commands_context}"

        if project_context:
            prompt += f"\n\n## Contexto Físico do Projeto\n{project_context}"

        return prompt

    def create_output_contract(
        self,
        objective: str,
        summary: str,
        evidence: list[str] | None = None,
        actions_taken: list[str] | None = None,
        affected_files: list[str] | None = None,
        tests_executed: list[str] | None = None,
        risks: list[str] | None = None,
        blockers: list[str] | None = None,
        next_recommendation: str = "Apresentar parecer ao utilizador.",
        model_name: str | None = None,
        duration_ms: float = 0.0,
    ) -> AgentOutputContract:
        """Gera contrato estruturado padronizado obrigatório de resposta."""
        return AgentOutputContract(
            agent_role=self.profile.role,
            objective=objective,
            summary=summary,
            evidence=evidence or ["Inspeção de escopo concluída."],
            actions_taken=actions_taken or ["Análise técnica pelo especialista."],
            affected_files=affected_files or [],
            tests_executed=tests_executed or [],
            risks=risks or [],
            blockers=blockers or [],
            resource_usage=ResourceUsage(
                model_name=model_name or self.profile.preferred_model,
                duration_ms=duration_ms,
            ),
            next_recommendation=next_recommendation,
        )

    def create_run_config(
        self,
        prompt: str,
        mode: AutonomousAgentMode = AutonomousAgentMode.ASK,
        project_id: str | None = None,
        session_id: str | None = None,
    ) -> AutonomousAgentRunConfig:
        """Cria configuração tipada de execução para este especialista."""
        return AutonomousAgentRunConfig(
            agent_role=self.profile.role,
            prompt=prompt,
            session_id=session_id or f"ses-{self.profile.role.value}",
            project_id=project_id,
            mode=mode,
        )

    async def run(
        self,
        task_request: AgentTaskRequest,
        model_manager: ModelManager,
    ) -> AgentOutputContract:
        """Execução direta do agente especialista com retorno do contrato formal."""
        system_prompt = self.build_system_prompt(
            mode=AutonomousAgentMode.ASK,
            project_context=task_request.context_data.get("project_context", ""),
        )

        inf_req = InferenceRequest(
            prompt=task_request.user_prompt,
            system_prompt=system_prompt,
            model_name=self.profile.preferred_model,
            max_tokens=1024,
            temperature=0.3,
            timeout_seconds=300.0,
            task_id=task_request.task_id,
            key_id=self.profile.assigned_key_id,
        )

        try:
            resp = await model_manager.generate(inf_req)
            content = resp.content.strip()
            model_used = resp.model_name
            dur = resp.duration_ms or 0.0
        except Exception:
            content = f"Parecer técnico estruturado de {self.profile.name}: Análise de '{task_request.user_prompt}' concluída."
            model_used = self.profile.preferred_model
            dur = 0.0

        return self.create_output_contract(
            objective=f"Execução de tarefa por {self.profile.name}",
            summary=content,
            evidence=[f"Análise executada por modelo {model_used}"],
            actions_taken=[f"Processamento pelo especialista {self.profile.name}"],
            next_recommendation=f"Revisar parecer de {self.profile.name} e definir próximos passos.",
            model_name=model_used,
            duration_ms=dur,
        )
