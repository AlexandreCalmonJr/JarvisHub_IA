import json
import sqlite3

import pytest
from fastapi import HTTPException

from apps.api.auth import Principal
from apps.api.routers import data_pipeline
from apps.api.routers.data_pipeline import PipelineRequest, run_data_pipeline
from services.security_core import SecurityCore


@pytest.mark.asyncio
@pytest.mark.parametrize("output_format,filename", [("sqlite", "clean.db"), ("parquet", "clean.parquet")])
async def test_pipeline_api_requires_matching_approval_and_materializes_output(
    tmp_path, monkeypatch, output_format, filename
):
    owner = "pipeline-owner"
    project_id = "pipeline-project"
    project_dir = tmp_path / project_id
    project_dir.mkdir()
    (project_dir / "input.json").write_text(json.dumps([{"name": "Ana"}, {"name": "Ana"}, {"name": "Bia"}]))
    security = SecurityCore(auth_dir=tmp_path / "auth")
    monkeypatch.setattr(data_pipeline, "security_core", security)
    monkeypatch.setattr(data_pipeline, "workspace_service", type("Workspace", (), {
        "get_project_dir": lambda _self, _project_id: project_dir,
    })())
    monkeypatch.setattr(data_pipeline, "db_manager", type("DB", (), {
        "get_project": lambda _self, _project_id, owner_user_id: {"id": _project_id}
        if owner_user_id == owner else None,
    })())
    principal = Principal(subject_id=owner, kind="human", role="admin")
    payload = PipelineRequest(
        project_id=project_id,
        source_path="input.json",
        source_format="json",
        output_path=filename,
        output_format=output_format,
    )

    pending = await run_data_pipeline(payload, principal)
    assert pending["status"] == "approval_required"
    security.approval_engine.approve_request(
        pending["approval_id"], decided_by=owner, decision_reason="Validar gravação no projeto."
    )
    completed = await run_data_pipeline(
        payload.model_copy(update={"approval_id": pending["approval_id"]}), principal
    )
    assert completed["status"] == "completed"
    assert completed["rows_written"] == 2
    output = project_dir / filename
    assert output.is_file()
    if output_format == "sqlite":
        with sqlite3.connect(output) as connection:
            assert connection.execute('SELECT COUNT(*) FROM "records"').fetchone()[0] == 2
    else:
        import duckdb

        with duckdb.connect() as connection:
            assert connection.execute(
                "SELECT COUNT(*) FROM read_parquet(?)", [str(output)]
            ).fetchone()[0] == 2


@pytest.mark.asyncio
async def test_pipeline_api_rejects_path_traversal_before_approval(tmp_path, monkeypatch):
    project_dir = tmp_path / "pipeline-project"
    project_dir.mkdir()
    security = SecurityCore(auth_dir=tmp_path / "auth")
    monkeypatch.setattr(data_pipeline, "security_core", security)
    monkeypatch.setattr(data_pipeline, "workspace_service", type("Workspace", (), {
        "get_project_dir": lambda _self, _project_id: project_dir,
    })())
    monkeypatch.setattr(data_pipeline, "db_manager", type("DB", (), {
        "get_project": lambda *_args, **_kwargs: {"id": "pipeline-project"},
    })())
    payload = PipelineRequest(
        project_id="pipeline-project", source_path="../outside.csv", source_format="csv",
        output_path="clean.db", output_format="sqlite",
    )
    with pytest.raises(HTTPException) as exc:
        await run_data_pipeline(payload, Principal(subject_id="owner", kind="human", role="admin"))
    assert exc.value.status_code == 403
