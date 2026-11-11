import pytest

from packages.contracts.agent import AgentRole, AutonomousAgentMode, AutonomousAgentRunConfig
from services.autonomous_agent.runtime import AutonomousAgentRuntime
from services.coding_agent.types import ChatTurn, ToolResult
from services.tool_gateway import ToolExecutionRequest


def test_tool_execution_request_contract_is_importable():
    request = ToolExecutionRequest(
        tool_name="read_file",
        arguments={"file_path": "README.md"},
        agent_role=AgentRole.RESEARCH_ANALYST.value,
        project_id="sample",
    )
    assert request.tool_name == "read_file"
    assert request.arguments["file_path"] == "README.md"


@pytest.mark.asyncio
async def test_successful_tool_output_is_collected_as_agent_evidence():
    runtime = AutonomousAgentRuntime(
        security_core=None,
        workspace_service=None,
        tools=None,
        broker=None,
        db_manager=None,
    )
    config = AutonomousAgentRunConfig(
        agent_role=AgentRole.RESEARCH_ANALYST,
        prompt="Inspecionar README",
        project_id="sample",
        session_id="evidence-test",
        mode=AutonomousAgentMode.PLAN,
    )
    evidence = []
    actions = []
    changed_files = []
    tests = []
    risks = []
    blockers = []
    messages = []

    events = [
        event
        async for event in runtime._finish_tool(
            tool_result=ToolResult(
                call_id="call-evidence-1",
                name="read_file",
                success=True,
                output="README contém as instruções de instalação e execução.",
                changed_files=["README.md"],
            ),
            config=config,
            role=AgentRole.RESEARCH_ANALYST,
            messages=messages,
            actions_taken=actions,
            evidence_collected=evidence,
            affected_files=changed_files,
            tests_executed=tests,
            risks_identified=risks,
            blockers_encountered=blockers,
        )
    ]

    assert len(events) == 1
    assert events[0]["type"] == "tool_result"
    assert evidence == [
        "Evidência de read_file: README contém as instruções de instalação e execução...."
    ]
    assert actions == ["Executou read_file"]
    assert changed_files == ["README.md"]
