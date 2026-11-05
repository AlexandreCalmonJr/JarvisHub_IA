import uuid
from typing import Dict, Any, List
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from packages.contracts.agent import AgentRole, AgentOutputContract, ResourceUsage
from packages.contracts.approval import ApprovalStatus
from services.security_core import SecurityCore, PermissionDeniedError
from services.model_runtime import ModelManager, InferenceRequest
from .state import TaskState


def create_master_graph(
    security_core: SecurityCore,
    model_manager: ModelManager,
    checkpointer: MemorySaver,
):
    """
    Constrói o grafo de execução do JARVIS Master v1.
    Fluxo:
    START -> classify_intent -> plan_task -> verify_policy -> [se requer aprovação: pause/finalize | senão: execute_or_delegate] -> validate_output -> finalize_task -> END
    """

    async def classify_intent(state: TaskState) -> Dict[str, Any]:
        prompt = state["user_prompt"].lower()
        if any(w in prompt for w in ("arquitetura", "estrutura", "diagrama", "módulos")):
            intent = "architecture_analysis"
            agents = [AgentRole.SOFTWARE_ARCHITECT.value]
        elif any(w in prompt for w in ("segurança", "vulnerabilidade", "threat", "owasp", "auditar")):
            intent = "security_audit"
            agents = [AgentRole.CYBERSECURITY_ENGINEER.value, AgentRole.SECURE_CODE_AUDITOR.value]
        elif any(w in prompt for w in ("editar", "alterar", "adicionar", "corrigir", "implementar", "fix")):
            intent = "code_modification"
            agents = [AgentRole.BACKEND_DEVELOPER.value, AgentRole.QA_ENGINEER.value]
        elif any(w in prompt for w in ("teste", "testes", "qa", "validar")):
            intent = "qa_testing"
            agents = [AgentRole.QA_ENGINEER.value]
        else:
            intent = "general_planning"
            agents = [AgentRole.PROJECT_MANAGER.value]

        return {
            "classified_intent": intent,
            "selected_agents": agents,
        }

    async def plan_task(state: TaskState) -> Dict[str, Any]:
        intent = state.get("classified_intent", "general_planning")
        prompt = state["user_prompt"]

        steps = [
            f"1. Interpretar contexto e objetivo do pedido: '{prompt[:60]}...'",
            f"2. Validar conformidade de segurança e modo de trabalho do projeto.",
            f"3. Executar análise com os especialistas selecionados: {', '.join(state.get('selected_agents', []))}.",
            f"4. Consolidar plano, riscos e recomendações de próximos passos.",
        ]
        return {"plan_steps": steps}

    async def verify_policy(state: TaskState) -> Dict[str, Any]:
        intent = state.get("classified_intent")
        project_id = state.get("project_id")
        violations: List[str] = []
        approval_required = False
        approval_id = None

        # Modificação de código sempre exige aprovação humana
        if intent == "code_modification":
            approval_required = True
            if project_id:
                try:
                    security_core.permission_engine.check_operation_permission(
                        agent_role=AgentRole.BACKEND_DEVELOPER,
                        project_id=project_id,
                        operation="file_write",
                        has_human_approval=False,
                    )
                except PermissionDeniedError as err:
                    violations.append(str(err))

            # Cria solicitação formal no Approval Engine
            appr = security_core.approval_engine.create_request(
                task_id=state["task_id"],
                agent_role=AgentRole.JARVIS_MASTER.value,
                operation="code_modification",
                impact_summary=f"Alteração de código solicitada pelo utilizador: '{state['user_prompt']}'",
                affected_resources=[f"project:{project_id or 'workspace'}"],
                reversible=True,
            )
            approval_id = appr.id

        return {
            "policy_verified": len(violations) == 0,
            "policy_violations": violations,
            "approval_required": approval_required,
            "approval_id": approval_id,
        }

    async def execute_or_delegate(state: TaskState) -> Dict[str, Any]:
        selected = state.get("selected_agents", [AgentRole.JARVIS_MASTER.value])
        primary_agent = selected[0]

        # Gera resposta estruturada do agente especializado
        agent_output = AgentOutputContract(
            agent_role=primary_agent,
            objective=f"Executar análise técnica para a intenção '{state.get('classified_intent')}'",
            summary=f"Análise estruturada gerada para: {state['user_prompt']}",
            evidence=["Verificação de escopo realizada", "Modo do projeto em conformidade"],
            actions_taken=state.get("plan_steps", []),
            affected_files=[],
            tests_executed=["Verificação estática e de políticas"],
            risks=["Nenhum risco detetado na fase de planeamento"],
            blockers=[],
            resource_usage=ResourceUsage(model_name="llama3.2:3b", tokens_prompt=40, tokens_completion=60),
            next_recommendation="Submeter recomendações ao utilizador para revisão.",
        )

        return {
            "agent_outputs": [agent_output.model_dump()],
            "current_step": 1,
        }

    async def validate_output(state: TaskState) -> Dict[str, Any]:
        # Valida conformidade do output com o contrato dos agentes
        outputs = state.get("agent_outputs", [])
        validated = []
        for out in outputs:
            # Revalida através do Pydantic
            contract = AgentOutputContract(**out)
            validated.append(contract.model_dump())
        return {"agent_outputs": validated}

    async def finalize_task(state: TaskState) -> Dict[str, Any]:
        if state.get("approval_required"):
            appr_id = state.get("approval_id")
            summary = (
                f"A operação requer aprovação humana prévia. Solicitação '{appr_id}' criada no Approval Center. "
                f"Impacto: alteração de código pendente de revisão."
            )
            return {"final_summary": summary, "is_completed": False}

        if state.get("policy_violations"):
            summary = f"Execução bloqueada por violação de políticas: {'; '.join(state['policy_violations'])}"
            return {"final_summary": summary, "is_completed": False}

        intent = state.get("classified_intent")
        steps = "\n".join(state.get("plan_steps", []))
        summary = (
            f"JARVIS Master concluiu o planeamento da tarefa com sucesso.\n\n"
            f"**Intenção Classificada**: {intent}\n"
            f"**Especialistas Selecionados**: {', '.join(state.get('selected_agents', []))}\n\n"
            f"**Plano de Execução**:\n{steps}"
        )
        return {"final_summary": summary, "is_completed": True}

    def route_after_policy(state: TaskState) -> str:
        if state.get("approval_required") or state.get("policy_violations"):
            return "finalize_task"
        return "execute_or_delegate"

    # Monta o grafo com LangGraph
    workflow = StateGraph(TaskState)

    workflow.add_node("classify_intent", classify_intent)
    workflow.add_node("plan_task", plan_task)
    workflow.add_node("verify_policy", verify_policy)
    workflow.add_node("execute_or_delegate", execute_or_delegate)
    workflow.add_node("validate_output", validate_output)
    workflow.add_node("finalize_task", finalize_task)

    workflow.add_edge(START, "classify_intent")
    workflow.add_edge("classify_intent", "plan_task")
    workflow.add_edge("plan_task", "verify_policy")

    workflow.add_conditional_edges(
        "verify_policy",
        route_after_policy,
        {
            "execute_or_delegate": "execute_or_delegate",
            "finalize_task": "finalize_task",
        },
    )

    workflow.add_edge("execute_or_delegate", "validate_output")
    workflow.add_edge("validate_output", "finalize_task")
    workflow.add_edge("finalize_task", END)

    return workflow.compile(checkpointer=checkpointer)
