from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from apps.api.auth import Principal, require_permission
from apps.api.deps import db_manager, security_core, workspace_service
from apps.api.routers.workspace import _require_human
from services.data_pipeline import DataPipelineRunner, QualityRule
from services.security_core import PermissionDeniedError

router = APIRouter(prefix="/api/v1/data", tags=["data pipeline"])
_SAFE_COLUMN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,62}$")
_MAX_INPUT_BYTES = 10 * 1024 * 1024
_MAX_RECORDS = 100_000


class PipelineRequest(BaseModel):
    project_id: str = Field(min_length=1, max_length=64)
    source_path: str = Field(min_length=1, max_length=240)
    source_format: str = Field(pattern="^(csv|json)$")
    output_path: str = Field(min_length=1, max_length=240)
    output_format: str = Field(pattern="^(sqlite|parquet)$")
    drop_duplicates: bool = True
    fill_nulls: dict[str, str | int | float | bool | None] = Field(default_factory=dict, max_length=64)
    rules: list[QualityRule] = Field(default_factory=list, max_length=64)
    approval_id: str | None = None


def _project_and_paths(payload: PipelineRequest, principal: Principal) -> tuple[Path, Path]:
    _require_human(principal)
    if db_manager.get_project(payload.project_id, owner_user_id=principal.subject_id) is None:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    project_dir = workspace_service.get_project_dir(payload.project_id).resolve()
    permission_engine = security_core.permission_engine
    if payload.project_id not in permission_engine._project_allowlists:
        permission_engine.register_project(payload.project_id, str(project_dir))
    source = permission_engine.validate_path_access(payload.project_id, payload.source_path)
    output = permission_engine.validate_path_access(payload.project_id, payload.output_path)
    if source == output or source.suffix.lower() not in {".csv", ".json"}:
        raise HTTPException(status_code=422, detail="Origem inválida ou igual ao destino.")
    expected_suffix = ".db" if payload.output_format == "sqlite" else ".parquet"
    if output.suffix.lower() != expected_suffix:
        raise HTTPException(status_code=422, detail=f"O destino deve terminar em {expected_suffix}.")
    if source.is_symlink() or (output.exists() and output.is_symlink()):
        raise HTTPException(status_code=403, detail="Links simbólicos não são permitidos.")
    if output.exists() and not output.is_file():
        raise HTTPException(status_code=422, detail="O destino existente não é um arquivo regular.")
    if not source.is_file() or source.stat().st_size > _MAX_INPUT_BYTES:
        raise HTTPException(status_code=413, detail="A origem deve ser um arquivo de até 10 MB.")
    if (project_dir / ".git").resolve() in output.parents or output.name.startswith(".env"):
        raise HTTPException(status_code=403, detail="Destino protegido.")
    return source, output


@router.post("/pipeline")
async def run_data_pipeline(
    payload: PipelineRequest,
    principal: Principal = Depends(require_permission("workspace:write")),
):
    try:
        source, output = _project_and_paths(payload, principal)
        source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
        output_hash = hashlib.sha256(output.read_bytes()).hexdigest() if output.is_file() else "new"
        options = payload.model_dump(exclude={"approval_id"})
        task_id = "data_pipeline:" + hashlib.sha256(
            f"{source_hash}:{output_hash}:{json.dumps(options, sort_keys=True, ensure_ascii=False)}".encode()
        ).hexdigest()
        resource = str(output)
        if security_core.kill_switch.is_global_killed():
            raise PermissionDeniedError("Operação bloqueada pelo Kill Switch Global.")
        if not payload.approval_id:
            approval = security_core.approval_engine.create_request(
                task_id=task_id,
                agent_role="data_pipeline",
                operation="data_pipeline_materialize",
                impact_summary=(
                    f"Processar {payload.source_path} e gravar {payload.output_path} ({payload.output_format}). "
                    f"{'O arquivo existente será substituído.' if output_hash != 'new' else 'Será criado um novo arquivo.'}"
                ),
                affected_resources=[resource],
                proposed_diff=f"Formato: {payload.source_format} → {payload.output_format}; hash da origem: {source_hash}",
                reversible=True,
                owner_user_id=principal.subject_id,
            )
            return {"status": "approval_required", "approval_id": approval.id, "task_id": task_id,
                    "project_id": payload.project_id, "output_path": payload.output_path}
        security_core.approval_engine.consume_approved_request(
            payload.approval_id,
            operation="data_pipeline_materialize",
            task_id=task_id,
            resource=resource,
            owner_user_id=principal.subject_id,
        )

        runner = DataPipelineRunner()
        records = runner.load_csv(source) if payload.source_format == "csv" else runner.load_json(source)
        if len(records) > _MAX_RECORDS:
            raise HTTPException(status_code=413, detail="A origem excede o limite de 100.000 registros.")
        cleaned, report = runner.process_and_clean(
            records, rules=payload.rules, drop_duplicates=payload.drop_duplicates,
            fill_nulls=payload.fill_nulls,
        )
        if not cleaned:
            raise HTTPException(status_code=422, detail="Não há registros válidos para materializar.")
        output.parent.mkdir(parents=True, exist_ok=True)
        temp_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(prefix=".jarvis-pipeline-", suffix=output.suffix,
                                             dir=output.parent, delete=False) as temporary:
                temp_path = Path(temporary.name)
            if payload.output_format == "sqlite":
                    columns = sorted({column for row in cleaned for column in row})
                if not columns or any(not _SAFE_COLUMN.fullmatch(column) for column in columns):
                    raise HTTPException(status_code=422, detail="Colunas vazias ou com nomes inválidos.")
                conn = sqlite3.connect(temp_path)
                try:
                    definitions = ", ".join(f'"{column}" TEXT' for column in columns)
                    conn.execute(f'CREATE TABLE "records" ({definitions})')
                    placeholders = ",".join("?" for _ in columns)
                    conn.executemany(
                        f'INSERT INTO "records" VALUES ({placeholders})',
                        [[json.dumps(row.get(column), ensure_ascii=False) for column in columns]
                         for row in cleaned],
                    )
                    conn.commit()
                finally:
                    conn.close()
            else:
                import duckdb

                json_path = temp_path.with_suffix(".json")
                json_path.write_text(json.dumps(cleaned, ensure_ascii=False), encoding="utf-8")
                escaped_source = str(json_path).replace("'", "''")
                escaped_target = str(temp_path).replace("'", "''")
                try:
                    with duckdb.connect() as conn:
                        conn.execute(
                            f"COPY (SELECT * FROM read_json_auto('{escaped_source}')) "
                            f"TO '{escaped_target}' (FORMAT PARQUET)"
                        )
                finally:
                    json_path.unlink(missing_ok=True)
            os.replace(temp_path, output)
        finally:
            if temp_path:
                temp_path.unlink(missing_ok=True)

        security_core.audit.record_event(
            operation="DATA_PIPELINE_MATERIALIZED", status="SUCCESS", user_id=principal.display_id,
            project_id=payload.project_id,
            parameters={"source": payload.source_path, "output": payload.output_path,
                        "format": payload.output_format, "rows": len(cleaned),
                        "approval_id": payload.approval_id},
        )
        return {"status": "completed", "project_id": payload.project_id,
                "output_path": payload.output_path, "output_format": payload.output_format,
                "rows_written": len(cleaned), "quality_report": report.model_dump()}
    except PermissionDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
