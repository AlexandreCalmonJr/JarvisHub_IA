import json
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

    @staticmethod
    def _checkpoint_thread_id(task_id: str, owner_user_id: str | None) -> str:
        """Namespace checkpoints by account to prevent cross-account task collisions."""
        if not owner_user_id:
            return task_id
        return f"account:{owner_user_id}:task:{task_id}"

    async def execute_task(
        self,
        user_prompt: str,
        session_id: str | None = None,
        project_id: str | None = None,
        task_id: str | None = None,
        owner_user_id: str | None = None,
    ) -> TaskState:
        actual_task_id = task_id or f"tsk-{uuid.uuid4().hex[:8]}"
        actual_session_id = session_id or f"ses-{uuid.uuid4().hex[:8]}"

        initial_state: TaskState = {
            "task_id": actual_task_id,
            "owner_user_id": owner_user_id,
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
        config = {"configurable": {"thread_id": self._checkpoint_thread_id(actual_task_id, owner_user_id)}}
        result_state = await self.graph.ainvoke(initial_state, config=config)
        return result_state

    async def resume_after_approval(
        self, task_id: str, approved_by: str, owner_user_id: str | None = None
    ) -> TaskState:
        """Retoma uma tarefa que estava pausada aguardando aprovação humana e aplica alterações se aplicável."""
        config = {"configurable": {"thread_id": self._checkpoint_thread_id(task_id, owner_user_id)}}
        checkpoint = await self.graph.aget_state(config)
        if not checkpoint or not checkpoint.values:
            raise ValueError(f"Nenhum estado persistido encontrado para a tarefa '{task_id}'.")

        current_values = dict(checkpoint.values)
        checkpoint_owner = current_values.get("owner_user_id")
        if checkpoint_owner != owner_user_id:
            raise PermissionDeniedError(
                "Retomada bloqueada: a tarefa não pertence à conta autenticada."
            )
        approval_id = current_values.get("approval_id")
        intent = current_values.get("classified_intent")
        approval = (
            self.security_core.approval_engine.get_request(
                approval_id, owner_user_id=owner_user_id
            )
            if approval_id else None
        )

        if intent == "code_modification":
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

        elif intent == "project_creation":
            pending_project = current_values.get("pending_project")
            if (
                not approval
                or approval.status != ApprovalStatus.APPROVED
                or approval.task_id != task_id
                or approval.operation != "project_create"
                or approval.decided_by != approved_by
                or not isinstance(pending_project, dict)
                or self.workspace_service is None
            ):
                raise PermissionDeniedError(
                    "Criação bloqueada: aprovação humana ou payload pendente inválido."
                )

            project_id = str(pending_project.get("project_id", ""))
            project_root = self.workspace_service.get_project_dir(project_id).resolve()
            expected_preview = json.dumps(
                {
                    "project_id": project_id,
                    "name": pending_project.get("name"),
                    "project_type": pending_project.get("project_type"),
                    "files": pending_project.get("files") or "Scaffold padrão do tipo selecionado",
                },
                ensure_ascii=False,
                indent=2,
            )
            if (
                str(project_root) not in approval.affected_resources
                or approval.proposed_diff != expected_preview
                or project_root.exists()
            ):
                raise PermissionDeniedError(
                    "Criação bloqueada: o destino ou conteúdo do projeto mudou após a aprovação."
                )

            created = self.workspace_service.scaffold_project(**pending_project)
            if getattr(self, "db_manager", None) is not None and owner_user_id is not None:
                self.db_manager.register_project(
                    project_id=project_id,
                    name=str(pending_project.get("name") or project_id),
                    root_path=str(project_root),
                    owner_user_id=owner_user_id,
                )
            self.security_core.audit.record_event(
                operation="WORKSPACE_PROJECT_CREATE_APPROVED",
                status="SUCCESS",
                user_id=approved_by,
                project_id=project_id,
                parameters={
                    "approval_id": approval_id,
                    "path": str(project_root),
                    "files": created.get("files_created", []),
                },
            )
            current_values["approval_required"] = False
            current_values["pending_project"] = None
            current_values["final_summary"] = (
                f"Projeto '{pending_project.get('name')}' criado após aprovação humana. "
                f"Pasta: {created.get('root_path')}. "
                f"Ficheiros: {', '.join(created.get('files_created', []))}."
            )
            current_values["is_completed"] = True
            await self.graph.aupdate_state(config, current_values)
            return current_values

        current_values["approval_required"] = False

        mod_extra = ""
        if (
            self.workspace_service
            and intent == "code_modification"
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
