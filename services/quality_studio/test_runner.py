"""
JARVIS AI HUB - Quality Studio & Testes Automatizados E2E
Gerenciamento de testes locais:
- Execução controlada sem shell, com ambiente sanitizado e timeout
- Geração de testes ponta a ponta (E2E) com Playwright
- Geração de testes de caos e casos de borda (Chaos / Edge Case Testing)
"""

import logging
import re
import sys
import time
from pathlib import Path
from typing import Any, ClassVar

logger = logging.getLogger("jarvis.quality_studio")


class QualityStudioService:
    def __init__(self, workspace_service: Any = None):
        self.workspace_service = workspace_service

    _EXCLUDED_DIRS: ClassVar[set[str]] = {
        ".git",
        ".venv",
        "venv",
        "env",
        "node_modules",
        ".tox",
        ".pytest_cache",
        ".mypy_cache",
        "__pycache__",
        "dist",
        "build",
    }

    @classmethod
    def _is_safe_project_file(cls, project_dir: Path, candidate: Path) -> bool:
        try:
            resolved = candidate.resolve()
            resolved.relative_to(project_dir.resolve())
            return resolved.is_file() and not any(
                part in cls._EXCLUDED_DIRS for part in candidate.parts
            )
        except (OSError, ValueError):
            return False

    def discover_project_tests(self, project_id: str) -> dict[str, Any]:
        """Localiza arquivos de teste sem seguir links para fora do projeto."""
        if not self.workspace_service:
            return {"test_framework": "unknown", "test_files": [], "total_files": 0}
        proj_dir = self.workspace_service.get_project_dir(project_id).resolve()
        if not proj_dir.exists():
            raise FileNotFoundError(f"Projeto não encontrado: {project_id}")

        test_files: set[str] = set()
        for pattern in ("test_*.py", "*_test.py", "*.test.*", "*.spec.*"):
            for candidate in proj_dir.rglob(pattern):
                if self._is_safe_project_file(proj_dir, candidate):
                    test_files.add(candidate.relative_to(proj_dir).as_posix())

        ordered_files = sorted(test_files)
        has_js_tests = any(path.endswith((".js", ".ts", ".jsx", ".tsx")) for path in ordered_files)
        has_python_tests = any(path.endswith(".py") for path in ordered_files)
        framework = "jest/vitest" if has_js_tests and not has_python_tests else "pytest"
        return {
            "test_framework": framework,
            "test_files": ordered_files,
            "total_files": len(ordered_files),
        }

    async def run_tests(
        self,
        project_id: str,
        test_file: str | None = None,
        timeout_seconds: int = 45,
    ) -> dict[str, Any]:
        """Executa testes com argumentos sem shell, ambiente sanitizado e timeout."""
        if not self.workspace_service:
            return {"status": "error", "message": "Workspace service indisponível"}
        proj_dir = self.workspace_service.get_project_dir(project_id).resolve()
        if not proj_dir.exists():
            raise FileNotFoundError(f"Projeto não encontrado: {project_id}")

        discovery = self.discover_project_tests(project_id)
        framework = discovery["test_framework"]
        if test_file:
            requested = Path(test_file)
            if requested.is_absolute() or requested.as_posix() not in discovery["test_files"]:
                raise PermissionError(
                    "O arquivo de teste não pertence à lista de testes deste projeto."
                )
            resolved_test = (proj_dir / requested).resolve()
            if not self._is_safe_project_file(proj_dir, resolved_test):
                raise PermissionError("O arquivo de teste está fora do projeto autorizado.")

        timeout = max(5, min(int(timeout_seconds), 300))
        if framework == "jest/vitest":
            command = ["npm", "test", "--", "--watchAll=false"]
        else:
            command = [sys.executable, "-m", "pytest", "-v"]
        if test_file:
            command.append(f"./{Path(test_file).as_posix()}")

        from services.tool_gateway.sandbox import SandboxTimeoutError, SubprocessSandbox

        started = time.perf_counter()
        try:
            return_code, stdout, stderr, duration_ms = await SubprocessSandbox(
                default_timeout_seconds=timeout,
                max_output_chars=100_000,
            ).run_command(command, cwd=proj_dir, timeout_seconds=timeout)
            output = (stdout + "\n" + stderr).strip()
            passed = len(re.findall(r"\bPASSED\b", stdout))
            failed = len(re.findall(r"\bFAILED\b", stdout))
            skipped = len(re.findall(r"\bSKIPPED\b", stdout))
            return {
                "status": "success" if return_code == 0 else "failure",
                "is_success": return_code == 0,
                "framework": framework,
                "duration_seconds": round(duration_ms / 1000.0, 2),
                "summary": {
                    "total": passed + failed + skipped,
                    "passed": passed,
                    "failed": failed,
                    "skipped": skipped,
                },
                "raw_output": output[:3000],
            }
        except SandboxTimeoutError:
            duration_s = round(time.perf_counter() - started, 2)
            return {
                "status": "timeout",
                "is_success": False,
                "framework": framework,
                "duration_seconds": duration_s,
                "summary": {"total": 0, "passed": 0, "failed": 1, "skipped": 0},
                "raw_output": f"Execução excedeu o limite de {timeout} segundos.",
            }
        except Exception as exc:
            duration_s = round(time.perf_counter() - started, 2)
            logger.exception("Falha ao executar suíte do projeto %s", project_id)
            return {
                "status": "error",
                "is_success": False,
                "framework": framework,
                "duration_seconds": duration_s,
                "summary": {"total": 0, "passed": 0, "failed": 0, "skipped": 0},
                "raw_output": f"Falha ao iniciar processo de testes: {exc}",
            }

    def generate_e2e_playwright_test(
        self,
        target_url: str = "http://127.0.0.1:8000",
        scenario_name: str = "fluxo_principal",
        steps: list[dict[str, str]] | None = None,
    ) -> str:
        """Gera código Playwright com strings escapadas e ações permitidas."""
        import json

        clean_name = re.sub(r"[^a-zA-Z0-9_]", "_", scenario_name) or "cenario"
        action_steps = steps or [
            {"action": "goto", "target": target_url},
            {"action": "assert_title", "target": "JARVIS"},
        ]
        code_lines = [
            "import pytest",
            "from playwright.sync_api import Page, expect",
            "",
            f"def test_{clean_name}_e2e(page: Page):",
            '    """Cenário E2E gerado pelo JARVIS Quality Studio."""',
        ]
        for step in action_steps:
            action = step.get("action", "goto")
            target = json.dumps(str(step.get("target", "")), ensure_ascii=False)
            if action == "goto":
                code_lines.append(f"    page.goto({target}, timeout=10000)")
            elif action == "click":
                code_lines.append(f"    page.locator({target}).click()")
            elif action == "fill":
                value = json.dumps(str(step.get("value", "")), ensure_ascii=False)
                code_lines.append(f"    page.locator({target}).fill({value})")
            elif action == "assert_visible":
                code_lines.append(f"    expect(page.locator({target})).to_be_visible()")
            elif action == "assert_title":
                code_lines.append(f"    assert {target}.lower() in page.title().lower()")
        code_lines.extend(
            [
                "",
                "    # Captura de evidência visual",
                f"    page.screenshot(path={json.dumps('screenshot_' + clean_name + '.png')})",
            ]
        )
        return "\n".join(code_lines)

    def generate_chaos_edge_cases(
        self,
        endpoint_or_func: str = "process_data",
    ) -> list[dict[str, Any]]:
        """Gera conjunto abrangente de payloads para testes de estresse, robustez e casos de borda."""
        return [
            {
                "category": "VALORES_NULOS_E_VAZIOS",
                "name": "String Vazia e Espaços em Branco",
                "payload": {"text": "   ", "query": ""},
                "expected_behavior": "Validação com HTTP 422 ou erro amigável sem quebra 500 do backend.",
            },
            {
                "category": "TIPAGEM_E_VALORES_NEGATIVOS",
                "name": "Valores Numéricos Negativos e Zero",
                "payload": {"id": -1, "page": 0, "limit": -50, "price": -99.99},
                "expected_behavior": "Rejeição com código de validação apropriado.",
            },
            {
                "category": "CARACTERES_ESPECIAIS_E_UNICODE",
                "name": "Emojis, RTL e Caracteres Especiais",
                "payload": {
                    "name": "🚀🔥 JARVIS 💻 \u202ereversed\u202c",
                    "bio": "Special chars: &<>'\"/\\;:",
                },
                "expected_behavior": "Processamento e persistência corretos com codificação UTF-8 completa.",
            },
            {
                "category": "PAYLOAD_GIGANTE_E_OVERFLOW",
                "name": "Buffer e String de 10.000 caracteres",
                "payload": {"description": "A" * 10000},
                "expected_behavior": "Limite de payload respeitado sem estouro de memória ou bloqueio de CPU.",
            },
            {
                "category": "SIMULACAO_INJECAO",
                "name": "Payload com Caracteres de Delimitação SQL e Script",
                "payload": {
                    "input": "test'; DROP TABLE users; --",
                    "xss": "<script>alert(1)</script>",
                },
                "expected_behavior": "Escapamento seguro e parametrização, impedindo execução no banco de dados.",
            },
        ]
