"""
JARVIS AI HUB - Knowledge Vault & Local RAG Service
Gerencia a indexação de documentos locais, manuais em PDF, arquivos Markdown e código
para injeção contextual em tempo real nos 26 agentes especialistas.
Opera 100% offline, local e blindado na sua máquina (Intel i5 + 32GB RAM).
"""

import logging
from pathlib import Path
from typing import Any

from services.knowledge.embedding_service import local_embedding_service
from services.memory.database import DatabaseManager
from services.tool_gateway.specialized_tools import vector_memory_manager

logger = logging.getLogger("jarvis.knowledge")

MAX_INDEX_FILE_BYTES = 25 * 1024 * 1024


def _vector_table_for_owner(owner_user_id: str | None) -> str:
    clean_id = (owner_user_id or "default").replace(":", "_").replace("-", "_")
    return f"knowledge_{clean_id}"

SUPPORTED_EXTENSIONS = {
    ".md",
    ".txt",
    ".json",
    ".yaml",
    ".yml",
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".java",
    ".go",
    ".cs",
    ".sql",
    ".html",
    ".css",
    ".pdf",
    ".docx",
}


class KnowledgeVaultService:
    def __init__(self, db_manager: DatabaseManager):
        self.db = db_manager

    def chunk_text(self, text: str, chunk_size: int = 600, overlap: int = 100) -> list[str]:
        """Divide o texto em blocos semânticos com sobreposição para manter o contexto."""
        if not text or not text.strip():
            return []
        paragraphs = text.split("\n\n")
        chunks: list[str] = []
        current_chunk = ""

        for p in paragraphs:
            clean_p = p.strip()
            if not clean_p:
                continue
            if len(current_chunk) + len(clean_p) > chunk_size:
                if current_chunk:
                    chunks.append(current_chunk)
                    # Mantém sobreposição do final do bloco anterior
                    current_chunk = current_chunk[-overlap:] + "\n" + clean_p
                else:
                    chunks.append(clean_p)
                    current_chunk = ""
            else:
                current_chunk = f"{current_chunk}\n\n{clean_p}".strip()

        if current_chunk.strip():
            chunks.append(current_chunk.strip())

        return chunks

    def extract_text_from_file(self, file_path: Path) -> str:
        """Extrai texto com suporte a arquivos de texto, PDFs e documentos DOCX."""
        ext = file_path.suffix.lower()
        if ext == ".docx":
            try:
                import xml.etree.ElementTree as ET
                import zipfile

                with zipfile.ZipFile(file_path) as z:
                    xml_content = z.read("word/document.xml")
                root = ET.fromstring(xml_content)
                namespaces = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
                paragraphs = []
                for p_elem in root.iterfind(".//w:p", namespaces):
                    texts = [
                        node.text for node in p_elem.iterfind(".//w:t", namespaces) if node.text
                    ]
                    if texts:
                        paragraphs.append("".join(texts))
                return "\n\n".join(paragraphs)
            except Exception as e:
                logger.warning("Falha ao extrair texto do DOCX %s: %s", file_path.name, e)
                return ""

        if ext == ".pdf":
            # Tenta usar pypdf se disponível, ou fallback de extração textual
            try:
                import pypdf

                reader = pypdf.PdfReader(str(file_path))
                pages_text = []
                for idx, page in enumerate(reader.pages):
                    pt = page.extract_text()
                    if pt:
                        pages_text.append(f"--- Página {idx + 1} ---\n{pt}")
                return "\n\n".join(pages_text)
            except Exception:
                try:
                    raw_bytes = file_path.read_bytes()
                    # Fallback leve para extração de strings legíveis do PDF
                    import re

                    text_parts = re.findall(rb"[\x20-\x7E\xA0-\xFF]{4,}", raw_bytes)
                    return b"\n".join(text_parts).decode("latin-1", errors="ignore")
                except Exception as e:
                    logger.warning("Falha ao extrair texto do PDF %s: %s", file_path.name, e)
                    return ""

        # Demais arquivos de texto (Markdown, código, JSON, etc.)
        for enc in ("utf-8", "latin-1", "cp1252"):
            try:
                return file_path.read_text(encoding=enc)
            except Exception:
                logger.debug(
                    "Codificação %s falhou para %s; a tentar a seguinte.",
                    enc,
                    file_path.name,
                    exc_info=True,
                )
                continue
        return ""

    def format_size(self, size_bytes: int) -> str:
        if size_bytes < 1024:
            return f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            return f"{size_bytes / 1024:.1f} KB"
        return f"{size_bytes / (1024 * 1024):.1f} MB"

    def index_file(
        self,
        file_path: Path | str,
        category: str = "geral",
        owner_user_id: str | None = None,
    ) -> dict[str, Any]:
        """Processa um arquivo físico e indexa seus blocos na Base de Conhecimento."""
        p = Path(file_path).resolve()
        if not p.exists() or not p.is_file():
            raise FileNotFoundError(f"Arquivo não encontrado: {p}")

        file_size = p.stat().st_size
        if file_size > MAX_INDEX_FILE_BYTES:
            raise ValueError("O ficheiro excede o limite de indexação de 25 MB.")
        doc_name = p.name
        file_type = p.suffix.lower().replace(".", "").upper() or "TXT"
        file_size_formatted = self.format_size(file_size)

        text = self.extract_text_from_file(p)
        if not text.strip():
            raise ValueError(f"Não foi possível extrair conteúdo textual legível de '{doc_name}'")

        chunks = self.chunk_text(text)
        inserted_count = self.db.insert_knowledge_chunks(
            doc_name=doc_name,
            file_type=file_type,
            category=category,
            chunks=chunks,
            file_size_formatted=file_size_formatted,
            source_path=str(p),
            owner_user_id=owner_user_id,
        )
        self._index_chunks_vector(
            doc_name=doc_name,
            category=category,
            chunks=chunks,
            source_path=str(p),
            owner_user_id=owner_user_id,
        )

        return {
            "status": "indexed",
            "doc_name": doc_name,
            "file_type": file_type,
            "category": category,
            "chunks_count": inserted_count,
            "file_size": file_size_formatted,
            "source_path": str(p),
        }

    def index_text_snippet(
        self,
        doc_name: str,
        content: str,
        category: str = "anotacoes",
        owner_user_id: str | None = None,
    ) -> dict[str, Any]:
        """Indexa um texto avulso digitado ou colado pelo usuário."""
        chunks = self.chunk_text(content)
        file_size_formatted = self.format_size(len(content.encode("utf-8")))
        inserted_count = self.db.insert_knowledge_chunks(
            doc_name=doc_name,
            file_type="TEXT",
            category=category,
            chunks=chunks,
            file_size_formatted=file_size_formatted,
            source_path="Entrada Direta do Usuário",
            owner_user_id=owner_user_id,
        )
        self._index_chunks_vector(
            doc_name=doc_name,
            category=category,
            chunks=chunks,
            source_path="Entrada Direta do Usuário",
            owner_user_id=owner_user_id,
        )
        return {
            "status": "indexed",
            "doc_name": doc_name,
            "chunks_count": inserted_count,
            "file_size": file_size_formatted,
        }

    def index_directory(
        self,
        dir_path: Path | str,
        category: str = "projeto",
        owner_user_id: str | None = None,
    ) -> dict[str, Any]:
        """Varre e indexa todos os arquivos suportados em um diretório local."""
        root = Path(dir_path).resolve()
        if not root.exists() or not root.is_dir():
            raise FileNotFoundError(f"Diretório não encontrado: {root}")

        indexed_files = []
        skipped_files = []

        for p in root.rglob("*"):
            if p.is_symlink() or not p.is_file() or p.suffix.lower() not in SUPPORTED_EXTENSIONS:
                continue
            try:
                p.resolve(strict=True).relative_to(root)
            except (OSError, RuntimeError, ValueError):
                continue
            # Ignora pastas de cache, dependências e arquivos acima do limite.
            parts = p.parts
            if any(
                k in parts
                for k in ("node_modules", ".venv", "__pycache__", ".git", "dist", "build")
            ):
                continue
            try:
                res = self.index_file(p, category=category, owner_user_id=owner_user_id)
                indexed_files.append(res)
            except Exception as exc:
                skipped_files.append({"file": p.name, "error": str(exc)})

        return {
            "status": "completed",
            "directory": str(root),
            "indexed_count": len(indexed_files),
            "indexed_files": [f["doc_name"] for f in indexed_files],
            "skipped_count": len(skipped_files),
        }

    def _index_chunks_vector(
        self,
        doc_name: str,
        category: str,
        chunks: list[str],
        source_path: str,
        owner_user_id: str | None = None,
    ) -> None:
        """Gera e armazena embeddings dos blocos no LanceDB para busca semântica."""
        try:
            table_name = _vector_table_for_owner(owner_user_id)
            for i, chunk in enumerate(chunks):
                vec = local_embedding_service.get_embedding(chunk)
                vector_memory_manager.store_memory(
                    table_name=table_name,
                    text=chunk,
                    vector=vec,
                    metadata={
                        "doc_name": doc_name,
                        "category": category,
                        "chunk_index": i,
                        "source_path": source_path,
                        "owner_user_id": owner_user_id,
                    },
                )
        except Exception as exc:
            logger.debug("Falha ao indexar vetores no LanceDB para %s: %s", doc_name, exc)

    def search(
        self, query: str, limit: int = 4, owner_user_id: str | None = None
    ) -> list[dict[str, Any]]:
        """Realiza busca semântica vetorial com fallback determinístico por palavras-chave."""
        clean_query = query.strip()
        if not clean_query:
            return []

        results: list[dict[str, Any]] = []
        seen: set[tuple[str, int]] = set()

        # 1. Busca Semântica via Embeddings e LanceDB
        try:
            table_name = _vector_table_for_owner(owner_user_id)
            query_vec = local_embedding_service.get_embedding(clean_query)
            similar = vector_memory_manager.search_similar(
                table_name=table_name, query_vector=query_vec, top_k=limit
            )
            for m in similar:
                meta = m.get("metadata", {})
                doc_name = meta.get("doc_name", "")
                chunk_idx = meta.get("chunk_index", 0)
                key = (doc_name, chunk_idx)
                if key not in seen and doc_name:
                    seen.add(key)
                    score = round(1.0 / (1.0 + float(m.get("score", 0.0))), 3)
                    results.append(
                        {
                            "doc_name": doc_name,
                            "category": meta.get("category", "geral"),
                            "chunk_index": chunk_idx,
                            "content": m.get("text", ""),
                            "source_path": meta.get("source_path", ""),
                            "score": score,
                            "match_type": "semantic",
                        }
                    )
        except Exception as exc:
            logger.debug("Busca semântica no LanceDB falhou: %s", exc)

        # 2. Fallback por palavras-chave no SQLite
        if len(results) < limit:
            keyword_limit = limit - len(results)
            try:
                keyword_matches = self.db.search_knowledge_vault(
                    clean_query, limit=keyword_limit, owner_user_id=owner_user_id
                )
                for km in keyword_matches:
                    key = (km.get("doc_name", ""), km.get("chunk_index", 0))
                    if key not in seen:
                        seen.add(key)
                        results.append(
                            {
                                **km,
                                "match_type": "keyword",
                            }
                        )
            except Exception as exc:
                logger.warning("Fallback de busca textual no SQLite falhou: %s", exc)

        return results[:limit]

    def list_documents(self, owner_user_id: str | None = None) -> list[dict[str, Any]]:
        """Lista inventário de documentos do proprietário."""
        return self.db.list_knowledge_documents(owner_user_id=owner_user_id)

    def delete_document(self, doc_name: str, owner_user_id: str | None = None) -> bool:
        """Exclui documento apenas do proprietário."""
        return self.db.delete_knowledge_document(doc_name, owner_user_id=owner_user_id)
