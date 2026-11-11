import pytest
from packages.contracts.agent import AgentRole
from packages.contracts.security import ProjectWorkMode
from services.memory.database import DatabaseManager
from services.security_core import PermissionDeniedError, SecurityCore
from services.tool_gateway import ToolGateway
from services.tool_gateway.types import ToolCategory, ToolDefinition, ToolExecutionRequest


def test_agent_read_only_persistence(tmp_path):
    db_path = str(tmp_path / "test_perm.db")
    db = DatabaseManager(db_path=db_path)

    # By default, is_read_only is True
    db.set_agent_config(
        role="software_architect",
        system_prompt="Custom prompt",
        preferred_model="qwen2.5:7b",
        allowed_tools=["read_file"],
        is_read_only=True,
    )

    configs = db.get_agent_configs()
    assert "software_architect" in configs
    assert configs["software_architect"]["is_read_only"] is True

    # User toggles to Read-Write (False)
    db.set_agent_config(
        role="software_architect",
        is_read_only=False,
    )

    configs2 = db.get_agent_configs()
    assert configs2["software_architect"]["is_read_only"] is False


@pytest.mark.asyncio
async def test_tool_gateway_blocks_modifications_for_read_only_agent(tmp_path):
    from agents.registry.registry import AgentRegistry

    sec = SecurityCore()
    sec.permission_engine.register_project("proj1", str(tmp_path), mode=ProjectWorkMode.EDIT_APPROVED)
    registry = AgentRegistry()

    # Get software architect profile and ensure is_read_only is True
    arch = registry.get_profile(AgentRole.SOFTWARE_ARCHITECT)
    assert arch is not None
    arch.is_read_only = True
    arch.allowed_tools.append("run_tests")

    gateway = ToolGateway(security_core=sec, agent_registry=registry)

    req = ToolExecutionRequest(
        agent_role="software_architect",
        tool_name="run_tests",
        arguments={},
        project_id="proj1",
    )

    with pytest.raises(PermissionDeniedError) as exc_info:
        await gateway.execute_tool(req, owner_user_id="test-owner", actor_role="admin")

    assert "Somente Leitura (Read-Only)" in str(exc_info.value)
