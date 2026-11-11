"""Runtime do agente de código (loop de tool-calling com aprovação humana).

Fluxo resumido:

1. Carrega o histórico persistido da sessão e o contexto do projeto.
2. Envia o pedido ao provedor (Ollama, OpenAI-compatível ou Anthropic).
3. Se o modelo pedir ferramentas, valida o risco, pede aprovação humana quando
   necessário e executa cada chamada dentro do sandbox.
4. Devolve os resultados ao modelo e repete até ele produzir uma resposta final
   ou até atingir ``max_iterations``.

O runtime é exposto como *gerador assíncrono* de eventos para que a API possa
transmiti-los por SSE sem acoplar o loop ao transporte.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from pathlib import Path
from typing import Any, AsyncIterator, Callable

from services.security_core import PermissionDeniedError, SecurityCore

from .broker import ApprovalBroker
from .context import build_project_context, detect_project_commands
from .providers import ChatProvider, OllamaChatProvider, ProviderError
from .tools import CodingToolExecutor
from .types import (
    AgentMode,
    AgentRunConfig,
    AgentRunResult,
    ChatTurn,
    ToolCall,
    ToolResult,
    ToolRisk,
)

logger = logging.getLogger("jarvis.coding.runtime")

MAX_HISTORY_MESSAGES = 40
MAX_EVENT_OUTPUT = 8_000

SYSTEM_PROMPT = """Você é o JARVIS Coding Agent, um engenheiro de software autónomo inspirado no Claude Code e no OpenCode.

## Regras fundamentais
- Responda SEMPRE em português do Brasil, com objetividade e precisão técnica.
- Trabalhe exclusivamente dentro do projeto ativo. Nunca invente caminhos absolutos para fora dele.
- Leia os arquivos relevantes antes de editá-los. Use `grep`/`glob` para localizar code antes de abrir arquivos inteiros.
- Prefira `edit_file` a `write_file`; preserve o estilo, a indentação e a arquitetura existentes.
- Nunca invente resultados de ferramentas. Se uma ferramenta falhar, leia o erro e corrija o plano.
- Não peça confirmação em texto: use as ferramentas normalmente. O sistema pede aprovação humana quando necessário.
- Ao terminar, explique de forma curta o que mudou, quais arquivos foram afetados e como validar.

## Modo de operação atual: {mode}
{mode_instructions}

## Diretrizes de ferramentas
- `read_file`, `list_directory`, `glob`, `grep`, `git_status`, `git_diff` são livres.
- `write_file`, `edit_file` e `run_command` podem exigir aprovação humana.
- Para validar alterações, execute testes/build/lint com `run_command` quando existirem comandos detectados.
- Se o pedido envolver algo fora do escopo do repositório, explique a limitação em vez de tentar contornar a segurança.

## Comandos detectados no projeto
{commands}

{project_context}
"""

MODE_INSTRUCTIONS = {
    AgentMode.PLAN: (
        "MODO PLANEJAMENTO: apenas leitura. Você NÃO pode escrever arquivos nem executar "
        "comandos. Produza um plano detalhado, análises e trechos de código propostos na resposta."
    ),
    AgentMode.ASK: (
        "MODO ASSISTIDO: antes de cada escrita ou comando, o sistema solicitará aprovação "
        "humana. Continue naturalmente após a decisão."
    ),
    AgentMode.AUTO: (
        "MODO AUTOMÁTICO: leitura sem pausas; toda escrita ou execução exige aprovação humana, "
        "mas comandos destrutivos continuam bloqueados pela política de segurança."
    ),
}


class CodingAgentRuntime:
    """Executa o loop agente ↔ ferramentas com eventos e persistência."""

    def __init__(
        self,
        *,
        security_core: SecurityCore,
        workspace_service: Any,
        tools: CodingToolExecutor,
        broker: ApprovalBroker,
        db_manager: Any | None = None,
        provider_factory: Callable[[], ChatProvider] | None = None,
    ):
        self.security_core = security_core
        self.workspace_service = workspace_service
        self.tools = tools
        self.broker = broker
        self.db_manager = db_manager
        self.provider_factory = provider_factory or (lambda: OllamaChatProvider())

    # ------------------------------------------------------------------
    # API principal
    # ------------------------------------------------------------------
    async def run(self, config: AgentRunConfig) -> AsyncIterator[dict[str, Any]]:
        """Gera eventos de execução até a conclusão (ou erro)."""
        task_id = config.task_id or f"task-{uuid.uuid4().hex[:12]}"
        session_id = config.session_id or f"session-{uuid.uuid4().hex[:10]}"
        # Garante que todo o fluxo (persistência, aprovações) use os IDs reais.
        config.task_id = task_id
        config.session_id = session_id
        started = time.perf_counter()
        result = AgentRunResult(
            task_id=task_id,
            session_id=session_id,
            project_id=config.project_id,
        )

        # 1. Valida e prepara o projeto
        try:
            project_root = self._prepare_project(config.project_id)
        except Exception as exc:
            yield {
                "type": "error",
                "task_id": task_id,
                "session_id": session_id,
                "error": str(exc),
            }
            return

        provider = self.provider_factory()
        model = provider.resolve_model(config.model)
        yield {
            "type": "start",
            "task_id": task_id,
            "session_id": session_id,
            "project_id": config.project_id,
            "mode": config.mode.value,
            "provider": provider.name,
            "model": model,
        }

        # 2. Monta histórico e contexto
        history = self._load_history(config, session_id)
        system_prompt = self._build_system_prompt(config, project_root)
        messages: list[ChatTurn] = [ChatTurn(role="system", content=system_prompt)]
        messages.extend(history)
        messages.append(ChatTurn(role="user", content=config.prompt))
        self._persist(session_id, config.project_id, "user", config.prompt)

        available_tools = self._tools_for_mode(config.mode)
        if not available_tools:
            yield {
                "type": "error",
                "task_id": task_id,
                "error": "Nenhuma ferramenta disponível para o modo selecionado.",
            }
            return

        deadline = started + max(10.0, config.timeout_seconds)
        final_content = ""
        iterations = 0

        for iteration in range(1, max(1, config.max_iterations) + 1):
            iterations = iteration
            if self._is_cancelled(task_id):
                yield {
                    "type": "error",
                    "task_id": task_id,
                    "error": "Execução interrompida pelo Kill Switch.",
                }
                result.error = "Execução interrompida pelo Kill Switch."
                break

            remaining = deadline - time.perf_counter()
            if remaining <= 1.0:
                result.error = (
                    f"Tempo limite global de {config.timeout_seconds:.0f}s excedido."
                )
                yield {"type": "error", "task_id": task_id, "error": result.error}
                break

            yield {"type": "thinking", "iteration": iteration}

            try:
                reply = await provider.complete(
                    turns=messages,
                    tools=available_tools,
                    model=config.model,
                    temperature=config.temperature,
                    max_tokens=config.max_tokens,
                    timeout_seconds=min(remaining, config.timeout_seconds),
                )
            except ProviderError as exc:
                result.error = str(exc)
                self._persist(
                    session_id, config.project_id, "assistant", f"[erro do provedor] {exc}"
                )
                yield {"type": "error", "task_id": task_id, "error": str(exc)}
                break
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # pragma: no cover - defensivo
                result.error = f"Falha inesperada no provedor: {exc}"
                yield {"type": "error", "task_id": task_id, "error": result.error}
                break

            if reply.content and reply.content.strip():
                yield {
                    "type": "assistant",
                    "iteration": iteration,
                    "content": reply.content,
                }

            if not reply.tool_calls:
                final_content = reply.content.strip()
                self._persist(
                    session_id,
                    config.project_id,
                    "assistant",
                    reply.content,
                )
                result.is_completed = True
                break

            messages.append(
                ChatTurn(
                    role="assistant",
                    content=reply.content,
                    tool_calls=reply.tool_calls,
                )
            )
            self._persist(
                session_id,
                config.project_id,
                "assistant",
                reply.content,
                tool_calls=[call.model_dump() for call in reply.tool_calls],
            )

            for call in reply.tool_calls:
                async for event in self._handle_tool_call(
                    call=call,
                    config=config,
                    task_id=task_id,
                    messages=messages,
                    result=result,
                ):
                    yield event

        # 3. Consolidação
        if not final_content and result.is_completed:
            final_content = "Tarefa concluída."
        if not result.is_completed and not result.error:
            result.error = (
                f"Limite de {config.max_iterations} iterações atingido sem resposta final. "
                "Refine o pedido ou aumente o limite."
            )
        result.summary = final_content or (result.error or "")
        result.iterations = iterations
        result.changed_files = sorted(set(result.changed_files))

        yield {
            "type": "final",
            "task_id": task_id,
            "session_id": session_id,
            "project_id": config.project_id,
            "summary": result.summary,
            "is_completed": result.is_completed,
            "iterations": result.iterations,
            "tool_calls": result.tool_calls,
            "changed_files": result.changed_files,
            "error": result.error,
            "duration_ms": round((time.perf_counter() - started) * 1000.0, 2),
        }

    # ------------------------------------------------------------------
    # Ferramentas e aprovação
    # ------------------------------------------------------------------
    async def _handle_tool_call(
        self,
        *,
        call: ToolCall,
        config: AgentRunConfig,
        task_id: str,
        messages: list[ChatTurn],
        result: AgentRunResult,
    ) -> AsyncIterator[dict[str, Any]]:
        spec = self.tools.get_spec(call.name)
        if spec is None:
            tool_result = ToolResult(
                call_id=call.id,
                name=call.name,
                success=False,
                error=f"Ferramenta desconhecida: '{call.name}'.",
            )
            async for event in self._finish_tool(tool_result, config, messages, result):
                yield event
            return

        yield {
            "type": "tool_call",
            "call_id": call.id,
            "name": call.name,
            "arguments": call.arguments,
            "risk": spec.risk.value,
        }

        # Modo planejamento: bloqueia qualquer escrita/execução
        if config.mode == AgentMode.PLAN and spec.risk in {ToolRisk.WRITE, ToolRisk.EXEC}:
            tool_result = ToolResult(
                call_id=call.id,
                name=call.name,
                success=False,
                denied=True,
                error=(
                    "O modo 'plan' é somente leitura. Descreva a alteração proposta "
                    "na resposta em vez de executá-la."
                ),
            )
            async for event in self._finish_tool(tool_result, config, messages, result):
                yield event
            return

        # Ferramentas bloqueadas pelo Kill Switch
        if hasattr(self.security_core, "kill_switch") and (
            self.security_core.kill_switch.is_global_killed()
            or self.security_core.kill_switch.is_tool_blocked(call.name)
        ):
            tool_result = ToolResult(
                call_id=call.id,
                name=call.name,
                success=False,
                denied=True,
                error=(
                    "Execução suspensa pelo Kill Switch Global."
                    if self.security_core.kill_switch.is_global_killed()
                    else f"A ferramenta '{call.name}' está bloqueada pelo Kill Switch."
                ),
            )
            async for event in self._finish_tool(tool_result, config, messages, result):
                yield event
            return

        # Aprovação humana
        if spec.requires_approval:
            try:
                preview = self.tools.preview(call, config.project_id)
            except PermissionDeniedError as exc:
                tool_result = ToolResult(
                    call_id=call.id,
                    name=call.name,
                    success=False,
                    denied=True,
                    error=str(exc),
                )
                async for event in self._finish_tool(tool_result, config, messages, result):
                    yield event
                return
            except Exception as exc:
                tool_result = ToolResult(
                    call_id=call.id,
                    name=call.name,
                    success=False,
                    error=f"Pré-validação falhou: {exc}",
                )
                async for event in self._finish_tool(tool_result, config, messages, result):
                    yield event
                return

            if preview is not None:
                ticket = self.broker.create(
                    task_id=task_id,
                    agent_role=config.agent_role,
                    operation=preview["operation"],
                    impact_summary=preview["impact_summary"],
                    affected_resources=preview["affected_resources"],
                    proposed_diff=preview.get("proposed_diff"),
                    reversible=preview.get("reversible", True),
                )
                yield {
                    "type": "approval_required",
                    "approval_id": ticket.request_id,
                    "task_id": task_id,
                    "operation": preview["operation"],
                    "impact_summary": preview["impact_summary"],
                    "affected_resources": preview["affected_resources"],
                    "proposed_diff": preview.get("proposed_diff"),
                    "reversible": preview.get("reversible", True),
                }
                try:
                    ticket = await self.broker.wait(
                        ticket, timeout_seconds=config.approval_timeout_seconds
                    )
                except asyncio.CancelledError:
                    self.broker.cancel_ticket(
                        ticket.request_id, reason="Cliente desconectou durante a aprovação."
                    )
                    raise

                if not ticket.approved:
                    tool_result = ToolResult(
                        call_id=call.id,
                        name=call.name,
                        success=False,
                        denied=True,
                        error=ticket.reason or "Operação rejeitada pelo utilizador.",
                    )
                    async for event in self._finish_tool(
                        tool_result, config, messages, result
                    ):
                        yield event
                    return

        # Execução real
        try:
            tool_result = await self.tools.execute(call, config.project_id)
        except PermissionDeniedError as exc:
            tool_result = ToolResult(
                call_id=call.id,
                name=call.name,
                success=False,
                denied=True,
                error=str(exc),
            )
        except Exception as exc:  # pragma: no cover - defensivo
            tool_result = ToolResult(
                call_id=call.id,
                name=call.name,
                success=False,
                error=str(exc),
            )

        if tool_result.success:
            for changed in tool_result.changed_files:
                if changed not in result.changed_files:
                    result.changed_files.append(changed)

        async for event in self._finish_tool(tool_result, config, messages, result):
            yield event

    async def _finish_tool(
        self,
        tool_result: ToolResult,
        config: AgentRunConfig,
        messages: list[ChatTurn],
        result: AgentRunResult,
    ) -> AsyncIterator[dict[str, Any]]:
        result.tool_calls += 1
        model_text = tool_result.to_model_text(max_chars=30_000)
        messages.append(
            ChatTurn(
                role="tool",
                content=model_text,
                tool_call_id=tool_result.call_id,
                tool_name=tool_result.name,
            )
        )
        self._persist(
            config.session_id,
            config.project_id,
            "tool",
            model_text,
            tool_call_id=tool_result.call_id,
            tool_name=tool_result.name,
        )
        output = tool_result.output or tool_result.error or ""
        if len(output) > MAX_EVENT_OUTPUT:
            output = output[:MAX_EVENT_OUTPUT] + "\n... [saída truncada no streaming]"
        yield {
            "type": "tool_result",
            "call_id": tool_result.call_id,
            "name": tool_result.name,
            "success": tool_result.success,
            "denied": tool_result.denied,
            "output": output,
            "error": tool_result.error,
            "changed_files": tool_result.changed_files,
            "duration_ms": round(tool_result.duration_ms, 2),
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _prepare_project(self, project_id: str) -> Path:
        root = self.workspace_service.get_project_dir(project_id)
        if not root.exists() or not root.is_dir():
            raise FileNotFoundError(
                f"Projeto '{project_id}' não encontrado. Crie ou importe o projeto "
                "no Project Workspace antes de usar o Coding Agent."
            )
        try:
            self.security_core.permission_engine.validate_path_access(project_id, ".")
        except PermissionDeniedError:
            self.security_core.permission_engine.register_project(
                project_id=project_id, root_path=str(root)
            )
        return root.resolve()

    def _load_history(self, config: AgentRunConfig, session_id: str) -> list[ChatTurn]:
        if not config.include_history or self.db_manager is None:
            return []
        try:
            rows = self.db_manager.list_chat_messages(
                session_id, limit=MAX_HISTORY_MESSAGES, ascending=False
            )
        except Exception as exc:
            logger.warning("Falha ao carregar histórico da sessão %s: %s", session_id, exc)
            return []

        turns: list[ChatTurn] = []
        for row in reversed(rows):
            row_project = row.get("project_id")
            if row_project and row_project != config.project_id:
                continue
            role = row.get("role", "user")
            if role == "system":
                continue
            tool_calls = []
            for raw in row.get("tool_calls") or []:
                try:
                    tool_calls.append(ToolCall(**raw))
                except Exception:
                    continue
            turns.append(
                ChatTurn(
                    role=role,
                    content=row.get("content") or "",
                    tool_calls=tool_calls,
                    tool_call_id=row.get("tool_call_id"),
                    tool_name=row.get("tool_name"),
                )
            )
        return turns

    def _build_system_prompt(self, config: AgentRunConfig, project_root: Path) -> str:
        context = build_project_context(project_root, config.project_id)
        commands = detect_project_commands(project_root)
        if commands:
            commands_text = "\n".join(
                f"- {name}: `{command}`" for name, command in commands.items()
            )
        else:
            commands_text = "- (nenhum comando padrão detectado; inspecione o projeto)"

        return SYSTEM_PROMPT.format(
            mode=config.mode.value,
            mode_instructions=MODE_INSTRUCTIONS[config.mode],
            commands=commands_text,
            project_context=context,
        )

    def _tools_for_mode(self, mode: AgentMode):
        specs = []
        for spec in self.tools.list_specs():
            if mode == AgentMode.PLAN and spec.risk in {ToolRisk.WRITE, ToolRisk.EXEC}:
                continue
            specs.append(spec)
        return specs

    def _persist(
        self,
        session_id: str,
        project_id: str,
        role: str,
        content: str,
        *,
        tool_calls: list[dict[str, Any]] | None = None,
        tool_call_id: str | None = None,
        tool_name: str | None = None,
    ) -> None:
        if self.db_manager is None:
            return
        try:
            self.db_manager.add_chat_message(
                session_id=session_id,
                role=role,
                content=content or "",
                project_id=project_id,
                tool_calls=tool_calls,
                tool_call_id=tool_call_id,
                tool_name=tool_name,
            )
        except Exception as exc:
            logger.warning("Falha ao persistir mensagem do agente: %s", exc)

    def _is_cancelled(self, task_id: str) -> bool:
        kill_switch = getattr(self.security_core, "kill_switch", None)
        if kill_switch is None:
            return False
        try:
            if kill_switch.is_global_killed():
                return True
            return kill_switch.is_task_cancelled(task_id)
        except Exception:
            return False
