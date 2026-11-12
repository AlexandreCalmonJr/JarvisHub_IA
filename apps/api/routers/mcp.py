"""API de gestão do cliente MCP (Model Context Protocol)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from apps.api.auth import Principal, get_principal, require_admin
from apps.api.deps import coding_tools, mcp_service

router = APIRouter(tags=["mcp"])


@router.get("/api/v1/mcp/status")
async def mcp_status(principal: Principal = Depends(get_principal)):
    """Estado dos servidores MCP configurados e ferramentas descobertas."""
    return mcp_service.status()


@router.post("/api/v1/mcp/reload")
async def mcp_reload(principal: Principal = Depends(require_admin)):
    """Recarrega servidores, descobre ferramentas e registra no Coding Agent."""
    summary = await mcp_service.discover(executor=coding_tools)
    return {**summary, "status": mcp_service.status()}
