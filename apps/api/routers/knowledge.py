import logging
from fastapi import APIRouter, UploadFile, File, Form

from apps.api.schemas import (
    KnowledgeIndexFolderRequest,
    KnowledgeIndexTextRequest,
    KnowledgeSearchRequest,
)
from apps.api.deps import (
    knowledge_vault_service,
    resolve_data_dir,
)

logger = logging.getLogger("jarvis.api.knowledge")
router = APIRouter(tags=["knowledge"])


@router.get("/api/v1/knowledge/documents")
async def list_knowledge_documents_endpoint():
    return knowledge_vault_service.list_documents()


@router.post("/api/v1/knowledge/upload")
async def upload_knowledge_document_endpoint(
    file: UploadFile = File(...),
    category: str = Form("geral"),
):
    upload_dir = resolve_data_dir() / "knowledge_uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    target_path = upload_dir / file.filename
    content_bytes = await file.read()
    target_path.write_bytes(content_bytes)
    result = knowledge_vault_service.index_file(target_path, category=category)
    return result


@router.post("/api/v1/knowledge/index-folder")
async def index_knowledge_folder_endpoint(payload: KnowledgeIndexFolderRequest):
    return knowledge_vault_service.index_directory(payload.folder_path, category=payload.category)


@router.post("/api/v1/knowledge/index-text")
async def index_knowledge_text_endpoint(payload: KnowledgeIndexTextRequest):
    return knowledge_vault_service.index_text_snippet(payload.doc_name, payload.content, category=payload.category)


@router.post("/api/v1/knowledge/search")
async def search_knowledge_endpoint(payload: KnowledgeSearchRequest):
    return knowledge_vault_service.search(payload.query, limit=payload.limit)


@router.delete("/api/v1/knowledge/documents/{doc_name}")
async def delete_knowledge_document_endpoint(doc_name: str):
    deleted = knowledge_vault_service.delete_document(doc_name)
    return {"status": "deleted" if deleted else "not_found", "doc_name": doc_name}
