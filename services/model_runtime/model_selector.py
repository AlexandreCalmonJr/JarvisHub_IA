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
    estimated_cost_usd: float = 0.0


@dataclass(frozen=True)
class ModelSelection:
    candidate: ModelCandidate
    score: float
    reason: str
    sample_sufficient: bool
    success_rate: float | None
    estimated_cost_usd: float = 0.0


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

    @staticmethod
    def _normalize_capability(task_capability: str | None, agent_role: str | None) -> str:
        if task_capability:
            return task_capability.strip().lower()
        role = (agent_role or "").lower()
        if any(term in role for term in ("developer", "coder", "devops", "programmer", "software_engineer")):
            return "code"
        if any(term in role for term in ("auditor", "architect", "security", "threat", "analyst", "qa", "quality")):
            return "reasoning"
        if any(term in role for term in ("vision", "image", "multimodal")):
            return "vision"
        return "general"

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
        pricing_by_provider: dict[str, tuple[float, float]] | None = None,
        prompt_text: str = "",
        system_prompt: str | None = None,
        max_tokens: int | None = 2048,
    ) -> ModelSelection:
        capability = self._normalize_capability(task_capability, agent_role)
        performance: dict[tuple[str, str, str | None], dict[str, Any]] = {}
        quality: dict[tuple[str, str, str | None], dict[str, Any]] = {}
        if telemetry_store and owner_user_id:
            try:
                for row in telemetry_store.performance_by_model_for_owner(owner_user_id):
                    performance[(row["model_name"], row["provider"], row.get("agent_role"))] = row
                quality_reader = getattr(telemetry_store, "quality_by_model_for_owner", None)
                if callable(quality_reader):
                    for row in quality_reader(owner_user_id):
                        quality[(row["model_name"], row["provider"], row.get("agent_role"))] = row
            except Exception:
                # A indisponibilidade da telemetria não deve impedir inferência.
                performance = {}
                quality = {}

        candidates: list[tuple[ModelCandidate, dict[str, Any] | None, int, str]] = []
        pricing = pricing_by_provider or {}
        estimated_input_tokens = max(1, (len(prompt_text) + len(system_prompt or "")) // 4)
        estimated_output_tokens = max(1, int(max_tokens or 2048))
        for metadata in models:
            is_cloud = metadata.parameter_size == "Cloud API"
            provider = f"online_gateway ({metadata.family})" if is_cloud else "ollama_local"
            if is_cloud and not allow_external:
                continue
            if is_cloud and contains_sensitive_data and not has_external_data_approval:
                continue
            input_rate, output_rate = pricing.get(metadata.family, (0.0, 0.0)) if is_cloud else (0.0, 0.0)
            estimated_cost = (
                (estimated_input_tokens / 1000.0) * max(0.0, float(input_rate))
                + (estimated_output_tokens / 1000.0) * max(0.0, float(output_rate))
            )
            stats = performance.get((metadata.name, provider, agent_role))
            if stats is None:
                stats = performance.get((metadata.name, provider, None))
            if estimated_cost <= 0 and stats and int(stats.get("total_inferences", 0)) > 0:
                estimated_cost = float(stats.get("average_cost_usd") or 0.0)
            candidate = ModelCandidate(
                model_name=metadata.name,
                provider=provider,
                local=not is_cloud,
                family=metadata.family,
                context_length=metadata.context_length,
                estimated_cost_usd=round(max(0.0, estimated_cost), 6),
            )
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
        max_estimated_cost = max((item[0].estimated_cost_usd for item in pool), default=0.0)
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
            feedback = quality.get((candidate.model_name, candidate.provider, agent_role))
            if feedback is None:
                feedback = quality.get((candidate.model_name, candidate.provider, None))
            if feedback and feedback.get("sample_sufficient"):
                average_rating = min(5.0, max(1.0, float(feedback.get("average_rating", 3.0))))
                quality_bonus = (average_rating - 3.0) * 5.0
                score += quality_bonus
                reasons.append(
                    f"avaliação humana média {average_rating:.2f}/5 "
                    f"({feedback.get('feedback_count', 0)} avaliações; ajuste {quality_bonus:+.1f})"
                )
            elif feedback:
                reasons.append(
                    f"avaliação humana ainda insuficiente ({feedback.get('feedback_count', 0)} amostras)"
                )
            else:
                reasons.append("sem avaliações humanas suficientes")
            if candidate.local:
                score += 10
                reasons.append("preferência local-first")
            if candidate.context_length >= 32000:
                score += 2
                reasons.append("janela de contexto ampla")
            if candidate.estimated_cost_usd > 0 and max_estimated_cost > 0:
                cost_penalty = 15 * (candidate.estimated_cost_usd / max_estimated_cost)
                score -= cost_penalty
                reasons.append(f"custo estimado ${candidate.estimated_cost_usd:.6f} (penalidade {cost_penalty:.1f})")
            else:
                reasons.append("sem custo externo estimado")
            selection = ModelSelection(
                candidate=candidate,
                score=round(score, 2),
                reason="; ".join(reasons),
                sample_sufficient=sample_sufficient,
                success_rate=success_rate,
                estimated_cost_usd=candidate.estimated_cost_usd,
            )
            ranked.append((score, selection))

        ranked.sort(key=lambda item: (item[0], item[1].candidate.local), reverse=True)
        return ranked[0][1]
