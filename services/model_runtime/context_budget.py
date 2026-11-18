"""Orçamento de contexto para as chamadas aos modelos locais.

O Ollama trunca silenciosamente o prompt quando este excede ``num_ctx``: o
modelo perde o system prompt e o histórico sem qualquer erro visível. Este
módulo centraliza (a) a resolução da janela de contexto enviada ao runtime e
(b) o corte do histórico antes de cada iteração do loop ReAct.
"""

from __future__ import annotations

import json
import os
from typing import Any

DEFAULT_NUM_CTX = 8192
MIN_NUM_CTX = 2048
MAX_NUM_CTX = 131072

#: Reserva para a resposta (tokens) e folga para a formatação do template.
DEFAULT_OUTPUT_RESERVE = 2048
TEMPLATE_OVERHEAD_TOKENS = 512
#: Nunca cortar abaixo disto: system prompt + últimas trocas.
MIN_KEPT_TURNS = 6


def resolve_num_ctx(requested: int | None = None) -> int:
    """Janela de contexto efetiva para o Ollama.

    Precedência: ``JARVIS_OLLAMA_NUM_CTX`` → valor pedido → predefinição.
    """
    value: int | None = None
    raw = os.environ.get("JARVIS_OLLAMA_NUM_CTX", "").strip()
    if raw:
        try:
            value = int(raw)
        except ValueError:
            value = None
    if not value:
        value = requested
    if not value:
        value = DEFAULT_NUM_CTX
    return max(MIN_NUM_CTX, min(int(value), MAX_NUM_CTX))


def estimate_tokens(text: str | None) -> int:
    """Estimativa conservadora (~4 caracteres por token)."""
    if not text:
        return 0
    return max(1, len(str(text)) // 4)


def _turn_content(turn: Any) -> str:
    content = turn.get("content") if isinstance(turn, dict) else getattr(turn, "content", "")
    if isinstance(content, list):
        return " ".join(str(part.get("text", "")) for part in content if isinstance(part, dict))
    return str(content or "")


def _turn_role(turn: Any) -> str:
    return str(turn.get("role") if isinstance(turn, dict) else getattr(turn, "role", ""))


def _turn_tool_calls(turn: Any) -> Any:
    return turn.get("tool_calls") if isinstance(turn, dict) else getattr(turn, "tool_calls", None)


def estimate_turn_tokens(turn: Any) -> int:
    """Tokens aproximados de um turno, incluindo tool calls serializadas."""
    total = estimate_tokens(_turn_content(turn)) + 8
    tool_calls = _turn_tool_calls(turn)
    if tool_calls:
        try:
            total += estimate_tokens(json.dumps(tool_calls, default=str))
        except (TypeError, ValueError):
            total += estimate_tokens(str(tool_calls))
    return total


def context_budget(
    num_ctx: int,
    output_reserve: int = DEFAULT_OUTPUT_RESERVE,
) -> int:
    """Tokens disponíveis para o histórico, descontando a resposta e o template."""
    return max(1024, num_ctx - max(0, output_reserve) - TEMPLATE_OVERHEAD_TOKENS)


def tool_output_char_limit(
    num_ctx: int,
    output_reserve: int = DEFAULT_OUTPUT_RESERVE,
    share: float = 0.35,
) -> int:
    """Limite de caracteres de UMA saída de ferramenta.

    Antes era fixo em 30 000 caracteres (~7 500 tokens): um único ``read_file``
    enchia a janela de 8 192 tokens e o Ollama truncava o prompt em silêncio.
    """
    tokens = int(context_budget(num_ctx, output_reserve) * max(0.1, min(share, 0.6)))
    return max(4_000, min(tokens * 4, 24_000))


def trim_turns(
    turns: list[Any],
    num_ctx: int,
    output_reserve: int = DEFAULT_OUTPUT_RESERVE,
    min_keep: int = MIN_KEPT_TURNS,
) -> tuple[list[Any], int]:
    """Corta o histórico antigo para caber na janela, preservando system + cauda.

    Devolve ``(turns_efetivos, quantidade_removida)``. Remove sempre do início
    do histórico (nunca do meio), para não separar uma chamada de ferramenta do
    seu resultado. Um turno ``tool`` órfão no início é descartado.
    """
    if not turns:
        return turns, 0

    budget = context_budget(num_ctx, output_reserve)

    system: list[Any] = []
    rest = list(turns)
    if _turn_role(rest[0]) == "system":
        system = [rest[0]]
        rest = rest[1:]
        budget -= estimate_turn_tokens(system[0])

    kept: list[Any] = []
    used = 0
    for turn in reversed(rest):
        cost = estimate_turn_tokens(turn)
        if kept and used + cost > budget and len(kept) >= min_keep:
            break
        kept.append(turn)
        used += cost
    kept.reverse()

    # Não iniciar o histórico com um resultado de ferramenta sem a chamada.
    while kept and _turn_role(kept[0]) == "tool":
        kept.pop(0)

    removed = len(rest) - len(kept)
    return system + kept, removed
