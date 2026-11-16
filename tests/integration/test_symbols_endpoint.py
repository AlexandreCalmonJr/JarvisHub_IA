"""Testes de integração para os endpoints de Code Intelligence e Navegação Sintática AST."""

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.main import app


@pytest.mark.asyncio
async def test_symbols_indexing_and_lookup():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Trigger AST Indexing com limite adequado
        index_res = await client.post("/api/v1/symbols/index?max_files=350")
        assert index_res.status_code == 200
        stats = index_res.json()
        assert "indexed_files" in stats
        assert "unique_symbols" in stats
        assert stats["indexed_files"] > 100

        # 2. Find Symbol Definition
        def_res = await client.get("/api/v1/symbols/definition?symbol=ASTIndexer")
        assert def_res.status_code == 200
        data = def_res.json()
        assert data["symbol"] == "ASTIndexer"
        assert data["count"] >= 1
        assert any(d["name"] == "ASTIndexer" for d in data["definitions"])

        # 3. Find Symbol References
        ref_res = await client.get("/api/v1/symbols/references?symbol=ASTIndexer&max_matches=10")
        assert ref_res.status_code == 200
        ref_data = ref_res.json()
        assert ref_data["count"] >= 1
        assert any("ASTIndexer" in r["context_line"] for r in ref_data["references"])
