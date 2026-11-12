"""Descoberta e registro de servidores MCP no Coding Agent.

Configuração (opcional) em ``data/mcp_servers.json``::

    {
      "servers": [
        {
          "id": "filesystem",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
          "enabled": true,
          "risk": "exec",
          "requires_approval": true
        }
      ]
    }

Sem o arquivo, nenhum processo é iniciado e o sistema permanece 100% local e
sem dependências externas.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from services.coding_agent.tools import CodingToolExecutor
from services.coding_agent.types import ToolResult, ToolSpec

from .client import McpError, McpStdioClient
from .types import McpServerConfig, McpToolInfo

logger = logging.getLogger("jarvis.mcp.service")

TOOL_PREFIX = "mcp__"


def _slug(value: str, max_length: int = 40) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", value or "").strip("_").lower()
    return (cleaned or "tool")[:max_length]


class McpService:
    """Carrega configuração, descobre ferramentas e as registra no executor."""

    def __init__(self, config_path: Path | str | None = None):
        self.config_path = Path(config_path) if config_path else None
        self.servers: list[McpServerConfig] = []
        self.clients: dict[str, McpStdioClient] = {}
        self.tools: dict[str, McpToolInfo] = {}
        self.last_error: str | None = None
        self._loaded = False

    # ------------------------------------------------------------------
    # Configuração
    # ------------------------------------------------------------------
    def load(self) -> list[McpServerConfig]:
        self._loaded = True
        self.servers = []
        if self.config_path is None or not self.config_path.exists():
            return self.servers
        try:
            data = json.loads(self.config_path.read_text(encoding="utf-8"))
        except Exception as exc:
            self.last_error = f"Configuração MCP inválida: {exc}"
            logger.warning(self.last_error)
            return self.servers

        raw_servers = data.get("servers") if isinstance(data, dict) else data
        for raw in raw_servers or []:
            try:
                config = McpServerConfig(**raw)
            except Exception as exc:
                logger.warning("Servidor MCP ignorado (%s): %s", raw, exc)
                continue
            if config.enabled:
                self.servers.append(config)
        return self.servers

    def _configs(self) -> list[McpServerConfig]:
        if not self._loaded:
            self.load()
        return self.servers

    # ------------------------------------------------------------------
    # Descoberta
    # ------------------------------------------------------------------
    async def discover(self, executor: CodingToolExecutor | None = None) -> dict[str, Any]:
        """Inicia servidores configurados, lista ferramentas e registra no executor."""
        self.last_error = None
        discovered: dict[str, McpToolInfo] = {}
        errors: dict[str, str] = {}

        if executor is not None:
            executor.remove_external_tools(TOOL_PREFIX)

        for config in self._configs():
            client = self.clients.get(config.id)
            if client is None:
                client = McpStdioClient(config)
                self.clients[config.id] = client
            try:
                tools = await client.list_tools()
            except McpError as exc:
                errors[config.id] = str(exc)
                logger.warning("Falha ao descobrir ferramentas MCP em %s: %s", config.id, exc)
                continue
            except Exception as exc:
                errors[config.id] = str(exc)
                logger.exception("Erro inesperado no MCP %s", config.id)
                continue

            for tool in tools:
                spec_name = f"{TOOL_PREFIX}{_slug(config.id)}__{_slug(tool.name)}"
                discovered[spec_name] = tool
                if executor is not None:
                    spec = ToolSpec(
                        name=spec_name,
                        description=f"[MCP:{config.id}] {tool.description or tool.name}",
                        parameters=tool.input_schema or {"type": "object", "properties": {}},
                        risk=config.risk,
                        requires_approval=config.requires_approval,
                    )
                    executor.register_external_tool(
                        spec,
                        self._make_handler(config.id, tool.name, spec_name),
                    )

        self.tools = discovered
        if errors and not discovered:
            self.last_error = "; ".join(f"{sid}: {msg}" for sid, msg in errors.items())
        return {
            "servers": len(self._configs()),
            "tools": len(discovered),
            "errors": errors,
            "registered": sorted(discovered.keys()),
        }

    def _make_handler(self, server_id: str, tool_name: str, spec_name: str):
        async def _handler(arguments: dict[str, Any]) -> ToolResult:
            client = self.clients.get(server_id)
            if client is None:
                return ToolResult(
                    call_id="",
                    name=spec_name,
                    success=False,
                    error=f"Servidor MCP '{server_id}' não está disponível.",
                )
            outcome = await client.call_tool(tool_name, arguments or {})
            return ToolResult(
                call_id="",
                name=spec_name,
                success=outcome.success,
                output=outcome.output,
                error=outcome.error,
            )

        return _handler

    # ------------------------------------------------------------------
    # Estado
    # ------------------------------------------------------------------
    def status(self) -> dict[str, Any]:
        configs = self._configs()
        return {
            "config_path": str(self.config_path) if self.config_path else None,
            "configured": len(configs),
            "connected": sum(
                1 for c in configs if self.clients.get(c.id) and self.clients[c.id].running
            ),
            "tools": sorted(self.tools.keys()),
            "servers": [
                {
                    "id": config.id,
                    "command": config.command,
                    "args": list(config.args),
                    "enabled": config.enabled,
                    "risk": config.risk.value,
                    "requires_approval": config.requires_approval,
                    "running": bool(
                        self.clients.get(config.id) and self.clients[config.id].running
                    ),
                }
                for config in configs
            ],
            "last_error": self.last_error,
        }

    async def close(self) -> None:
        for client in list(self.clients.values()):
            await client.close()
        self.clients.clear()
        self.tools.clear()
