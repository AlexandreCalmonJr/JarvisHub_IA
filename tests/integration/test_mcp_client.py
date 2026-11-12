"""Testes de integração do cliente MCP via stdio (JSON-RPC)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

from services.coding_agent import CodingToolExecutor, ToolCall
from services.mcp import McpService
from services.security_core import SecurityCore

FAKE_SERVER = r"""
import json
import sys

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        message = json.loads(line)
    except json.JSONDecodeError:
        continue
    method = message.get("method")
    if method == "initialize":
        result = {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "fake-mcp", "version": "1.0.0"},
        }
    elif method == "tools/list":
        result = {
            "tools": [
                {
                    "name": "echo",
                    "description": "Repete o texto recebido.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {"text": {"type": "string"}},
                        "required": ["text"],
                    },
                }
            ]
        }
    elif method == "tools/call":
        arguments = message.get("params", {}).get("arguments", {})
        result = {"content": [{"type": "text", "text": "echo:" + str(arguments.get("text"))}]}
    else:
        result = {}
    if "id" in message:
        print(json.dumps({"jsonrpc": "2.0", "id": message["id"], "result": result}), flush=True)
"""


def _write_config(tmp_path: Path, script: Path, server_id: str = "fake") -> Path:
    config = {
        "servers": [
            {
                "id": server_id,
                "command": sys.executable,
                "args": [str(script)],
                "risk": "exec",
                "requires_approval": True,
            }
        ]
    }
    path = tmp_path / "mcp_servers.json"
    path.write_text(json.dumps(config), encoding="utf-8")
    return path


@pytest.mark.asyncio
async def test_mcp_discovery_registers_tool_and_executes_it(tmp_path):
    script = tmp_path / "fake_mcp_server.py"
    script.write_text(FAKE_SERVER, encoding="utf-8")
    config_path = _write_config(tmp_path, script)

    executor = CodingToolExecutor(security_core=SecurityCore(), workspace_service=None)
    service = McpService(config_path=config_path)
    try:
        summary = await service.discover(executor=executor)
        assert summary["servers"] == 1
        assert summary["tools"] == 1
        assert summary["registered"] == ["mcp__fake__echo"]

        spec = executor.get_spec("mcp__fake__echo")
        assert spec is not None
        assert spec.requires_approval is True
        assert "Repete o texto" in spec.description

        preview = executor.preview(
            ToolCall(id="c1", name="mcp__fake__echo", arguments={"text": "oi"}), "demo"
        )
        assert preview is not None
        assert preview["operation"] == "MCP_CALL"

        result = await executor.execute(
            ToolCall(id="c1", name="mcp__fake__echo", arguments={"text": "oi"}), "demo"
        )
        assert result.success, result.error
        assert result.output == "echo:oi"

        status = service.status()
        assert status["configured"] == 1
        assert status["connected"] == 1
        assert "mcp__fake__echo" in status["tools"]
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_mcp_missing_command_reports_error_without_crashing(tmp_path):
    config = {
        "servers": [
            {
                "id": "missing",
                "command": "jarvis-comando-inexistente-xyz",
                "args": [],
            }
        ]
    }
    config_path = tmp_path / "mcp_servers.json"
    config_path.write_text(json.dumps(config), encoding="utf-8")

    service = McpService(config_path=config_path)
    executor = CodingToolExecutor(security_core=SecurityCore(), workspace_service=None)
    try:
        summary = await service.discover(executor=executor)
        assert summary["tools"] == 0
        assert "missing" in summary["errors"]
        assert service.status()["last_error"]
    finally:
        await service.close()


def test_mcp_without_config_is_noop(tmp_path):
    service = McpService(config_path=tmp_path / "nao_existe.json")
    assert service.load() == []
    assert service.status()["configured"] == 0
