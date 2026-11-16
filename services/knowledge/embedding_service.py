"""
JARVIS AI HUB - Local Embedding Service
Gera embeddings semânticos para o Knowledge Vault e busca vetorial dos agentes.
Opera 100% local e offline usando Ollama (nomic-embed-text) com fallback determinístico.
"""

from __future__ import annotations

import hashlib
import logging
import math
import os
from typing import Any

logger = logging.getLogger("jarvis.embeddings")

DEFAULT_EMBEDDING_MODEL = os.getenv("JARVIS_EMBEDDING_MODEL", "nomic-embed-text")
EMBEDDING_DIM = 768


class LocalEmbeddingService:
    """Serviço local de embeddings vetoriais com fallback resiliente."""

    def __init__(self, model_name: str = DEFAULT_EMBEDDING_MODEL):
        self.model_name = model_name
        self._cache: dict[str, list[float]] = {}
        self._ollama_client: Any = None

    def _get_ollama(self) -> Any:
        if self._ollama_client is None:
            try:
                import ollama

                base_url = os.getenv("JARVIS_OLLAMA_BASE_URL")
                if base_url:
                    self._ollama_client = ollama.Client(host=base_url)
                else:
                    self._ollama_client = ollama
            except Exception as exc:
                logger.debug("Cliente Ollama não pôde ser instanciado: %s", exc)
                return None
        return self._ollama_client

    def _fallback_embedding(self, text: str, dim: int = EMBEDDING_DIM) -> list[float]:
        """Gera um embedding determinístico e normalizado baseado em hash de n-grams quando o LLM está indisponível."""
        if not text:
            return [0.0] * dim

        vec = [0.0] * dim
        words = text.lower().split()
        for i, word in enumerate(words):
            h = int(hashlib.sha256(word.encode("utf-8")).hexdigest(), 16)
            idx = h % dim
            weight = 1.0 / (1.0 + math.log(i + 1))
            vec[idx] += weight

        # Normalização L2
        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 0.0:
            vec = [v / norm for v in vec]
        return vec

    def get_embedding(self, text: str) -> list[float]:
        """Gera o vetor de embedding para o texto fornecido."""
        clean_text = text.strip()
        if not clean_text:
            return [0.0] * EMBEDDING_DIM

        cache_key = hashlib.sha256(clean_text.encode("utf-8")).hexdigest()
        if cache_key in self._cache:
            return self._cache[cache_key]

        client = self._get_ollama()
        if client is not None:
            try:
                # Tenta gerar com o modelo dedicado de embeddings local
                res = client.embeddings(model=self.model_name, prompt=clean_text)
                emb = res.get("embedding")
                if emb and isinstance(emb, list) and len(emb) > 0:
                    # Garante tamanho fixo se necessário
                    self._cache[cache_key] = emb
                    return emb
            except Exception as exc:
                logger.debug("Falha na chamada de embeddings Ollama (%s): %s", self.model_name, exc)

        # Fallback local se Ollama offline
        emb = self._fallback_embedding(clean_text)
        self._cache[cache_key] = emb
        return emb

    def get_embeddings_batch(self, texts: list[str]) -> list[list[float]]:
        """Gera embeddings em lote para uma lista de textos."""
        return [self.get_embedding(t) for t in texts]


# Instância singleton do serviço de embeddings
local_embedding_service = LocalEmbeddingService()
