import time
from abc import ABC, abstractmethod
from typing import Any

import httpx

from .types import InferenceRequest, InferenceResponse, ModelMetadata


class BaseModelAdapter(ABC):
    """Interface abstrata para desacoplar a aplicação do fornecedor de modelos."""

    @abstractmethod
    async def generate(self, request: InferenceRequest) -> InferenceResponse:
        pass

    @abstractmethod
    async def list_models(self) -> list[ModelMetadata]:
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        pass


class OllamaAdapter(BaseModelAdapter):
    """Adaptador assíncrono para o runtime local Ollama."""

    def __init__(self, base_url: str = "http://127.0.0.1:11434"):
        self.base_url = base_url.rstrip("/")

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                return res.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> list[ModelMetadata]:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(f"{self.base_url}/api/tags")
            res.raise_for_status()
            data = res.json()

        models = []
        for m in data.get("models", []):
            details = m.get("details", {})
            models.append(
                ModelMetadata(
                    name=m.get("name", ""),
                    size_bytes=m.get("size", 0),
                    parameter_size=details.get("parameter_size", "unknown"),
                    quantization=details.get("quantization_level", "unknown"),
                    family=details.get("family", "unknown"),
                    context_length=details.get("context_length", 4096),
                )
            )
        return models

    async def generate(self, request: InferenceRequest) -> InferenceResponse:
        payload: dict[str, Any] = {
            "model": request.model_name,
            "prompt": request.prompt,
            "stream": False,
            "options": {
                "temperature": request.temperature,
            },
        }
        if request.system_prompt:
            payload["system"] = request.system_prompt
        if request.format_json:
            payload["format"] = "json"
        if request.max_tokens:
            payload["options"]["num_predict"] = request.max_tokens

        start_time = time.perf_counter()
        async with httpx.AsyncClient(timeout=request.timeout_seconds) as client:
            response = await client.post(f"{self.base_url}/api/generate", json=payload)
            response.raise_for_status()
            data = response.json()
        duration_ms = (time.perf_counter() - start_time) * 1000.0

        content = data.get("response", "")
        prompt_tokens = data.get("prompt_eval_count", 0)
        completion_tokens = data.get("eval_count", 0)
        eval_duration_ns = data.get("eval_duration", 0)

        # Cálculo preciso de tokens/segundo retornado diretamente pelo engine do Ollama ou fallback
        if eval_duration_ns > 0:
            tokens_per_second = completion_tokens / (eval_duration_ns / 1e9)
        elif duration_ms > 0 and completion_tokens > 0:
            tokens_per_second = completion_tokens / (duration_ms / 1000.0)
        else:
            tokens_per_second = 0.0

        return InferenceResponse(
            content=content,
            model_name=request.model_name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            duration_ms=round(duration_ms, 2),
            tokens_per_second=round(tokens_per_second, 2),
        )


class MockAdapter(BaseModelAdapter):
    """Adaptador simulado para testes unitários determinísticos e sem dependência de rede/LLM."""

    def __init__(self, default_response: str = '{"status": "ok", "message": "mocked response"}'):
        self.default_response = default_response

    async def health_check(self) -> bool:
        return True

    async def list_models(self) -> list[ModelMetadata]:
        return [
            ModelMetadata(
                name="mock-model",
                size_bytes=1024,
                parameter_size="1B",
                quantization="Q4",
                family="mock",
                context_length=2048,
            )
        ]

    async def generate(self, request: InferenceRequest) -> InferenceResponse:
        return InferenceResponse(
            content=self.default_response,
            model_name=request.model_name,
            prompt_tokens=10,
            completion_tokens=20,
            duration_ms=15.0,
            tokens_per_second=133.3,
        )
