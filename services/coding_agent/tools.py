"""Ferramentas do agente de código.

Todas as operações passam pela allowlist de caminhos do ``SecurityCore`` e são
auditadas. Ferramentas de escrita e execução exigem aprovação humana (exceto no
modo ``auto``), mas continuam confinadas ao diretório autorizado do projeto.
"""

from __future__ import annotations

import fnmatch
import logging
import os
import re
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

from services.security_core import PermissionDeniedError, SecurityCore
from services.tool_gateway.specialized_tools import (
    execute_duckdb_query,
    execute_generate_sbom,
    execute_inspect_dependencies,
    execute_scan_sast_patterns,
    execute_scan_secrets,
    execute_sql_query_explain,
    vector_memory_manager,
)
from services.tool_gateway.web_search import safe_web_search

from .context import IGNORED_DIRS, _is_probably_text
from .types import ToolCall, ToolResult, ToolRisk, ToolSpec

MAX_READ_BYTES = 400_000
MAX_READ_LINES = 800
MAX_GREP_FILE_BYTES = 2_000_000

DANGEROUS_COMMAND_PATTERNS = [
    r"\brm\s+-rf\s+/(?:\s|$)",
    r"\brm\s+-rf\s+~",
    r"\bdel\s+/[fsq]\b.*[a-zA-Z]:\\",
    r"\bformat\s+[a-zA-Z]:",
    r"\bmkfs(?:\.\w+)?\b",
    r"\bshutdown\b",
    r"\breboot\b",
    r":\(\)\s*\{\s*:\|:&\s*\};:",
    r"(?:curl|wget)[^|]*\|\s*(?:sh|bash|zsh|powershell|pwsh)",
    r"powershell(?:\.exe)?\s+.*-(?:enc|encodedcommand)\b",
    r"\bInvoke-Expression\b",
    r"\bchmod\s+777\s+/(?:\s|$)",
    r"\bdd\s+if=",
    r"\bdiskpart\b",
    r"\breg\s+delete\b",
    r"\bnet\s+user\s+.*\s+/add\b",
]


def _sanitize_commit_message(message: str) -> str:
    """Normaliza a mensagem para uso seguro em shell e em uma linha de commit."""
    text = re.sub(r"[\r\n\t]+", " ", str(message or ""))
    text = re.sub(r'["\'`$%!]', "", text)
    text = re.sub(r"\s{2,}", " ", text).strip()
    if not text:
        raise ValueError("A mensagem de commit não pode ser vazia.")
    return text[:300]


def _tool_specs() -> list[ToolSpec]:
    return [
        ToolSpec(
            name="read_file",
            description=(
                "Lê um arquivo de texto do projeto ativo. Use offset/limit para ler em partes "
                "quando o arquivo for grande. Sempre leia um arquivo antes de editá-lo."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Caminho relativo à raiz do projeto."},
                    "offset": {"type": "integer", "description": "Linha inicial (1-based).", "default": 1},
                    "limit": {"type": "integer", "description": "Máximo de linhas.", "default": 400},
                },
                "required": ["path"],
            },
            risk=ToolRisk.READ,
        ),
        ToolSpec(
            name="list_directory",
            description="Lista arquivos e diretórios de um caminho do projeto, com tamanho e tipo.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Caminho relativo (padrão: raiz).", "default": "."},
                },
                "required": [],
            },
            risk=ToolRisk.READ,
        ),
        ToolSpec(
            name="glob",
            description="Encontra arquivos por padrão glob (ex.: '**/*.tsx', 'src/**/*.py').",
            parameters={
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "Padrão glob relativo ao projeto."},
                    "path": {"type": "string", "description": "Diretório base relativo.", "default": "."},
                },
                "required": ["pattern"],
            },
            risk=ToolRisk.READ,
        ),
        ToolSpec(
            name="grep",
            description=(
                "Pesquisa expressão regular nos arquivos do projeto. Retorna arquivo, linha e trecho. "
                "Prefira esta ferramenta a varrer arquivos manualmente."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "Expressão regular (Python re)."},
                    "path": {"type": "string", "description": "Diretório base relativo.", "default": "."},
                    "include": {"type": "string", "description": "Filtro glob de arquivos (ex.: '*.py').", "default": "*"},
                    "max_results": {"type": "integer", "description": "Máximo de ocorrências.", "default": 80},
                },
                "required": ["pattern"],
            },
            risk=ToolRisk.READ,
        ),
        ToolSpec(
            name="write_file",
            description=(
                "Cria ou substitui completamente um arquivo de texto. Use edit_file para mudanças pontuais. "
                "Exige aprovação humana em todos os modos."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Caminho relativo à raiz do projeto."},
                    "content": {"type": "string", "description": "Conteúdo completo do arquivo."},
                },
                "required": ["path", "content"],
            },
            risk=ToolRisk.WRITE,
            requires_approval=True,
        ),
        ToolSpec(
            name="edit_file",
            description=(
                "Edita um arquivo substituindo uma string exata por outra. Prefira esta ferramenta a "
                "reescrever o arquivo inteiro. Falha se old_string não existir ou for ambíguo."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Caminho relativo à raiz do projeto."},
                    "old_string": {"type": "string", "description": "Trecho exato a localizar."},
                    "new_string": {"type": "string", "description": "Novo trecho."},
                    "replace_all": {
                        "type": "boolean",
                        "description": "Substitui todas as ocorrências (padrão: apenas uma).",
                        "default": False,
                    },
                },
                "required": ["path", "old_string", "new_string"],
            },
            risk=ToolRisk.WRITE,
            requires_approval=True,
        ),
        ToolSpec(
            name="run_command",
            description=(
                "Executa um comando de shell dentro da raiz do projeto (testes, build, linter, git). "
                "Exige aprovação humana em todos os modos. Comandos destrutivos são bloqueados."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Comando a executar."},
                    "timeout_seconds": {
                        "type": "integer",
                        "description": "Timeout em segundos (máx. 600).",
                        "default": 120,
                    },
                },
                "required": ["command"],
            },
            risk=ToolRisk.EXEC,
            requires_approval=True,
        ),
        ToolSpec(
            name="git_status",
            description="Mostra o status atual do repositório Git do projeto.",
            parameters={"type": "object", "properties": {}, "required": []},
            risk=ToolRisk.READ,
        ),
        ToolSpec(
            name="git_diff",
            description="Mostra o diff unificado das alterações não commitadas do projeto.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Arquivo específico (opcional).", "default": ""},
                },
                "required": [],
            },
            risk=ToolRisk.READ,
        ),
        ToolSpec(
            name="git_commit",
            description=(
                "Cria um commit Git com todas as alterações do projeto (exceto backups .bak). "
                "Use apenas depois de revisar o diff e validar os testes. Exige aprovação humana "
                "em todos os modos."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "message": {
                        "type": "string",
                        "description": "Mensagem de commit curta e descritiva (imperativo).",
                    },
                    "paths": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Caminhos relativos a incluir (padrão: repositório inteiro).",
                        "default": [],
                    },
                },
                "required": ["message"],
            },
            risk=ToolRisk.EXEC,
            requires_approval=True,
        ),
        ToolSpec(
            name="duckdb_query",
            description=(
                "Executa consulta SQL analítica de alta performance com o motor DuckDB embutido. "
                "Pode ler arquivos CSV, Parquet e JSON diretamente do projeto (ex: SELECT * FROM 'dados.csv' LIMIT 10)."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "sql": {"type": "string", "description": "Comando SQL analítico a ser executado no DuckDB."},
                    "max_rows": {"type": "integer", "description": "Número máximo de linhas retornadas.", "default": 50},
                },
                "required": ["sql"],
            },
            risk=ToolRisk.READ,
        ),
        ToolSpec(
            name="scan_secrets",
            description="Varre o projeto em busca de credenciais, chaves de API, tokens e senhas expostas em texto claro.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Subdiretório a auditar (padrão: raiz).", "default": "."},
                },
                "required": [],
            },
            risk=ToolRisk.READ,
        ),
        ToolSpec(
            name="scan_sast_patterns",
            description="Audita estaticamente o código em busca de vulnerabilidades alinhadas ao OWASP Top 10 (SQLi, command injection, eval, etc.).",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Subdiretório a auditar (padrão: raiz).", "default": "."},
                },
                "required": [],
            },
            risk=ToolRisk.READ,
        ),
        ToolSpec(
            name="inspect_dependencies",
            description="Lê manifestos de pacotes (requirements.txt, package.json, pyproject.toml) e lista todas as dependências declaradas.",
            parameters={"type": "object", "properties": {}, "required": []},
            risk=ToolRisk.READ,
        ),
        ToolSpec(
            name="generate_sbom",
            description="Gera inventário de software SBOM padronizado (Software Bill of Materials) no formato CycloneDX.",
            parameters={"type": "object", "properties": {}, "required": []},
            risk=ToolRisk.READ,
        ),
        ToolSpec(
            name="sql_query_explain",
            description="Executa EXPLAIN QUERY PLAN em consultas SQL para diagnosticar gargalos de desempenho e uso de índices.",
            parameters={
                "type": "object",
                "properties": {
                    "sql": {"type": "string", "description": "Consulta SQL para auditar o plano de execução."},
                    "db_filename": {"type": "string", "description": "Nome do arquivo do banco SQLite.", "default": "jarvis.db"},
                },
                "required": ["sql"],
            },
            risk=ToolRisk.READ,
        ),
        ToolSpec(
            name="glob_find",
            description="Encontra arquivos por padrão glob (ex.: '**/*.tsx', 'src/**/*.py').",
            parameters={
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "Padrão glob relativo ao projeto."},
                    "path": {"type": "string", "description": "Diretório base relativo.", "default": "."},
                },
                "required": ["pattern"],
            },
            risk=ToolRisk.READ,
        ),
        ToolSpec(
            name="grep_search",
            description="Pesquisa expressão regular nos arquivos do projeto. Retorna arquivo, linha e trecho.",
            parameters={
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "Expressão regular (Python re)."},
                    "path": {"type": "string", "description": "Diretório base relativo.", "default": "."},
                    "include": {"type": "string", "description": "Filtro glob de arquivos (ex.: '*.py').", "default": "*"},
                    "max_results": {"type": "integer", "description": "Máximo de ocorrências.", "default": 80},
                },
                "required": ["pattern"],
            },
            risk=ToolRisk.READ,
        ),
        ToolSpec(
            name="execute_command",
            description="Executa um comando de sistema seguro e confinado no projeto autorizado sob aprovação humana.",
            parameters={
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Comando shell a executar."},
                    "timeout_seconds": {"type": "number", "description": "Timeout em segundos.", "default": 60.0},
                },
                "required": ["command"],
            },
            risk=ToolRisk.EXEC,
            requires_approval=True,
        ),
        ToolSpec(
            name="vector_search",
            description="Realiza busca semântica vetorial por similaridade no banco vetorial LanceDB embutido.",
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Texto ou termo de busca semântica."},
                    "table": {"type": "string", "description": "Tabela de vetores (padrão: project_vectors).", "default": "project_vectors"},
                    "top_k": {"type": "integer", "description": "Número de itens similares.", "default": 5},
                },
                "required": ["query"],
            },
            risk=ToolRisk.READ,
        ),
        ToolSpec(
            name="web_search",
            description="Pesquisa na web por informações técnicas atualizadas com proteção SSRF e sanitização DLP.",
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Termo de busca na web."},
                },
                "required": ["query"],
            },
            risk=ToolRisk.READ,
        ),
    ]


class CodingToolExecutor:
    """Executa ferramentas com confinamento de caminho e auditoria."""

    def __init__(
        self,
        security_core: SecurityCore,
        workspace_service: Any,
        sandbox: Any | None = None,
    ):
        self.security_core = security_core
        self.workspace_service = workspace_service
        self.sandbox = sandbox
        self.specs = {s.name: s for s in _tool_specs()}
        # Ferramentas externas (MCP): nome -> (spec, handler async)
        self.external: dict[str, tuple[ToolSpec, Callable[[dict[str, Any]], Any]]] = {}

    # ------------------------------------------------------------------
    # API pública
    # ------------------------------------------------------------------
    def list_specs(self) -> list[ToolSpec]:
        return list(self.specs.values()) + [spec for spec, _ in self.external.values()]

    def get_spec(self, name: str) -> ToolSpec | None:
        if name in self.external:
            return self.external[name][0]
        return self.specs.get(name)

    def register_external_tool(
        self,
        spec: ToolSpec,
        handler: Callable[[dict[str, Any]], Any],
    ) -> None:
        """Registra uma ferramenta externa (ex.: MCP) no catálogo do agente."""
        self.external[spec.name] = (spec, handler)

    def remove_external_tools(self, prefix: str = "") -> int:
        names = [name for name in self.external if not prefix or name.startswith(prefix)]
        for name in names:
            self.external.pop(name, None)
        return len(names)

    def is_write_tool(self, name: str) -> bool:
        spec = self.get_spec(name)
        return bool(spec and spec.risk in {ToolRisk.WRITE, ToolRisk.EXEC})

    # ------------------------------------------------------------------
    # Pré-visualização para aprovação humana
    # ------------------------------------------------------------------
    def preview(self, call: ToolCall, project_id: str) -> dict[str, Any] | None:
        """Descreve o impacto de uma ferramenta antes de pedir aprovação.

        Retorna ``None`` para ferramentas de leitura. Levanta exceções de
        validação (arquivo inexistente, trecho ambíguo, etc.) antes de qualquer
        escrita, para que o humano nunca aprove uma operação inválida.
        """
        if call.name == "write_file":
            rel = str(call.arguments.get("path", ""))
            path = self._resolve(project_id, rel)
            root = self._project_root(project_id)
            rel_norm = path.relative_to(root).as_posix()
            new_content = str(call.arguments.get("content", ""))
            old_content = (
                path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""
            )
            action = "Substituir" if path.exists() else "Criar"
            diff = self._unified_diff(old_content, new_content, rel_norm)
            return {
                "operation": "WRITE_FILE",
                "impact_summary": (
                    f"{action} o arquivo '{rel_norm}' "
                    f"({len(new_content.splitlines())} linhas, {len(new_content)} caracteres)."
                ),
                "affected_resources": [rel_norm],
                "proposed_diff": diff,
                "reversible": True,
            }

        if call.name == "edit_file":
            rel = str(call.arguments.get("path", ""))
            path = self._resolve(project_id, rel)
            if not path.is_file():
                raise FileNotFoundError(f"Arquivo não encontrado: '{rel}'.")
            old_string = str(call.arguments.get("old_string", ""))
            new_string = str(call.arguments.get("new_string", ""))
            if not old_string:
                raise ValueError("'old_string' não pode ser vazio.")
            if old_string == new_string:
                raise ValueError("'old_string' e 'new_string' são idênticos.")
            content = path.read_text(encoding="utf-8", errors="replace")
            occurrences = content.count(old_string)
            replace_all = bool(call.arguments.get("replace_all", False))
            if occurrences == 0:
                raise ValueError(
                    "Trecho não encontrado. Leia o arquivo novamente e use um trecho exato."
                )
            if occurrences > 1 and not replace_all:
                raise ValueError(
                    f"O trecho aparece {occurrences} vezes. Inclua mais contexto ou use replace_all=true."
                )
            updated = content.replace(old_string, new_string) if replace_all else content.replace(
                old_string, new_string, 1
            )
            root = self._project_root(project_id)
            rel_norm = path.relative_to(root).as_posix()
            diff = self._unified_diff(content, updated, rel_norm)
            return {
                "operation": "EDIT_FILE",
                "impact_summary": (
                    f"Editar '{rel_norm}' "
                    f"({occurrences if replace_all else 1} substituição(ões))."
                ),
                "affected_resources": [rel_norm],
                "proposed_diff": diff,
                "reversible": True,
            }

        if call.name == "run_command":
            command = str(call.arguments.get("command", "")).strip()
            if not command:
                raise ValueError("Comando vazio.")
            lowered = command.lower()
            for pattern in DANGEROUS_COMMAND_PATTERNS:
                if re.search(pattern, lowered, re.IGNORECASE):
                    raise PermissionDeniedError(
                        "Comando bloqueado pela política de segurança (padrão destrutivo detectado)."
                    )
            return {
                "operation": "RUN_COMMAND",
                "impact_summary": f"Executar comando no projeto: `{command}`",
                "affected_resources": [f"shell:{command}"],
                "proposed_diff": None,
                "reversible": False,
            }

        if call.name == "git_commit":
            message = _sanitize_commit_message(str(call.arguments.get("message", "")))
            raw_paths = call.arguments.get("paths") or []
            paths = [str(p) for p in raw_paths if str(p).strip()]
            for rel in paths:
                self._resolve(project_id, rel)
            return {
                "operation": "GIT_COMMIT",
                "impact_summary": f"Criar commit Git: \"{message}\"",
                "affected_resources": paths or ["."],
                "proposed_diff": None,
                "reversible": False,
            }

        if call.name in self.external:
            spec = self.external[call.name][0]
            if not spec.requires_approval:
                return None
            import json

            try:
                arguments = json.dumps(call.arguments, ensure_ascii=False)
            except Exception:
                arguments = str(call.arguments)
            if len(arguments) > 800:
                arguments = arguments[:800] + "..."
            return {
                "operation": "MCP_CALL",
                "impact_summary": f"Executar ferramenta MCP '{spec.name}': {arguments}",
                "affected_resources": [f"mcp:{spec.name}"],
                "proposed_diff": None,
                "reversible": False,
            }

        return None

    async def execute(self, call: ToolCall, project_id: str) -> ToolResult:
        started = time.perf_counter()
        spec = self.get_spec(call.name)
        if not spec:
            return ToolResult(
                call_id=call.id,
                name=call.name,
                success=False,
                error=f"Ferramenta desconhecida: '{call.name}'.",
                duration_ms=(time.perf_counter() - started) * 1000.0,
            )
        try:
            if call.name in self.external:
                result = await self._run_external(call)
            else:
                handler = getattr(self, f"_run_{call.name}", None)
                if handler is None:
                    raise PermissionDeniedError(f"Ferramenta '{call.name}' não implementada.")
                result = await handler(call.arguments, project_id)
            result.call_id = call.id
            result.name = call.name
            result.duration_ms = (time.perf_counter() - started) * 1000.0
            self._audit(call.name, project_id, "SUCCESS", result.changed_files)
            return result
        except PermissionDeniedError:
            raise
        except Exception as exc:
            result = ToolResult(
                call_id=call.id,
                name=call.name,
                success=False,
                error=str(exc),
                duration_ms=(time.perf_counter() - started) * 1000.0,
            )
            self._audit(call.name, project_id, "FAILED", reason=str(exc))
            return result

    # ------------------------------------------------------------------
    # Ferramentas externas (MCP)
    # ------------------------------------------------------------------
    async def _run_external(self, call: ToolCall) -> ToolResult:
        spec, handler = self.external[call.name]
        outcome = handler(call.arguments)
        if hasattr(outcome, "__await__"):
            outcome = await outcome
        if isinstance(outcome, ToolResult):
            return outcome
        data = outcome if isinstance(outcome, dict) else {"success": bool(outcome)}
        return ToolResult(
            call_id=call.id,
            name=spec.name,
            success=bool(data.get("success")),
            output=str(data.get("output") or ""),
            error=data.get("error"),
        )

    # ------------------------------------------------------------------
    # Resolução segura de caminhos
    # ------------------------------------------------------------------
    def _resolve(self, project_id: str, rel_path: str) -> Path:
        rel = (rel_path or ".").replace("\\", "/").strip()
        if rel.startswith("/") or re.match(r"^[a-zA-Z]:", rel):
            raise PermissionDeniedError("Caminhos absolutos não são permitidos.")
        try:
            return self.security_core.permission_engine.validate_path_access(project_id, rel)
        except PermissionDeniedError:
            project_root = self.workspace_service.get_project_dir(project_id)
            if not project_root.exists():
                raise
            self.security_core.permission_engine.register_project(project_id, str(project_root))
            return self.security_core.permission_engine.validate_path_access(project_id, rel)

    def _project_root(self, project_id: str) -> Path:
        return self._resolve(project_id, ".")

    def _audit(
        self,
        tool_name: str,
        project_id: str,
        status: str,
        changed_files: list[str] | None = None,
        reason: str | None = None,
    ) -> None:
        if not self.security_core.audit:
            return
        try:
            from packages.contracts.security import AuditEventSeverity

            self.security_core.audit.record_event(
                operation=f"CODING_AGENT_{tool_name.upper()}",
                status=status,
                project_id=project_id,
                tool_name=tool_name,
                parameters={"changed_files": changed_files or []},
                severity=AuditEventSeverity.INFO if status == "SUCCESS" else AuditEventSeverity.WARNING,
                reason=reason,
            )
        except Exception as exc:
            logger.debug("Falha ao registrar auditoria de ferramenta: %s", exc)

    # ------------------------------------------------------------------
    # Handlers de leitura
    # ------------------------------------------------------------------
    async def _run_read_file(self, args: dict[str, Any], project_id: str) -> ToolResult:
        path = self._resolve(project_id, str(args.get("path", "")))
        if not path.is_file():
            raise FileNotFoundError(f"Arquivo não encontrado: '{args.get('path')}'.")
        size = path.stat().st_size
        if size > MAX_READ_BYTES:
            raise ValueError(
                f"Arquivo muito grande ({size} bytes). Use offset/limit ou a ferramenta grep."
            )
        raw = path.read_text(encoding="utf-8", errors="replace")
        lines = raw.splitlines()
        offset = max(1, int(args.get("offset") or 1))
        limit = max(1, min(int(args.get("limit") or 400), MAX_READ_LINES))
        selected = lines[offset - 1 : offset - 1 + limit]
        numbered = "\n".join(f"{i + offset:>5}| {line}" for i, line in enumerate(selected))
        header = f"{args.get('path')} ({len(lines)} linhas, {size} bytes)"
        if offset > 1 or offset - 1 + limit < len(lines):
            header += f" — exibindo linhas {offset}..{offset - 1 + len(selected)}"
        return ToolResult(
            call_id="",
            name="read_file",
            success=True,
            output=f"{header}\n{numbered}" if numbered else f"{header}\n(arquivo vazio)",
        )

    async def _run_list_directory(self, args: dict[str, Any], project_id: str) -> ToolResult:
        target = self._resolve(project_id, str(args.get("path") or "."))
        if not target.is_dir():
            raise NotADirectoryError(f"'{args.get('path')}' não é um diretório.")
        root = self._project_root(project_id)
        entries = []
        for item in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
            if item.name in IGNORED_DIRS:
                continue
            if item.is_dir():
                entries.append(f"[DIR ] {item.relative_to(root).as_posix()}/")
            else:
                try:
                    entries.append(f"[FILE] {item.relative_to(root).as_posix()} ({item.stat().st_size} bytes)")
                except OSError:
                    entries.append(f"[FILE] {item.relative_to(root).as_posix()}")
        return ToolResult(
            call_id="",
            name="list_directory",
            success=True,
            output="\n".join(entries) if entries else "(diretório vazio)",
        )

    async def _run_glob(self, args: dict[str, Any], project_id: str) -> ToolResult:
        pattern = str(args.get("pattern") or "")
        if not pattern or ".." in pattern:
            raise ValueError("Padrão glob inválido.")
        base = self._resolve(project_id, str(args.get("path") or "."))
        root = self._project_root(project_id)
        matches: list[str] = []
        for candidate in base.glob(pattern):
            if any(part in IGNORED_DIRS for part in candidate.parts):
                continue
            if candidate.is_file():
                matches.append(candidate.relative_to(root).as_posix())
            if len(matches) >= 300:
                break
        return ToolResult(
            call_id="",
            name="glob",
            success=True,
            output="\n".join(sorted(matches)) if matches else "Nenhum arquivo corresponde ao padrão.",
        )

    async def _run_grep(self, args: dict[str, Any], project_id: str) -> ToolResult:
        pattern = str(args.get("pattern") or "")
        if not pattern:
            raise ValueError("Informe uma expressão regular em 'pattern'.")
        try:
            regex = re.compile(pattern, re.IGNORECASE)
        except re.error as exc:
            raise ValueError(f"Expressão regular inválida: {exc}") from exc

        base = self._resolve(project_id, str(args.get("path") or "."))
        root = self._project_root(project_id)
        include = str(args.get("include") or "*")
        max_results = max(1, min(int(args.get("max_results") or 80), 400))
        matches: list[str] = []

        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [d for d in dirnames if d not in IGNORED_DIRS]
            for name in filenames:
                if not fnmatch.fnmatch(name, include):
                    continue
                file_path = Path(dirpath) / name
                if not _is_probably_text(file_path):
                    continue
                try:
                    if file_path.stat().st_size > MAX_GREP_FILE_BYTES:
                        continue
                    text = file_path.read_text(encoding="utf-8", errors="ignore")
                except Exception as exc:
                    logger.debug("Falha ao ler arquivo para grep %s: %s", file_path, exc)
                    continue
                for lineno, line in enumerate(text.splitlines(), start=1):
                    if regex.search(line):
                        rel = file_path.relative_to(root).as_posix()
                        matches.append(f"{rel}:{lineno}: {line.strip()[:240]}")
                        if len(matches) >= max_results:
                            break
                if len(matches) >= max_results:
                    break
            if len(matches) >= max_results:
                break

        return ToolResult(
            call_id="",
            name="grep",
            success=True,
            output="\n".join(matches) if matches else "Nenhuma ocorrência encontrada.",
        )

    # ------------------------------------------------------------------
    # Handlers de escrita
    # ------------------------------------------------------------------
    async def _run_write_file(self, args: dict[str, Any], project_id: str) -> ToolResult:
        path = self._resolve(project_id, str(args.get("path", "")))
        content = str(args.get("content", ""))
        root = self._project_root(project_id)
        existed = path.exists()
        old_content = path.read_text(encoding="utf-8", errors="replace") if existed else ""
        if existed:
            backup = path.with_suffix(path.suffix + ".bak")
            backup.write_text(old_content, encoding="utf-8")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        diff = self._unified_diff(old_content, content, path.relative_to(root).as_posix())
        action = "atualizado" if existed else "criado"
        return ToolResult(
            call_id="",
            name="write_file",
            success=True,
            output=f"Arquivo {action}: {path.relative_to(root).as_posix()}\n{diff}",
            changed_files=[path.relative_to(root).as_posix()],
            diff=diff,
        )

    async def _run_edit_file(self, args: dict[str, Any], project_id: str) -> ToolResult:
        path = self._resolve(project_id, str(args.get("path", "")))
        if not path.is_file():
            raise FileNotFoundError(f"Arquivo não encontrado: '{args.get('path')}'.")
        old_string = str(args.get("old_string", ""))
        new_string = str(args.get("new_string", ""))
        if not old_string:
            raise ValueError("'old_string' não pode ser vazio.")
        if old_string == new_string:
            raise ValueError("'old_string' e 'new_string' são idênticos.")
        content = path.read_text(encoding="utf-8", errors="replace")
        occurrences = content.count(old_string)
        if occurrences == 0:
            raise ValueError(
                "Trecho não encontrado. Leia o arquivo novamente e use um trecho exato, "
                "incluindo indentação."
            )
        replace_all = bool(args.get("replace_all", False))
        if occurrences > 1 and not replace_all:
            raise ValueError(
                f"O trecho aparece {occurrences} vezes. Inclua mais contexto ou use replace_all=true."
            )
        updated = content.replace(old_string, new_string) if replace_all else content.replace(
            old_string, new_string, 1
        )
        backup = path.with_suffix(path.suffix + ".bak")
        backup.write_text(content, encoding="utf-8")
        path.write_text(updated, encoding="utf-8")
        rel = path.relative_to(self._project_root(project_id)).as_posix()
        diff = self._unified_diff(content, updated, rel)
        return ToolResult(
            call_id="",
            name="edit_file",
            success=True,
            output=f"Arquivo editado: {rel} ({occurrences if replace_all else 1} substituição(ões))\n{diff}",
            changed_files=[rel],
            diff=diff,
        )

    # ------------------------------------------------------------------
    # Execução de comandos
    # ------------------------------------------------------------------
    async def _run_shell(
        self, command: str, project_id: str, timeout_seconds: float
    ) -> tuple[int, str, str, float]:
        cwd = self._project_root(project_id)
        if self.sandbox is not None:
            return await self.sandbox.run_shell_command(command, cwd, timeout_seconds)
        if self.workspace_service is not None and hasattr(
            self.workspace_service, "run_shell_command"
        ):
            return await self.workspace_service.run_shell_command(
                command, cwd, timeout_seconds
            )
        raise RuntimeError("Executor de shell indisponível.")

    async def _run_run_command(self, args: dict[str, Any], project_id: str) -> ToolResult:
        command = str(args.get("command") or "").strip()
        if not command:
            raise ValueError("Comando vazio.")
        lowered = command.lower()
        for pattern in DANGEROUS_COMMAND_PATTERNS:
            if re.search(pattern, lowered, re.IGNORECASE):
                raise PermissionDeniedError(
                    "Comando bloqueado pela política de segurança (padrão destrutivo detectado)."
                )
        timeout = max(1, min(int(args.get("timeout_seconds") or 120), 600))
        exit_code, stdout, stderr, duration = await self._run_shell(
            command, project_id, timeout
        )
        output = stdout
        if stderr:
            output += f"\n[stderr]\n{stderr}"
        return ToolResult(
            call_id="",
            name="run_command",
            success=exit_code == 0,
            output=output,
            error=None if exit_code == 0 else f"Comando terminou com código {exit_code}.",
            duration_ms=duration,
        )

    async def _run_git_status(self, args: dict[str, Any], project_id: str) -> ToolResult:
        exit_code, stdout, stderr, duration = await self._run_shell(
            "git status --short --branch", project_id, 30
        )
        return ToolResult(
            call_id="",
            name="git_status",
            success=exit_code == 0,
            output=stdout + (f"\n{stderr}" if stderr else ""),
            error=None if exit_code == 0 else stderr,
            duration_ms=duration,
        )

    async def _run_git_diff(self, args: dict[str, Any], project_id: str) -> ToolResult:
        requested = str(args.get("path") or "").strip()
        command = "git diff"
        if requested:
            safe = self._resolve(project_id, requested)
            command += f' -- "{safe.name}"'
        exit_code, stdout, stderr, duration = await self._run_shell(
            command, project_id, 30
        )
        output = stdout or "Nenhuma alteração não commitada."
        return ToolResult(
            call_id="",
            name="git_diff",
            success=exit_code == 0,
            output=output,
            error=None if exit_code == 0 else stderr,
            duration_ms=duration,
        )

    async def _run_git_commit(self, args: dict[str, Any], project_id: str) -> ToolResult:
        message = _sanitize_commit_message(str(args.get("message", "")))
        raw_paths = args.get("paths") or []
        paths = [str(p) for p in raw_paths if str(p).strip()]
        for rel in paths:
            self._resolve(project_id, rel)

        add_targets = " ".join(f'"{rel}"' for rel in paths) or "."
        # Backups .bak nunca entram no commit, mesmo com git add -A.
        command = (
            f"git add -A -- {add_targets} "
            f'":(exclude)**/*.bak" ":(exclude)*.bak" '
            f'&& git commit -m "{message}"'
        )
        exit_code, stdout, stderr, duration = await self._run_shell(
            command, project_id, 60
        )
        output = stdout
        if stderr:
            output += f"\n[stderr]\n{stderr}"
        return ToolResult(
            call_id="",
            name="git_commit",
            success=exit_code == 0,
            output=output.strip() or ("Commit criado." if exit_code == 0 else ""),
            error=None if exit_code == 0 else f"Git commit falhou (código {exit_code}).",
            duration_ms=duration,
        )

    async def _run_duckdb_query(self, args: dict[str, Any], project_id: str) -> ToolResult:
        root = self._project_root(project_id)
        sql = str(args.get("sql", args.get("query", ""))).strip()
        max_rows = int(args.get("max_rows", 50))
        ok, out, err = execute_duckdb_query(sql=sql, project_root=root, max_rows=max_rows)
        return ToolResult(
            call_id="",
            name="duckdb_query",
            success=ok,
            output=out,
            error=err or None,
        )

    async def _run_scan_secrets(self, args: dict[str, Any], project_id: str) -> ToolResult:
        root = self._project_root(project_id)
        target_p = str(args.get("path", ".")).strip()
        ok, out, err = execute_scan_secrets(project_root=root, target_path=target_p)
        return ToolResult(
            call_id="",
            name="scan_secrets",
            success=ok,
            output=out,
            error=err or None,
        )

    async def _run_scan_sast_patterns(self, args: dict[str, Any], project_id: str) -> ToolResult:
        root = self._project_root(project_id)
        target_p = str(args.get("path", ".")).strip()
        ok, out, err = execute_scan_sast_patterns(project_root=root, target_path=target_p)
        return ToolResult(
            call_id="",
            name="scan_sast_patterns",
            success=ok,
            output=out,
            error=err or None,
        )

    async def _run_inspect_dependencies(self, args: dict[str, Any], project_id: str) -> ToolResult:
        root = self._project_root(project_id)
        ok, out, err = execute_inspect_dependencies(project_root=root)
        return ToolResult(
            call_id="",
            name="inspect_dependencies",
            success=ok,
            output=out,
            error=err or None,
        )

    async def _run_generate_sbom(self, args: dict[str, Any], project_id: str) -> ToolResult:
        root = self._project_root(project_id)
        ok, out, err = execute_generate_sbom(project_root=root)
        return ToolResult(
            call_id="",
            name="generate_sbom",
            success=ok,
            output=out,
            error=err or None,
        )

    async def _run_sql_query_explain(self, args: dict[str, Any], project_id: str) -> ToolResult:
        root = self._project_root(project_id)
        sql = str(args.get("sql", args.get("query", ""))).strip()
        db_name = str(args.get("db_filename", "jarvis.db")).strip()
        ok, out, err = execute_sql_query_explain(sql=sql, project_root=root, db_filename=db_name)
        return ToolResult(
            call_id="",
            name="sql_query_explain",
            success=ok,
            output=out,
            error=err or None,
        )

    async def _run_glob_find(self, args: dict[str, Any], project_id: str) -> ToolResult:
        res = await self._run_glob(args, project_id)
        res.name = "glob_find"
        return res

    async def _run_grep_search(self, args: dict[str, Any], project_id: str) -> ToolResult:
        res = await self._run_grep(args, project_id)
        res.name = "grep_search"
        return res

    async def _run_execute_command(self, args: dict[str, Any], project_id: str) -> ToolResult:
        res = await self._run_run_command(args, project_id)
        res.name = "execute_command"
        return res

    async def _run_vector_search(self, args: dict[str, Any], project_id: str) -> ToolResult:
        import json

        table = str(args.get("table", "project_vectors"))
        top_k = int(args.get("top_k", 5))
        # Gera embedding simples ou vetor de consulta
        vec = args.get("vector")
        if not vec:
            query_text = str(args.get("query", ""))
            vec = [float(ord(c) % 17) / 10.0 for c in query_text[:128]]
            if len(vec) < 128:
                vec.extend([0.0] * (128 - len(vec)))
        matches = vector_memory_manager.search_similar(table_name=table, query_vector=vec, top_k=top_k)
        return ToolResult(
            call_id="",
            name="vector_search",
            success=True,
            output=json.dumps(matches, indent=2, ensure_ascii=False) if matches else "Nenhum vetor correspondente.",
        )

    async def _run_web_search(self, args: dict[str, Any], project_id: str) -> ToolResult:
        query = str(args.get("query", "")).strip()
        search_results = await safe_web_search.search(query=query)
        formatted = [f"**{r.title}** ({r.url})\n{r.snippet}" for r in search_results]
        return ToolResult(
            call_id="",
            name="web_search",
            success=True,
            output="\n\n".join(formatted) if formatted else "Nenhum resultado retornado.",
        )

    @staticmethod
    def _unified_diff(old: str, new: str, rel_path: str, max_chars: int = 20_000) -> str:
        import difflib

        diff = "".join(
            difflib.unified_diff(
                old.splitlines(keepends=True),
                new.splitlines(keepends=True),
                fromfile=f"a/{rel_path}",
                tofile=f"b/{rel_path}",
            )
        )
        if len(diff) > max_chars:
            diff = diff[:max_chars] + "\n... [diff truncado]"
        return diff
