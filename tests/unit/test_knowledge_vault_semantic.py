"""Testes unitários para a busca semântica e RAG local do Knowledge Vault."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from services.knowledge.embedding_service import LocalEmbeddingService
from services.knowledge.knowledge_vault import KnowledgeVaultService
from services.memory.database import DatabaseManager


@pytest.fixture
def temp_environment():
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp_dir:
        tmp_path = Path(tmp_dir)
        db_path = tmp_path / "test_knowledge.db"
        vector_dir = tmp_path / "test_vectors"
        db = DatabaseManager(db_path=str(db_path))
        kv = KnowledgeVaultService(db_manager=db)
        yield kv, db, vector_dir


def test_embedding_service_dimensions_and_fallback():
    service = LocalEmbeddingService()
    emb = service.get_embedding("teste de arquitetura limpa com FastAPI")
    assert isinstance(emb, list)
    assert len(emb) == 768
    assert all(isinstance(v, float) for v in emb)

    # Verifica cache
    emb2 = service.get_embedding("teste de arquitetura limpa com FastAPI")
    assert emb == emb2


def test_knowledge_vault_semantic_index_and_search(temp_environment):
    kv, db, _ = temp_environment
    user_a = "user_alice"

    # Indexa um snippet de texto
    content = (
        "A arquitetura do JARVIS AI HUB utiliza FastAPI no backend e React no frontend. "
        "A governança humana de código é feita através do Approval Center, exigindo validação explícita de diffs."
    )
    result = kv.index_text_snippet(
        doc_name="arquitetura.md",
        content=content,
        category="engenharia",
        owner_user_id=user_a,
    )
    assert result["status"] == "indexed"
    assert result["chunks_count"] >= 1

    # Busca com termo exato
    matches = kv.search(query="FastAPI", limit=3, owner_user_id=user_a)
    assert len(matches) > 0
    assert "FastAPI" in matches[0]["content"]

    # Busca semântica por conceito correlato
    matches_semantic = kv.search(
        query="governança e validação de alterações", limit=3, owner_user_id=user_a
    )
    assert len(matches_semantic) > 0
    assert any("Approval Center" in m["content"] for m in matches_semantic)


def test_knowledge_vault_account_isolation(temp_environment):
    kv, db, _ = temp_environment
    user_a = "user_alice"
    user_b = "user_bob"

    kv.index_text_snippet(
        doc_name="segredo_alice.txt",
        content="Informação altamente confidencial da Alice: token_secreto_xyz",
        category="seguranca",
        owner_user_id=user_a,
    )

    # Alice consegue pesquisar
    alice_results = kv.search(query="token_secreto_xyz", limit=5, owner_user_id=user_a)
    assert len(alice_results) > 0

    # Bob não consegue ver os documentos da Alice
    bob_results = kv.search(query="token_secreto_xyz", limit=5, owner_user_id=user_b)
    assert len(bob_results) == 0


def test_keyword_fallback_when_vectors_empty(temp_environment):
    kv, db, _ = temp_environment
    user = "user_fallback"

    # Insere diretamente no SQLite simulando documento legado sem vetor
    db.insert_knowledge_chunks(
        doc_name="legado.txt",
        file_type="TXT",
        category="legado",
        chunks=["Documento armazenado diretamente no banco relacional sem embedding prévio."],
        file_size_formatted="1 KB",
        source_path="/tmp/legado.txt",
        owner_user_id=user,
    )

    results = kv.search(query="relacional", limit=3, owner_user_id=user)
    assert len(results) > 0
    assert results[0]["doc_name"] == "legado.txt"
    assert results[0]["match_type"] == "keyword"
