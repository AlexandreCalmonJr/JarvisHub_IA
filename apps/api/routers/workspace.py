import logging
from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import HTMLResponse

from apps.api.schemas import (
    WriteProjectFilePayload,
    ImportFolderPayload,
    ProjectMemoryRequest,
)
from apps.api.deps import workspace_service, webhook_service, db_manager
from services.security_core import PermissionDeniedError

logger = logging.getLogger("jarvis.api.workspace")
router = APIRouter(tags=["workspace"])


@router.get("/api/v1/workspace/projects")
async def list_workspace_projects_endpoint():
    return workspace_service.list_available_projects()


@router.get("/api/v1/workspace/projects/{project_id}/file")
async def read_project_file_endpoint(project_id: str, path: str):
    """Lê o conteúdo físico de um arquivo de projeto em workspace/."""
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
async def write_project_file_endpoint(project_id: str, payload: WriteProjectFilePayload):
    """Grava o novo conteúdo no arquivo físico do projeto com criação automática de backup .bak."""
    try:
        res = workspace_service.modify_project_file(
            project_id=project_id,
            rel_path=payload.path,
            new_content=payload.content,
            reason=payload.reason,
        )
        return {
            "status": "saved",
            "project_id": project_id,
            "path": payload.path,
            "diff": res.get("diff", ""),
        }
    except PermissionDeniedError as pde:
        raise HTTPException(status_code=403, detail=str(pde))
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=404, detail=str(fnf))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha ao salvar arquivo no projeto: {exc}")


@router.post("/api/v1/workspace/projects/{project_id}/rollback")
async def rollback_project_endpoint(project_id: str):
    """Desfaz a última alteração de código via Git local com restauração instantânea dos arquivos."""
    try:
        res = workspace_service.rollback_last_change(project_id)
        return res
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=404, detail=str(fnf))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha ao executar rollback: {exc}")


@router.get("/api/v1/workspace/projects/{project_id}/git-history")
async def get_project_git_history_endpoint(project_id: str):
    """Retorna os últimos commits Git semânticos locais do projeto."""
    try:
        history = workspace_service.get_git_history(project_id)
        return history
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha ao consultar histórico Git: {exc}")


@router.delete("/api/v1/workspace/projects/{project_id}")
async def delete_workspace_project_endpoint(project_id: str):
    """Exclui permanentemente um projeto e todos os seus arquivos do disco."""
    try:
        success = workspace_service.delete_project(project_id)
        if not success:
            raise HTTPException(status_code=404, detail=f"Projeto '{project_id}' não encontrado no disco.")
        return {"status": "deleted", "project_id": project_id}
    except PermissionDeniedError as pde:
        raise HTTPException(status_code=403, detail=str(pde))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha ao excluir projeto: {exc}")


@router.get("/api/v1/workspace/projects/{project_id}/export-zip")
async def export_project_zip_endpoint(project_id: str):
    """Exporta o projeto em um pacote ZIP limpo (sem node_modules, .venv, .git)."""
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
async def dockerize_project_endpoint(project_id: str):
    """Gera automaticamente Dockerfile, docker-compose.yml e .dockerignore para o projeto."""
    try:
        res = workspace_service.dockerize_project(project_id)
        # Dispara notificação assíncrona se ativada
        try:
            await webhook_service.send_notification(
                title=f"Projeto Dockerizado: {project_id}",
                message=f"Ambiente Docker multi-stage criado com sucesso para {res.get('stack', 'Aplicação')}. Pronto para 'docker compose up --build'.",
                event_type="dockerize",
            )
        except Exception:
            pass
        return res
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=404, detail=str(fnf))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha ao dockerizar projeto: {exc}")


@router.post("/api/v1/workspace/projects/{project_id}/open-folder")
async def open_workspace_folder_endpoint(project_id: str):
    """Abre o explorador de arquivos nativo do sistema operacional na pasta do projeto."""
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
async def open_project_code_endpoint(project_id: str):
    """Abre o projeto no Visual Studio Code (se instalado)."""
    try:
        path = workspace_service.open_project_in_editor(project_id)
        return {"status": "opened", "path": path}
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=404, detail=str(fnf))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha ao abrir no VS Code: {exc}")


@router.get("/api/v1/workspace/projects/{project_id}/preview")
async def get_project_preview_endpoint(project_id: str):
    """Retorna o HTML principal do projeto para exibição segura em sandbox/Sparkpages."""
    try:
        content = workspace_service.read_project_file(project_id, "index.html")
        return HTMLResponse(content=content)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Preview não disponível (index.html não encontrado): {exc}")


@router.post("/api/v1/workspace/import")
async def import_external_folder_endpoint(payload: ImportFolderPayload):
    """Importa e conecta uma pasta física do computador como projeto no JARVIS AI HUB."""
    try:
        res = workspace_service.import_external_project(payload.folder_path, payload.name)
        return {"status": "imported", "project": res}
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=404, detail=str(fnf))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Falha ao importar diretório: {exc}")


@router.get("/api/v1/workspace/projects/{project_id}/memory")
async def get_project_memory_endpoint(project_id: str):
    """Recupera memórias, decisões e diretrizes persistidas de um projeto."""
    return db_manager.list_project_memory(project_id)


@router.post("/api/v1/workspace/projects/{project_id}/memory")
async def save_project_memory_endpoint(project_id: str, payload: ProjectMemoryRequest):
    """Salva uma nova diretriz ou decisão arquitetural na memória persistente do projeto."""
    db_manager.set_project_memory(
        project_id=project_id,
        category=payload.category,
        key=payload.key,
        content=payload.content,
        sources=payload.sources,
    )
    return {"status": "saved", "project_id": project_id, "key": payload.key}
