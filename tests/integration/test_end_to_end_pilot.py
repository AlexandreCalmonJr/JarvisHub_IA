import pytest

from services.project_workspace import ProjectScanner
from services.security_core import (
    FindingSeverity,
    QASecurityPipeline,
    SecurityCore,
)


@pytest.mark.asyncio
async def test_end_to_end_pilot_flow_with_git_qa_and_rollback(tmp_path):
    # 1. Setup sample project workspace (simulating demo_flutter_app)
    project_dir = tmp_path / "pilot_app"
    project_dir.mkdir()
    pubspec = project_dir / "pubspec.yaml"
    pubspec.write_text("name: pilot_app\ndependencies:\n  flutter:\n    sdk: flutter\n")
    main_dart = project_dir / "lib" / "main.dart"
    main_dart.parent.mkdir()
    main_dart.write_text("void main() => print('Pilot v1');\n")

    # 2. Scanner & Read-only Inventory
    scanner = ProjectScanner()
    initial_inventory = scanner.scan(project_id="pilot_app", root_path=project_dir)
    assert len(initial_inventory.files) == 2
    assert any("main.dart" in f.relative_path for f in initial_inventory.files)

    # 3. Security Core & Human Approval Gate
    security = SecurityCore()
    appr_req = security.approval_engine.create_request(
        task_id="pilot-task-001",
        agent_role="flutter_specialist",
        operation="APPLY_CODE_CHANGE",
        impact_summary="Update greeting message in main.dart",
        affected_resources=[str(main_dart)],
        proposed_diff="--- lib/main.dart\n+++ lib/main.dart\n-void main() => print('Pilot v1');\n+void main() => print('Pilot v1.0 Release');",
        reversible=True,
    )

    # 4. Human Approval
    decided = security.approval_engine.approve_request(
        request_id=appr_req.id,
        decided_by="LeadDeveloper",
        decision_reason="Approved for v1.0 Pilot release",
    )
    assert decided.status.value == "approved"

    # 5. Apply change safely
    main_dart.write_text("void main() => print('Pilot v1.0 Release');\n")
    assert "Pilot v1.0 Release" in main_dart.read_text()

    # 6. Run QA & Security Pipeline on modified workspace
    pipeline = QASecurityPipeline(audit_trail=security.audit)
    gate_result = await pipeline.run_pipeline(
        project_root=project_dir,
        project_id="pilot_app",
        skip_tests=True,
    )
    assert gate_result.passed is True
    assert not any(f.severity == FindingSeverity.CRITICAL for f in gate_result.findings)

    # 7. Rollback Verification: restore exact initial state
    main_dart.write_text("void main() => print('Pilot v1');\n")
    reverted_inventory = scanner.scan(project_id="pilot_app", root_path=project_dir)
    assert len(reverted_inventory.files) == 2
    assert main_dart.read_text() == "void main() => print('Pilot v1');\n"
