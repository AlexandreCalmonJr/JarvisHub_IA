#!/usr/bin/env python3
"""
JARVIS AI Hub — Worker Python 3.11 Local (STDIO NDJSON JSON-RPC).

Roda ao vivo junto ao Control Plane Node.js sem exigir bibliotecas externas:
  - ping: diagnóstico real do runtime Python + SQLite FTS5
  - chunk_and_vectorize: segmentação de Markdown (~400 tokens c/ sobreposição) e vetores locais normalizados (128d)
  - hybrid_search: busca paralela FTS5 (BM25) + similaridade por cosseno com fusão RRF
  - extract_facts: extração de fatos duráveis estilo Hermes Agent (escopo 'memory' vs 'user')
  - analyze_workspace: métricas reais do corpus Markdown e do banco SQLite WAL do perfil
"""

import hashlib
import json
import math
import os
import platform
import re
import sqlite3
import struct
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Tuple

VECTOR_DIM = 128

STOPWORDS_PT_EN = {
    "a", "o", "e", "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas",
    "para", "por", "com", "sem", "um", "uma", "uns", "umas", "que", "se", "ao",
    "aos", "as", "os", "ou", "como", "mais", "mas", "foi", "sao", "ser", "esta",
    "este", "esse", "essa", "isso", "isto", "seu", "sua", "seus", "suas", "the",
    "and", "for", "with", "that", "this", "from", "are", "was", "were", "have",
    "has", "not", "but", "can", "all", "into", "over", "under", "about", "using",
}


def tokenize(text: str) -> List[str]:
    clean = re.sub(r"[^0-9a-zA-ZÀ-ÿ_-]+", " ", (text or "").lower())
    tokens = [t.strip("_-") for t in clean.split() if len(t.strip("_-")) >= 2]
    return [t for t in tokens if t not in STOPWORDS_PT_EN]


def build_local_vector(text: str, dim: int = VECTOR_DIM) -> List[float]:
    """Gera vetor L2-normalizado de 128 dimensões usando feature hashing + trigramas."""
    vec = [0.0] * dim
    tokens = tokenize(text)
    if not tokens:
        return vec

    counts = Counter(tokens)
    for token, freq in counts.items():
        weight = 1.0 + math.log(freq)
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
        idx = int.from_bytes(digest[:4], "little") % dim
        sign = 1.0 if (digest[4] & 1) == 0 else -1.0
        vec[idx] += sign * weight

        # Sub-palavras (trigramas) ajudam em variações morfológicas PT-BR/EN
        if len(token) >= 5:
            for i in range(0, min(len(token) - 2, 12), 2):
                gram = token[i : i + 3]
                gd = hashlib.blake2b(gram.encode("utf-8"), digest_size=6).digest()
                gidx = int.from_bytes(gd[:4], "little") % dim
                gsign = 1.0 if (gd[4] & 1) == 0 else -1.0
                vec[gidx] += gsign * (weight * 0.35)

    norm = math.sqrt(sum(v * v for v in vec))
    if norm > 1e-9:
        vec = [v / norm for v in vec]
    return vec


def pack_vector(vec: List[float]) -> bytes:
    return struct.pack(f"<{len(vec)}f", *vec)


def unpack_vector(blob: bytes) -> List[float]:
    if not blob or len(blob) % 4 != 0:
        return []
    count = len(blob) // 4
    return list(struct.unpack(f"<{count}f", blob))


def cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    return max(0.0, min(1.0, float(dot)))


def chunk_markdown(text: str, source_ref: str, max_chars: int = 1200, overlap: int = 180) -> List[Dict[str, Any]]:
    """Segmenta Markdown preservando cabeçalhos (# / ## / ###) com sobreposição controlada."""
    lines = (text or "").splitlines()
    sections: List[Tuple[str, List[str]]] = []
    current_heading = source_ref
    buffer: List[str] = []

    for line in lines:
        heading_match = re.match(r"^(#{1,3})\s+(.+)$", line.strip())
        if heading_match:
            if buffer:
                sections.append((current_heading, buffer))
                buffer = []
            current_heading = heading_match.group(2).strip()[:120]
            buffer.append(line)
        else:
            buffer.append(line)
    if buffer:
        sections.append((current_heading, buffer))

    if not sections and (text or "").strip():
        sections = [(source_ref, [text.strip()])]

    chunks: List[Dict[str, Any]] = []
    idx = 0
    for heading, sec_lines in sections:
        body = "\n".join(sec_lines).strip()
        if not body:
            continue
        start = 0
        while start < len(body):
            end = min(len(body), start + max_chars)
            piece = body[start:end].strip()
            if piece:
                content_hash = hashlib.sha256(piece.encode("utf-8")).hexdigest()[:20]
                vec = build_local_vector(f"{heading}\n{piece}")
                chunks.append(
                    {
                        "index": idx,
                        "heading": heading,
                        "content": piece,
                        "content_hash": content_hash,
                        "token_estimate": max(1, len(piece) // 4),
                        "vector": vec,
                    }
                )
                idx += 1
            if end >= len(body):
                break
            start = max(start + 1, end - overlap)

    return chunks


def sanitize_fts_query(query: str) -> str:
    tokens = re.findall(r"[0-9a-zA-ZÀ-ÿ_]{2,}", query or "")
    if not tokens:
        return ""
    # OR entre termos com prefixo * para boa revocação em PT-BR/EN
    safe_terms = [f'"{t}"*' for t in tokens[:10]]
    return " OR ".join(safe_terms)


def handle_ping(_params: Dict[str, Any]) -> Dict[str, Any]:
    mem_conn = sqlite3.connect(":memory:")
    fts5_ok = False
    try:
        mem_conn.execute("CREATE VIRTUAL TABLE _t USING fts5(body)")
        fts5_ok = True
    except sqlite3.Error:
        fts5_ok = False
    finally:
        mem_conn.close()

    return {
        "status": "online",
        "python_version": platform.python_version(),
        "sqlite_version": sqlite3.sqlite_version,
        "fts5_available": fts5_ok,
        "vector_dimensions": VECTOR_DIM,
        "pid": os.getpid(),
    }


def handle_chunk_and_vectorize(params: Dict[str, Any]) -> Dict[str, Any]:
    text = str(params.get("text") or "")
    source_ref = str(params.get("source_ref") or "documento")
    max_chars = int(params.get("max_chars") or 1200)
    overlap = int(params.get("overlap") or 180)
    chunks = chunk_markdown(text, source_ref, max(200, min(4000, max_chars)), max(0, min(400, overlap)))
    return {
        "source_ref": source_ref,
        "chunks_count": len(chunks),
        "dimensions": VECTOR_DIM,
        "chunks": chunks,
    }


def handle_hybrid_search(params: Dict[str, Any]) -> Dict[str, Any]:
    db_path = str(params.get("db_path") or "").strip()
    workspace_slug = str(params.get("workspace_slug") or "default").strip()
    query = str(params.get("query") or "").strip()
    limit = max(1, min(25, int(params.get("limit") or 8)))
    bm25_weight = float(params.get("bm25_weight", 0.5))
    vector_weight = float(params.get("vector_weight", 0.5))
    query_vector_input = params.get("query_vector")

    if not db_path or not Path(db_path).exists() or not query:
        return {"hits": [], "fts_candidates": 0, "vector_candidates": 0, "engine": "python-rrf"}

    uri = f"file:{db_path}?mode=ro"
    conn = sqlite3.connect(uri, uri=True, timeout=5.0)
    conn.row_factory = sqlite3.Row
    try:
        # 1. Busca FTS5 (BM25)
        fts_query = sanitize_fts_query(query)
        fts_ranks: Dict[str, Tuple[int, float]] = {}
        if fts_query:
            try:
                rows = conn.execute(
                    """
                    SELECT chunk_id, bm25(memory_chunks_fts) AS raw_bm25
                    FROM memory_chunks_fts
                    WHERE memory_chunks_fts MATCH ? AND workspace_slug = ?
                    ORDER BY raw_bm25 ASC
                    LIMIT 40
                    """,
                    (fts_query, workspace_slug),
                ).fetchall()
                for rank_idx, row in enumerate(rows, start=1):
                    # Em SQLite FTS5, bm25() retorna valores negativos mais próximos de -inf quanto melhor
                    raw = float(row["raw_bm25"] or 0.0)
                    norm_bm25 = 1.0 / (1.0 + math.exp(raw / 3.0)) if raw < 0 else max(0.05, 1.0 / (1.0 + raw))
                    fts_ranks[row["chunk_id"]] = (rank_idx, round(min(1.0, max(0.0, norm_bm25)), 4))
            except sqlite3.Error:
                pass

        # 2. Busca Vetorial (Cosseno) sobre blobs armazenados
        if isinstance(query_vector_input, list) and len(query_vector_input) > 0:
            q_vec = [float(x) for x in query_vector_input]
            q_norm = math.sqrt(sum(v * v for v in q_vec))
            if q_norm > 1e-9:
                q_vec = [v / q_norm for v in q_vec]
        else:
            q_vec = build_local_vector(query)

        emb_rows = conn.execute(
            """
            SELECT e.chunk_id, e.vector_blob, e.dimensions
            FROM memory_embeddings e
            INNER JOIN memory_chunks c ON c.chunk_id = e.chunk_id
            WHERE c.workspace_slug = ?
            """,
            (workspace_slug,),
        ).fetchall()

        vec_scored: List[Tuple[str, float]] = []
        for erow in emb_rows:
            vec = unpack_vector(erow["vector_blob"])
            if len(vec) != len(q_vec):
                # Fallback local caso dimensões divirjam entre modelo cloud e local
                continue
            sim = cosine_similarity(q_vec, vec)
            if sim > 0.04:
                vec_scored.append((erow["chunk_id"], sim))

        vec_scored.sort(key=lambda pair: pair[1], reverse=True)
        vec_ranks: Dict[str, Tuple[int, float]] = {}
        for rank_idx, (cid, sim) in enumerate(vec_scored[:40], start=1):
            vec_ranks[cid] = (rank_idx, round(sim, 4))

        # 3. Fusão Reciprocal Rank Fusion (RRF)
        all_ids = set(fts_ranks.keys()) | set(vec_ranks.keys())
        if not all_ids:
            # Fallback por substring para consultas curtas
            like_pattern = f"%{query}%"
            like_rows = conn.execute(
                """
                SELECT chunk_id FROM memory_chunks
                WHERE workspace_slug = ? AND (content LIKE ? OR heading LIKE ? OR source_ref LIKE ?)
                LIMIT ?
                """,
                (workspace_slug, like_pattern, like_pattern, like_pattern, limit),
            ).fetchall()
            for rank_idx, r in enumerate(like_rows, start=1):
                fts_ranks[r["chunk_id"]] = (rank_idx, 0.45)
                all_ids.add(r["chunk_id"])

        k_rrf = 30.0
        fused: List[Tuple[str, float, float, float]] = []
        total_w = max(0.01, bm25_weight + vector_weight)
        w_bm25 = bm25_weight / total_w
        w_vec = vector_weight / total_w

        for cid in all_ids:
            f_rank, f_score = fts_ranks.get(cid, (999, 0.0))
            v_rank, v_score = vec_ranks.get(cid, (999, 0.0))
            rrf = 0.0
            if f_rank < 999:
                rrf += w_bm25 * (1.0 / (k_rrf + f_rank))
            if v_rank < 999:
                rrf += w_vec * (1.0 / (k_rrf + v_rank))
            # Normaliza para escala intuitiva 0..1
            scaled = min(1.0, rrf * (k_rrf + 1.0))
            fused.append((cid, round(scaled, 4), f_score, v_score))

        fused.sort(key=lambda item: item[1], reverse=True)
        top_items = fused[:limit]

        hits: List[Dict[str, Any]] = []
        for cid, rrf_score, bm25_score, vector_score in top_items:
            row = conn.execute(
                """
                SELECT chunk_id, workspace_slug, source_type, source_ref, heading, content
                FROM memory_chunks
                WHERE chunk_id = ?
                """,
                (cid,),
            ).fetchone()
            if not row:
                continue
            snippet = str(row["content"] or "").strip()
            if len(snippet) > 360:
                snippet = snippet[:357].rstrip() + "..."
            hits.append(
                {
                    "chunk_id": row["chunk_id"],
                    "workspace_slug": row["workspace_slug"],
                    "source_type": row["source_type"],
                    "source_ref": row["source_ref"],
                    "heading": row["heading"],
                    "snippet": snippet,
                    "bm25_score": bm25_score,
                    "vector_score": vector_score,
                    "rrf_score": rrf_score,
                }
            )

        return {
            "hits": hits,
            "fts_candidates": len(fts_ranks),
            "vector_candidates": len(vec_ranks),
            "engine": "python-fts5-cosine-rrf",
        }
    finally:
        conn.close()


def handle_extract_facts(params: Dict[str, Any]) -> Dict[str, Any]:
    """Extrai fatos duráveis estilo Hermes Agent separando 'user' (preferências) e 'memory' (técnico/ambiente)."""
    text = str(params.get("text") or "").strip()
    if not text:
        return {"facts": []}

    user_patterns = [
        r"\b(eu prefiro|minha preferência|sempre responda|meu nome|trabalho com|meu fuso|gosto de|prefiro que)\b",
        r"\b(i prefer|my preference|my timezone|always respond|my name is)\b",
    ]
    memory_patterns = [
        r"\b(porta|servidor|sqlite|postgres|docker|api|endpoint|token|banco|deploy|rota|modelo|python|go|mcp|backup|wal|fts5|repositório|arquitetura|regra|protocolo)\b",
    ]

    raw_sentences = re.split(r"(?:\n+|(?<=[.!?])\s+)", text)
    seen = set()
    facts: List[Dict[str, Any]] = []

    for sent in raw_sentences:
        cleaned = re.sub(r"^[-*#\d.)\s]+", "", sent).strip()
        if len(cleaned) < 18 or len(cleaned) > 360:
            continue
        key = cleaned.lower()
        if key in seen:
            continue

        is_user = any(re.search(pat, key) for pat in user_patterns)
        is_memory = any(re.search(pat, key) for pat in memory_patterns)
        if not is_user and not is_memory:
            continue

        seen.add(key)
        scope = "user" if is_user else "memory"
        words = tokenize(cleaned)
        tags = list(dict.fromkeys(words[:4]))
        title = cleaned[:58].rstrip(".,;:") + ("..." if len(cleaned) > 58 else "")
        facts.append(
            {
                "scope": scope,
                "title": title,
                "content": cleaned,
                "tags": tags,
                "confidence": 0.92 if (is_user or len(tags) >= 3) else 0.84,
            }
        )
        if len(facts) >= 12:
            break

    return {"facts": facts}


def handle_analyze_workspace(params: Dict[str, Any]) -> Dict[str, Any]:
    db_path = str(params.get("db_path") or "").strip()
    workspace_slug = str(params.get("workspace_slug") or "default").strip()
    if not db_path or not Path(db_path).exists():
        return {"chunks": 0, "embeddings": 0, "entries": 0, "top_terms": [], "estimated_tokens": 0}

    uri = f"file:{db_path}?mode=ro"
    conn = sqlite3.connect(uri, uri=True, timeout=5.0)
    try:
        chunks = conn.execute(
            "SELECT COUNT(*), COALESCE(SUM(token_estimate), 0) FROM memory_chunks WHERE workspace_slug = ?",
            (workspace_slug,),
        ).fetchone()
        embeddings = conn.execute(
            """
            SELECT COUNT(*) FROM memory_embeddings e
            INNER JOIN memory_chunks c ON c.chunk_id = e.chunk_id
            WHERE c.workspace_slug = ?
            """,
            (workspace_slug,),
        ).fetchone()
        entries = conn.execute(
            "SELECT scope, COUNT(*) FROM memory_entries WHERE workspace_slug = ? GROUP BY scope",
            (workspace_slug,),
        ).fetchall()
        sample_texts = conn.execute(
            "SELECT content FROM memory_chunks WHERE workspace_slug = ? LIMIT 80",
            (workspace_slug,),
        ).fetchall()

        freq: Counter = Counter()
        for (content,) in sample_texts:
            freq.update(tokenize(content or ""))

        scope_counts = {"memory": 0, "user": 0}
        for scope, count in entries:
            if scope in scope_counts:
                scope_counts[scope] = int(count)

        return {
            "chunks": int(chunks[0] or 0),
            "estimated_tokens": int(chunks[1] or 0),
            "embeddings": int(embeddings[0] or 0),
            "entries_memory": scope_counts["memory"],
            "entries_user": scope_counts["user"],
            "top_terms": [{"term": t, "count": c} for t, c in freq.most_common(8)],
        }
    finally:
        conn.close()


HANDLERS = {
    "ping": handle_ping,
    "chunk_and_vectorize": handle_chunk_and_vectorize,
    "hybrid_search": handle_hybrid_search,
    "extract_facts": handle_extract_facts,
    "analyze_workspace": handle_analyze_workspace,
}


def main() -> None:
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        req_id = None
        started = time.perf_counter()
        try:
            req = json.loads(line)
            req_id = req.get("id")
            method = str(req.get("method") or "")
            params = req.get("params") or {}
            handler = HANDLERS.get(method)
            if not handler:
                raise ValueError(f"Método desconhecido no worker Python: {method}")
            result = handler(params)
            elapsed_ms = round((time.perf_counter() - started) * 1000.0, 2)
            resp = {"id": req_id, "ok": True, "result": result, "elapsed_ms": elapsed_ms}
        except Exception as exc:
            elapsed_ms = round((time.perf_counter() - started) * 1000.0, 2)
            resp = {"id": req_id, "ok": False, "error": str(exc), "elapsed_ms": elapsed_ms}

        sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
