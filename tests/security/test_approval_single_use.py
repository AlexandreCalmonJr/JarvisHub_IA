import pytest

from packages.contracts.approval import ApprovalStatus
from services.memory.database import DatabaseManager
from services.security_core.approval_engine import ApprovalEngine


def test_approved_request_is_consumed_once_and_persisted(tmp_path):
    database = DatabaseManager(str(tmp_path / "approvals.db"))
    engine = ApprovalEngine(db_manager=database)
    request = engine.create_request(
        task_id="workspace:file_write:abc123",
        agent_role="workspace_operator",
        operation="file_write",
        impact_summary="Atualizar arquivo de configuração",
        affected_resources=["/workspace/project/config.json"],
    )
    engine.approve_request(
        request.id,
        decided_by="admin",
        decision_reason="Alteração revista e aprovada.",
    )

    consumed = engine.consume_approved_request(
        request.id,
        operation="file_write",
        task_id="workspace:file_write:abc123",
        resource="/workspace/project/config.json",
    )

    assert consumed.status == ApprovalStatus.CONSUMED
    assert database.get_approval(request.id)["status"] == ApprovalStatus.CONSUMED.value

    with pytest.raises(ValueError, match="Aprovação ausente|já foi utilizada"):
        engine.consume_approved_request(
            request.id,
            operation="file_write",
            task_id="workspace:file_write:abc123",
            resource="/workspace/project/config.json",
        )


@pytest.mark.parametrize(
    ("operation", "task_id", "resource"),
    [
        ("project_delete", "workspace:file_write:abc123", "/workspace/project/config.json"),
        ("file_write", "workspace:file_write:other", "/workspace/project/config.json"),
        ("file_write", "workspace:file_write:abc123", "/workspace/other/config.json"),
    ],
)
def test_approval_cannot_be_consumed_for_different_scope(tmp_path, operation, task_id, resource):
    engine = ApprovalEngine()
    request = engine.create_request(
        task_id="workspace:file_write:abc123",
        agent_role="workspace_operator",
        operation="file_write",
        impact_summary="Atualizar arquivo",
        affected_resources=["/workspace/project/config.json"],
    )
    engine.approve_request(request.id, decided_by="admin")

    with pytest.raises(ValueError, match="não correspondente"):
        engine.consume_approved_request(
            request.id,
            operation=operation,
            task_id=task_id,
            resource=resource,
        )

    assert engine.get_request(request.id).status == ApprovalStatus.APPROVED
