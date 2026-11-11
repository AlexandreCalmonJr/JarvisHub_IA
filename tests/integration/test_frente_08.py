"""
Testes de Integração - FRENTE 08: Quality Studio & Testes Automatizados E2E
Valida:
1. Descoberta de suítes de testes locais (pytest/vitest) no workspace do projeto.
2. Execução controlada de testes com relatório de sumário (passed, failed, skipped, duration).
3. Geração de roteiro de teste ponta a ponta (E2E) com Playwright e captura de evidência visual.
4. Geração de casos de borda e cenários de estresse (Chaos Testing).
"""

from pathlib import Path
import pytest

from services.quality_studio.test_runner import QualityStudioService


class MockWorkspace:
    def __init__(self, root: Path):
        self.root = root

    def get_project_dir(self, project_id: str) -> Path:
        return self.root / project_id


@pytest.fixture
def project_with_tests(tmp_path: Path):
    proj_dir = tmp_path / "app_with_tests"
    proj_dir.mkdir(parents=True, exist_ok=True)

    test_file = proj_dir / "test_math.py"
    test_file.write_text(
        "def test_addition():\n"
        "    assert 1 + 1 == 2\n\n"
        "def test_subtraction():\n"
        "    assert 5 - 3 == 2\n",
        encoding="utf-8",
    )
    return proj_dir


def test_quality_studio_discover_tests(tmp_path: Path, project_with_tests):
    ws = MockWorkspace(tmp_path)
    service = QualityStudioService(workspace_service=ws)

    discovered = service.discover_project_tests("app_with_tests")
    assert discovered["test_framework"] == "pytest"
    assert discovered["total_files"] == 1
    assert "test_math.py" in discovered["test_files"]


@pytest.mark.asyncio
async def test_quality_studio_run_tests(tmp_path: Path, project_with_tests):
    ws = MockWorkspace(tmp_path)
    service = QualityStudioService(workspace_service=ws)

    result = await service.run_tests("app_with_tests", test_file="test_math.py", timeout_seconds=10)
    assert result["is_success"] is True
    assert result["status"] == "success"
    assert result["summary"]["passed"] >= 2
    assert result["duration_seconds"] >= 0


def test_quality_studio_generate_playwright():
    service = QualityStudioService()
    script = service.generate_e2e_playwright_test(
        target_url="http://127.0.0.1:8000/studio",
        scenario_name="login_e_chat",
        steps=[
            {"action": "goto", "target": "http://127.0.0.1:8000/studio"},
            {"action": "fill", "target": "#chat-input", "value": "Olá JARVIS"},
            {"action": "click", "target": "#send-btn"},
            {"action": "assert_visible", "target": ".chat-bubble"},
        ],
    )

    assert "def test_login_e_chat_e2e" in script
    assert "from playwright.sync_api import Page, expect" in script
    assert "page.goto(\"http://127.0.0.1:8000/studio\", timeout=10000)" in script
    assert "page.locator(\"#chat-input\").fill(\"Olá JARVIS\")" in script
    assert "page.locator(\"#send-btn\").click()" in script
    assert "expect(page.locator(\".chat-bubble\")).to_be_visible()" in script
    assert "page.screenshot(path=\"screenshot_login_e_chat.png\")" in script


def test_quality_studio_chaos_edge_cases():
    service = QualityStudioService()
    cases = service.generate_chaos_edge_cases()

    assert len(cases) >= 5
    categories = [c["category"] for c in cases]
    assert "VALORES_NULOS_E_VAZIOS" in categories
    assert "TIPAGEM_E_VALORES_NEGATIVOS" in categories
    assert "CARACTERES_ESPECIAIS_E_UNICODE" in categories
    assert "PAYLOAD_GIGANTE_E_OVERFLOW" in categories
    assert "SIMULACAO_INJECAO" in categories
