import pytest

from agents.registry import AgentRegistry
from packages.contracts.agent import AgentRole
from packages.contracts.security import ProjectWorkMode
from services.security_core import PermissionDeniedError, SecurityCore
from services.tool_gateway import ToolGateway
from services.tool_gateway.registry import PERMITTED_TOOLS
from services.tool_gateway.types import ToolExecutionRequest


def test_all_26_agents_have_real_tools_and_react_prompts():
    registry = AgentRegistry()
    agents = registry.list_agents()
    assert len(agents) == 26

    valid_tool_names = set(PERMITTED_TOOLS.keys())
    # Metas and coordination tools permitted
    valid_tool_names.update({"delegate_agent", "list_projects", "request_approval", "query_audit"})

    for agent in agents:
        assert len(agent.allowed_tools) > 0, f"O agente {agent.role.value} deve ter ferramentas associadas"
        # Garante que nenhuma ferramenta seja placeholder desconhecido
        for tool in agent.allowed_tools:
            assert tool in valid_tool_names, f"Ferramenta desconhecida '{tool}' no perfil '{agent.role.value}'"

        # Valida que o prompt possui estrutura cognitiva ReAct
        prompt = agent.system_prompt
        assert "Thought:" in prompt, f"Agente {agent.role.value} sem diretriz Thought"
        assert "Action:" in prompt, f"Agente {agent.role.value} sem diretriz Action"
        assert "Observation:" in prompt, f"Agente {agent.role.value} sem diretriz Observation"
        assert "Reflexion:" in prompt, f"Agente {agent.role.value} sem diretriz Reflexion"


def test_permission_engine_can_propose_operation(tmp_path):
    sec = SecurityCore()
    sec.permission_engine.register_project(
        "proj-edit", str(tmp_path), mode=ProjectWorkMode.EDIT_APPROVED
    )

    # Agentes ativos podem propor escrita sob aprovação
    assert sec.permission_engine.can_propose_operation(
        AgentRole.BACKEND_DEVELOPER, "proj-edit", "file_write"
    ) is True
    assert sec.permission_engine.can_propose_operation(
        AgentRole.SOFTWARE_ARCHITECT, "proj-edit", "file_write"
    ) is True
    assert sec.permission_engine.can_propose_operation(
        AgentRole.DEVOPS_ENGINEER, "proj-edit", "shell_exec"
    ) is True

    # Agentes analíticos (READ_ONLY_ROLES) são bloqueados de propor escrita
    assert sec.permission_engine.can_propose_operation(
        AgentRole.CODE_REVIEWER, "proj-edit", "file_write"
    ) is False
    assert sec.permission_engine.can_propose_operation(
        AgentRole.RESEARCH_ANALYST, "proj-edit", "shell_exec"
    ) is False

    # Em projeto READ_ONLY, nenhum agente pode propor escrita
    sec.permission_engine.register_project(
        "proj-ro", str(tmp_path), mode=ProjectWorkMode.READ_ONLY
    )
    assert sec.permission_engine.can_propose_operation(
        AgentRole.BACKEND_DEVELOPER, "proj-ro", "file_write"
    ) is False


def test_permission_engine_requires_approval():
    sec = SecurityCore()
    assert sec.permission_engine.requires_approval(AgentRole.BACKEND_DEVELOPER, "file_write") is True
    assert sec.permission_engine.requires_approval(AgentRole.BACKEND_DEVELOPER, "shell_exec") is True
    assert sec.permission_engine.requires_approval(AgentRole.BACKEND_DEVELOPER, "file_read") is False


@pytest.mark.asyncio
async def test_data_scientist_can_execute_duckdb_tool(tmp_path):
    sec = SecurityCore()
    sec.permission_engine.register_project("proj-ds", str(tmp_path), mode=ProjectWorkMode.EDIT_APPROVED)
    registry = AgentRegistry()
    gateway = ToolGateway(security_core=sec, agent_registry=registry)

    # Executa consulta analítica com data_scientist
    req = ToolExecutionRequest(
        agent_role="data_scientist",
        tool_name="duckdb_query",
        arguments={"sql": "SELECT 42 as answer, 'test' as label"},
        project_id="proj-ds",
    )
    res = await gateway.execute_tool(req, owner_user_id="test-owner", actor_role="admin")
    assert res.success is True
    assert "answer" in res.stdout
    assert "42" in res.stdout


@pytest.mark.asyncio
async def test_code_reviewer_blocked_on_mutating_tools(tmp_path):
    sec = SecurityCore()
    sec.permission_engine.register_project("proj-cr", str(tmp_path), mode=ProjectWorkMode.EDIT_APPROVED)
    registry = AgentRegistry()
    gateway = ToolGateway(security_core=sec, agent_registry=registry)

    # Tentativa do revisor executar uma escrita deve falhar por ser read-only
    req = ToolExecutionRequest(
        agent_role="code_reviewer",
        tool_name="write_file",
        arguments={"path": "bad.py", "content": "print(1)"},
        project_id="proj-cr",
    )
    with pytest.raises(PermissionDeniedError, match="Somente Leitura"):
        await gateway.execute_tool(req, owner_user_id="test-owner", actor_role="admin")
