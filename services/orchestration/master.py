import uuid
from typing import Any

from langgraph.checkpoint.memory import MemorySaver

from services.model_runtime import ModelManager
from packages.contracts.approval import ApprovalStatus
from services.security_core import PermissionDeniedError, SecurityCore

from .graph import create_master_graph, execute_workspace_modification
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
        workspace_service: Any = None,
        agent_registry: Any = None,
        skills_catalog: Any = None,
        db_manager: Any = None,
        tool_gateway: Any = None,
    ):
        self.security_core = security_core
        self.model_manager = model_manager
        self.checkpointer = checkpointer or MemorySaver()
        self.workspace_service = workspace_service
        self.agent_registry = agent_registry
        self.skills_catalog = skills_catalog
        self.db_manager = db_manager
        self.tool_gateway = tool_gateway
        self.graph = create_master_graph(
            security_core=self.security_core,
            model_manager=self.model_manager,
            checkpointer=self.checkpointer,
            workspace_service=self.workspace_service,
            agent_registry=self.agent_registry,
            skills_catalog=self.skills_catalog,
            db_manager=self.db_manager,
            tool_gateway=self.tool_gateway,
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
            "pending_project": None,
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
        """Retoma uma tarefa que estava pausada aguardando aprovação humana e aplica alterações se aplicável."""
        config = {"configurable": {"thread_id": task_id}}
        checkpoint = await self.graph.aget_state(config)
        if not checkpoint or not checkpoint.values:
            raise ValueError(f"Nenhum estado persistido encontrado para a tarefa '{task_id}'.")

        current_values = dict(checkpoint.values)
        approval_id = current_values.get("approval_id")
        if current_values.get("classified_intent") == "code_modification":
            approval = self.security_core.approval_engine.get_request(approval_id) if approval_id else None
            if (
                not approval
                or approval.status != ApprovalStatus.APPROVED
                or approval.task_id != task_id
                or approval.operation != "file_write"
                or approval.decided_by != approved_by
            ):
                raise PermissionDeniedError(
                    "Retomada bloqueada: aprovação humana ausente, pendente ou não vinculada a esta tarefa."
                )

        current_values["approval_required"] = False

        mod_extra = ""
        if (
            self.workspace_service
            and current_values.get("classified_intent") == "code_modification"
        ):
            msg, _ = execute_workspace_modification(
                workspace_service=self.workspace_service,
                user_prompt=current_values.get("user_prompt", ""),
                project_id=current_values.get("project_id"),
                approval_id=approval_id,
                task_id=task_id,
            )
            mod_extra = f"\n\n{msg}"

        current_values["final_summary"] = (
            f"Aprovação concedida por '{approved_by}'. A alteração foi autorizada e executada no sistema.{mod_extra}"
        )
        current_values["is_completed"] = True

        await self.graph.aupdate_state(config, current_values)
        return current_values
