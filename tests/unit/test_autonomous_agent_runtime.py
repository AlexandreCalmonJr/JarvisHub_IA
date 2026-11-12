import pytest

from packages.contracts.agent import (
    AgentOutputContract,
    AgentRole,
    AutonomousAgentMode,
    AutonomousAgentRunConfig,
)
from packages.contracts.security import ProjectWorkMode
from services.autonomous_agent import AutonomousAgentRuntime
from services.coding_agent.broker import ApprovalBroker
from services.coding_agent.tools import CodingToolExecutor
from services.coding_agent.types import ChatTurn, ProviderReply, ToolCall, ToolSpec
from services.memory.database import DatabaseManager
from services.security_core import SecurityCore


class MockWorkspaceService:
    def __init__(self, root):
        self.root = root

    def get_project_dir(self, project_id: str):
        return self.root


class ScriptedChatProvider:
    """Provedor mock que retorna respostas pré-programadas baseadas no número de turnos."""

    name = "mock_scripted"

    def __init__(self, replies: list[ProviderReply]):
        self.replies = list(replies)
        self.call_history: list[dict] = []

    def resolve_model(self, model: str | None) -> str:
        return model or "mock_model:latest"

    async def complete(
        self,
        turns: list[ChatTurn],
        tools: list[ToolSpec],
        model: str | None = None,
        temperature: float = 0.2,
        max_tokens: int = 2048,
        timeout_seconds: float = 60.0,
    ) -> ProviderReply:
        self.call_history.append({"turns": turns, "tools": tools})
        if self.replies:
            return self.replies.pop(0)
        return ProviderReply(content="Análise concluída com sucesso.", model=model or "mock_model")


@pytest.mark.asyncio
async def test_data_scientist_autonomous_execution_with_duckdb(tmp_path):
    sec = SecurityCore()
    sec.permission_engine.register_project(
        "proj-ds", str(tmp_path), mode=ProjectWorkMode.EDIT_APPROVED
    )
    tools = CodingToolExecutor(security_core=sec, workspace_service=MockWorkspaceService(tmp_path))
    broker = ApprovalBroker(approval_engine=sec.approval_engine, audit_trail=sec.audit)
    db = DatabaseManager(str(tmp_path / "jarvis_test.db"))

    # Salva memória prévia do cientista de dados
    db.set_agent_memory(
        agent_role="data_scientist",
        category="metrics",
        key="baseline_accuracy",
        content="O modelo anterior atingiu 89.4% de ROC-AUC",
        importance=0.9,
    )

    # Cria script mock: primeiro chama duckdb_query, depois devolve a síntese final
    call = ToolCall(
        id="call_duck_1",
        name="duckdb_query",
        arguments={"sql": "SELECT 100 as total, 'metrics' as metric"},
    )
    reply1 = ProviderReply(
        content="Calculando métricas analíticas no DuckDB...", tool_calls=[call], model="mock_ds"
    )
    reply2 = ProviderReply(
        content="Conclusão: O DuckDB confirmou total = 100 com sucesso.",
        tool_calls=[],
        model="mock_ds",
    )

    provider = ScriptedChatProvider([reply1, reply2])
    runtime = AutonomousAgentRuntime(
        security_core=sec,
        workspace_service=MockWorkspaceService(tmp_path),
        tools=tools,
        broker=broker,
        db_manager=db,
        provider_factory=lambda: provider,
    )

    config = AutonomousAgentRunConfig(
        agent_role=AgentRole.DATA_SCIENTIST,
        prompt="Analise a volumetria de dados no DuckDB",
        project_id="proj-ds",
        session_id="ses-ds-01",
        mode=AutonomousAgentMode.AUTO,
    )

    events = []
    async for event in runtime.run_stream(config):
        events.append(event)

    types = [e["type"] for e in events]
    assert "start" in types
    assert "thinking" in types
    assert "tool_call" in types
    assert "tool_result" in types
    assert "output_contract" in types
    assert "final" in types

    # Valida eventos de ferramenta
    tool_res = next(e for e in events if e["type"] == "tool_result")
    assert tool_res["name"] == "duckdb_query"
    assert tool_res["success"] is True
    assert "total" in tool_res["output"]

    # Valida que o contrato emitido é do tipo AgentOutputContract
    contract_ev = next(e for e in events if e["type"] == "output_contract")
    contract = AgentOutputContract(**contract_ev["contract"])
    assert contract.agent_role == AgentRole.DATA_SCIENTIST
    assert "total = 100" in contract.summary
    assert len(contract.actions_taken) >= 1

    # Valida injeção de memória prévia no system prompt
    first_call_turns = provider.call_history[0]["turns"]
    system_turn = next(t for t in first_call_turns if t.role == "system")
    assert "baseline_accuracy" in system_turn.content


@pytest.mark.asyncio
async def test_tool_filtering_per_specialist(tmp_path):
    sec = SecurityCore()
    sec.permission_engine.register_project(
        "proj-filter", str(tmp_path), mode=ProjectWorkMode.EDIT_APPROVED
    )
    tools = CodingToolExecutor(security_core=sec, workspace_service=MockWorkspaceService(tmp_path))
    broker = ApprovalBroker(approval_engine=sec.approval_engine, audit_trail=sec.audit)

    provider = ScriptedChatProvider([ProviderReply(content="Pesquisa concluída.")])
    runtime = AutonomousAgentRuntime(
        security_core=sec,
        workspace_service=MockWorkspaceService(tmp_path),
        tools=tools,
        broker=broker,
        provider_factory=lambda: provider,
    )

    # Analista de Pesquisa (perfil analítico, apenas ferramentas de pesquisa/leitura)
    config = AutonomousAgentRunConfig(
        agent_role=AgentRole.RESEARCH_ANALYST,
        prompt="Pesquise sobre as melhores práticas de DuckDB",
        project_id="proj-filter",
        session_id="ses-research",
    )

    contract = await runtime.run_task(config)
    assert contract.agent_role == AgentRole.RESEARCH_ANALYST

    # Verifica que as ferramentas expostas ao modelo eram estritamente as do Analista de Pesquisa
    tools_passed = provider.call_history[0]["tools"]
    tool_names = {t.name for t in tools_passed}
    assert "read_file" in tool_names
    assert "web_search" in tool_names
    # write_file e git_commit NÃO podem estar presentes para o Research Analyst
    assert "write_file" not in tool_names
    assert "git_commit" not in tool_names


@pytest.mark.asyncio
async def test_self_correction_on_tool_failure(tmp_path):
    sec = SecurityCore()
    sec.permission_engine.register_project(
        "proj-sc", str(tmp_path), mode=ProjectWorkMode.EDIT_APPROVED
    )
    tools = CodingToolExecutor(security_core=sec, workspace_service=MockWorkspaceService(tmp_path))
    broker = ApprovalBroker(approval_engine=sec.approval_engine, audit_trail=sec.audit)

    # 1º turno: agente tenta ler arquivo inexistente
    call_fail = ToolCall(id="call_fail_1", name="read_file", arguments={"path": "inexistente.py"})
    reply1 = ProviderReply(content="Vou ler o arquivo inexistente.", tool_calls=[call_fail])

    # 2º turno: agente recebe o erro com instrução de auto-correção e conclui
    reply2 = ProviderReply(
        content="Percebi que o arquivo não existe. Auto-correção aplicada: vou documentar o cenário."
    )

    provider = ScriptedChatProvider([reply1, reply2])
    runtime = AutonomousAgentRuntime(
        security_core=sec,
        workspace_service=MockWorkspaceService(tmp_path),
        tools=tools,
        broker=broker,
        provider_factory=lambda: provider,
    )

    config = AutonomousAgentRunConfig(
        agent_role=AgentRole.SOFTWARE_ARCHITECT,
        prompt="Inspecione o módulo inexistente",
        project_id="proj-sc",
        mode=AutonomousAgentMode.AUTO,
    )

    events = []
    async for ev in runtime.run_stream(config):
        events.append(ev)

    # Valida que o segundo turno recebeu a mensagem de auto-correção
    second_call_turns = provider.call_history[1]["turns"]
    tool_reply = next(t for t in second_call_turns if t.role == "tool")
    assert "Diretriz de Auto-Correção" in tool_reply.content


@pytest.mark.asyncio
async def test_ask_mode_requires_approval_for_write(tmp_path):
    sec = SecurityCore()
    sec.permission_engine.register_project(
        "proj-ask", str(tmp_path), mode=ProjectWorkMode.EDIT_APPROVED
    )
    tools = CodingToolExecutor(security_core=sec, workspace_service=MockWorkspaceService(tmp_path))
    broker = ApprovalBroker(approval_engine=sec.approval_engine, audit_trail=sec.audit)

    call_write = ToolCall(
        id="call_w_1", name="write_file", arguments={"path": "novo.py", "content": "print('novo')"}
    )
    reply1 = ProviderReply(content="Gravando novo arquivo...", tool_calls=[call_write])
    reply2 = ProviderReply(content="Arquivo criado.")

    provider = ScriptedChatProvider([reply1, reply2])
    runtime = AutonomousAgentRuntime(
        security_core=sec,
        workspace_service=MockWorkspaceService(tmp_path),
        tools=tools,
        broker=broker,
        provider_factory=lambda: provider,
    )

    config = AutonomousAgentRunConfig(
        agent_role=AgentRole.BACKEND_DEVELOPER,
        prompt="Crie novo arquivo",
        project_id="proj-ask",
        mode=AutonomousAgentMode.ASK,
    )

    # Executa em tarefa assíncrona para aprovar durante a espera
    async def run_and_approve():
        events = []
        async for ev in runtime.run_stream(config):
            events.append(ev)
            if ev.get("type") == "approval_required":
                # Operador humano aprova no ApprovalCenter
                app_id = ev["approval_id"]
                broker.decide(app_id, approved=True, decided_by="human_operator")
        return events

    events = await run_and_approve()
    assert any(e["type"] == "approval_required" for e in events)
    assert any(e["type"] == "tool_result" and e["success"] is True for e in events)
    assert (tmp_path / "novo.py").exists()
    approval_id = next(e["approval_id"] for e in events if e["type"] == "approval_required")
    assert sec.approval_engine.get_request(approval_id).status.value == "consumed"


@pytest.mark.asyncio
async def test_cybersecurity_engineer_scans_secrets_and_reports(tmp_path):
    sec = SecurityCore()
    sec.permission_engine.register_project(
        "proj-sec", str(tmp_path), mode=ProjectWorkMode.EDIT_APPROVED
    )
    tools = CodingToolExecutor(security_core=sec, workspace_service=MockWorkspaceService(tmp_path))
    broker = ApprovalBroker(approval_engine=sec.approval_engine, audit_trail=sec.audit)

    # Cria arquivo com credencial simulada no projeto
    secret_file = tmp_path / "credentials.env"
    secret_file.write_text("AWS_SECRET_KEY=AKIAIOSFODNN7EXAMPLE123\n")

    call = ToolCall(id="call_sec_1", name="scan_secrets", arguments={})
    reply1 = ProviderReply(content="Varrendo repositório por credenciais...", tool_calls=[call])
    reply2 = ProviderReply(
        content="Identificada chave AWS exposta. Recomendada revogação imediata."
    )

    provider = ScriptedChatProvider([reply1, reply2])
    runtime = AutonomousAgentRuntime(
        security_core=sec,
        workspace_service=MockWorkspaceService(tmp_path),
        tools=tools,
        broker=broker,
        provider_factory=lambda: provider,
    )

    config = AutonomousAgentRunConfig(
        agent_role=AgentRole.CYBERSECURITY_ENGINEER,
        prompt="Audite credenciais e segredos no repositório",
        project_id="proj-sec",
        mode=AutonomousAgentMode.AUTO,
    )

    contract = await runtime.run_task(config)
    assert contract.agent_role == AgentRole.CYBERSECURITY_ENGINEER
    assert len(contract.actions_taken) >= 1
    assert any("scan_secrets" in a for a in contract.actions_taken)


@pytest.mark.asyncio
async def test_plan_mode_blocks_mutations_and_warns(tmp_path):
    sec = SecurityCore()
    sec.permission_engine.register_project(
        "proj-plan", str(tmp_path), mode=ProjectWorkMode.EDIT_APPROVED
    )
    tools = CodingToolExecutor(security_core=sec, workspace_service=MockWorkspaceService(tmp_path))
    broker = ApprovalBroker(approval_engine=sec.approval_engine, audit_trail=sec.audit)

    call = ToolCall(
        id="call_mut_1", name="write_file", arguments={"path": "bad.txt", "content": "hello"}
    )
    reply1 = ProviderReply(content="Tentando gravar no modo PLAN...", tool_calls=[call])
    reply2 = ProviderReply(content="Compreendido. No modo PLAN apenas gero o plano.")

    provider = ScriptedChatProvider([reply1, reply2])
    runtime = AutonomousAgentRuntime(
        security_core=sec,
        workspace_service=MockWorkspaceService(tmp_path),
        tools=tools,
        broker=broker,
        provider_factory=lambda: provider,
    )

    config = AutonomousAgentRunConfig(
        agent_role=AgentRole.SOFTWARE_ARCHITECT,
        prompt="Gere plano e grave arquivo",
        project_id="proj-plan",
        mode=AutonomousAgentMode.PLAN,
    )

    events = []
    async for ev in runtime.run_stream(config):
        events.append(ev)

    tool_res = next(e for e in events if e["type"] == "tool_result")
    assert tool_res["denied"] is True
    assert "estritamente de leitura" in tool_res["error"]
    assert not (tmp_path / "bad.txt").exists()
