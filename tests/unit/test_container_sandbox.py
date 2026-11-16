from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from services.security_core import SecurityCore
from services.tool_gateway import ContainerSandbox, SubprocessSandbox, ToolGateway


def test_container_sandbox_builds_expected_isolation_flags(tmp_path: Path):
    sandbox = ContainerSandbox(
        image="python:3.12-slim",
        memory_limit="256m",
        cpus=0.5,
        network="none",
    )
    args = sandbox.build_container_args(["python", "script.py"], cwd=tmp_path)
    assert args[0] == "docker"
    assert args[1:4] == ["run", "--rm", "-i"]
    assert "--network=none" in args
    assert "--memory=256m" in args
    assert "--cpus=0.5" in args
    assert "-w" in args
    assert "/workspace" in args
    assert "python:3.12-slim" in args
    assert args[-2:] == ["python", "script.py"]


@pytest.mark.asyncio
async def test_container_sandbox_fallback_to_subprocess(tmp_path: Path):
    sandbox = ContainerSandbox(enable_fallback=True)
    # Garante que is_available retorna False (sem docker)
    sandbox._available = False

    code, stdout, stderr, dur = await sandbox.run_command(
        ["python", "-c", "print('hello from subprocess fallback')"], cwd=tmp_path
    )
    assert code == 0
    assert "hello from subprocess fallback" in stdout
    assert dur > 0


@pytest.mark.asyncio
async def test_container_sandbox_raises_when_fallback_disabled(tmp_path: Path):
    sandbox = ContainerSandbox(enable_fallback=False)
    sandbox._available = False

    with pytest.raises(
        RuntimeError, match="indisponível e fallback para subprocesso está desativado"
    ):
        await sandbox.run_command(["echo", "test"], cwd=tmp_path)


@pytest.mark.asyncio
async def test_container_sandbox_executes_in_container_when_available(tmp_path: Path, monkeypatch):
    sandbox = ContainerSandbox()
    sandbox._available = True
    sandbox._container_cli = "docker"

    executed_commands = []

    async def mock_super_run(cmd, cwd, timeout_seconds=None):
        executed_commands.append(cmd)
        return 0, "mocked container output", "", 10.0

    monkeypatch.setattr(SubprocessSandbox, "run_command", AsyncMock(side_effect=mock_super_run))

    code, out, _, _ = await sandbox.run_command(["pytest", "-v"], cwd=tmp_path)
    assert code == 0
    assert out == "mocked container output"
    assert len(executed_commands) == 1
    assert executed_commands[0][0] == "docker"
    assert "pytest" in executed_commands[0]


def test_tool_gateway_instantiates_container_sandbox_from_env(monkeypatch):
    monkeypatch.setenv("JARVIS_SANDBOX_DRIVER", "container")
    gw = ToolGateway(security_core=SecurityCore())
    assert isinstance(gw.sandbox, ContainerSandbox)
