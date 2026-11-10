"""Rastreador de telemetria e métricas de inferência dos modelos LLM (tempo de resposta, t/s e economia)."""

from collections import deque
from datetime import datetime
from typing import Any


class InferenceTracker:
    """Coleta e agrega métricas de cada chamada a LLMs no JARVIS AI Hub."""

    def __init__(self, max_history: int = 500):
        self.history: deque[dict[str, Any]] = deque(maxlen=max_history)

    def record_inference(
        self,
        model_name: str,
        agent_role: str,
        elapsed_seconds: float,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        status: str = "success",
        error_message: str | None = None,
        provider: str = "ollama_local",
    ) -> dict[str, Any]:
        """Registra uma inferência executada."""
        tokens_per_second = 0.0
        if elapsed_seconds > 0 and completion_tokens > 0:
            tokens_per_second = round(completion_tokens / elapsed_seconds, 2)
        elif elapsed_seconds > 0 and prompt_tokens > 0:
            # Estimativa caso completion não seja retornado individualmente
            tokens_per_second = round((prompt_tokens + completion_tokens) / elapsed_seconds, 2)

        # Estimativa de economia equivalente ao GPT-4 / Claude (~$15 por 1M tokens)
        total_tokens = prompt_tokens + completion_tokens
        saved_usd = round(total_tokens * 0.000015, 4)

        entry = {
            "id": len(self.history) + 1,
            "timestamp": datetime.now().isoformat(),
            "model_name": model_name,
            "agent_role": agent_role,
            "provider": provider,
            "elapsed_seconds": round(elapsed_seconds, 2),
            "latency_ms": int(elapsed_seconds * 1000),
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "tokens_per_second": tokens_per_second,
            "status": status,
            "error_message": error_message,
            "estimated_savings_usd": saved_usd,
        }
        self.history.appendleft(entry)
        return entry

    def get_metrics_summary(self) -> dict[str, Any]:
        """Calcula estatísticas agregadas de performance dos modelos."""
        if not self.history:
            return {
                "total_inferences": 0,
                "total_tokens": 0,
                "total_savings_usd": 0.0,
                "average_latency_seconds": 0.0,
                "average_tokens_per_second": 0.0,
                "fastest_model": "Nenhum ainda",
                "success_rate_percent": 100.0,
                "recent_inferences": [],
            }

        total = len(self.history)
        successful = [e for e in self.history if e["status"] == "success"]
        success_count = len(successful)

        avg_lat = (
            round(sum(e["elapsed_seconds"] for e in successful) / success_count, 2)
            if success_count > 0
            else 0.0
        )
        avg_tps = (
            round(sum(e["tokens_per_second"] for e in successful) / success_count, 2)
            if success_count > 0
            else 0.0
        )
        tot_tok = sum(e["total_tokens"] for e in self.history)
        tot_sav = round(sum(e["estimated_savings_usd"] for e in self.history), 4)

        # Identifica o modelo mais rápido com pelo menos 1 inferência de sucesso
        model_speeds: dict[str, list[float]] = {}
        for e in successful:
            if e["tokens_per_second"] > 0:
                model_speeds.setdefault(e["model_name"], []).append(e["tokens_per_second"])

        fastest_model = "llama3.2:3b"
        if model_speeds:
            fastest_model = max(
                model_speeds.keys(),
                key=lambda m: sum(model_speeds[m]) / len(model_speeds[m]),
            )

        return {
            "total_inferences": total,
            "total_tokens": tot_tok,
            "total_savings_usd": tot_sav,
            "average_latency_seconds": avg_lat,
            "average_tokens_per_second": avg_tps,
            "fastest_model": fastest_model,
            "success_rate_percent": round((success_count / total) * 100, 1),
            "recent_inferences": list(self.history)[:15],
        }


# Instância singleton global
inference_tracker = InferenceTracker(max_history=500)
