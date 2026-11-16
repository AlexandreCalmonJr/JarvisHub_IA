"""Validação única de output dos especialistas.

O contrato padronizado continua a ser a fonte de verdade do schema. Este
módulo acrescenta duas proteções antes da entrega ao utilizador:

1. Limites de comprimento para o resumo, objetivo, recomendação e listas.
2. Uma única tentativa de reparação determinística para textos vazios,
   demasiado longos ou blocos JSON inválidos.

A reparação não inventa conteúdo: normaliza, trunca em fronteira de frase e
reaproveita o motor de auto-correção sintática já existente. Se o schema
continuar inválido, o erro é explícito e o chamador decide como degradar.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from packages.contracts.agent import (
    MAX_AGENT_LIST_ITEM_CHARS,
    MAX_AGENT_LIST_ITEMS,
    MAX_AGENT_OBJECTIVE_CHARS,
    MAX_AGENT_RECOMMENDATION_CHARS,
    MAX_AGENT_SUMMARY_CHARS,
    AgentOutputContract,
)
from services.orchestration.self_correction import SelfCorrectionEngine

_TEXT_LIMITS = {
    "objective": MAX_AGENT_OBJECTIVE_CHARS,
    "summary": MAX_AGENT_SUMMARY_CHARS,
    "next_recommendation": MAX_AGENT_RECOMMENDATION_CHARS,
}
_LIST_FIELDS = (
    "evidence",
    "actions_taken",
    "affected_files",
    "tests_executed",
    "risks",
    "blockers",
)
_FALLBACKS = {
    "objective": "Objetivo não especificado pelo especialista.",
    "summary": "Sem resumo produzido pelo especialista.",
    "next_recommendation": "Revisar a resposta e repetir a execução.",
}
_JSON_BLOCK_RE = re.compile(r"```json\s*(.*?)```", re.IGNORECASE | re.DOTALL)
_FENCED_BLOCK_RE = re.compile(r"^```([A-Za-z0-9_-]*)\s*(.*?)\s*```$", re.DOTALL)
_WORD_RE = re.compile(r"\w+", re.UNICODE)


def count_words(text: str) -> int:
    """Conta palavras da mesma forma que a avaliação de qualidade."""
    return len(_WORD_RE.findall(text or ""))


def _looks_structured_or_code(text: str) -> bool:
    """JSON e blocos de código não estão sujeitos ao limite narrativo."""
    stripped = text.lstrip()
    if stripped.startswith(("{", "[")):
        return True
    return "```" in text


def _compact_words(text: str, limit: int) -> str:
    """Corta em fronteira de palavra/frase para garantir o limite narrativo.

    Só é usado como último recurso depois de uma reparação pelo modelo que
    continue acima do limite. Preserva o máximo de conteúdo possível.
    """
    matches = list(_WORD_RE.finditer(text))
    if len(matches) <= limit:
        return text
    cutoff = matches[limit - 1].end()
    window = text[:cutoff]
    boundary = max(window.rfind(". "), window.rfind("! "), window.rfind("? "), window.rfind("\n"))
    if boundary >= int(cutoff * 0.6):
        window = window[: boundary + 1]
    return window.rstrip(" \t,;:-") + " …"


class OutputContractError(ValueError):
    """O output continua inválido mesmo depois da tentativa única de reparação."""


@dataclass(frozen=True)
class RepairedContract:
    contract: AgentOutputContract
    issues: list[str]

    @property
    def repaired(self) -> bool:
        return bool(self.issues)


def _truncate(text: str, limit: int) -> str:
    """Trunca preferindo o fim de uma frase e, na falta dele, uma palavra."""
    if len(text) <= limit:
        return text
    suffix = " …"
    window = text[: limit - len(suffix)]
    for separator in (". ", "! ", "? ", "\n", " "):
        index = window.rfind(separator)
        if index >= int(limit * 0.6):
            return window[: index + len(separator)].rstrip() + suffix
    return window.rstrip() + suffix


def _repair_text(value: Any, field: str, issues: list[str]) -> str:
    limit = _TEXT_LIMITS[field]
    if not isinstance(value, str):
        issues.append(f"{field}: tipo inválido; substituído por texto de fallback.")
        return _FALLBACKS[field]
    cleaned = value.replace("\x00", "").strip()
    if not cleaned:
        issues.append(f"{field}: vazio; substituído por texto de fallback.")
        return _FALLBACKS[field]
    if len(cleaned) > limit:
        cleaned = _truncate(cleaned, limit)
        issues.append(f"{field}: truncado para {limit} caracteres.")
    elif cleaned != value:
        issues.append(f"{field}: espaços ou NUL normalizados.")
    return cleaned


def _repair_list(value: Any, field: str, issues: list[str]) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        issues.append(f"{field}: tipo inválido; substituído por lista vazia.")
        return []

    repaired: list[str] = []
    for item in value:
        if not isinstance(item, str):
            issues.append(f"{field}: item não textual removido.")
            continue
        cleaned = item.replace("\x00", "").strip()
        if not cleaned:
            issues.append(f"{field}: item vazio removido.")
            continue
        if len(cleaned) > MAX_AGENT_LIST_ITEM_CHARS:
            cleaned = _truncate(cleaned, MAX_AGENT_LIST_ITEM_CHARS)
            issues.append(f"{field}: item truncado para {MAX_AGENT_LIST_ITEM_CHARS} caracteres.")
        if cleaned:
            repaired.append(cleaned)

    if len(repaired) > MAX_AGENT_LIST_ITEMS:
        repaired = repaired[:MAX_AGENT_LIST_ITEMS]
        issues.append(f"{field}: limitado a {MAX_AGENT_LIST_ITEMS} itens.")
    return repaired


def _strip_json_fence(text: str, issues: list[str]) -> str:
    """Remove a cerca markdown quando todo o resumo é um bloco JSON.

    Só atua quando não há texto fora da cerca. Um bloco marcado como ``json``
    é sempre desembrulhado; uma cerca sem linguagem só é removida se o
    conteúdo for JSON válido. Outras linguagens ficam intactas.
    """
    match = _FENCED_BLOCK_RE.match(text.strip())
    if not match:
        return text
    language = (match.group(1) or "").strip().lower()
    body = match.group(2).strip()
    if language not in ("", "json"):
        return text
    if language == "":
        try:
            json.loads(body)
        except (TypeError, ValueError):
            return text
    issues.append("summary: cerca markdown removida de um bloco JSON.")
    return body


def _heal_json_in_summary(text: str, issues: list[str]) -> str:
    """Repara uma vez o primeiro bloco JSON encontrado no resumo."""
    block = _JSON_BLOCK_RE.search(text)
    if block:
        candidate = block.group(1).strip()
        healed, modified, message = SelfCorrectionEngine.heal_json_code(candidate)
        if modified:
            text = text[: block.start(1)] + healed + text[block.end(1) :]
            issues.append(f"summary: JSON reparado numa tentativa ({message}).")
        elif message:
            issues.append(f"summary: JSON inválido após uma tentativa de reparação ({message}).")
        try:
            json.loads(healed)
        except (TypeError, ValueError):
            if not any("JSON inválido" in issue for issue in issues):
                issues.append("summary: JSON inválido após uma tentativa de reparação.")
        return text

    stripped = text.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        healed, modified, message = SelfCorrectionEngine.heal_json_code(stripped)
        if modified:
            text = healed
            issues.append(f"summary: JSON reparado numa tentativa ({message}).")
        elif message:
            issues.append(f"summary: JSON inválido após uma tentativa de reparação ({message}).")
        try:
            json.loads(healed)
        except (TypeError, ValueError):
            if not any("JSON inválido" in issue for issue in issues):
                issues.append("summary: JSON inválido após uma tentativa de reparação.")
    return text


def validate_summary_text(
    text: str,
    *,
    finish_reason: str = "stop",
    max_words: int | None = None,
    enforce_max_words: bool = False,
) -> tuple[str, list[str]]:
    """Valida comprimento e JSON do resumo, com uma reparação determinística.

    Devolve ``(texto_reparado, problemas)``. ``problemas`` vazio significa que
    nenhuma alteração foi necessária. ``max_words`` ativa o contrato narrativo;
    ``enforce_max_words`` aplica a compactação determinística como último
    recurso, depois da reparação pelo modelo.
    """
    issues: list[str] = []
    cleaned = (text or "").replace("\x00", "").strip()
    if not cleaned:
        cleaned = _FALLBACKS["summary"]
        issues.append("summary: vazio; substituído por texto de fallback.")
    elif len(cleaned) > MAX_AGENT_SUMMARY_CHARS:
        cleaned = _truncate(cleaned, MAX_AGENT_SUMMARY_CHARS)
        issues.append(f"summary: truncado para {MAX_AGENT_SUMMARY_CHARS} caracteres.")
    elif cleaned != text:
        issues.append("summary: espaços ou NUL normalizados.")

    if finish_reason == "length":
        issues.append("summary: resposta atingiu o limite de tokens e pode estar truncada.")

    cleaned = _strip_json_fence(cleaned, issues)
    cleaned = _heal_json_in_summary(cleaned, issues)

    if max_words is not None and cleaned and not _looks_structured_or_code(cleaned):
        words = count_words(cleaned)
        if words > max_words:
            if enforce_max_words:
                cleaned = _compact_words(cleaned, max_words)
                issues.append(
                    f"summary: compactado de {words} para {count_words(cleaned)} palavras "
                    f"(limite {max_words})."
                )
            else:
                issues.append(
                    f"summary: excede {max_words} palavras ({words}); requer compactação."
                )
    return cleaned, issues


def validate_and_repair_contract(payload: dict[str, Any]) -> RepairedContract:
    """Valida schema e comprimento do contrato e aplica uma única reparação.

    Levanta :class:`OutputContractError` apenas quando o schema continua
    inválido depois da reparação (por exemplo, um ``agent_role`` desconhecido).
    """
    issues: list[str] = []
    candidate = dict(payload)

    if isinstance(candidate.get("summary"), str):
        candidate["summary"] = _strip_json_fence(candidate["summary"], issues)

    for field in _TEXT_LIMITS:
        candidate[field] = _repair_text(candidate.get(field), field, issues)

    for field in _LIST_FIELDS:
        candidate[field] = _repair_list(candidate.get(field), field, issues)

    if issues:
        detail = "; ".join(issues[:5])
        if len(issues) > 5:
            detail += f"; +{len(issues) - 5} correção(ões)"
        note = _truncate(
            f"Validação de output aplicou uma reparação única: {detail}",
            MAX_AGENT_LIST_ITEM_CHARS,
        )
        evidence = list(candidate.get("evidence") or [])
        if len(evidence) >= MAX_AGENT_LIST_ITEMS:
            evidence = evidence[: MAX_AGENT_LIST_ITEMS - 1]
        candidate["evidence"] = [*evidence, note]

    try:
        contract = AgentOutputContract.model_validate(candidate)
    except ValidationError as exc:
        raise OutputContractError(f"Contrato de saída inválido após reparação: {exc}") from exc

    return RepairedContract(contract=contract, issues=issues)
