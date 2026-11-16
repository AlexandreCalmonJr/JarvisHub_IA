"""Router de Code Intelligence e Navegação Sintática AST (estilo Cursor / Devin)."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from apps.api.auth import Principal, get_principal
from services.engineering_intelligence import ASTIndexer

logger = logging.getLogger("jarvis.api.symbols")
router = APIRouter(prefix="/api/v1/symbols", tags=["code_intelligence"])

# Instância compartilhada do indexador AST
_indexer = ASTIndexer()


@router.post("/index")
async def trigger_ast_indexing(
    principal: Annotated[Principal, Depends(get_principal)],
    project_path: str | None = None,
    max_files: int = Query(default=500, ge=10, le=2000),
):
    """Executa a varredura e indexação sintática do repositório/projeto."""
    stats = _indexer.index_project(project_path=project_path, max_files=max_files)
    return stats


@router.get("/definition")
async def find_symbol_definition(
    symbol: str = Query(..., min_length=1, max_length=128),
    principal: Annotated[Principal, Depends(get_principal)] = None,
):
    """Localiza arquivos, linhas e assinaturas onde o símbolo foi declarado."""
    matches = _indexer.find_definition(symbol)
    return {
        "symbol": symbol,
        "count": len(matches),
        "definitions": [m.to_dict() for m in matches],
    }


@router.get("/references")
async def find_symbol_references(
    symbol: str = Query(..., min_length=1, max_length=128),
    max_matches: int = Query(default=30, ge=1, le=100),
    principal: Annotated[Principal, Depends(get_principal)] = None,
):
    """Localiza ocorrências e chamadas de um símbolo no projeto."""
    refs = _indexer.find_references(symbol, max_matches=max_matches)
    return {
        "symbol": symbol,
        "count": len(refs),
        "references": [r.to_dict() for r in refs],
    }


@router.get("/file")
async def get_file_symbols(
    path: str = Query(..., min_length=1),
    principal: Annotated[Principal, Depends(get_principal)] = None,
):
    """Lista todos os símbolos identificados em um arquivo específico."""
    symbols = _indexer.list_file_symbols(path)
    return {
        "path": path,
        "count": len(symbols),
        "symbols": [s.to_dict() for s in symbols],
    }
