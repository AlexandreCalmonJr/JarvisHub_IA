import json
import logging
import re
import shlex
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

from agents.registry import AgentRegistry
from packages.contracts.agent import AgentRole
from packages.contracts.approval import ApprovalStatus
from packages.contracts.security import AuditEventSeverity
from services.security_core import PermissionDeniedError, SecurityCore

from .registry import ToolRegistry
from .sandbox import SubprocessSandbox
from .specialized_tools import (
    execute_duckdb_query,
    execute_generate_sbom,
    execute_inspect_dependencies,
    execute_scan_sast_patterns,
    execute_scan_secrets,
    execute_sql_query_explain,
)
from .types import ToolCategory, ToolExecutionRequest, ToolExecutionResult


class ToolGateway:
    """
    Broker central para execução controlada e auditada de ferramentas.
    Nenhuma ferramenta é chamada diretamente pelo modelo de IA.
    """

    def __init__(
        self,
        security_core: SecurityCore,
        agent_registry: AgentRegistry | None = None,
        sandbox: SubprocessSandbox | None = None,
    ):
        self.security_core = security_core
        self.agent_registry = agent_registry or AgentRegistry()
        self.tool_registry = ToolRegistry()
        self.sandbox = sandbox or SubprocessSandbox()

    async def execute_tool(
        self, request: ToolExecutionRequest, owner_user_id: str
    ) -> ToolExecutionResult:
        if not owner_user_id:
            raise PermissionDeniedError("A conta proprietária é obrigatória para executar ferramentas.")
        start_time = time.perf_counter()

        # 1. Verificação do Kill Switch
        if self.security_core.kill_switch.is_global_killed():
            raise PermissionDeniedError("Execução de ferramentas suspensa pelo Kill Switch Global.")
        if request.task_id and self.security_core.kill_switch.is_task_cancelled(request.task_id):
            raise PermissionDeniedError(f"A tarefa '{request.task_id}' foi cancelada.")
        if self.security_core.kill_switch.is_tool_blocked(request.tool_name):
            raise PermissionDeniedError(
                f"A ferramenta '{request.tool_name}' está bloqueada por política de segurança."
            )

        # 2. Verificação no Catálogo de Ferramentas Permitidas
        tool_def = self.tool_registry.get_tool(request.tool_name)
        if not tool_def:
            self._audit(request, "DENIED", owner_user_id=owner_user_id, reason="Ferramenta não permitida ou desconhecida")
            raise PermissionDeniedError(
                f"A ferramenta '{request.tool_name}' não está no catálogo autorizado."
            )

        # 3. Verificação de Permissão por Perfil de Agente
        NON_MUTATING_CATEGORIES = {
            ToolCategory.READ_ONLY,
            ToolCategory.SEARCH,
            ToolCategory.GIT_READ,
            ToolCategory.ANALYTICS,
            ToolCategory.SECURITY_SCAN,
        }
        try:
            role_enum = AgentRole(request.agent_role)
            profile = self.agent_registry.get_profile(role_enum)
            if profile and getattr(profile, "is_read_only", False) and tool_def.category not in NON_MUTATING_CATEGORIES:
                raise PermissionDeniedError(
                    f"O agente '{request.agent_role}' está configurado em modo Somente Leitura (Read-Only) e não pode executar '{request.tool_name}'."
                )
            allowed_tools = self.agent_registry.get_allowed_tools(role_enum)
            if (
                request.tool_name not in allowed_tools
                and tool_def.category not in NON_MUTATING_CATEGORIES
            ):
                raise PermissionDeniedError(
                    f"O agente '{request.agent_role}' não tem permissão para usar '{request.tool_name}'."
                )
        except ValueError:
            raise PermissionDeniedError(f"Papel de agente desconhecido: '{request.agent_role}'.")

        # 4. Validação de Contenção de Caminho no Projeto
        project_root = self.security_core.permission_engine.validate_path_access(
            request.project_id, "."
        )

        # 5. Verificação de Aprovação Humana Prévia (se exigida)
        if tool_def.requires_approval:
            if not request.approval_id:
                raise PermissionDeniedError(
                    f"A ferramenta '{request.tool_name}' exige autorização humana explícita."
                )
            appr = self.security_core.approval_engine.get_request(request.approval_id, owner_user_id=owner_user_id)
            if not appr or appr.status != ApprovalStatus.APPROVED:
                raise PermissionDeniedError(
                    f"Aprovação '{request.approval_id}' não autorizada ou pendente."
                )

        # 6. Despacho e Execução Segura
        try:
            if request.tool_name == "read_file":
                rel_path = request.arguments.get("file_path", "")
                resolved_file = self.security_core.permission_engine.validate_path_access(
                    request.project_id, rel_path
                )
                if not resolved_file.is_file():
                    raise FileNotFoundError(f"Arquivo '{rel_path}' não encontrado.")
                content = resolved_file.read_text(encoding="utf-8", errors="replace")[:100_000]
                result = ToolExecutionResult(
                    tool_name=request.tool_name,
                    success=True,
                    stdout=content,
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                )

            elif request.tool_name == "list_directory":
                rel_path = request.arguments.get("path", ".")
                resolved_dir = self.security_core.permission_engine.validate_path_access(
                    request.project_id, rel_path
                )
                entries = [p.name for p in resolved_dir.iterdir() if not p.name.startswith(".git")]
                result = ToolExecutionResult(
                    tool_name=request.tool_name,
                    success=True,
                    stdout="\n".join(entries),
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                )

            elif request.tool_name == "git_status":
                code, out, err, dur = await self.sandbox.run_command(
                    ["git", "status", "--short"], cwd=project_root
                )
                result = ToolExecutionResult(
                    tool_name=request.tool_name,
                    success=code == 0,
                    exit_code=code,
                    stdout=out,
                    stderr=err,
                    duration_ms=dur,
                )

            elif request.tool_name == "run_tests":
                # Detecta runner apropriado conforme a stack
                if (project_root / "pubspec.yaml").exists():
                    cmd = (
                        ["flutter.bat", "test"]
                        if Path("C:/tools/flutter/bin/flutter.bat").exists()
                        else ["flutter", "test"]
                    )
                else:
                    cmd = ["python", "-m", "pytest"]
                code, out, err, dur = await self.sandbox.run_command(cmd, cwd=project_root)
                result = ToolExecutionResult(
                    tool_name=request.tool_name,
                    success=code == 0,
                    exit_code=code,
                    stdout=out,
                    stderr=err,
                    duration_ms=dur,
                )

            elif request.tool_name == "run_linter":
                if (project_root / "pubspec.yaml").exists():
                    cmd = (
                        ["flutter.bat", "analyze"]
                        if Path("C:/tools/flutter/bin/flutter.bat").exists()
                        else ["flutter", "analyze"]
                    )
                else:
                    cmd = ["ruff", "check", "."]
                code, out, err, dur = await self.sandbox.run_command(cmd, cwd=project_root)
                result = ToolExecutionResult(
                    tool_name=request.tool_name,
                    success=code == 0,
                    exit_code=code,
                    stdout=out,
                    stderr=err,
                    duration_ms=dur,
                )

            elif request.tool_name == "git_diff":
                code, out, err, dur = await self.sandbox.run_command(
                    ["git", "diff"], cwd=project_root
                )
                result = ToolExecutionResult(
                    tool_name=request.tool_name,
                    success=code == 0,
                    exit_code=code,
                    stdout=out if out else "Nenhuma alteração não comitada no repositório.",
                    stderr=err,
                    duration_ms=dur,
                )

            elif request.tool_name == "search_code":
                query = request.arguments.get("query", "")
                rel_path = request.arguments.get("path", ".")
                resolved_dir = self.security_core.permission_engine.validate_path_access(
                    request.project_id, rel_path
                )
                matches: list[str] = []
                if resolved_dir.is_dir():
                    for file_p in resolved_dir.rglob("*"):
                        if file_p.is_file() and not any(part.startswith(".") for part in file_p.parts):
                            try:
                                text = file_p.read_text(encoding="utf-8", errors="ignore")
                                if query.lower() in text.lower():
                                    matches.append(str(file_p.relative_to(project_root)))
                            except Exception as exc:
                                logger.debug("Falha ao ler arquivo na busca %s: %s", file_p, exc)
                result = ToolExecutionResult(
                    tool_name=request.tool_name,
                    success=True,
                    stdout="\n".join(matches[:50]) if matches else "Nenhuma ocorrência encontrada.",
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                )

            elif request.tool_name == "duckdb_query":
                sql = request.arguments.get("sql", request.arguments.get("query", ""))
                max_rows = request.arguments.get("max_rows", 50)
                ok, out, err = execute_duckdb_query(sql=sql, project_root=project_root, max_rows=max_rows)
                result = ToolExecutionResult(
                    tool_name=request.tool_name,
                    success=ok,
                    stdout=out,
                    stderr=err,
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                )

            elif request.tool_name == "scan_secrets":
                target_p = request.arguments.get("path", ".")
                ok, out, err = execute_scan_secrets(project_root=project_root, target_path=target_p)
                result = ToolExecutionResult(
                    tool_name=request.tool_name,
                    success=ok,
                    stdout=out,
                    stderr=err,
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                )

            elif request.tool_name == "scan_sast_patterns":
                target_p = request.arguments.get("path", ".")
                ok, out, err = execute_scan_sast_patterns(project_root=project_root, target_path=target_p)
                result = ToolExecutionResult(
                    tool_name=request.tool_name,
                    success=ok,
                    stdout=out,
                    stderr=err,
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                )

            elif request.tool_name == "inspect_dependencies":
                ok, out, err = execute_inspect_dependencies(project_root=project_root)
                result = ToolExecutionResult(
                    tool_name=request.tool_name,
                    success=ok,
                    stdout=out,
                    stderr=err,
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                )

            elif request.tool_name == "generate_sbom":
                ok, out, err = execute_generate_sbom(project_root=project_root)
                result = ToolExecutionResult(
                    tool_name=request.tool_name,
                    success=ok,
                    stdout=out,
                    stderr=err,
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                )

            elif request.tool_name == "sql_query_explain":
                sql = request.arguments.get("sql", request.arguments.get("query", ""))
                db_name = request.arguments.get("db_filename", "jarvis.db")
                ok, out, err = execute_sql_query_explain(sql=sql, project_root=project_root, db_filename=db_name)
                result = ToolExecutionResult(
                    tool_name=request.tool_name,
                    success=ok,
                    stdout=out,
                    stderr=err,
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                )

            elif request.tool_name == "vector_search":
                # O índice vetorial legado usa tabelas globais sem namespace de conta.
                # Bloqueia até a migração para índices privados por proprietário.
                raise PermissionDeniedError(
                    "Busca vetorial indisponível até a conclusão do isolamento dos índices por conta."
                )

            elif request.tool_name == "web_search":
                query = request.arguments.get("query", "")
                from .web_search import safe_web_search
                search_results = await safe_web_search.search(query=query)
                formatted = [f"**{r.title}** ({r.url})\n{r.snippet}" for r in search_results]
                result = ToolExecutionResult(
                    tool_name=request.tool_name,
                    success=True,
                    stdout="\n\n".join(formatted) if formatted else "Nenhum resultado retornado.",
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                )

            elif request.tool_name == "write_file":
                rel_path = request.arguments.get("path", request.arguments.get("file_path", ""))
                content = request.arguments.get("content", "")
                resolved_path = self.security_core.permission_engine.validate_path_access(
                    request.project_id, rel_path
                )
                resolved_path.parent.mkdir(parents=True, exist_ok=True)
                resolved_path.write_text(content, encoding="utf-8")
                result = ToolExecutionResult(
                    tool_name=request.tool_name,
                    success=True,
                    stdout=f"Arquivo '{rel_path}' gravado com sucesso ({len(content)} caracteres).",
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                )

            elif request.tool_name == "edit_file":
                rel_path = request.arguments.get("path", request.arguments.get("file_path", ""))
                target = request.arguments.get("target", request.arguments.get("old_str", ""))
                replacement = request.arguments.get("replacement", request.arguments.get("new_str", ""))
                resolved_path = self.security_core.permission_engine.validate_path_access(
                    request.project_id, rel_path
                )
                if not resolved_path.is_file():
                    raise FileNotFoundError(f"Arquivo '{rel_path}' não encontrado.")
                old_content = resolved_path.read_text(encoding="utf-8")
                if target not in old_content:
                    raise ValueError(f"Texto alvo não encontrado no arquivo '{rel_path}'.")
                new_content = old_content.replace(target, replacement)
                resolved_path.write_text(new_content, encoding="utf-8")
                result = ToolExecutionResult(
                    tool_name=request.tool_name,
                    success=True,
                    stdout=f"Arquivo '{rel_path}' editado com sucesso.",
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                )

            elif request.tool_name == "delete_file":
                rel_path = request.arguments.get("path", request.arguments.get("file_path", ""))
                resolved_path = self.security_core.permission_engine.validate_path_access(
                    request.project_id, rel_path
                )
                if resolved_path.is_file():
                    resolved_path.unlink()
                result = ToolExecutionResult(
                    tool_name=request.tool_name,
                    success=True,
                    stdout=f"Arquivo '{rel_path}' removido com sucesso.",
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                )

            elif request.tool_name == "glob_find":
                pattern = request.arguments.get("pattern", "*")
                rel_path = request.arguments.get("path", ".")
                resolved_dir = self.security_core.permission_engine.validate_path_access(
                    request.project_id, rel_path
                )
                matches_glob: list[str] = []
                if resolved_dir.is_dir():
                    for p in resolved_dir.glob(pattern):
                        if p.is_file() and not any(part.startswith(".") for part in p.parts):
                            matches_glob.append(str(p.relative_to(project_root)))
                result = ToolExecutionResult(
                    tool_name=request.tool_name,
                    success=True,
                    stdout="\n".join(matches_glob[:100]) if matches_glob else "Nenhum arquivo encontrado pelo padrão.",
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                )

            elif request.tool_name == "grep_search":
                pattern = request.arguments.get("pattern", request.arguments.get("query", ""))
                rel_path = request.arguments.get("path", ".")
                resolved_dir = self.security_core.permission_engine.validate_path_access(
                    request.project_id, rel_path
                )
                matches_grep: list[str] = []
                regex = re.compile(pattern, re.IGNORECASE)
                if resolved_dir.is_dir():
                    for file_p in resolved_dir.rglob("*"):
                        if file_p.is_file() and not any(part.startswith(".") for part in file_p.parts):
                            try:
                                text = file_p.read_text(encoding="utf-8", errors="ignore")
                                for lineno, line in enumerate(text.splitlines(), start=1):
                                    if regex.search(line):
                                        rel = str(file_p.relative_to(project_root))
                                        matches_grep.append(f"{rel}:{lineno}: {line.strip()[:200]}")
                                        if len(matches_grep) >= 80:
                                            break
                            except Exception as exc:
                                logger.debug("Falha no grep_search em %s: %s", file_p, exc)
                        if len(matches_grep) >= 80:
                            break
                result = ToolExecutionResult(
                    tool_name=request.tool_name,
                    success=True,
                    stdout="\n".join(matches_grep) if matches_grep else "Nenhum resultado correspondente ao padrão.",
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                )

            elif request.tool_name == "execute_command":
                cmd = request.arguments.get("command", "")
                if isinstance(cmd, str):
                    cmd_parts = shlex.split(cmd)
                else:
                    cmd_parts = list(cmd)
                code, out, err, dur = await self.sandbox.run_command(cmd_parts, cwd=project_root)
                result = ToolExecutionResult(
                    tool_name=request.tool_name,
                    success=code == 0,
                    exit_code=code,
                    stdout=out,
                    stderr=err,
                    duration_ms=dur,
                )

            else:
                raise PermissionDeniedError(f"Handler para '{request.tool_name}' não implementado.")

            self._audit(request, "SUCCESS", owner_user_id=owner_user_id, parameters={"duration_ms": result.duration_ms})
            return result

        except Exception as exc:
            self._audit(request, "FAILED", owner_user_id=owner_user_id, reason=str(exc))
            raise

    def _audit(
        self,
        req: ToolExecutionRequest,
        status: str,
        owner_user_id: str,
        parameters: dict[str, Any] | None = None,
        reason: str | None = None,
    ):
        if self.security_core.audit:
            self.security_core.audit.record_event(
                operation=f"TOOL_EXEC_{req.tool_name.upper()}",
                status=status,
                agent_role=req.agent_role,
                project_id=req.project_id,
                user_id=owner_user_id,
                tool_name=req.tool_name,
                parameters=parameters or req.arguments,
                severity=AuditEventSeverity.INFO
                if status == "SUCCESS"
                else AuditEventSeverity.WARNING,
                reason=reason,
            )
