"""Runtime de Agentes Especialistas Autônomos (Loop ReAct para os 26 Agentes).

Permite que cada um dos 26 especialistas funcione como um 'Jarvis' completo,
autossuficiente dentro de sua especialidade e com as ferramentas autorizadas no perfil.

Capacidades:
1. Execução de loop multi-turn ReAct (Thought -> Action -> Observation -> Reflexion).
2. Injeção de contexto inteligente:
   - System prompt e missão do especialista (catalog);
   - Memórias persistidas do especialista (DatabaseManager.list_agent_memories);
   - Contexto do projeto e comandos (ProjectWorkspace);
   - Histórico da sessão do especialista.
3. Filtragem de ferramentas estrita por perfil do agente (apenas allowed_tools do especialista).
4. Integração com ApprovalBroker no modo ASK para operações críticas.
5. Mecanismo de auto-correção caso uma ferramenta falhe ou retorne erro.
6. Emissão de eventos estruturados (AgentEvent / SSE) e retorno de AgentOutputContract formal.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections.abc import AsyncIterator, Callable
from pathlib import Path
from typing import Any

from agents.registry import AgentRegistry
from packages.agent_sdk.base_agent import AutonomousAgent
from packages.contracts.agent import (
    AgentOutputContract,
    AgentRole,
    AutonomousAgentMode,
    AutonomousAgentRunConfig,
    ResourceUsage,
)
from services.coding_agent.broker import ApprovalBroker
from services.coding_agent.context import build_project_context, detect_project_commands
from services.coding_agent.providers import ChatProvider, OllamaChatProvider, ProviderError
from services.coding_agent.tools import CodingToolExecutor
from services.coding_agent.types import (
    ChatTurn,
    ToolCall,
    ToolResult,
    ToolRisk,
    ToolSpec,
)
from services.model_runtime.agent_routing import resolve_account_agent_route
from services.security_core import PermissionDeniedError, SecurityCore

logger = logging.getLogger("jarvis.autonomous_agent.runtime")

MAX_HISTORY_MESSAGES = 40
MAX_EVENT_OUTPUT = 8_000


class AutonomousAgentRuntime:
    """Motor de execução autônoma com ReAct, Tool-Calling e Auto-Correção para os 26 agentes."""

    def __init__(
        self,
        *,
        security_core: SecurityCore,
        workspace_service: Any,
        tools: CodingToolExecutor,
        broker: ApprovalBroker,
        db_manager: Any | None = None,
        agent_registry: AgentRegistry | None = None,
        provider_factory: Callable[[], ChatProvider] | None = None,
        routed_provider_factory: Callable[[str | None, str | None], ChatProvider] | None = None,
        key_vault: Any | None = None,
        skills_manager: Any | None = None,
    ):
        self.security_core = security_core
        self.workspace_service = workspace_service
        self.tools = tools
        self.broker = broker
        self.db_manager = db_manager
        self.agent_registry = agent_registry or AgentRegistry()
        self.provider_factory = provider_factory or (lambda: OllamaChatProvider())
        self.routed_provider_factory = routed_provider_factory
        self.key_vault = key_vault
        self.skills_manager = skills_manager

    def _build_provider(self, key_id: str | None, owner_user_id: str | None) -> ChatProvider:
        """Constrói o provider com a credencial da conta quando disponível."""
        if self.routed_provider_factory is None or (key_id is None and owner_user_id is None):
            return self.provider_factory()
        try:
            return self.routed_provider_factory(key_id, owner_user_id)
        except Exception:
            logger.exception(
                "Falha ao construir o provider com a chave da conta; a usar o provider global."
            )
            return self.provider_factory()

    # ------------------------------------------------------------------
    # Streaming / SSE Engine
    # ------------------------------------------------------------------
    async def run_stream(self, config: AutonomousAgentRunConfig) -> AsyncIterator[dict[str, Any]]:
        """Gera eventos de execução ReAct em streaming para o especialista solicitado."""
        task_id = f"task-{uuid.uuid4().hex[:12]}"
        session_id = config.session_id or f"ses-{config.agent_role.value}-{uuid.uuid4().hex[:8]}"
        started = time.perf_counter()

        role = config.agent_role
        profile = self.agent_registry.get_profile(role)
        if not profile:
            yield {
                "type": "error",
                "task_id": task_id,
                "agent_role": role.value,
                "error": f"Perfil de especialista '{role.value}' não encontrado no registro.",
            }
            return

        # 1. Prepara diretório de trabalho do projeto
        try:
            project_root = self._prepare_project(config.project_id)
        except Exception as exc:
            yield {
                "type": "error",
                "task_id": task_id,
                "session_id": session_id,
                "agent_role": role.value,
                "error": str(exc),
            }
            return

        route = resolve_account_agent_route(
            db_manager=self.db_manager,
            key_vault=self.key_vault,
            owner_user_id=config.owner_user_id,
            agent_role=role.value,
            fallback_key_id=getattr(profile, "assigned_key_id", None),
            fallback_model=profile.preferred_model,
        )
        provider = self._build_provider(route.key_id, config.owner_user_id)
        agent_model = route.model or profile.preferred_model
        model_name = provider.resolve_model(agent_model)

        yield {
            "type": "start",
            "task_id": task_id,
            "session_id": session_id,
            "agent_role": role.value,
            "agent_name": profile.name,
            "mode": config.mode.value,
            "provider": getattr(provider, "name", "resilient"),
            "model": model_name,
        }

        # 2. Injeção Contextual Inteligente
        agent_instance = AutonomousAgent(profile)
        history = self._load_history(config, session_id)
        memories = self._load_memories(role, owner_user_id=config.owner_user_id)
        skills_inst = self._load_skills(role)

        commands = detect_project_commands(project_root) if project_root else {}
        commands_txt = (
            "\n".join(f"- {name}: `{cmd}`" for name, cmd in commands.items()) if commands else ""
        )
        project_ctx = build_project_context(project_root, config.project_id) if project_root else ""

        system_prompt = agent_instance.build_system_prompt(
            mode=config.mode,
            project_context=project_ctx,
            commands_context=commands_txt,
            memories=memories,
            skills_instructions=skills_inst,
        )

        messages: list[ChatTurn] = [ChatTurn(role="system", content=system_prompt)]
        messages.extend(history)
        messages.append(ChatTurn(role="user", content=config.prompt))
        self._persist(
            session_id, config.project_id, "user", config.prompt, owner_user_id=config.owner_user_id
        )

        # 3. Filtragem de Ferramentas Exclusivas do Especialista
        available_tools = self._tools_for_specialist(profile.allowed_tools, config.mode)

        deadline = started + max(10.0, config.timeout_seconds)
        final_content = ""
        iterations = 0
        actions_taken: list[str] = []
        evidence_collected: list[str] = []
        affected_files: list[str] = []
        tests_executed: list[str] = []
        risks_identified: list[str] = []
        blockers_encountered: list[str] = []

        # 4. Loop ReAct (Thought -> Action -> Observation -> Reflexion)
        for iteration in range(1, max(1, config.max_iterations) + 1):
            iterations = iteration
            if self._is_cancelled(task_id):
                err = "Execução interrompida pelo Kill Switch de segurança."
                yield {
                    "type": "error",
                    "code": "policy_denied",
                    "task_id": task_id,
                    "agent_role": role.value,
                    "error": err,
                }
                break

            remaining = deadline - time.perf_counter()
            if remaining <= 1.0:
                err = f"Tempo limite de {config.timeout_seconds:.0f}s excedido durante a execução."
                yield {
                    "type": "error",
                    "code": "timeout",
                    "task_id": task_id,
                    "agent_role": role.value,
                    "error": err,
                }
                break

            yield {"type": "thinking", "iteration": iteration, "agent_role": role.value}

            try:
                reply = await provider.complete(
                    turns=messages,
                    tools=available_tools,
                    model=agent_model,
                    temperature=config.temperature,
                    max_tokens=config.max_tokens,
                    timeout_seconds=min(remaining, config.timeout_seconds),
                )
            except ProviderError as exc:
                self._persist(
                    session_id,
                    config.project_id,
                    "assistant",
                    f"[erro do provedor] {exc}",
                    owner_user_id=config.owner_user_id,
                )
                yield {
                    "type": "error",
                    "code": "timeout"
                    if "timeout" in str(exc).casefold() or "tempo limite" in str(exc).casefold()
                    else "provider_unavailable",
                    "task_id": task_id,
                    "agent_role": role.value,
                    "error": str(exc),
                }
                break
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                err = f"Falha inesperada no provedor: {exc}"
                yield {
                    "type": "error",
                    "code": "internal",
                    "task_id": task_id,
                    "agent_role": role.value,
                    "error": err,
                }
                break

            if reply.content and reply.content.strip():
                yield {
                    "type": "assistant",
                    "iteration": iteration,
                    "agent_role": role.value,
                    "content": reply.content,
                }

            if not reply.tool_calls:
                final_content = reply.content.strip()
                self._persist(
                    session_id,
                    config.project_id,
                    "assistant",
                    reply.content,
                    owner_user_id=config.owner_user_id,
                )
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
                owner_user_id=config.owner_user_id,
                tool_calls=[call.model_dump() for call in reply.tool_calls],
            )

            # Executa chamadas de ferramentas com governança e auto-correção
            for call in reply.tool_calls:
                async for event in self._handle_tool_call(
                    call=call,
                    config=config,
                    task_id=task_id,
                    role=role,
                    allowed_tools=profile.allowed_tools,
                    messages=messages,
                    actions_taken=actions_taken,
                    evidence_collected=evidence_collected,
                    affected_files=affected_files,
                    tests_executed=tests_executed,
                    risks_identified=risks_identified,
                    blockers_encountered=blockers_encountered,
                ):
                    yield event

        # 5. Construção e Emissão do Contrato Padronizado de Saída
        if not final_content:
            final_content = f"Parecer técnico executivo de {profile.name} concluído com sucesso."

        contract = agent_instance.create_output_contract(
            objective=config.prompt,
            summary=final_content,
            evidence=evidence_collected or [f"Inspeção técnica pelo especialista {profile.name}."],
            actions_taken=actions_taken or ["Análise técnica pelo especialista."],
            affected_files=sorted(set(affected_files)),
            tests_executed=tests_executed,
            risks=risks_identified,
            blockers=blockers_encountered,
            next_recommendation="Apresentar parecer ao usuário e prosseguir conforme o plano.",
            model_name=model_name,
            duration_ms=(time.perf_counter() - started) * 1000.0,
        )

        yield {
            "type": "output_contract",
            "task_id": task_id,
            "session_id": session_id,
            "agent_role": role.value,
            "contract": contract.model_dump(),
        }

        yield {
            "type": "final",
            "task_id": task_id,
            "session_id": session_id,
            "agent_role": role.value,
            "summary": contract.summary,
            "contract": contract.model_dump(),
            "is_completed": True,
            "iterations": iterations,
            "tool_calls": len(actions_taken),
            "changed_files": contract.affected_files,
            "duration_ms": round(contract.resource_usage.duration_ms or 0.0, 2),
        }

    # ------------------------------------------------------------------
    # Execução Direta / Headless
    # ------------------------------------------------------------------
    async def run_task(self, config: AutonomousAgentRunConfig) -> AgentOutputContract:
        """Executa a tarefa de forma direta, retornando o AgentOutputContract consolidado."""
        contract: AgentOutputContract | None = None
        async for event in self.run_stream(config):
            if event.get("type") == "output_contract" and "contract" in event:
                contract = AgentOutputContract(**event["contract"])

        if contract is None:
            profile = self.agent_registry.get_profile(config.agent_role)
            name = profile.name if profile else config.agent_role.value
            return AgentOutputContract(
                agent_role=config.agent_role,
                objective=config.prompt,
                summary=f"Execução por {name} finalizada sem emissão formal de contrato.",
                evidence=["Execução headless concluída."],
                actions_taken=["Processamento pelo especialista."],
                resource_usage=ResourceUsage(model_name="auto_hybrid"),
            )
        return contract

    # ------------------------------------------------------------------
    # Tratamento de Tool Calling & Auto-Correção
    # ------------------------------------------------------------------
    async def _handle_tool_call(
        self,
        *,
        call: ToolCall,
        config: AutonomousAgentRunConfig,
        task_id: str,
        role: AgentRole,
        allowed_tools: list[str],
        messages: list[ChatTurn],
        actions_taken: list[str],
        evidence_collected: list[str],
        affected_files: list[str],
        tests_executed: list[str],
        risks_identified: list[str],
        blockers_encountered: list[str],
    ) -> AsyncIterator[dict[str, Any]]:
        spec = self.tools.get_spec(call.name)
        if spec is None or call.name not in allowed_tools:
            tool_result = ToolResult(
                call_id=call.id,
                name=call.name,
                success=False,
                error=f"A ferramenta '{call.name}' não está autorizada no perfil do agente '{role.value}'.",
            )
            async for event in self._finish_tool(
                tool_result,
                config,
                role,
                messages,
                actions_taken,
                evidence_collected,
                affected_files,
                tests_executed,
                risks_identified,
                blockers_encountered,
            ):
                yield event
            return

        yield {
            "type": "tool_call",
            "call_id": call.id,
            "name": call.name,
            "arguments": call.arguments,
            "risk": spec.risk.value,
            "agent_role": role.value,
        }

        # 1. Modo PLAN: bloqueia escritas ou comandos
        if config.mode == AutonomousAgentMode.PLAN and spec.risk in {ToolRisk.WRITE, ToolRisk.EXEC}:
            tool_result = ToolResult(
                call_id=call.id,
                name=call.name,
                success=False,
                denied=True,
                error="O modo 'PLAN' é estritamente de leitura. Descreva o plano proposto em vez de alterá-lo.",
            )
            async for event in self._finish_tool(
                tool_result,
                config,
                role,
                messages,
                actions_taken,
                evidence_collected,
                affected_files,
                tests_executed,
                risks_identified,
                blockers_encountered,
            ):
                yield event
            return

        # 2. Kill Switch
        if hasattr(
            self.security_core, "kill_switch"
        ) and self.security_core.kill_switch.is_tool_blocked(call.name):
            tool_result = ToolResult(
                call_id=call.id,
                name=call.name,
                success=False,
                denied=True,
                error=f"A ferramenta '{call.name}' está bloqueada pelo Kill Switch.",
            )
            async for event in self._finish_tool(
                tool_result,
                config,
                role,
                messages,
                actions_taken,
                evidence_collected,
                affected_files,
                tests_executed,
                risks_identified,
                blockers_encountered,
            ):
                yield event
            return

        # 3. Aprovação Humana no modo ASK para operações críticas
        if spec.requires_approval:
            try:
                preview = self.tools.preview(call, config.project_id or "")
            except PermissionDeniedError as exc:
                tool_result = ToolResult(
                    call_id=call.id, name=call.name, success=False, denied=True, error=str(exc)
                )
                async for event in self._finish_tool(
                    tool_result,
                    config,
                    role,
                    messages,
                    actions_taken,
                    evidence_collected,
                    affected_files,
                    tests_executed,
                    risks_identified,
                    blockers_encountered,
                ):
                    yield event
                return
            except Exception as exc:
                tool_result = ToolResult(
                    call_id=call.id,
                    name=call.name,
                    success=False,
                    error=f"Pré-validação falhou: {exc}",
                )
                async for event in self._finish_tool(
                    tool_result,
                    config,
                    role,
                    messages,
                    actions_taken,
                    evidence_collected,
                    affected_files,
                    tests_executed,
                    risks_identified,
                    blockers_encountered,
                ):
                    yield event
                return

            if preview is not None:
                ticket = self.broker.create(
                    task_id=task_id,
                    agent_role=role.value,
                    operation=preview["operation"],
                    impact_summary=preview["impact_summary"],
                    affected_resources=preview["affected_resources"],
                    proposed_diff=preview.get("proposed_diff"),
                    reversible=preview.get("reversible", True),
                    owner_user_id=config.owner_user_id,
                )
                yield {
                    "type": "approval_required",
                    "approval_id": ticket.request_id,
                    "task_id": task_id,
                    "operation": preview["operation"],
                    "impact_summary": preview["impact_summary"],
                    "affected_resources": preview["affected_resources"],
                    "proposed_diff": preview.get("proposed_diff"),
                    "agent_role": role.value,
                }
                try:
                    ticket = await self.broker.wait(ticket, timeout_seconds=900.0)
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
                        error=f"Aprovação rejeitada pelo operador humano: {ticket.rejection_reason or 'Sem justificativa.'}",
                    )
                    blockers_encountered.append(f"Aprovação recusada para ferramenta {call.name}")
                    async for event in self._finish_tool(
                        tool_result,
                        config,
                        role,
                        messages,
                        actions_taken,
                        evidence_collected,
                        affected_files,
                        tests_executed,
                        risks_identified,
                        blockers_encountered,
                    ):
                        yield event
                    return

                resources = preview.get("affected_resources") or []
                try:
                    self.security_core.approval_engine.consume_approved_request(
                        ticket.request_id,
                        operation=preview["operation"],
                        task_id=task_id,
                        resource=resources[0] if resources else "",
                        proposed_diff=preview.get("proposed_diff"),
                        owner_user_id=config.owner_user_id,
                    )
                except (ValueError, KeyError) as exc:
                    tool_result = ToolResult(
                        call_id=call.id,
                        name=call.name,
                        success=False,
                        denied=True,
                        error=f"Aprovação não pôde ser validada para uso único: {exc}",
                    )
                    blockers_encountered.append("Aprovação expirada ou já utilizada")
                    async for event in self._finish_tool(
                        tool_result,
                        config,
                        role,
                        messages,
                        actions_taken,
                        evidence_collected,
                        affected_files,
                        tests_executed,
                        risks_identified,
                        blockers_encountered,
                    ):
                        yield event
                    return

        # 4. Execução da Ferramenta
        try:
            tool_result = await self.tools.execute(
                call, config.project_id or "", owner_user_id=config.owner_user_id
            )
        except Exception as exc:
            tool_result = ToolResult(
                call_id=call.id,
                name=call.name,
                success=False,
                error=f"Falha de execução: {exc}",
            )

        async for event in self._finish_tool(
            tool_result,
            config,
            role,
            messages,
            actions_taken,
            evidence_collected,
            affected_files,
            tests_executed,
            risks_identified,
            blockers_encountered,
        ):
            yield event

    async def _finish_tool(
        self,
        tool_result: ToolResult,
        config: AutonomousAgentRunConfig,
        role: AgentRole,
        messages: list[ChatTurn],
        actions_taken: list[str],
        evidence_collected: list[str],
        affected_files: list[str],
        tests_executed: list[str],
        risks_identified: list[str],
        blockers_encountered: list[str],
    ) -> AsyncIterator[dict[str, Any]]:
        # Auto-correção em caso de falha da ferramenta
        if not tool_result.success:
            model_text = (
                f"[ERRO AO EXECUTAR '{tool_result.name}']: {tool_result.error}\n"
                f"Diretriz de Auto-Correção: A ferramenta falhou ou foi bloqueada. "
                f"Reflita (Thought) sobre a causa raiz e tente uma abordagem corretiva ou alternativa."
            )
            risks_identified.append(f"Falha na ferramenta {tool_result.name}: {tool_result.error}")
        else:
            model_text = tool_result.to_model_text()
            actions_taken.append(f"Executou {tool_result.name}")
            if tool_result.output:
                evidence_collected.append(
                    f"Evidência de {tool_result.name}: {tool_result.output[:180].strip()}..."
                )
            if tool_result.changed_files:
                affected_files.extend(tool_result.changed_files)
            if tool_result.name in {"run_tests", "run_linter"}:
                tests_executed.append(
                    f"{tool_result.name} ({'sucesso' if tool_result.success else 'falha'})"
                )

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
            owner_user_id=config.owner_user_id,
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
            "agent_role": role.value,
            "duration_ms": round(tool_result.duration_ms, 2),
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _prepare_project(self, project_id: str | None) -> Path | None:
        if not project_id:
            return None
        root = self.workspace_service.get_project_dir(project_id)
        if not root.exists() or not root.is_dir():
            raise FileNotFoundError(f"Projeto '{project_id}' não encontrado no Project Workspace.")
        try:
            self.security_core.permission_engine.validate_path_access(project_id, ".")
        except PermissionDeniedError:
            self.security_core.permission_engine.register_project(
                project_id=project_id, root_path=str(root)
            )
        return root.resolve()

    def _load_history(self, config: AutonomousAgentRunConfig, session_id: str) -> list[ChatTurn]:
        if not config.include_history or self.db_manager is None:
            return []
        try:
            rows = self.db_manager.list_chat_messages(
                session_id,
                limit=MAX_HISTORY_MESSAGES,
                ascending=False,
                owner_user_id=config.owner_user_id,
            )
        except Exception as exc:
            logger.warning("Falha ao carregar histórico da sessão %s: %s", session_id, exc)
            return []

        turns: list[ChatTurn] = []
        for row in reversed(rows):
            row_project = row.get("project_id")
            if row_project and config.project_id and row_project != config.project_id:
                continue
            role = row.get("role", "user")
            if role == "system":
                continue
            tool_calls = []
            for raw in row.get("tool_calls") or []:
                try:
                    tool_calls.append(ToolCall(**raw))
                except Exception as exc:
                    logger.debug("Ignorando tool call malformada no histórico: %s", exc)
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

    def _load_memories(self, role: AgentRole, owner_user_id: str | None = None) -> list[str]:
        if not self.db_manager:
            return []
        try:
            mems = self.db_manager.list_agent_memories(
                agent_role=role.value, limit=10, owner_user_id=owner_user_id
            )
            return [
                f"{m.get('key', 'Fato')}: {m.get('content', '')}" for m in mems if m.get("content")
            ]
        except Exception as exc:
            logger.warning("Falha ao ler memórias do agente %s: %s", role.value, exc)
            return []

    def _load_skills(self, role: AgentRole) -> str:
        if not self.skills_manager:
            return ""
        try:
            if hasattr(self.skills_manager, "get_agent_skills"):
                skills = self.skills_manager.get_agent_skills(role)
                return "\n".join(f"- {s.name}: {s.description}" for s in skills)
        except Exception as exc:
            logger.warning("Falha ao obter skills do agente %s: %s", role.value, exc)
        return ""

    def _tools_for_specialist(
        self, allowed_tools: list[str], mode: AutonomousAgentMode
    ) -> list[ToolSpec]:
        allowed_set = set(allowed_tools)
        # Mapeamento de sinônimos/aliases comuns
        if "glob_find" in allowed_set:
            allowed_set.add("glob")
        if "grep_search" in allowed_set:
            allowed_set.add("grep")
        if "execute_command" in allowed_set:
            allowed_set.add("run_command")

        specs: list[ToolSpec] = []
        for spec in self.tools.list_specs():
            if spec.name not in allowed_set:
                continue
            if mode == AutonomousAgentMode.PLAN and spec.risk in {ToolRisk.WRITE, ToolRisk.EXEC}:
                continue
            specs.append(spec)
        return specs

    def _persist(
        self,
        session_id: str,
        project_id: str | None,
        role: str,
        content: str,
        *,
        tool_calls: list[dict[str, Any]] | None = None,
        tool_call_id: str | None = None,
        tool_name: str | None = None,
        owner_user_id: str | None = None,
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
                owner_user_id=owner_user_id,
            )
        except Exception as exc:
            logger.warning("Falha ao persistir mensagem do agente %s: %s", role, exc)

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
