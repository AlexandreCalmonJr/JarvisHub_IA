import uuid

from langgraph.checkpoint.memory import MemorySaver

from services.model_runtime import ModelManager
from services.security_core import SecurityCore

from .graph import create_master_graph
from .state import TaskState


class JarvisMaster:
    """
    Coordenador central do JARVIS AI HUB baseado em LangGraph.
    Gerencia tarefas com estado, checkpoints, aprovações humanas e delegação para especialistas.
    """

    def __init__(
        self,
        security_core: SecurityCore,
        model_manager: ModelManager,
        checkpointer: MemorySaver | None = None,
    ):
        self.security_core = security_core
        self.model_manager = model_manager
        self.checkpointer = checkpointer or MemorySaver()
        self.graph = create_master_graph(
            security_core=self.security_core,
            model_manager=self.model_manager,
            checkpointer=self.checkpointer,
        )

    async def execute_task(
        self,
        user_prompt: str,
        session_id: str | None = None,
        project_id: str | None = None,
        task_id: str | None = None,
    ) -> TaskState:
        actual_task_id = task_id or f"tsk-{uuid.uuid4().hex[:8]}"
        actual_session_id = session_id or f"ses-{uuid.uuid4().hex[:8]}"

        initial_state: TaskState = {
            "task_id": actual_task_id,
            "session_id": actual_session_id,
            "user_prompt": user_prompt,
            "project_id": project_id,
            "classified_intent": None,
            "plan_steps": [],
            "selected_agents": [],
            "policy_verified": False,
            "policy_violations": [],
            "approval_required": False,
            "approval_id": None,
            "current_step": 0,
            "agent_outputs": [],
            "final_summary": None,
            "is_completed": False,
            "error": None,
        }

        # Executa no grafo com checkpoint associado ao task_id
        config = {"configurable": {"thread_id": actual_task_id}}
        result_state = await self.graph.ainvoke(initial_state, config=config)
        return result_state

    async def resume_after_approval(self, task_id: str, approved_by: str) -> TaskState:
        """Retoma uma tarefa que estava pausada aguardando aprovação humana."""
        config = {"configurable": {"thread_id": task_id}}
        checkpoint = await self.graph.aget_state(config)
        if not checkpoint or not checkpoint.values:
            raise ValueError(f"Nenhum estado persistido encontrado para a tarefa '{task_id}'.")

        current_values = dict(checkpoint.values)
        current_values["approval_required"] = False
        current_values["final_summary"] = (
            f"Aprovação concedida por '{approved_by}'. Retomando execução da tarefa."
        )
        current_values["is_completed"] = True

        await self.graph.aupdate_state(config, current_values)
        return current_values
