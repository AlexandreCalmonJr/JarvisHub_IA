import pytest
from datetime import datetime
from packages.contracts import (
    AgentRole,
    AgentOutputContract,
    ResourceUsage,
    ApprovalRequest,
    ApprovalStatus,
    ProjectWorkMode,
)


def test_agent_role_count():
    # Deve conter exatamente os 26 agentes definidos no Plano Mestre
    assert len(AgentRole) == 26


def test_agent_output_contract_valid():
    output = AgentOutputContract(
        agent_role=AgentRole.JARVIS_MASTER,
        objective="Validar o escopo do projeto",
        summary="Análise preliminar concluída com sucesso.",
        evidence=["README.md verificado", "Build do Windows 10 confirmada"],
        actions_taken=["Inventário inicial", "Leitura de manifestos"],
        affected_files=["docs/adr/0001-modular-monolith-and-local-first.md"],
        tests_executed=["pytest tests/unit"],
        risks=["Nenhum risco de escrita imediata"],
        blockers=[],
        resource_usage=ResourceUsage(model_name="llama3.2:3b", tokens_prompt=120, tokens_completion=80),
        next_recommendation="Prosseguir para a Fase 2 de Segurança.",
    )
    assert output.agent_role == AgentRole.JARVIS_MASTER
    assert len(output.evidence) == 2
    assert output.resource_usage.model_name == "llama3.2:3b"


def test_approval_request_lifecycle():
    approval = ApprovalRequest(
        id="appr-001",
        task_id="task-100",
        agent_role=AgentRole.BACKEND_DEVELOPER.value,
        operation="git_worktree_create",
        impact_summary="Criação de branch isolada para teste",
        affected_resources=["workspace/project_demo"],
        reversible=True,
    )
    assert approval.status == ApprovalStatus.PENDING
    assert approval.reversible is True
