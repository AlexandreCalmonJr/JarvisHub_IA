import pytest

from packages.contracts.agent import AgentRole
from packages.contracts.security import ProjectWorkMode
from services.security_core import PermissionDeniedError, SecurityCore
from services.tool_gateway import (
    SandboxTimeoutError,
    SubprocessSandbox,
    ToolExecutionRequest,
    ToolGateway,
)


@pytest.fixture
def gateway_and_project(tmp_path):
    project_root = tmp_path / "safe_project"
    project_root.mkdir()
    (project_root / "README.md").write_text("# Safe Project\nContent here.")
    (project_root / "src").mkdir()
    (project_root / "src" / "index.py").write_text("print('ok')")

    security = SecurityCore()
    security.permission_engine.register_project(
        "proj-safe", str(project_root), mode=ProjectWorkMode.TEST_APPROVED
    )

    gw = ToolGateway(security_core=security)
    return gw, project_root, security


@pytest.mark.asyncio
async def test_arbitrary_shell_tool_is_blocked(gateway_and_project):
    gw, _, _ = gateway_and_project
    req = ToolExecutionRequest(
        tool_name="arbitrary_shell_exec",
        agent_role=AgentRole.JARVIS_MASTER.value,
        project_id="proj-safe",
    )
    with pytest.raises(PermissionDeniedError, match="não está no catálogo autorizado"):
        await gw.execute_tool(req, owner_user_id="test-owner")


@pytest.mark.asyncio
async def test_path_traversal_in_tool_argument_is_blocked(gateway_and_project, tmp_path):
    gw, _, _ = gateway_and_project
    req = ToolExecutionRequest(
        tool_name="read_file",
        arguments={"file_path": "../../../system_secrets.txt"},
        agent_role=AgentRole.SOFTWARE_ARCHITECT.value,
        project_id="proj-safe",
    )
    with pytest.raises(PermissionDeniedError, match="fora do diretório do projeto"):
        await gw.execute_tool(req, owner_user_id="test-owner")


@pytest.mark.asyncio
async def test_tool_read_file_and_list_dir_success(gateway_and_project):
    gw, _, _ = gateway_and_project
    req = ToolExecutionRequest(
        tool_name="read_file",
        arguments={"file_path": "README.md"},
        agent_role=AgentRole.SOFTWARE_ARCHITECT.value,
        project_id="proj-safe",
    )
    res = await gw.execute_tool(req, owner_user_id="test-owner")
    assert res.success is True
    assert "# Safe Project" in res.stdout

    req_list = ToolExecutionRequest(
        tool_name="list_directory",
        arguments={"path": "."},
        agent_role=AgentRole.SOFTWARE_ARCHITECT.value,
        project_id="proj-safe",
    )
    res_list = await gw.execute_tool(req_list, owner_user_id="test-owner")
    assert res_list.success is True
    assert "README.md" in res_list.stdout


@pytest.mark.asyncio
async def test_kill_switch_blocks_tool_execution(gateway_and_project):
    gw, _, sec = gateway_and_project
    sec.kill_switch.trigger_global_kill(reason="Paragem de teste")

    req = ToolExecutionRequest(
        tool_name="read_file",
        arguments={"file_path": "README.md"},
        agent_role=AgentRole.SOFTWARE_ARCHITECT.value,
        project_id="proj-safe",
    )
    with pytest.raises(PermissionDeniedError, match="Kill Switch Global"):
        await gw.execute_tool(req, owner_user_id="test-owner")


@pytest.mark.asyncio
async def test_sandbox_timeout_terminates_subprocess(tmp_path):
    sandbox = SubprocessSandbox(default_timeout_seconds=0.1)
    # Comando python que dorme por 2 segundos (deve dar timeout em 0.1s)
    cmd = ["python", "-c", "import time; time.sleep(2)"]
    with pytest.raises(SandboxTimeoutError, match="tempo limite"):
        await sandbox.run_command(cmd, cwd=tmp_path)



@pytest.mark.asyncio
async def test_vector_search_is_blocked_until_private_account_indexes_exist(gateway_and_project, monkeypatch):
    gw, _, _ = gateway_and_project
    monkeypatch.setattr(gw.agent_registry, "get_allowed_tools", lambda _role: ["vector_search"])
    req = ToolExecutionRequest(
        tool_name="vector_search",
        arguments={"table": "project_vectors", "vector": [0.0] * 128},
        agent_role=AgentRole.SOFTWARE_ARCHITECT.value,
        project_id="proj-safe",
    )
    with pytest.raises(PermissionDeniedError, match="isolamento dos índices por conta"):
        await gw.execute_tool(req, owner_user_id="test-owner")
