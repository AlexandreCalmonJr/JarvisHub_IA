"""Ponto de entrada do JARVIS CLI (Terminal TUI estilo Claude Code)."""

from __future__ import annotations

import argparse
import asyncio
import sys
import uuid

from rich.table import Table

from services.coding_agent.repo_map import generate_repo_map

from .client import JarvisClient
from .session import create_cli_session, format_prompt
from .ui import (
    console,
    print_banner,
    render_approval_prompt,
    render_diff,
    render_help,
    render_markdown,
    render_tool_call,
    render_tool_result,
)


async def execute_task_stream(
    client: JarvisClient,
    prompt: str,
    project_id: str,
    session_id: str,
    mode: str,
) -> None:
    """Consome e renderiza eventos de streaming do Coding Agent com suporte a aprovação interativa."""
    with console.status("[bold cyan]JARVIS pensando...", spinner="dots") as status:
        async for event in client.stream_coding_task(
            prompt=prompt,
            project_id=project_id,
            session_id=session_id,
            mode=mode,
        ):
            event_type = event.get("type")

            if event_type == "thinking":
                iter_num = event.get("iteration", 1)
                status.update(f"[bold cyan]Iteração {iter_num} • Analisando código...")

            elif event_type == "assistant":
                status.stop()
                content = event.get("content", "")
                if content:
                    render_markdown(content)
                status.start()

            elif event_type == "tool_call":
                status.stop()
                render_tool_call(event.get("name", "tool"), event.get("arguments", {}))
                status.start()

            elif event_type == "approval_needed":
                status.stop()
                req_id = event.get("approval_id") or event.get("request_id")
                op = event.get("operation", "write_file")
                res = ", ".join(event.get("affected_resources", []))
                diff = event.get("proposed_diff")

                authorized = render_approval_prompt(operation=op, resource=res, diff=diff)
                action = "approve" if authorized else "reject"

                try:
                    await client.decide_approval(req_id, action=action)
                    if authorized:
                        console.print("[bold green]✓ Operação autorizada pelo desenvolvedor.[/]")
                    else:
                        console.print("[bold red]✗ Operação rejeitada pelo desenvolvedor.[/]")
                except Exception as exc:
                    console.print(f"[bold red]Falha ao enviar aprovação: {exc}[/]")
                status.start()

            elif event_type == "tool_result":
                status.stop()
                render_tool_result(
                    name=event.get("name", "tool"),
                    success=event.get("success", False),
                    output=event.get("output", "") or event.get("error", ""),
                    duration_ms=event.get("duration_ms", 0.0),
                )
                status.start()

            elif event_type == "final":
                status.stop()
                console.print()
                summary = event.get("summary", "Concluído.")
                render_markdown(f"### Resumo Final\n{summary}")
                changed = event.get("changed_files", [])
                if changed:
                    console.print(f"[bold green]Arquivos alterados:[/] {', '.join(changed)}")
                return

            elif event_type == "error":
                status.stop()
                console.print(f"[bold red]❌ Erro:[/] {event.get('error', 'Falha desconhecida')}")
                return


async def handle_slash_command(
    cmd: str,
    client: JarvisClient,
    state: dict[str, str],
) -> bool:
    """Executa comandos slash. Retorna True para continuar o loop, False para encerrar."""
    parts = cmd.strip().split()
    base_cmd = parts[0].lower()

    if base_cmd in {"/exit", "/quit"}:
        console.print("[cyan]Até logo, desenvolvedor! Sessão encerrada.[/cyan]")
        return False

    if base_cmd == "/help":
        render_help()
        return True

    if base_cmd == "/clear":
        console.clear()
        print_banner(mode=state["mode"], project_id=state["project_id"])
        return True

    if base_cmd == "/mode":
        if len(parts) > 1 and parts[1].lower() in {"plan", "ask", "auto"}:
            state["mode"] = parts[1].lower()
            console.print(f"[bold green]✓ Modo alterado para: {state['mode'].upper()}[/]")
        else:
            console.print("[yellow]Uso: /mode <plan|ask|auto>[/]")
        return True

    if base_cmd == "/diff":
        try:
            proc = await asyncio.create_subprocess_shell(
                "git diff",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await proc.communicate()
            diff_text = stdout.decode("utf-8", errors="replace")
            if diff_text.strip():
                render_diff(diff_text)
            else:
                console.print("[dim]Nenhuma alteração não commitada no repositório.[/dim]")
        except Exception as exc:
            console.print(f"[bold red]Erro ao executar git diff: {exc}[/]")
        return True

    if base_cmd == "/undo":
        ans = (
            console.input(
                "[bold yellow]Deseja reverter todas as alterações não commitadas (git checkout -- .)? [y/N]: [/]"
            )
            .strip()
            .lower()
        )
        if ans in {"y", "s", "yes", "sim"}:
            try:
                proc = await asyncio.create_subprocess_shell(
                    "git checkout -- .",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                await proc.communicate()
                if proc.returncode == 0:
                    console.print(
                        "[bold green]✓ Alterações revertidas com sucesso (Rollback concluído).[/]"
                    )
                else:
                    console.print("[bold red]Falha ao executar rollback git.[/]")
            except Exception as exc:
                console.print(f"[bold red]Erro no rollback: {exc}[/]")
        else:
            console.print("[dim]Operação cancelada.[/dim]")
        return True

    if base_cmd == "/test":
        cmd_to_run = " ".join(parts[1:]) if len(parts) > 1 else "pytest -q"
        console.print(f"[cyan]Executando suíte de testes: [bold]{cmd_to_run}[/]...[/cyan]")
        try:
            proc = await asyncio.create_subprocess_shell(
                cmd_to_run,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            stdout, _ = await proc.communicate()
            output = stdout.decode("utf-8", errors="replace")
            if proc.returncode == 0:
                console.print("[bold green]✓ Testes passaram com sucesso (Exit Code 0)[/]")
            else:
                console.print(f"[bold red]✗ Testes falharam (Exit Code {proc.returncode})[/]")
            console.print(output.strip()[-2000:])
        except Exception as exc:
            console.print(f"[bold red]Erro ao executar testes: {exc}[/]")
        return True

    if base_cmd == "/map":
        console.print("[cyan]Gerando Repo Map sintático compacto (AST <1000 tokens)...[/cyan]")
        try:
            from pathlib import Path

            repo_map = generate_repo_map(Path("."), max_tokens=1000)
            if repo_map:
                render_markdown(
                    f"### Mapa Sintático de Repositório (Repo Map)\n```\n{repo_map}\n```"
                )
            else:
                console.print("[dim]Nenhum símbolo de código encontrado no diretório atual.[/dim]")
        except Exception as exc:
            console.print(f"[bold red]Erro ao gerar repo map: {exc}[/]")
        return True

    if base_cmd == "/compact":
        console.print("[cyan]Iniciando compactação semântica do histórico...[/cyan]")
        try:
            stats = await client.compact_session(
                session_id=state["session_id"],
                project_id=state["project_id"],
            )
            console.print(
                f"[bold green]✓ Sessão compactada:[/] {stats.get('original_turns')} ➔ "
                f"{stats.get('compacted_turns')} turnos "
                f"(~{stats.get('estimated_tokens_saved', 0)} tokens poupados / "
                f"{stats.get('reduction_percent', 0)}% de redução)"
            )
        except Exception as exc:
            console.print(f"[bold red]Erro na compactação: {exc}[/]")
        return True

    if base_cmd == "/teammates":
        try:
            items = await client.list_teammates()
            if not items:
                console.print("[dim]Nenhum AI Teammate ativo no momento.[/dim]")
            else:
                table = Table(title="AI Teammates Ativos (OpenBot / ACP)", border_style="cyan")
                table.add_column("ID", style="bold")
                table.add_column("Nome", style="cyan")
                table.add_column("Papel")
                table.add_column("Status")
                table.add_column("Workspace Isolado")
                for t in items:
                    table.add_row(
                        t.get("id", ""),
                        t.get("name", ""),
                        t.get("role", ""),
                        t.get("status", ""),
                        "Sim" if t.get("isolated_workspace") else "Não",
                    )
                console.print(table)
        except Exception as exc:
            console.print(f"[bold red]Erro ao listar teammates: {exc}[/]")
        return True

    if base_cmd == "/status":
        try:
            tools_data = await client.get_tools_and_provider()
            prov = tools_data.get("provider", {})
            table = Table(title="Status do Sistema JARVIS", border_style="cyan")
            table.add_column("Parâmetro", style="bold")
            table.add_column("Valor", style="green")

            table.add_row("API URL", client.base_url)
            table.add_row("Provedor Ativo", prov.get("name", "N/A"))
            table.add_row("Modelo Padrão", prov.get("model", "N/A"))
            table.add_row("Local-First", "Sim" if prov.get("local_first") else "Nuvem")
            table.add_row("Ferramentas Registradas", str(len(tools_data.get("tools", []))))
            table.add_row("Projeto Ativo", state["project_id"])
            table.add_row("Modo do Agente", state["mode"].upper())
            table.add_row("Sessão ID", state["session_id"])
            console.print(table)
        except Exception as exc:
            console.print(f"[bold red]Erro ao obter status da API: {exc}[/]")
        return True

    console.print(
        f"[yellow]Comando desconhecido: '{cmd}'. Digite /help para ver os comandos.[/yellow]"
    )
    return True


async def async_main() -> None:
    """Execução principal assíncrona do CLI."""
    parser = argparse.ArgumentParser(description="JARVIS AI HUB • Terminal TUI Interativo")
    parser.add_argument(
        "--api-url", default="http://127.0.0.1:8000", help="URL base da API do JARVIS"
    )
    parser.add_argument("--token", default=None, help="Token de autenticação Bearer")
    parser.add_argument("--project", default="default", help="ID do projeto no workspace")
    parser.add_argument(
        "--mode", default="ask", choices=["plan", "ask", "auto"], help="Modo do Coding Agent"
    )
    parser.add_argument("prompt", nargs="*", help="Instrução opcional para execução direta")

    args = parser.parse_args()

    client = JarvisClient(base_url=args.api_url, token=args.token)
    session_id = f"cli-{uuid.uuid4().hex[:8]}"

    state = {
        "mode": args.mode,
        "project_id": args.project,
        "session_id": session_id,
    }

    # Execução one-shot via argumento posicional
    if args.prompt:
        direct_prompt = " ".join(args.prompt).strip()
        await execute_task_stream(
            client=client,
            prompt=direct_prompt,
            project_id=state["project_id"],
            session_id=state["session_id"],
            mode=state["mode"],
        )
        return

    # Modo REPL Interativo
    print_banner(mode=state["mode"], project_id=state["project_id"])
    cli_session = create_cli_session()

    while True:
        try:
            prompt_html = format_prompt(mode=state["mode"], project_id=state["project_id"])
            user_input = await cli_session.prompt_async(prompt_html)
            clean_input = user_input.strip()

            if not clean_input:
                continue

            if clean_input.startswith("/"):
                keep_running = await handle_slash_command(clean_input, client, state)
                if not keep_running:
                    break
                continue

            await execute_task_stream(
                client=client,
                prompt=clean_input,
                project_id=state["project_id"],
                session_id=state["session_id"],
                mode=state["mode"],
            )

        except (KeyboardInterrupt, EOFError):
            console.print("\n[cyan]Saindo do JARVIS CLI...[/cyan]")
            break
        except Exception as exc:
            console.print(f"[bold red]Erro inesperado:[/] {exc}")


def main() -> None:
    """Ponto de entrada síncrono para setup de console e execução do loop assíncrono."""
    try:
        asyncio.run(async_main())
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()
