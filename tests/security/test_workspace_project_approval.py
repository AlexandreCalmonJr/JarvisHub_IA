import json
from types import SimpleNamespace

import pytest

from services.orchestration.master import JarvisMaster
from services.project_workspace import ProjectWorkspaceService
from services.security_core import SecurityCore


class _CheckpointGraph:
    def __init__(self, values):
        self.values = values
        self.updated = None

    async def aget_state(self, config):
        return SimpleNamespace(values=self.values)

    async def aupdate_state(self, config, values):
        self.updated = values


@pytest.mark.asyncio
async def test_project_creation_is_executed_only_after_matching_human_approval(tmp_path):
    security = SecurityCore(auth_dir=tmp_path / "auth")
    workspace = ProjectWorkspaceService(
        security_core=security,
        base_dir=tmp_path / "workspace",
    )
    project_id = "approved-project-test"
    task_id = "task-approved-project-test"
    pending_project = {
        "project_id": project_id,
        "name": "Approved Project Test",
        "description": "Projeto de teste com aprovação humana.",
        "project_type": "web",
        "files": {"index.html": "<html><body>Approved</body></html>"},
    }
    project_root = workspace.get_project_dir(project_id).resolve()
    preview = json.dumps(
        {
            "project_id": project_id,
            "name": pending_project["name"],
            "project_type": pending_project["project_type"],
            "files": pending_project["files"],
        },
        ensure_ascii=False,
        indent=2,
    )

    approval = security.approval_engine.create_request(
        task_id=task_id,
        agent_role="jarvis_master",
        operation="project_create",
        impact_summary="Criar projeto de teste",
        affected_resources=[str(project_root)],
        proposed_diff=preview,
    )
    state = {
        "task_id": task_id,
        "classified_intent": "project_creation",
        "approval_id": approval.id,
        "pending_project": pending_project,
        "approval_required": True,
        "final_summary": None,
        "is_completed": False,
    }
    graph = _CheckpointGraph(state)
    master = JarvisMaster.__new__(JarvisMaster)
    master.security_core = security
    master.workspace_service = workspace
    master.graph = graph

    try:
        with pytest.raises(Exception):
            await master.resume_after_approval(task_id, "admin_test")
        assert not project_root.exists()

        security.approval_engine.approve_request(
            approval.id,
            decided_by="admin_test",
            decision_reason="Aprovado no teste.",
        )
        result = await master.resume_after_approval(task_id, "admin_test")

        assert project_root.is_dir()
        assert (project_root / "index.html").read_text(encoding="utf-8") == (
            "<html><body>Approved</body></html>"
        )
        assert result["is_completed"] is True
        assert result["pending_project"] is None
        assert "após aprovação humana" in result["final_summary"]
    finally:
        if project_root.exists():
            workspace.delete_project(project_id)
