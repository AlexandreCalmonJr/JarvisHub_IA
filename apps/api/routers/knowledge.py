import hashlib
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from apps.api.auth import Principal, get_principal
from apps.api.deps import (
    db_manager,
    knowledge_vault_service,
    resolve_data_dir,
)
from apps.api.schemas import (
    KnowledgeIndexFolderRequest,
    KnowledgeIndexTextRequest,
    KnowledgeSearchRequest,
)

logger = logging.getLogger("jarvis.api.knowledge")
router = APIRouter(tags=["knowledge"])


def _private_owner(principal: Principal) -> str:
    if principal.kind == "device" and principal.subject_id.startswith("device:"):
        raise HTTPException(
            status_code=403,
            detail="Dispositivo sem associação a uma conta. Emparelhe novamente com uma conta autorizada.",
        )
    return principal.subject_id


MAX_KNOWLEDGE_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_KNOWLEDGE_TEXT_BYTES = 1024 * 1024


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _owner_upload_dir(owner_user_id: str) -> Path:
    owner_hash = hashlib.sha256(owner_user_id.encode("utf-8")).hexdigest()[:16]
    return (resolve_data_dir() / "knowledge_uploads" / owner_hash).resolve()


def _validate_index_folder(folder_path: str, owner_user_id: str) -> Path:
    try:
        candidate = Path(folder_path).expanduser().resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise HTTPException(status_code=404, detail="Pasta não encontrada.") from exc
    if not candidate.is_dir():
        raise HTTPException(status_code=400, detail="O caminho indicado não é uma pasta.")

    if _is_within(candidate, _owner_upload_dir(owner_user_id)):
        return candidate

    for project in db_manager.list_projects(owner_user_id=owner_user_id):
        root_value = project.get("root_path")
        if not root_value:
            continue
        try:
            project_root = Path(root_value).expanduser().resolve(strict=True)
        except (OSError, RuntimeError):
            continue
        if _is_within(candidate, project_root):
            return candidate

    raise HTTPException(
        status_code=403,
        detail="Só é permitido indexar pastas de projetos ou uploads pertencentes à sua conta.",
    )


@router.get("/api/v1/knowledge/documents")
async def list_knowledge_documents_endpoint(
    principal: Principal = Depends(get_principal),
):
    return knowledge_vault_service.list_documents(owner_user_id=_private_owner(principal))


@router.post("/api/v1/knowledge/upload")
async def upload_knowledge_document_endpoint(
    file: UploadFile = File(...),
    category: str = Form("geral"),
    principal: Principal = Depends(get_principal),
):
    owner = _private_owner(principal)
    upload_dir = _owner_upload_dir(owner)
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path((file.filename or "upload.bin").replace(chr(92), "/")).name
    target_path = upload_dir / safe_name
    if target_path.is_symlink():
        raise HTTPException(status_code=403, detail="Destino de upload não permitido.")
    content_bytes = await file.read(MAX_KNOWLEDGE_UPLOAD_BYTES + 1)
    if len(content_bytes) > MAX_KNOWLEDGE_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="O ficheiro excede o limite de 25 MB.")
    target_path.write_bytes(content_bytes)
    result = knowledge_vault_service.index_file(target_path, category=category, owner_user_id=owner)
    return result


@router.post("/api/v1/knowledge/index-folder")
async def index_knowledge_folder_endpoint(
    payload: KnowledgeIndexFolderRequest, principal: Principal = Depends(get_principal)
):
    owner = _private_owner(principal)
    folder = _validate_index_folder(payload.folder_path, owner)
    return knowledge_vault_service.index_directory(
        folder,
        category=payload.category,
        owner_user_id=owner,
    )


@router.post("/api/v1/knowledge/index-text")
async def index_knowledge_text_endpoint(
    payload: KnowledgeIndexTextRequest, principal: Principal = Depends(get_principal)
):
    owner = _private_owner(principal)
    if len(payload.content.encode("utf-8")) > MAX_KNOWLEDGE_TEXT_BYTES:
        raise HTTPException(status_code=413, detail="O texto excede o limite de 1 MB.")
    return knowledge_vault_service.index_text_snippet(
        payload.doc_name,
        payload.content,
        category=payload.category,
        owner_user_id=owner,
    )


@router.post("/api/v1/knowledge/search")
async def search_knowledge_endpoint(
    payload: KnowledgeSearchRequest, principal: Principal = Depends(get_principal)
):
    return knowledge_vault_service.search(
        payload.query,
        limit=payload.limit,
        owner_user_id=_private_owner(principal),
    )


@router.delete("/api/v1/knowledge/documents/{doc_name}")
async def delete_knowledge_document_endpoint(
    doc_name: str, principal: Principal = Depends(get_principal)
):
    deleted = knowledge_vault_service.delete_document(
        doc_name, owner_user_id=_private_owner(principal)
    )
    return {"status": "deleted" if deleted else "not_found", "doc_name": doc_name}
