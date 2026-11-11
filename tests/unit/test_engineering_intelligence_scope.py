from pathlib import Path

import pytest

from services.engineering_intelligence.tech_debt_analyzer import EngineeringIntelligenceService


class DatabaseStub:
    def __init__(self):
        self.last_owner = None

    def list_tasks(self, limit=50, owner_user_id=None):
        self.last_owner = owner_user_id
        return [
            {"id": "done-a", "is_completed": True},
            {"id": "open-a", "is_completed": False},
        ]


def test_productivity_metrics_filter_by_owner_and_count_completed_tasks():
    db = DatabaseStub()
    service = EngineeringIntelligenceService(db_manager=db)
    result = service.calculate_productivity_and_roi(owner_user_id="account-a")

    assert db.last_owner == "account-a"
    assert result["total_tasks_completed"] == 1


def test_project_report_requires_owner_scope():
    service = EngineeringIntelligenceService(db_manager=DatabaseStub())
    with pytest.raises(PermissionError):
        service.generate_executive_report(project_id="project-a")


def test_project_report_uses_account_scoped_metrics():
    db = DatabaseStub()
    service = EngineeringIntelligenceService(db_manager=db)
    result = service.generate_executive_report(
        project_id="project-a", owner_user_id="account-a"
    )

    assert db.last_owner == "account-a"
    assert result["roi"]["total_tasks_completed"] == 1
    assert "Conta proprietária do projeto" in result["markdown"]


def test_technical_debt_analysis_skips_symlinks_outside_project(tmp_path):
    project_dir = tmp_path / "project-a"
    project_dir.mkdir()
    outside = tmp_path / "outside.py"
    outside.write_text("def private_data():\n    return 1\n", encoding="utf-8")
    try:
        (project_dir / "external.py").symlink_to(outside)
    except (OSError, NotImplementedError):
        pytest.skip("Symlink creation is unavailable on this platform.")

    service = EngineeringIntelligenceService()
    result = service.analyze_technical_debt(project_dir)
    assert result["metrics"]["total_files"] == 0
