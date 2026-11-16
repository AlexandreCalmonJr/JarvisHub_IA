"""Testes unitários para o pacote apps/cli/ (TUI Interativo estilo Claude Code)."""

import pytest

from apps.cli.client import JarvisClient
from apps.cli.main import handle_slash_command
from apps.cli.session import format_prompt
from apps.cli.ui import render_diff, render_markdown, render_tool_call, render_tool_result


def test_jarvis_client_initialization_and_headers():
    client = JarvisClient(base_url="http://localhost:8000", token="test_token_123")
    assert client.base_url == "http://localhost:8000"
    assert client.headers["Authorization"] == "Bearer test_token_123"
    assert client.headers["Content-Type"] == "application/json"


def test_ui_components_render_without_exceptions():
    # Testa renderizadores visuais do Rich
    render_markdown("# Título de Teste\nEste é um markdown.")
    render_diff("--- a/f.py\n+++ b/f.py\n@@ -1 +1 @@\n-old\n+new", filename="f.py")
    render_tool_call("read_file", {"path": "main.py"})
    render_tool_result("read_file", True, "Conteúdo lido com sucesso.", duration_ms=12.5)
    render_tool_result("write_file", False, "Permissão negada.")


def test_format_prompt():
    prompt_html = format_prompt(mode="ask", project_id="proj-alpha")
    formatted_str = prompt_html.formatted_text
    # Garante que as tags HTML estão presentes
    assert any("jarvis" in str(item) for item in formatted_str)
    assert any("proj-alpha" in str(item) for item in formatted_str)


@pytest.mark.asyncio
async def test_slash_command_mode_and_help():
    client = JarvisClient(base_url="http://localhost:8000", token="mock")
    state = {"mode": "ask", "project_id": "test-p", "session_id": "s-1"}

    # /help deve retornar True (continua no loop)
    cont = await handle_slash_command("/help", client, state)
    assert cont is True

    # /mode auto deve atualizar o estado
    cont = await handle_slash_command("/mode auto", client, state)
    assert cont is True
    assert state["mode"] == "auto"

    # /mode plan deve atualizar para plan
    cont = await handle_slash_command("/mode plan", client, state)
    assert cont is True
    assert state["mode"] == "plan"

    # /exit deve retornar False (encerra o loop)
    cont = await handle_slash_command("/exit", client, state)
    assert cont is False
