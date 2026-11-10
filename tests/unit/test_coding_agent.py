from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from services.coding_agent import (
    AgentMode,
    AgentRunConfig,
    ApprovalBroker,
    ChatTurn,
    CodingAgentRuntime,
    CodingToolExecutor,
    ProviderReply,
    ToolCall,
    ToolSpec,
)
from services.coding_agent.providers import to_anthropic_messages, to_openai_messages
from services.memory import DatabaseManager
from services.project_workspace import ProjectWorkspaceService
from services.security_core import (
    PermissionDeniedError,
    SecurityCore,
    UnauthorizedApprovalError,
)


class FakeProvider:
    """Provedor determinístico que devolve respostas pré-programadas."""

    name = "fake"
    default_model = "fake-coder"

    def __init__(self, replies: list[ProviderReply]):
        self.replies = list(replies)
        self.calls: list[dict] = []

    def resolve_model(self, requested: str | None) -> str:
        return (requested or "").strip() or self.default_model

    async def complete(self, **kwargs) -> ProviderReply:
        self.calls.append(kwargs)
        if self.replies:
            return self.replies.pop(0)
        return ProviderReply(content="Fim.", model=self.default_model)


def _workspace_with_project(tmp_path: Path, project_id: str = "demo") -> tuple[SecurityCore, ProjectWorkspaceService, Path]:
    root = tmp_path / project_id
    root.mkdir(parents=True)
    (root / "README.md").write_text("# Demo\n", encoding="utf-8")
    (root / "app.py").write_text("def soma(a, b):\n    return a + b\n", encoding="utf-8")
    security = SecurityCore()
    workspace = ProjectWorkspaceService(security_core=security, base_dir=tmp_path)
    security.permission_engine.register_project(project_id, str(root))
    return security, workspace, root


def _collect(agen):
    async def _run():
        return [event async for event in agen]

    return asyncio.run(_run())


class TestTools:
    def test_read_list_glob_grep(self, tmp_path: Path):
        security, workspace, _ = _workspace_with_project(tmp_path)
        executor = CodingToolExecutor(security, workspace)

        read = asyncio.run(
            executor.execute(ToolCall(id="1", name="read_file", arguments={"path": "app.py"}), "demo")
        )
        assert read.success and "def soma" in read.output

        listing = asyncio.run(
            executor.execute(ToolCall(id="2", name="list_directory", arguments={}), "demo")
        )
        assert listing.success and "app.py" in listing.output

        found = asyncio.run(
            executor.execute(
                ToolCall(id="3", name="grep", arguments={"pattern": "soma", "include": "*.py"}),
                "demo",
            )
        )
        assert found.success and "app.py" in found.output

        globbed = asyncio.run(
            executor.execute(ToolCall(id="4", name="glob", arguments={"pattern": "**/*.py"}), "demo")
        )
        assert globbed.success and "app.py" in globbed.output

    def test_blocks_path_traversal_and_absolute_paths(self, tmp_path: Path):
        security, workspace, _ = _workspace_with_project(tmp_path)
        executor = CodingToolExecutor(security, workspace)

        with pytest.raises(PermissionDeniedError):
            asyncio.run(
                executor.execute(
                    ToolCall(id="1", name="read_file", arguments={"path": "../segredo.txt"}),
                    "demo",
                )
            )
        with pytest.raises(PermissionDeniedError):
            asyncio.run(
                executor.execute(
                    ToolCall(id="2", name="read_file", arguments={"path": "C:/Windows/win.ini"}),
                    "demo",
                )
            )

    def test_blocks_dangerous_shell_commands(self, tmp_path: Path):
        security, workspace, _ = _workspace_with_project(tmp_path)
        executor = CodingToolExecutor(security, workspace)

        call = ToolCall(id="1", name="run_command", arguments={"command": "rm -rf /"})
        with pytest.raises(PermissionDeniedError):
            executor.preview(call, "demo")
        with pytest.raises(PermissionDeniedError):
            asyncio.run(executor.execute(call, "demo"))

    def test_write_and_edit_generate_diff_and_backup(self, tmp_path: Path):
        security, workspace, root = _workspace_with_project(tmp_path)
        executor = CodingToolExecutor(security, workspace)

        write = asyncio.run(
            executor.execute(
                ToolCall(
                    id="1",
                    name="write_file",
                    arguments={"path": "novo.py", "content": "x = 1\n"},
                ),
                "demo",
            )
        )
        assert write.success and write.changed_files == ["novo.py"]
        assert (root / "novo.py").read_text(encoding="utf-8") == "x = 1\n"

        edit = asyncio.run(
            executor.execute(
                ToolCall(
                    id="2",
                    name="edit_file",
                    arguments={"path": "novo.py", "old_string": "x = 1", "new_string": "x = 2"},
                ),
                "demo",
            )
        )
        assert edit.success
        assert (root / "novo.py").read_text(encoding="utf-8") == "x = 2\n"
        assert (root / "novo.py.bak").exists()

    def test_preview_rejects_invalid_edit(self, tmp_path: Path):
        security, workspace, _ = _workspace_with_project(tmp_path)
        executor = CodingToolExecutor(security, workspace)

        with pytest.raises(ValueError):
            executor.preview(
                ToolCall(
                    id="1",
                    name="edit_file",
                    arguments={
                        "path": "app.py",
                        "old_string": "nao_existe",
                        "new_string": "algo",
                    },
                ),
                "demo",
            )


class TestBroker:
    def test_human_approval_resolves_waiting_ticket(self):
        engine_core = SecurityCore()
        broker = ApprovalBroker(engine_core.approval_engine)

        async def scenario():
            ticket = broker.create(
                task_id="t1",
                agent_role="backend_developer",
                operation="WRITE_FILE",
                impact_summary="Criar arquivo",
                affected_resources=["a.py"],
            )
            asyncio.get_running_loop().call_soon(
                lambda: broker.decide(
                    ticket.request_id,
                    approved=True,
                    decided_by="humano_local",
                    reason="ok",
                )
            )
            return await broker.wait(ticket, timeout_seconds=2)

        result = asyncio.run(scenario())
        assert result.approved is True
        assert result.decided_by == "humano_local"

    def test_agent_cannot_self_approve(self):
        engine_core = SecurityCore()
        broker = ApprovalBroker(engine_core.approval_engine)
        ticket = broker.create(
            task_id="t1",
            agent_role="backend_developer",
            operation="RUN_COMMAND",
            impact_summary="Executar testes",
        )
        with pytest.raises(UnauthorizedApprovalError):
            broker.decide(
                ticket.request_id,
                approved=True,
                decided_by="backend_developer",
                reason="auto",
            )

    def test_timeout_rejects_request(self):
        engine_core = SecurityCore()
        broker = ApprovalBroker(engine_core.approval_engine)
        ticket = broker.create(
            task_id="t1",
            agent_role="backend_developer",
            operation="WRITE_FILE",
            impact_summary="Criar arquivo",
        )
        result = asyncio.run(broker.wait(ticket, timeout_seconds=1))
        assert result.timed_out is True
        assert result.approved is False
        assert engine_core.approval_engine.get_request(ticket.request_id).status.value == "rejected"


class TestRuntime:
    def _runtime(self, tmp_path: Path, provider: FakeProvider):
        security, workspace, root = _workspace_with_project(tmp_path)
        db = DatabaseManager(str(tmp_path / "jarvis_test.db"))
        executor = CodingToolExecutor(security, workspace)
        broker = ApprovalBroker(security.approval_engine)
        runtime = CodingAgentRuntime(
            security_core=security,
            workspace_service=workspace,
            tools=executor,
            broker=broker,
            db_manager=db,
            provider_factory=lambda: provider,
        )
        return runtime, broker, db, root

    def test_auto_mode_writes_file_and_persists_history(self, tmp_path: Path):
        provider = FakeProvider(
            [
                ProviderReply(
                    content="",
                    tool_calls=[
                        ToolCall(
                            id="call_1",
                            name="write_file",
                            arguments={"path": "hello.py", "content": "print('oi')\n"},
                        )
                    ],
                ),
                ProviderReply(content="Arquivo hello.py criado com sucesso."),
            ]
        )
        runtime, _, db, root = self._runtime(tmp_path, provider)
        config = AgentRunConfig(
            prompt="Crie hello.py",
            project_id="demo",
            session_id="sess-1",
            mode=AgentMode.AUTO,
        )
        events = _collect(runtime.run(config))

        assert (root / "hello.py").exists()
        assert [e["type"] for e in events][0] == "start"
        assert any(e["type"] == "tool_result" and e["success"] for e in events)
        final = [e for e in events if e["type"] == "final"][0]
        assert final["is_completed"] is True
        assert "hello.py" in final["changed_files"]

        rows = db.list_chat_messages("sess-1")
        roles = [r["role"] for r in rows]
        assert roles == ["user", "assistant", "tool", "assistant"]
        assert rows[1]["tool_calls"][0]["name"] == "write_file"

    def test_ask_mode_waits_for_approval_then_executes(self, tmp_path: Path):
        provider = FakeProvider(
            [
                ProviderReply(
                    content="",
                    tool_calls=[
                        ToolCall(
                            id="call_1",
                            name="write_file",
                            arguments={"path": "aprovado.py", "content": "ok = True\n"},
                        )
                    ],
                ),
                ProviderReply(content="Feito."),
            ]
        )
        runtime, broker, _, root = self._runtime(tmp_path, provider)
        config = AgentRunConfig(
            prompt="Crie aprovado.py",
            project_id="demo",
            session_id="sess-2",
            mode=AgentMode.ASK,
        )

        async def scenario():
            events = []
            async for event in runtime.run(config):
                events.append(event)
                if event["type"] == "approval_required":
                    broker.decide(
                        event["approval_id"],
                        approved=True,
                        decided_by="humano_local",
                        reason="Aprovado no teste",
                    )
            return events

        events = asyncio.run(scenario())
        assert (root / "aprovado.py").exists()
        assert any(e["type"] == "approval_required" for e in events)
        assert not any(e.get("denied") for e in events if e["type"] == "tool_result")

    def test_ask_mode_rejection_prevents_write(self, tmp_path: Path):
        provider = FakeProvider(
            [
                ProviderReply(
                    content="",
                    tool_calls=[
                        ToolCall(
                            id="call_1",
                            name="write_file",
                            arguments={"path": "negado.py", "content": "x = 1\n"},
                        )
                    ],
                ),
                ProviderReply(content="Operação cancelada."),
            ]
        )
        runtime, broker, _, root = self._runtime(tmp_path, provider)
        config = AgentRunConfig(
            prompt="Crie negado.py",
            project_id="demo",
            session_id="sess-3",
            mode=AgentMode.ASK,
        )

        async def scenario():
            events = []
            async for event in runtime.run(config):
                events.append(event)
                if event["type"] == "approval_required":
                    broker.decide(
                        event["approval_id"],
                        approved=False,
                        decided_by="humano_local",
                        reason="Não autorizado",
                    )
            return events

        events = asyncio.run(scenario())
        assert not (root / "negado.py").exists()
        denied = [e for e in events if e["type"] == "tool_result" and e["denied"]]
        assert denied and "Não autorizado" in (denied[0]["error"] or "")

    def test_plan_mode_blocks_write_tools(self, tmp_path: Path):
        provider = FakeProvider(
            [
                ProviderReply(
                    content="",
                    tool_calls=[
                        ToolCall(
                            id="call_1",
                            name="write_file",
                            arguments={"path": "bloqueado.py", "content": "x = 1\n"},
                        )
                    ],
                ),
                ProviderReply(content="Plano proposto sem escrita."),
            ]
        )
        runtime, _, _, root = self._runtime(tmp_path, provider)
        config = AgentRunConfig(
            prompt="Planeje a criação de bloqueado.py",
            project_id="demo",
            session_id="sess-4",
            mode=AgentMode.PLAN,
        )
        events = _collect(runtime.run(config))

        assert not (root / "bloqueado.py").exists()
        assert any(e["type"] == "tool_result" and e["denied"] for e in events)
        # Ferramentas de escrita nem sequer são oferecidas ao modelo no modo plan
        offered = {tool.name for tool in provider.calls[0]["tools"]}
        assert "write_file" not in offered and "run_command" not in offered


class TestGitCommitTool:
    def _git(self, root: Path, *args: str) -> str:
        import subprocess

        result = subprocess.run(
            ["git", *args], cwd=root, capture_output=True, text=True, timeout=30
        )
        assert result.returncode == 0, result.stderr
        return result.stdout

    @pytest.mark.skipif(__import__("shutil").which("git") is None, reason="git ausente")
    def test_git_commit_requires_approval_and_excludes_backups(self, tmp_path: Path):
        security, workspace, root = _workspace_with_project(tmp_path)
        self._git(root, "init")
        self._git(root, "config", "user.email", "dev@example.com")
        self._git(root, "config", "user.name", "Dev Local")
        (root / "app.py.bak").write_text("backup\n", encoding="utf-8")

        executor = CodingToolExecutor(security, workspace)
        call = ToolCall(
            id="1",
            name="git_commit",
            arguments={"message": 'teste "commit" com aspas'},
        )

        preview = executor.preview(call, "demo")
        assert preview is not None
        assert preview["operation"] == "GIT_COMMIT"
        assert preview["reversible"] is False

        result = asyncio.run(executor.execute(call, "demo"))
        assert result.success, result.error
        log = self._git(root, "log", "--oneline")
        assert "teste commit com aspas" in log
        tracked = self._git(root, "ls-files")
        assert "app.py" in tracked
        assert "app.py.bak" not in tracked

    def test_git_commit_rejects_empty_message(self, tmp_path: Path):
        security, workspace, _ = _workspace_with_project(tmp_path)
        executor = CodingToolExecutor(security, workspace)
        call = ToolCall(id="1", name="git_commit", arguments={"message": "   "})
        with pytest.raises(ValueError):
            executor.preview(call, "demo")


class TestProviderConversion:
    def test_openai_history_includes_tool_calls_and_results(self):
        turns = [
            ChatTurn(role="system", content="sys"),
            ChatTurn(role="user", content="pedido"),
            ChatTurn(
                role="assistant",
                content="vou ler",
                tool_calls=[ToolCall(id="c1", name="read_file", arguments={"path": "a.py"})],
            ),
            ChatTurn(role="tool", content="conteúdo", tool_call_id="c1", tool_name="read_file"),
        ]
        messages = to_openai_messages(turns)
        assert messages[0] == {"role": "system", "content": "sys"}
        assert messages[2]["tool_calls"][0]["function"]["name"] == "read_file"
        assert messages[3] == {"role": "tool", "tool_call_id": "c1", "content": "conteúdo"}

    def test_anthropic_merges_tool_results_in_user_blocks(self):
        turns = [
            ChatTurn(role="system", content="sys"),
            ChatTurn(role="user", content="pedido"),
            ChatTurn(
                role="assistant",
                content="",
                tool_calls=[
                    ToolCall(id="c1", name="read_file", arguments={"path": "a.py"}),
                    ToolCall(id="c2", name="read_file", arguments={"path": "b.py"}),
                ],
            ),
            ChatTurn(role="tool", content="A", tool_call_id="c1", tool_name="read_file"),
            ChatTurn(role="tool", content="B", tool_call_id="c2", tool_name="read_file"),
        ]
        system, messages = to_anthropic_messages(turns)
        assert system == "sys"
        assert messages[-1]["role"] == "user"
        assert [b["type"] for b in messages[-1]["content"]] == ["tool_result", "tool_result"]
        assert messages[-2]["content"][0]["type"] == "tool_use"
