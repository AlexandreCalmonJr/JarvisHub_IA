"""Gerenciador de entrada e sessão REPL com prompt_toolkit."""

from __future__ import annotations

from pathlib import Path

from prompt_toolkit import PromptSession
from prompt_toolkit.completion import WordCompleter
from prompt_toolkit.formatted_text import HTML
from prompt_toolkit.history import FileHistory

SLASH_COMMANDS = [
    "/help",
    "/mode plan",
    "/mode ask",
    "/mode auto",
    "/compact",
    "/teammates",
    "/status",
    "/clear",
    "/exit",
    "/quit",
]


def create_cli_session() -> PromptSession:
    """Cria uma sessão interativa com autocompletion e histórico persistente."""
    history_dir = Path.home() / ".jarvis"
    history_dir.mkdir(parents=True, exist_ok=True)
    history_file = history_dir / "cli_history"

    completer = WordCompleter(SLASH_COMMANDS, ignore_case=True, sentence=True)

    return PromptSession(
        history=FileHistory(str(history_file)),
        completer=completer,
        complete_while_typing=True,
    )


def format_prompt(mode: str = "ask", project_id: str = "default") -> HTML:
    """Gera um prompt estilizado em cores dinâmicas."""
    mode_color = "#00ff88" if mode == "ask" else ("#ffcc00" if mode == "auto" else "#00ffff")
    return HTML(
        f"<ansicyan><b>jarvis</b></ansicyan> [<ansigreen>{project_id}</ansigreen>] "
        f"[<style fg='{mode_color}'><b>{mode}</b></style>] <b>❯</b> "
    )
