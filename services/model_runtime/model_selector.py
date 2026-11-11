"""Deterministic, privacy-aware model selection using inventory and owner telemetry."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from services.model_runtime.types import ModelMetadata


@dataclass(frozen=True)
class ModelCandidate:
    model_name: str
    provider: str
    local: bool
    family: str
    context_length: int


@dataclass(frozen=True)
class ModelSelection:
    candidate: ModelCandidate
    score: float
    reason: str
    sample_sufficient: bool
    success_rate: float | None


class ModelSelector:
    """Ranks only available candidates; external egress remains governed by HybridModelRouter."""

    MINIMUM_SAMPLES = 5
    MINIMUM_SUCCESS_RATE = 0.95

    @staticmethod
    def _capability_match(candidate: ModelCandidate, capability: str) -> tuple[int, str]:
        identity = f"{candidate.model_name} {candidate.family}".lower()
        if capability in {"code", "coding", "development", "software"}:
            if any(term in identity for term in ("coder", "code", "codestral", "starcoder", "devstral")):
                return 50, "especialização em código"
            return 15, "modelo genérico para tarefa de código"
        if capability in {"reasoning", "analysis", "research", "planning"}:
            if any(term in identity for term in ("reason", "r1", "qwq", "thinking", "deepseek")):
                return 50, "especialização em raciocínio"
            return 20, "capacidade geral de análise"
        if capability in {"vision", "image"}:
            if any(term in identity for term in ("vision", "llava", "qwen-vl", "gemini")):
                return 50, "indício de capacidade visual pelo catálogo"
            return 0, "capacidade visual não comprovada"
        return 35, "modelo disponível para uso geral"

    def select(
        self,
        *,
        models: list[ModelMetadata],
        owner_user_id: str | None,
        agent_role: str | None,
        task_capability: str | None,
        telemetry_store: Any | None,
        allow_external: bool,
        contains_sensitive_data: bool,
        has_external_data_approval: bool,
    ) -> ModelSelection:
        capability = (task_capability or agent_role or "general").lower()
        performance: dict[tuple[str, str, str | None], dict[str, Any]] = {}
        if telemetry_store and owner_user_id:
            for row in telemetry_store.performance_by_model_for_owner(owner_user_id):
                performance[(row["model_name"], row["provider"], row.get("agent_role"))] = row

        candidates: list[tuple[ModelCandidate, dict[str, Any] | None, int, str]] = []
        for metadata in models:
            is_cloud = metadata.parameter_size == "Cloud API"
            provider = f"online_gateway ({metadata.family})" if is_cloud else "ollama_local"
            if is_cloud and not allow_external:
                continue
            if is_cloud and contains_sensitive_data and not has_external_data_approval:
                continue
            candidate = ModelCandidate(
                model_name=metadata.name,
                provider=provider,
                local=not is_cloud,
                family=metadata.family,
                context_length=metadata.context_length,
            )
            stats = performance.get((candidate.model_name, candidate.provider, agent_role))
            if stats is None:
                stats = performance.get((candidate.model_name, candidate.provider, None))
            capability_score, capability_reason = self._capability_match(candidate, capability)
            if capability in {"vision", "image"} and capability_score == 0:
                continue
            candidates.append((candidate, stats, capability_score, capability_reason))

        if not candidates:
            raise RuntimeError("Nenhum modelo disponível atende às políticas de seleção.")

        eligible = [
            item for item in candidates
            if item[1]
            and item[1].get("sample_sufficient")
            and float(item[1].get("success_rate", 0)) >= self.MINIMUM_SUCCESS_RATE
        ]
        pool = eligible or candidates

        ranked: list[tuple[float, ModelSelection]] = []
        for candidate, stats, capability_score, capability_reason in pool:
            score = float(capability_score)
            reasons = [capability_reason]
            sample_sufficient = bool(stats and stats.get("sample_sufficient"))
            success_rate = float(stats["success_rate"]) if stats else None
            if stats and sample_sufficient:
                score += success_rate * 25
                latency = max(0.0, float(stats.get("average_latency_ms") or 0))
                score += 15 / (1 + latency / 10000)
                reasons.append(f"histórico de sucesso {success_rate:.0%}")
                reasons.append(f"latência média {latency:.0f} ms")
            else:
                reasons.append("sem histórico suficiente; sem bônus de desempenho")
            if candidate.local:
                score += 10
                reasons.append("preferência local-first")
            if candidate.context_length >= 32000:
                score += 2
                reasons.append("janela de contexto ampla")
            selection = ModelSelection(
                candidate=candidate,
                score=round(score, 2),
                reason="; ".join(reasons),
                sample_sufficient=sample_sufficient,
                success_rate=success_rate,
            )
            ranked.append((score, selection))

        ranked.sort(key=lambda item: (item[0], item[1].candidate.local), reverse=True)
        return ranked[0][1]
