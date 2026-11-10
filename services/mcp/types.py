"""Tipos do cliente MCP (Model Context Protocol)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from services.coding_agent.types import ToolRisk


class McpServerConfig(BaseModel):
    """Servidor MCP declarado em ``data/mcp_servers.json``."""

    id: str
    command: str
    args: list[str] = Field(default_factory=list)
    env: dict[str, str] = Field(default_factory=dict)
    cwd: str | None = None
    enabled: bool = True
    risk: ToolRisk = ToolRisk.EXEC
    requires_approval: bool = True
    timeout_seconds: float = 60.0


class McpToolInfo(BaseModel):
    """Ferramenta descoberta via ``tools/list``."""

    server_id: str
    name: str
    description: str = ""
    input_schema: dict[str, Any] = Field(default_factory=dict)


class McpToolOutcome(BaseModel):
    """Resultado normalizado de ``tools/call``."""

    success: bool
    output: str = ""
    error: str | None = None
