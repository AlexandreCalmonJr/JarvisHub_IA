import hashlib
import logging
from fastapi import APIRouter, HTTPException, Response, Depends
from fastapi.responses import HTMLResponse

from apps.api.auth import Principal, get_principal
from apps.api.deps import security_core

from apps.api.schemas import (
    WriteProjectFilePayload,
    ImportFolderPayload,
    ProjectMemoryRequest,
)
from apps.api.deps import workspace_service, webhook_service, db_manager
from services.security_core import PermissionDeniedError

logger = logging.getLogger("jarvis.api.workspace")
router = APIRouter(tags=["workspace"])

def _workspace_approval(
    *,
    approval_id: str | None,
    task_id: str,
    operation: str,
    summary: str,
    resource: str,
    proposed_diff: str | None = None,
    owner_user_id: str | None = None,
):
    """Cria pedido pendente ou valida aprovação humana vinculada ao alvo e conta."""
    if security_core.kill_switch.is_global_killed():
        raise PermissionDeniedError("Operação bloqueada pelo Kill Switch Global.")
    if not approval_id:
        request = security_core.approval_engine.create_request(
            task_id=task_id,
            agent_role="workspace_operator",
            operation=operation,
            impact_summary=summary,
            affected_resources=[resource],
            proposed_diff=proposed_diff,
            reversible=operation != "project_delete",
            owner_user_id=owner_user_id,
        )
        return request

    try:
        security_core.approval_engine.consume_approved_request(
            approval_id,
            operation=operation,
            task_id=task_id,
            resource=resource,
            owner_user_id=owner_user_id,
        )
    except ValueError as exc:
        raise PermissionDeniedError(str(exc)) from exc
    return None


def _require_human(principal: Principal) -> None:
    if principal.kind != "human":
        raise HTTPException(status_code=403, detail="Esta operação exige aprovação de um utilizador humano.")



def _require_owned_project(project_id: str, principal: Principal) -> dict:
    _require_human(principal)
    project = db_manager.get_project(
        project_id, owner_user_id=principal.subject_id
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    return project


@router.get("/api/v1/workspace/projects")
async def list_workspace_projects_endpoint(
    principal: Principal = Depends(get_principal),
):
    _require_human(principal)
    owned = {p["id"] for p in db_manager.list_projects(owner_user_id=principal.subject_id)}
    return [
        project for project in workspace_service.list_available_projects()
        if project.get("id") in owned or project.get("project_id") in owned
    ]


@router.get("/api/v1/workspace/projects/{project_id}/file")
async def read_project_file_endpoint(
    project_id: str, path: str, principal: Principal = Depends(get_principal)
):
    """Lê um arquivo pertencente à conta autenticada."""
    _require_owned_project(project_id, principal)
    try:
        content = workspace_service.read_project_file(project_id, path)
        return {"project_id": project_id, "path": path, "content": content}
    except PermissionDeniedError as pde:
        raise HTTPException(status_code=403, detail=str(pde))
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=404, detail=str(fnf))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/v1/workspace/projects/{project_id}/files/write")
async def write_project_file_endpoint(
    project_id: str,
    payload: WriteProjectFilePayload,
    principal: Principal = Depends(get_principal),
):
    """Solicita aprovação vinculada ao arquivo/diff e só grava após decisão humana."""
    _require_owned_project(project_id, principal)
    try:
        project_dir = workspace_service.get_project_dir(project_id).resolve()
        if not project_dir.is_dir():
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")
        target = (project_dir / payload.path).resolve()
        try:
            target.relative_to(project_dir)
        except ValueError as exc:
            raise PermissionDeniedError("Caminho fora da raiz autorizada do projeto.") from exc
        if target.name.startswith(".env") or target.suffix.lower() in {".key", ".pem"}:
            raise PermissionDeniedError("Modificação de arquivo sensível bloqueada.")
        if (project_dir / ".git").resolve() in target.parents:
            raise PermissionDeniedError("Modificação direta de arquivos internos do Git bloqueada.")

        old = target.read_text(encoding="utf-8", errors="replace") if target.is_file() else ""
        diff = "".join(__import__("difflib").unified_diff(
            old.splitlines(keepends=True),
            payload.content.splitlines(keepends=True),
            fromfile=f"a/{payload.path}",
            tofile=f"b/{payload.path}",
        ))
        fingerprint = hashlib.sha256(
            f"{project_id}\0{target}\0{hashlib.sha256(old.encode('utf-8')).hexdigest()}\0{payload.content}".encode("utf-8")
        ).hexdigest()
        task_id = f"workspace:file_write:{fingerprint}"
        pending = _workspace_approval(
            approval_id=payload.approval_id,
            task_id=task_id,
            operation="file_write",
            summary=f"Gravar {payload.path} no projeto {project_id}: {payload.reason}",
            resource=str(target),
            proposed_diff=diff,
            owner_user_id=principal.subject_id,
        )
        if pending:
            return {
                "status": "approval_required",
                "approval_id": pending.id,
                "project_id": project_id,
                "path": payload.path,
                "diff": diff,
            }

        result = workspace_service.modify_project_file(
            project_id=project_id,
            rel_path=payload.path,
            new_content=payload.content,
            reason=payload.reason,
        )
        security_core.audit.record_event(
            operation="WORKSPACE_FILE_WRITE_APPROVED",
            status="SUCCESS",
            user_id=principal.display_id,
            project_id=project_id,
            parameters={"path": payload.path, "approval_id": payload.approval_id},
        )
        return {**result, "status": "saved", "approval_id": payload.approval_id}
    except PermissionDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Falha ao salvar arquivo no workspace")
        raise HTTPException(status_code=500, detail="Falha ao salvar arquivo no projeto.") from exc

@router.post("/api/v1/workspace/projects/{project_id}/rollback")
async def rollback_project_endpoint(
    project_id: str,
    approval_id: str | None = None,
    principal: Principal = Depends(get_principal),
):
    """Solicita aprovação explícita antes de executar git reset --hard."""
    _require_owned_project(project_id, principal)
    try:
        project_dir = workspace_service.get_project_dir(project_id).resolve()
        history = workspace_service.get_git_history(project_id, max_count=1)
        head = history[0].get("hash", "unknown") if history else "unknown"
        task_id = f"workspace:rollback:{project_id}:{head}"
        pending = _workspace_approval(
            approval_id=approval_id,
            task_id=task_id,
            operation="git_rollback",
            summary=f"Reverter o último commit do projeto {project_id} (HEAD {head}).",
            resource=str(project_dir),
            owner_user_id=principal.subject_id,
        )
        if pending:
            return {"status": "approval_required", "approval_id": pending.id, "project_id": project_id, "current_head": head}
        result = workspace_service.rollback_last_change(project_id)
        security_core.audit.record_event(
            operation="WORKSPACE_ROLLBACK_APPROVED",
            status="SUCCESS",
            user_id=principal.display_id,
            project_id=project_id,
            parameters={"approval_id": approval_id, "previous_head": head},
        )
        return result
    except PermissionDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Falha no rollback do workspace")
        raise HTTPException(status_code=500, detail="Falha ao executar rollback.") from exc

@router.get("/api/v1/workspace/projects/{project_id}/git-history")
async def get_project_git_history_endpoint(
    project_id: str, principal: Principal = Depends(get_principal)
):
    """Retorna histórico Git apenas do projeto pertencente à conta."""
    _require_owned_project(project_id, principal)
    try:
        history = workspace_service.get_git_history(project_id)
        return history
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha ao consultar histórico Git: {exc}")


@router.delete("/api/v1/workspace/projects/{project_id}")
async def delete_workspace_project_endpoint(
    project_id: str,
    approval_id: str | None = None,
    principal: Principal = Depends(get_principal),
):
    """Solicita aprovação explícita antes da exclusão física irreversível."""
    _require_human(principal)
    try:
        project_dir = workspace_service.get_project_dir(project_id).resolve()
        task_id = f"workspace:delete:{project_id}:{project_dir}"
        pending = _workspace_approval(
            approval_id=approval_id,
            task_id=task_id,
            operation="project_delete",
            summary=f"Excluir permanentemente o projeto {project_id} e todo o seu conteúdo.",
            resource=str(project_dir),
        )
        if pending:
            return {"status": "approval_required", "approval_id": pending.id, "project_id": project_id, "path": str(project_dir)}
        success = workspace_service.delete_project(project_id)
        if not success:
            raise HTTPException(status_code=404, detail=f"Projeto '{project_id}' não encontrado no disco.")
        security_core.audit.record_event(
            operation="WORKSPACE_PROJECT_DELETE_APPROVED",
            status="SUCCESS",
            user_id=principal.display_id,
            project_id=project_id,
            parameters={"approval_id": approval_id, "path": str(project_dir)},
        )
        return {"status": "deleted", "project_id": project_id}
    except PermissionDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Falha ao excluir projeto do workspace")
        raise HTTPException(status_code=500, detail="Falha ao excluir projeto.") from exc

@router.get("/api/v1/workspace/projects/{project_id}/export-zip")
async def export_project_zip_endpoint(
    project_id: str, principal: Principal = Depends(get_principal)
):
    """Exporta apenas projetos pertencentes à conta autenticada."""
    _require_owned_project(project_id, principal)
    try:
        zip_bytes, filename = workspace_service.export_clean_project_zip(project_id)
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=404, detail=str(fnf))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha ao exportar ZIP do projeto: {exc}")


@router.post("/api/v1/workspace/projects/{project_id}/dockerize")
async def dockerize_project_endpoint(
    project_id: str,
    approval_id: str | None = None,
    principal: Principal = Depends(get_principal),
):
    """Gera ficheiros Docker somente após aprovação humana explícita."""
    _require_human(principal)
    try:
        project_dir = workspace_service.get_project_dir(project_id).resolve()
        task_id = f"workspace:dockerize:{project_id}:{project_dir}"
        pending = _workspace_approval(
            approval_id=approval_id,
            task_id=task_id,
            operation="workspace_dockerize",
            summary=f"Gerar Dockerfile, docker-compose.yml e .dockerignore no projeto {project_id}.",
            resource=str(project_dir),
        )
        if pending:
            return {"status": "approval_required", "approval_id": pending.id, "project_id": project_id}
        res = workspace_service.dockerize_project(project_id)
        try:
            await webhook_service.send_notification(
                title=f"Projeto Dockerizado: {project_id}",
                message=f"Ambiente Docker criado para {res.get('stack', 'Aplicação')}.",
                event_type="dockerize",
            )
        except Exception:
            logger.exception("Falha ao notificar dockerização do projeto %s", project_id)
        security_core.audit.record_event(
            operation="WORKSPACE_DOCKERIZE_APPROVED",
            status="SUCCESS",
            user_id=principal.display_id,
            project_id=project_id,
            parameters={"approval_id": approval_id},
        )
        return res
    except PermissionDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Falha ao dockerizar projeto")
        raise HTTPException(status_code=500, detail="Falha ao dockerizar projeto.") from exc


@router.post("/api/v1/workspace/projects/{project_id}/open-folder")
async def open_workspace_folder_endpoint(
    project_id: str, principal: Principal = Depends(get_principal)
):
    """Abre apenas pastas de projetos da conta autenticada."""
    _require_owned_project(project_id, principal)
    try:
        path = workspace_service.open_project_folder(project_id)
        return {"status": "opened", "path": path}
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=404, detail=str(fnf))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha ao abrir pasta local: {exc}")


@router.post("/api/v1/workspace/open-root")
async def open_workspace_root_endpoint():
    """Abre o diretório geral de workspace no Windows Explorer."""
    try:
        path = workspace_service.open_root_folder()
        return {"status": "opened", "path": path}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha ao abrir pasta geral de workspaces: {exc}")


@router.post("/api/v1/workspace/projects/{project_id}/open-code")
async def open_project_code_endpoint(
    project_id: str, principal: Principal = Depends(get_principal)
):
    """Abre no editor apenas projetos pertencentes à conta."""
    _require_owned_project(project_id, principal)
    try:
        path = workspace_service.open_project_in_editor(project_id)
        return {"status": "opened", "path": path}
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=404, detail=str(fnf))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha ao abrir no VS Code: {exc}")


@router.get("/api/v1/workspace/projects/{project_id}/preview")
async def get_project_preview_endpoint(
    project_id: str, principal: Principal = Depends(get_principal)
):
    """Retorna preview apenas de projetos pertencentes à conta."""
    _require_owned_project(project_id, principal)
    try:
        content = workspace_service.read_project_file(project_id, "index.html")
        return HTMLResponse(content=content)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Preview não disponível (index.html não encontrado): {exc}")


@router.post("/api/v1/workspace/import")
async def import_external_folder_endpoint(
    payload: ImportFolderPayload,
    principal: Principal = Depends(get_principal),
):
    """Importa somente raízes previamente autorizadas e após aprovação humana."""
    _require_human(principal)
    try:
        target = workspace_service.validate_import_root(payload.folder_path)
        name = payload.name or target.name
        project_id = name.lower().replace(" ", "-").replace("_", "-")
        task_id = f"workspace:import:{project_id}:{target}"
        pending = _workspace_approval(
            approval_id=payload.approval_id,
            task_id=task_id,
            operation="project_import",
            summary=f"Importar a pasta autorizada '{target}' como projeto '{project_id}'.",
            resource=str(target),
            owner_user_id=principal.subject_id,
        )
        if pending:
            return {"status": "approval_required", "approval_id": pending.id, "path": str(target), "project_id": project_id}
        result = workspace_service.import_external_project(str(target), payload.name)
        project_root = workspace_service.get_project_dir(project_id).resolve()
        db_manager.register_project(
            project_id=project_id,
            name=name,
            root_path=str(project_root),
            owner_user_id=principal.subject_id,
        )
        security_core.audit.record_event(
            operation="WORKSPACE_IMPORT_APPROVED",
            status="SUCCESS",
            user_id=principal.display_id,
            project_id=project_id,
            parameters={"approval_id": payload.approval_id, "path": str(target)},
        )
        return {**result, "status": "imported", "approval_id": payload.approval_id}
    except PermissionDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Falha ao importar pasta para workspace")
        raise HTTPException(status_code=400, detail="Falha ao importar diretório.") from exc

@router.get("/api/v1/workspace/projects/{project_id}/memory")
async def get_project_memory_endpoint(
    project_id: str, principal: Principal = Depends(get_principal)
):
    """Recupera somente memórias do projeto pertencentes à conta."""
    if principal.kind != "human":
        raise HTTPException(status_code=403, detail="Conta humana necessária.")
    return db_manager.list_project_memory(
        project_id, owner_user_id=principal.subject_id
    )


@router.post("/api/v1/workspace/projects/{project_id}/memory")
async def save_project_memory_endpoint(
    project_id: str, payload: ProjectMemoryRequest,
    principal: Principal = Depends(get_principal),
):
    """Salva uma diretriz privada da conta no projeto."""
    if principal.kind != "human":
        raise HTTPException(status_code=403, detail="Conta humana necessária.")
    db_manager.set_project_memory(
        project_id=project_id,
        category=payload.category,
        key=payload.key,
        content=payload.content,
        sources=payload.sources,
        owner_user_id=principal.subject_id,
    )
    return {"status": "saved", "project_id": project_id, "key": payload.key}
