import time
from pathlib import Path
from typing import Any

from agents.registry import AgentRegistry
from packages.contracts.agent import AgentRole
from packages.contracts.approval import ApprovalStatus
from packages.contracts.security import AuditEventSeverity
from services.security_core import PermissionDeniedError, SecurityCore

from .registry import ToolRegistry
from .sandbox import SubprocessSandbox
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

    async def execute_tool(self, request: ToolExecutionRequest) -> ToolExecutionResult:
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
            self._audit(request, "DENIED", reason="Ferramenta não permitida ou desconhecida")
            raise PermissionDeniedError(
                f"A ferramenta '{request.tool_name}' não está no catálogo autorizado."
            )

        # 3. Verificação de Permissão por Perfil de Agente
        try:
            role_enum = AgentRole(request.agent_role)
            allowed_tools = self.agent_registry.get_allowed_tools(role_enum)
            if (
                request.tool_name not in allowed_tools
                and tool_def.category != ToolCategory.READ_ONLY
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
            appr = self.security_core.approval_engine.get_request(request.approval_id)
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

            else:
                raise PermissionDeniedError(f"Handler para '{request.tool_name}' não implementado.")

            self._audit(request, "SUCCESS", parameters={"duration_ms": result.duration_ms})
            return result

        except Exception as exc:
            self._audit(request, "FAILED", reason=str(exc))
            raise

    def _audit(
        self,
        req: ToolExecutionRequest,
        status: str,
        parameters: dict[str, Any] | None = None,
        reason: str | None = None,
    ):
        if self.security_core.audit:
            self.security_core.audit.record_event(
                operation=f"TOOL_EXEC_{req.tool_name.upper()}",
                status=status,
                agent_role=req.agent_role,
                project_id=req.project_id,
                tool_name=req.tool_name,
                parameters=parameters or req.arguments,
                severity=AuditEventSeverity.INFO
                if status == "SUCCESS"
                else AuditEventSeverity.WARNING,
                reason=reason,
            )
