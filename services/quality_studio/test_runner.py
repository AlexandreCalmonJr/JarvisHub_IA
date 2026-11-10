"""
JARVIS AI HUB - Quality Studio & Testes Automatizados E2E
Gerenciamento de testes locais:
- Execução controlada em sandbox local com timeout
- Geração de testes ponta a ponta (E2E) com Playwright
- Geração de testes de caos e casos de borda (Chaos / Edge Case Testing)
"""

import logging
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger("jarvis.quality_studio")


class QualityStudioService:
    def __init__(self, workspace_service: Any = None):
        self.workspace_service = workspace_service

    def discover_project_tests(self, project_id: str) -> dict[str, Any]:
        """Localiza arquivos de testes no projeto (pytest, unittest ou vitest/jest)."""
        if not self.workspace_service:
            return {"test_framework": "unknown", "test_files": [], "total_files": 0}

        proj_dir = self.workspace_service.get_project_dir(project_id)
        if not proj_dir.exists():
            raise FileNotFoundError(f"Projeto não encontrado: {project_id}")

        test_files = []
        framework = "pytest"

        # Varredura por arquivos de teste Python
        for p in proj_dir.rglob("test_*.py"):
            if ".venv" not in p.parts and "node_modules" not in p.parts:
                test_files.append(p.relative_to(proj_dir).as_posix())

        for p in proj_dir.rglob("*_test.py"):
            if ".venv" not in p.parts and "node_modules" not in p.parts:
                rel = p.relative_to(proj_dir).as_posix()
                if rel not in test_files:
                    test_files.append(rel)

        # Se houver package.json, verifica testes JS/TS
        pkg_file = proj_dir / "package.json"
        if pkg_file.exists():
            for p in proj_dir.rglob("*.test.*"):
                if "node_modules" not in p.parts:
                    test_files.append(p.relative_to(proj_dir).as_posix())
            for p in proj_dir.rglob("*.spec.*"):
                if "node_modules" not in p.parts:
                    test_files.append(p.relative_to(proj_dir).as_posix())
            if len(test_files) > 0 and any(f.endswith((".js", ".ts", ".jsx", ".tsx")) for f in test_files):
                framework = "jest/vitest"

        return {
            "test_framework": framework,
            "test_files": test_files,
            "total_files": len(test_files),
        }

    def run_tests(
        self,
        project_id: str,
        test_file: str | None = None,
        timeout_seconds: int = 45,
    ) -> dict[str, Any]:
        """Executa a suíte de testes do projeto em ambiente local com captura de métricas e status."""
        if not self.workspace_service:
            return {"status": "error", "message": "Workspace service indisponível"}

        proj_dir = self.workspace_service.get_project_dir(project_id)
        if not proj_dir.exists():
            raise FileNotFoundError(f"Projeto não encontrado: {project_id}")

        # Identifica framework
        discovery = self.discover_project_tests(project_id)
        framework = discovery["test_framework"]

        start_time = time.perf_counter()

        cmd = [sys.executable, "-m", "pytest", "-v"] if framework == "pytest" else ["npm", "test", "--", "--watchAll=false"]
        if test_file:
            cmd.append(test_file)

        try:
            res = subprocess.run(
                cmd,
                cwd=str(proj_dir),
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                shell=False,
            )
            duration_s = round(time.perf_counter() - start_time, 2)
            stdout = res.stdout or ""
            stderr = res.stderr or ""
            full_output = stdout + "\n" + stderr

            # Parsing heurístico de contagens de testes no pytest
            passed = len(re.findall(r"\bPASSED\b", stdout))
            failed = len(re.findall(r"\bFAILED\b", stdout))
            skipped = len(re.findall(r"\bSKIPPED\b", stdout))

            total = passed + failed + skipped
            is_success = res.returncode == 0

            return {
                "status": "success" if is_success else "failure",
                "is_success": is_success,
                "framework": framework,
                "duration_seconds": duration_s,
                "summary": {
                    "total": total,
                    "passed": passed,
                    "failed": failed,
                    "skipped": skipped,
                },
                "raw_output": full_output[:3000],
            }
        except subprocess.TimeoutExpired:
            duration_s = round(time.perf_counter() - start_time, 2)
            return {
                "status": "timeout",
                "is_success": False,
                "framework": framework,
                "duration_seconds": duration_s,
                "summary": {"total": 0, "passed": 0, "failed": 1, "skipped": 0},
                "raw_output": f"Erro: A execução dos testes excedeu o limite de {timeout_seconds} segundos.",
            }
        except Exception as exc:
            duration_s = round(time.perf_counter() - start_time, 2)
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
        """Gera um roteiro de teste automatizado ponta a ponta (E2E) com Playwright em Python."""
        clean_name = re.sub(r"[^a-zA-Z0-9_]", "_", scenario_name)
        action_steps = steps or [
            {"action": "goto", "target": target_url},
            {"action": "assert_title", "target": "JARVIS"},
        ]

        code_lines = [
            'import pytest',
            'from playwright.sync_api import Page, expect',
            '',
            f'def test_{clean_name}_e2e(page: Page):',
            f'    """Cenário E2E automatizado com Playwright gerado pelo JARVIS Quality Studio."""',
            f'    # 1. Acesso à aplicação local blindada',
            f'    page.goto("{target_url}", timeout=10000)',
            '',
        ]

        for s in action_steps:
            action = s.get("action", "goto")
            target = s.get("target", "")
            if action == "goto":
                code_lines.append(f'    page.goto("{target}")')
            elif action == "click":
                code_lines.append(f'    page.locator("{target}").click()')
            elif action == "fill":
                val = s.get("value", "")
                code_lines.append(f'    page.locator("{target}").fill("{val}")')
            elif action == "assert_visible":
                code_lines.append(f'    expect(page.locator("{target}")).to_be_visible()')
            elif action == "assert_title":
                code_lines.append(f'    assert "{target}".lower() in page.title().lower()')

        code_lines.append('')
        code_lines.append('    # Captura de evidência visual')
        code_lines.append(f'    page.screenshot(path="screenshot_{clean_name}.png")')
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
                "payload": {"name": "🚀🔥 JARVIS 💻 \u202Ereversed\u202C", "bio": "Special chars: &<>'\"/\\;:"},
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
                "payload": {"input": "test'; DROP TABLE users; --", "xss": "<script>alert(1)</script>"},
                "expected_behavior": "Escapamento seguro e parametrização, impedindo execução no banco de dados.",
            },
        ]
