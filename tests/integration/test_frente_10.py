"""
Testes de Integração - FRENTE 10: Inteligência de Engenharia & Métricas Executivas
Valida:
1. Cálculo de dívida técnica, LOC, linhas de comentário, god files e nota de saúde do código.
2. Cálculo de métricas de produtividade, ROI financeiro e economia em dólares via inferência local.
3. Geração de Relatório Executivo consolidado em Markdown e JSON para liderança técnica.
"""

from pathlib import Path
import pytest

from services.engineering_intelligence.tech_debt_analyzer import EngineeringIntelligenceService


class MockWorkspace:
    def __init__(self, root: Path):
        self.root = root

    def get_project_dir(self, project_id: str) -> Path:
        return self.root / project_id


@pytest.fixture
def sample_code_project(tmp_path: Path):
    proj_dir = tmp_path / "sample_system"
    proj_dir.mkdir(parents=True, exist_ok=True)

    # Arquivo limpo
    mod_file = proj_dir / "clean_module.py"
    mod_file.write_text(
        "# Módulo de regras de negócio\n"
        "# Mantido de acordo com Clean Code\n\n"
        "def calculate_total(items: list) -> float:\n"
        "    return sum(item['price'] for item in items)\n",
        encoding="utf-8",
    )

    # Arquivo com função extensa
    large_file = proj_dir / "large_service.py"
    func_lines = ["def process_huge_batch():"]
    for i in range(75):
        func_lines.append(f"    val_{i} = {i} * 2")
    func_lines.append("    return True\n")
    large_file.write_text("\n".join(func_lines), encoding="utf-8")

    return proj_dir


def test_engineering_intelligence_tech_debt(sample_code_project):
    service = EngineeringIntelligenceService()
    debt = service.analyze_technical_debt(sample_code_project)

    assert debt["status"] == "completed"
    assert debt["metrics"]["total_files"] == 2
    assert debt["metrics"]["total_lines_of_code"] > 70
    assert debt["complex_functions_count"] >= 1
    assert any("process_huge_batch" in cf["function"] for cf in debt["complex_functions"])
    assert debt["score"] <= 100
    assert debt["grade"].startswith(("A", "B", "C"))
    assert len(debt["recommendations"]) >= 1


def test_engineering_intelligence_productivity_roi():
    service = EngineeringIntelligenceService()
    roi = service.calculate_productivity_and_roi()

    assert roi["total_tasks_completed"] >= 1
    assert roi["estimated_local_tokens"] > 0
    assert roi["cost_saved_usd"] >= 0
    assert roi["cost_saved_brl"] >= 0
    assert roi["engineering_hours_saved"] >= 0
    assert "100% Local" in roi["cloud_lockin"]


def test_engineering_intelligence_executive_report(tmp_path: Path, sample_code_project):
    ws = MockWorkspace(tmp_path)
    service = EngineeringIntelligenceService(workspace_service=ws)

    report = service.generate_executive_report(project_id="sample_system")
    assert report["status"] == "generated"
    assert "sample_system" in report["project"]
    assert "Relatório Executivo de Engenharia" in report["markdown"]
    assert "Horas de Engenharia Poupadas" in report["markdown"]
    assert "Economia Direta em APIs de Nuvem" in report["markdown"]
    assert report["technical_debt"] is not None
    assert report["technical_debt"]["metrics"]["total_files"] == 2
