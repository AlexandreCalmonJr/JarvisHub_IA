"""Componentes visuais e renderizador TUI para o JARVIS CLI usando Rich."""

from __future__ import annotations

from typing import Any

from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.syntax import Syntax
from rich.table import Table
from rich.text import Text

console = Console()


def print_banner(version: str = "3.0.0", mode: str = "ask", project_id: str = "default") -> None:
    """Renderiza o banner de boas-vindas do JARVIS CLI com status pills."""
    title_text = Text()
    title_text.append("⚡ JARVIS AI HUB ", style="bold cyan")
    title_text.append(f"• CLI v{version}", style="dim")
    title_text.append("\nAssistente Soberano de Engenharia e Operações Autônomas\n", style="italic")

    status_table = Table.grid(padding=(0, 2))
    status_table.add_column(style="bold")
    status_table.add_column()
    status_table.add_column(style="bold")
    status_table.add_column()

    status_table.add_row(
        "Modo:",
        Text(mode.upper(), style="bold green" if mode == "ask" else "bold yellow"),
        "Projeto:",
        Text(project_id, style="bold cyan"),
    )

    console.print(
        Panel(
            title_text,
            subtitle=Text(
                "Digite /help para listar comandos especiais • /exit para sair", style="dim"
            ),
            expand=False,
            border_style="cyan",
        )
    )
    console.print(status_table)
    console.print()


def render_markdown(content: str) -> None:
    """Renderiza conteúdo em Markdown com formatação rica."""
    if not content or not content.strip():
        return
    console.print(Markdown(content.strip()))


def render_diff(diff_content: str, filename: str | None = None) -> None:
    """Exibe um diff com syntax highlighting."""
    if not diff_content.strip():
        console.print("[dim](Sem alterações de diff)[/dim]")
        return
    syntax = Syntax(diff_content, "diff", theme="monokai", line_numbers=True)
    title = f"Diff Proposto: {filename}" if filename else "Diff Proposto"
    console.print(Panel(syntax, title=title, border_style="yellow"))


def render_tool_call(name: str, arguments: dict[str, Any]) -> None:
    """Exibe a intenção de execução de uma ferramenta pelo agente."""
    args_str = ", ".join(f"[cyan]{k}[/cyan]={v!r}" for k, v in arguments.items())
    console.print(f"[bold blue]🔧 Ferramenta:[/] [bold]{name}[/]({args_str})")


def render_tool_result(name: str, success: bool, output: str, duration_ms: float = 0.0) -> None:
    """Exibe o resultado retornado por uma ferramenta."""
    status_str = "[bold green]✓ SUCESSO[/]" if success else "[bold red]✗ FALHA[/]"
    dur_str = f"[dim]({duration_ms:.1f}ms)[/dim]" if duration_ms > 0 else ""
    console.print(f"   {status_str} {dur_str}")
    if output and output.strip() and not success:
        console.print(Panel(output.strip()[:1000], title="Detalhe do Erro", border_style="red"))


def render_approval_prompt(
    operation: str,
    resource: str,
    diff: str | None = None,
) -> bool:
    """Exibe prompt de confirmação de segurança humana no terminal."""
    console.print()
    warning_text = Text()
    warning_text.append("⚠️  APROVAÇÃO HUMANA NECESSÁRIA\n", style="bold yellow")
    warning_text.append(f"Operação: {operation}\n", style="bold")
    warning_text.append(f"Recurso afetado: {resource}\n", style="cyan")

    console.print(Panel(warning_text, border_style="yellow"))

    if diff:
        render_diff(diff, filename=resource)

    answer = (
        console.input("[bold yellow]Deseja autorizar esta operação? [y/N]: [/]").strip().lower()
    )
    return answer in {"y", "s", "yes", "sim"}


def render_help() -> None:
    """Exibe comandos slash disponíveis."""
    table = Table(title="Comandos Especiais do JARVIS CLI", border_style="cyan")
    table.add_column("Comando", style="bold cyan")
    table.add_column("Descrição")

    table.add_row("/help", "Exibe esta lista de comandos disponíveis")
    table.add_row(
        "/mode <plan|ask|auto>",
        "Altera o modo do Coding Agent (plan=leitura, ask=aprovações, auto=autônomo)",
    )
    table.add_row("/compact", "Compacta semanticamente o histórico de contexto reduzindo tokens")
    table.add_row("/teammates", "Lista todos os AI Teammates ativos e seus estados")
    table.add_row("/status", "Exibe o status do servidor, provedor de modelo e projeto ativo")
    table.add_row("/clear", "Limpa a tela do terminal")
    table.add_row("/exit ou /quit", "Encerra a sessão do JARVIS CLI")

    console.print(table)
