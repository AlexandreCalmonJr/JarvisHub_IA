import json
import logging
import os
import time
from abc import ABC, abstractmethod
from typing import Any

import httpx

from .provider_defaults import default_model_for_provider
from .types import InferenceRequest, InferenceResponse, ModelMetadata

logger = logging.getLogger("jarvis.model_runtime.adapter")


def _to_anthropic_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Converte schemas de ferramentas (OpenAI ou Anthropic) para a Messages API."""
    converted: list[dict[str, Any]] = []
    for tool in tools or []:
        if "input_schema" in tool:
            converted.append(tool)
            continue
        if tool.get("type") == "function":
            fn = tool.get("function") or {}
            name = fn.get("name")
            if not name:
                continue
            converted.append(
                {
                    "name": name,
                    "description": fn.get("description", ""),
                    "input_schema": fn.get("parameters") or {"type": "object", "properties": {}},
                }
            )
    return converted


try:
    from services.observability import inference_tracker
except ImportError:
    inference_tracker = None


class BaseModelAdapter(ABC):
    """Interface abstrata para desacoplar a aplicação do fornecedor de modelos."""

    @abstractmethod
    async def resolve_model_name(self, requested: str) -> str:
        """Resolve dinamicamente o modelo local real instalado no Ollama.
        Garante portabilidade universal em qualquer máquina: se o usuário
        baixar outros modelos (ex: mistral, gemma2, phi3, deepseek), o sistema
        mapeia inteligentemente em vez de quebrar por referências hardcoded."""
        installed = await self._get_installed_model_names()
        if not installed:
            return requested

        clean_req = requested.strip()
        # 1. Correspondência exata ou com :latest
        if clean_req in installed:
            return clean_req
        if f"{clean_req}:latest" in installed:
            return f"{clean_req}:latest"
        for inst in installed:
            if inst.startswith(f"{clean_req}:") or clean_req.startswith(f"{inst.split(':')[0]}:"):
                return inst

        # 2. Classificação heurística por capacidades de código
        req_lower = clean_req.lower()
        if any(k in req_lower for k in ("coder", "code", "starcoder")):
            for inst in installed:
                if any(k in inst.lower() for k in ("coder", "code", "starcoder", "deepseek")):
                    return inst

        # 3. Classificação heurística por raciocínio / QA
        if any(k in req_lower for k in ("reason", "r1", "think", "qwen")):
            for inst in installed:
                if any(k in inst.lower() for k in ("r1", "reason", "qwen", "mistral")):
                    return inst

        # 4. Modelos gerais / leves
        for inst in installed:
            if any(k in inst.lower() for k in ("llama", "gemma", "phi", "mistral")):
                return inst

        # 5. Fallback soberano para o primeiro modelo disponível
        return installed[0]

    async def _get_installed_model_names(self) -> list[str]:
        now = time.time()
        if hasattr(self, "_cached_models") and hasattr(self, "_cache_ts"):
            if now - self._cache_ts < 20.0 and self._cached_models:
                return self._cached_models
        try:
            models = await self.list_models()
            names = [m.name for m in models if m.name]
            self._cached_models = names
            self._cache_ts = now
            return names
        except Exception:
            return getattr(self, "_cached_models", [])

    async def generate(self, request: InferenceRequest) -> InferenceResponse:
        pass

    @abstractmethod
    async def generate_stream(self, request: InferenceRequest):
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
        self.cpu_threads: int | None = None
        self.keep_alive = os.getenv("JARVIS_OLLAMA_KEEP_ALIVE", "15m").strip() or "15m"
        try:
            configured_ctx = int(os.getenv("JARVIS_OLLAMA_NUM_CTX", "0"))
        except ValueError:
            configured_ctx = 0
        self.context_window = configured_ctx if 2048 <= configured_ctx <= 8192 else None

    def set_cpu_threads(self, threads: int | None) -> None:
        """Define o limite máximo de threads de CPU para inferência local no Ollama."""
        self.cpu_threads = threads

    async def get_loaded_models(self) -> list[str]:
        """Retorna os nomes dos modelos atualmente residentes na memória do Ollama."""
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                res = await client.get(f"{self.base_url}/api/ps")
                if res.status_code == 200:
                    data = res.json()
                    return [m.get("name", "") for m in data.get("models", []) if m.get("name")]
        except Exception:
            logger.debug("Falha ao listar modelos carregados no Ollama.", exc_info=True)
        return []

    async def evict_model(self, model_name: str) -> bool:
        """Descarrega imediatamente um modelo da memória RAM/VRAM via keep_alive: 0."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.post(
                    f"{self.base_url}/api/generate",
                    json={"model": model_name, "keep_alive": 0},
                )
                return res.status_code == 200
        except Exception:
            return False

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

    async def resolve_model_name(self, requested: str) -> str:
        """Resolve dinamicamente o modelo local real instalado no Ollama.
        Garante portabilidade universal em qualquer máquina: se o usuário
        baixar outros modelos (ex: mistral, gemma2, phi3, deepseek), o sistema
        mapeia inteligentemente em vez de quebrar por referências hardcoded."""
        installed = await self._get_installed_model_names()
        if not installed:
            return requested

        clean_req = requested.strip()
        # 1. Correspondência exata ou com :latest
        if clean_req in installed:
            return clean_req
        if f"{clean_req}:latest" in installed:
            return f"{clean_req}:latest"
        for inst in installed:
            if inst.startswith(f"{clean_req}:") or clean_req.startswith(f"{inst.split(':')[0]}:"):
                return inst

        # 2. Classificação heurística por capacidades de código
        req_lower = clean_req.lower()
        if any(k in req_lower for k in ("coder", "code", "starcoder")):
            for inst in installed:
                if any(k in inst.lower() for k in ("coder", "code", "starcoder", "deepseek")):
                    return inst

        # 3. Classificação heurística por raciocínio / QA
        if any(k in req_lower for k in ("reason", "r1", "think", "qwen")):
            for inst in installed:
                if any(k in inst.lower() for k in ("r1", "reason", "qwen", "mistral")):
                    return inst

        # 4. Modelos gerais / leves
        for inst in installed:
            if any(k in inst.lower() for k in ("llama", "gemma", "phi", "mistral")):
                return inst

        # 5. Fallback soberano para o primeiro modelo disponível
        return installed[0]

    async def _get_installed_model_names(self) -> list[str]:
        now = time.time()
        if hasattr(self, "_cached_models") and hasattr(self, "_cache_ts"):
            if now - self._cache_ts < 20.0 and self._cached_models:
                return self._cached_models
        try:
            models = await self.list_models()
            names = [m.name for m in models if m.name]
            self._cached_models = names
            self._cache_ts = now
            return names
        except Exception:
            return getattr(self, "_cached_models", [])

    async def generate(self, request: InferenceRequest) -> InferenceResponse:
        resolved_model = await self.resolve_model_name(request.model_name)
        payload: dict[str, Any] = {
            "model": resolved_model,
            "prompt": request.prompt,
            "stream": False,
            "keep_alive": self.keep_alive,
            "options": {
                "temperature": request.temperature,
            },
        }
        if request.system_prompt:
            payload["system"] = request.system_prompt
        if request.format_json:
            payload["format"] = "json"

        payload["options"]["num_predict"] = request.max_tokens if request.max_tokens else 1024
        payload["options"]["num_ctx"] = self.context_window or (
            2048 if (not request.max_tokens or request.max_tokens <= 1500) else 4096
        )
        if self.cpu_threads and self.cpu_threads > 0:
            payload["options"]["num_thread"] = self.cpu_threads

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

        if inference_tracker:
            inference_tracker.record_inference(
                model_name=request.model_name,
                agent_role="Especialista Local",
                elapsed_seconds=duration_ms / 1000.0,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                status="success",
                provider="ollama_local",
            )

        return InferenceResponse(
            content=content,
            model_name=request.model_name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            duration_ms=round(duration_ms, 2),
            tokens_per_second=round(tokens_per_second, 2),
        )

    async def generate_stream(self, request: InferenceRequest):
        resolved_model = await self.resolve_model_name(request.model_name)
        payload: dict[str, Any] = {
            "model": resolved_model,
            "prompt": request.prompt,
            "stream": True,
            "keep_alive": self.keep_alive,
            "options": {"temperature": request.temperature},
        }
        if request.system_prompt:
            payload["system"] = request.system_prompt

        payload["options"]["num_predict"] = request.max_tokens if request.max_tokens else 1024
        payload["options"]["num_ctx"] = self.context_window or (
            2048 if (not request.max_tokens or request.max_tokens <= 1500) else 4096
        )
        if self.cpu_threads and self.cpu_threads > 0:
            payload["options"]["num_thread"] = self.cpu_threads

        start_time = time.perf_counter()
        async with (
            httpx.AsyncClient(timeout=request.timeout_seconds) as client,
            client.stream("POST", f"{self.base_url}/api/generate", json=payload) as response,
        ):
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                    text = chunk.get("response", "")
                    if text:
                        yield text
                    if chunk.get("done") and inference_tracker:
                        elapsed = time.perf_counter() - start_time
                        inference_tracker.record_inference(
                            model_name=request.model_name,
                            agent_role="Maestro Stream",
                            elapsed_seconds=elapsed,
                            prompt_tokens=chunk.get("prompt_eval_count", 0),
                            completion_tokens=chunk.get("eval_count", 0),
                            status="success",
                            provider="ollama_local",
                        )
                except Exception:
                    logger.debug("Falha ao registar métricas de inferência.", exc_info=True)


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

    async def resolve_model_name(self, requested: str) -> str:
        """Resolve dinamicamente o modelo local real instalado no Ollama.
        Garante portabilidade universal em qualquer máquina: se o usuário
        baixar outros modelos (ex: mistral, gemma2, phi3, deepseek), o sistema
        mapeia inteligentemente em vez de quebrar por referências hardcoded."""
        installed = await self._get_installed_model_names()
        if not installed:
            return requested

        clean_req = requested.strip()
        # 1. Correspondência exata ou com :latest
        if clean_req in installed:
            return clean_req
        if f"{clean_req}:latest" in installed:
            return f"{clean_req}:latest"
        for inst in installed:
            if inst.startswith(f"{clean_req}:") or clean_req.startswith(f"{inst.split(':')[0]}:"):
                return inst

        # 2. Classificação heurística por capacidades de código
        req_lower = clean_req.lower()
        if any(k in req_lower for k in ("coder", "code", "starcoder")):
            for inst in installed:
                if any(k in inst.lower() for k in ("coder", "code", "starcoder", "deepseek")):
                    return inst

        # 3. Classificação heurística por raciocínio / QA
        if any(k in req_lower for k in ("reason", "r1", "think", "qwen")):
            for inst in installed:
                if any(k in inst.lower() for k in ("r1", "reason", "qwen", "mistral")):
                    return inst

        # 4. Modelos gerais / leves
        for inst in installed:
            if any(k in inst.lower() for k in ("llama", "gemma", "phi", "mistral")):
                return inst

        # 5. Fallback soberano para o primeiro modelo disponível
        return installed[0]

    async def _get_installed_model_names(self) -> list[str]:
        now = time.time()
        if hasattr(self, "_cached_models") and hasattr(self, "_cache_ts"):
            if now - self._cache_ts < 20.0 and self._cached_models:
                return self._cached_models
        try:
            models = await self.list_models()
            names = [m.name for m in models if m.name]
            self._cached_models = names
            self._cache_ts = now
            return names
        except Exception:
            return getattr(self, "_cached_models", [])

    async def generate(self, request: InferenceRequest) -> InferenceResponse:
        return InferenceResponse(
            content=self.default_response,
            model_name=request.model_name,
            prompt_tokens=10,
            completion_tokens=20,
            duration_ms=15.0,
            tokens_per_second=133.3,
        )

    async def generate_stream(self, request: InferenceRequest):
        words = self.default_response.split(" ")
        for i, word in enumerate(words):
            yield word + (" " if i < len(words) - 1 else "")


class UniversalOnlineAdapter(BaseModelAdapter):
    """Adaptador universal para provedores de IA na nuvem (OpenAI, Gemini, Groq, DeepSeek, Anthropic, Custom)."""

    def __init__(
        self,
        api_key: str,
        provider_name: str = "openai",
        base_url: str | None = None,
        default_model: str | None = None,
        timeout_seconds: float = 30.0,
    ):
        self.api_key = api_key.strip() if api_key else ""
        self.provider_name = (provider_name or "openai").lower()
        self.base_url = (base_url or self._default_base_url(self.provider_name)).rstrip("/")
        self.default_model = default_model or self._default_model_for_provider(self.provider_name)
        self.timeout_seconds = timeout_seconds
        # Última utilização reportada pelo provedor durante streaming (quando disponível).
        # O roteador híbrido usa esse dado para contabilizar custos sem inventar valores.
        self.last_stream_usage: dict[str, int] | None = None

    @staticmethod
    def _default_base_url(provider: str) -> str:
        presets = {
            "openai": "https://api.openai.com/v1",
            "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
            "groq": "https://api.groq.com/openai/v1",
            "deepseek": "https://api.deepseek.com",
            "anthropic": "https://api.anthropic.com/v1",
            "openrouter": "https://openrouter.ai/api/v1",
        }
        return presets.get(provider, "https://api.openai.com/v1")

    @staticmethod
    def _default_model_for_provider(provider: str) -> str:
        return default_model_for_provider(provider)

    async def health_check(self) -> bool:
        try:
            res = await self.test_connection()
            return res.get("success", False)
        except Exception:
            return False

    async def list_models(self) -> list[ModelMetadata]:
        return [
            ModelMetadata(
                name=self.default_model,
                size_bytes=0,
                parameter_size="Cloud API",
                quantization="FP16",
                family=self.provider_name,
                context_length=128000,
            )
        ]

    async def test_connection(self) -> dict[str, Any]:
        """Testa conectividade e validação da chave API com uma chamada ultraleve."""
        if not self.api_key:
            return {
                "success": False,
                "provider": self.provider_name,
                "error": "Chave de API não informada.",
            }

        test_req = InferenceRequest(
            prompt="ping",
            model_name=self.default_model,
            max_tokens=5,
            temperature=0.0,
            timeout_seconds=15.0,
        )
        try:
            res = await self.generate(test_req)
            return {
                "success": True,
                "provider": self.provider_name,
                "model": self.default_model,
                "latency_ms": res.duration_ms,
                "message": f"Conexão com {self.provider_name.upper()} ({self.default_model}) validada com sucesso!",
            }
        except httpx.HTTPStatusError as hse:
            status = hse.response.status_code
            err_msg = f"Erro HTTP {status}: "
            if status == 401:
                err_msg += "Chave de API inválida ou expirada."
            elif status == 429:
                err_msg += "Limite de requisições ou créditos esgotados (Rate Limit/Quota)."
            else:
                try:
                    err_msg += hse.response.text[:200]
                except Exception:
                    err_msg += str(hse)
            return {"success": False, "provider": self.provider_name, "error": err_msg}
        except Exception as exc:
            return {
                "success": False,
                "provider": self.provider_name,
                "error": f"Falha de conexão: {exc}",
            }

    async def resolve_model_name(self, requested: str) -> str:
        """Resolve dinamicamente o modelo local real instalado no Ollama.
        Garante portabilidade universal em qualquer máquina: se o usuário
        baixar outros modelos (ex: mistral, gemma2, phi3, deepseek), o sistema
        mapeia inteligentemente em vez de quebrar por referências hardcoded."""
        installed = await self._get_installed_model_names()
        if not installed:
            return requested

        clean_req = requested.strip()
        # 1. Correspondência exata ou com :latest
        if clean_req in installed:
            return clean_req
        if f"{clean_req}:latest" in installed:
            return f"{clean_req}:latest"
        for inst in installed:
            if inst.startswith(f"{clean_req}:") or clean_req.startswith(f"{inst.split(':')[0]}:"):
                return inst

        # 2. Classificação heurística por capacidades de código
        req_lower = clean_req.lower()
        if any(k in req_lower for k in ("coder", "code", "starcoder")):
            for inst in installed:
                if any(k in inst.lower() for k in ("coder", "code", "starcoder", "deepseek")):
                    return inst

        # 3. Classificação heurística por raciocínio / QA
        if any(k in req_lower for k in ("reason", "r1", "think", "qwen")):
            for inst in installed:
                if any(k in inst.lower() for k in ("r1", "reason", "qwen", "mistral")):
                    return inst

        # 4. Modelos gerais / leves
        for inst in installed:
            if any(k in inst.lower() for k in ("llama", "gemma", "phi", "mistral")):
                return inst

        # 5. Fallback soberano para o primeiro modelo disponível
        return installed[0]

    async def _get_installed_model_names(self) -> list[str]:
        now = time.time()
        if hasattr(self, "_cached_models") and hasattr(self, "_cache_ts"):
            if now - self._cache_ts < 20.0 and self._cached_models:
                return self._cached_models
        try:
            models = await self.list_models()
            names = [m.name for m in models if m.name]
            self._cached_models = names
            self._cache_ts = now
            return names
        except Exception:
            return getattr(self, "_cached_models", [])

    async def generate(self, request: InferenceRequest) -> InferenceResponse:
        if not self.api_key:
            raise ValueError(
                f"Chave de API não configurada para o provedor '{self.provider_name}'."
            )

        # Inspeção e Blindagem Cibernética DLP antes da saída externa
        safe_prompt = request.prompt
        safe_system = request.system_prompt
        try:
            from services.security_core import cyber_shield

            safe_prompt, _ = cyber_shield.inspect_and_sanitize_outbound(request.prompt)
            if safe_system:
                safe_system, _ = cyber_shield.inspect_and_sanitize_outbound(safe_system)
        except ImportError:
            pass

        local_model_names = {"llama3.2:3b", "qwen2.5-coder:7b", "qwen2.5:7b", "mock-model"}
        if not request.model_name or request.model_name in local_model_names:
            target_model = self.default_model
        else:
            target_model = request.model_name

        timeout = request.timeout_seconds or self.timeout_seconds
        tool_calls: list[dict[str, Any]] = []
        finish_reason = "stop"

        # Provedor Anthropic Claude
        if self.provider_name == "anthropic" or "anthropic.com" in self.base_url:
            headers = {
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            }
            payload: dict[str, Any] = {
                "model": target_model,
                "max_tokens": request.max_tokens or 2048,
                "messages": [{"role": "user", "content": safe_prompt}],
            }
            if safe_system:
                payload["system"] = safe_system
            if request.temperature is not None:
                payload["temperature"] = request.temperature
            anthropic_tools = _to_anthropic_tools(request.tools)
            if anthropic_tools:
                payload["tools"] = anthropic_tools

            start_time = time.perf_counter()
            async with httpx.AsyncClient(timeout=timeout) as client:
                res = await client.post(f"{self.base_url}/messages", headers=headers, json=payload)
                res.raise_for_status()
                data = res.json()
            duration_ms = (time.perf_counter() - start_time) * 1000.0

            content = ""
            for block in data.get("content", []):
                if block.get("type") == "text":
                    content += block.get("text", "")
                elif block.get("type") == "tool_use":
                    tool_calls.append(
                        {
                            "id": str(block.get("id") or ""),
                            "type": "function",
                            "function": {
                                "name": str(block.get("name") or ""),
                                "arguments": json.dumps(
                                    block.get("input") or {}, ensure_ascii=False
                                ),
                            },
                        }
                    )
            usage = data.get("usage", {})
            prompt_tokens = usage.get("input_tokens", 0)
            completion_tokens = usage.get("output_tokens", 0)
            finish_reason = str(data.get("stop_reason") or ("tool_calls" if tool_calls else "stop"))

        # Provedores compatíveis com o protocolo OpenAI (OpenAI, Gemini OpenAI-compat, Groq, DeepSeek, etc.)
        else:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            messages = []
            if safe_system:
                messages.append({"role": "system", "content": safe_system})
            messages.append({"role": "user", "content": safe_prompt})

            payload = {
                "model": target_model,
                "messages": messages,
                "temperature": request.temperature,
            }
            if request.max_tokens:
                payload["max_tokens"] = request.max_tokens
            if request.format_json:
                payload["response_format"] = {"type": "json_object"}
            if request.tools:
                payload["tools"] = request.tools
                payload["tool_choice"] = request.tool_choice or "auto"

            url = f"{self.base_url}/chat/completions"
            start_time = time.perf_counter()
            async with httpx.AsyncClient(timeout=timeout) as client:
                res = await client.post(url, headers=headers, json=payload)
                res.raise_for_status()
                data = res.json()
            duration_ms = (time.perf_counter() - start_time) * 1000.0

            choices = data.get("choices", [])
            message = (choices[0].get("message") if choices else {}) or {}
            content = message.get("content") or ""
            usage = data.get("usage", {})
            prompt_tokens = usage.get("prompt_tokens", 0)
            completion_tokens = usage.get("completion_tokens", 0)
            for item in message.get("tool_calls") or []:
                fn = item.get("function") or {}
                if not fn.get("name"):
                    continue
                tool_calls.append(
                    {
                        "id": str(item.get("id") or ""),
                        "type": "function",
                        "function": {
                            "name": str(fn.get("name")),
                            "arguments": fn.get("arguments") or "{}",
                        },
                    }
                )
            finish_reason = str(
                (choices[0].get("finish_reason") if choices else None)
                or ("tool_calls" if tool_calls else "stop")
            )

        tokens_per_second = (
            round(completion_tokens / (duration_ms / 1000.0), 2) if duration_ms > 0 else 0.0
        )

        if inference_tracker:
            inference_tracker.record_inference(
                model_name=target_model,
                agent_role="Especialista Híbrido",
                elapsed_seconds=duration_ms / 1000.0,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                status="success",
                provider=self.provider_name,
            )

        return InferenceResponse(
            content=content,
            model_name=target_model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            duration_ms=round(duration_ms, 2),
            tokens_per_second=tokens_per_second,
            tool_calls=tool_calls,
            finish_reason=finish_reason,
        )

    async def generate_stream(self, request: InferenceRequest):
        if not self.api_key:
            raise ValueError(
                f"Chave de API não configurada para o provedor '{self.provider_name}'."
            )

        self.last_stream_usage = None

        local_model_names = {"llama3.2:3b", "qwen2.5-coder:7b", "qwen2.5:7b", "mock-model"}
        if not request.model_name or request.model_name in local_model_names:
            target_model = self.default_model
        else:
            target_model = request.model_name

        timeout = request.timeout_seconds or self.timeout_seconds

        # Blindagem DLP também no streaming (mesma política do generate)
        safe_prompt = request.prompt
        safe_system = request.system_prompt
        try:
            from services.security_core import cyber_shield

            safe_prompt, _ = cyber_shield.inspect_and_sanitize_outbound(request.prompt)
            if safe_system:
                safe_system, _ = cyber_shield.inspect_and_sanitize_outbound(safe_system)
        except ImportError:
            pass

        start_time = time.perf_counter()
        streamed_chars = 0

        if self.provider_name == "anthropic" or "anthropic.com" in self.base_url:
            headers = {
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            }
            payload: dict[str, Any] = {
                "model": target_model,
                "max_tokens": request.max_tokens or 2048,
                "messages": [{"role": "user", "content": safe_prompt}],
                "temperature": request.temperature,
                "stream": True,
            }
            if safe_system:
                payload["system"] = safe_system
            anthropic_tools = _to_anthropic_tools(request.tools)
            if anthropic_tools:
                payload["tools"] = anthropic_tools

            async with (
                httpx.AsyncClient(timeout=timeout) as client,
                client.stream(
                    "POST", f"{self.base_url}/messages", headers=headers, json=payload
                ) as response,
            ):
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data_str = line[5:].strip()
                    if not data_str:
                        continue
                    try:
                        event = json.loads(data_str)
                    except Exception:
                        logger.debug("Evento SSE inválido ignorado.", exc_info=True)
                        continue
                    if event.get("type") == "message_start":
                        usage = (event.get("message") or {}).get("usage") or {}
                        if usage:
                            self.last_stream_usage = {
                                "prompt_tokens": int(usage.get("input_tokens") or 0),
                                "completion_tokens": int(usage.get("output_tokens") or 0),
                            }
                        continue
                    if event.get("type") == "message_delta":
                        usage = event.get("usage") or {}
                        if usage:
                            current = self.last_stream_usage or {
                                "prompt_tokens": 0,
                                "completion_tokens": 0,
                            }
                            current["completion_tokens"] = int(
                                usage.get("output_tokens") or current["completion_tokens"]
                            )
                            self.last_stream_usage = current
                        continue
                    if event.get("type") == "content_block_delta":
                        delta = event.get("delta") or {}
                        if delta.get("type") == "text_delta":
                            text = delta.get("text", "")
                            if text:
                                streamed_chars += len(text)
                                yield text

            if inference_tracker:
                elapsed = time.perf_counter() - start_time
                inference_tracker.record_inference(
                    model_name=target_model,
                    agent_role="Maestro Anthropic Stream",
                    elapsed_seconds=elapsed,
                    prompt_tokens=len(safe_prompt) // 4,
                    completion_tokens=max(1, streamed_chars // 4),
                    status="success",
                    provider=self.provider_name,
                )
            return

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        messages = []
        if safe_system:
            messages.append({"role": "system", "content": safe_system})
        messages.append({"role": "user", "content": safe_prompt})

        payload = {
            "model": target_model,
            "messages": messages,
            "temperature": request.temperature,
            "stream": True,
        }
        if request.max_tokens:
            payload["max_tokens"] = request.max_tokens
        if request.tools:
            payload["tools"] = request.tools
            payload["tool_choice"] = request.tool_choice or "auto"

        url = f"{self.base_url}/chat/completions"
        async with (
            httpx.AsyncClient(timeout=timeout) as client,
            client.stream("POST", url, headers=headers, json=payload) as response,
        ):
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue
                data_str = line[6:].strip()
                if data_str == "[DONE]":
                    if inference_tracker:
                        elapsed = time.perf_counter() - start_time
                        approx_tokens = max(1, streamed_chars // 4)
                        inference_tracker.record_inference(
                            model_name=target_model,
                            agent_role="Maestro Híbrido Stream",
                            elapsed_seconds=elapsed,
                            prompt_tokens=len(safe_prompt) // 4,
                            completion_tokens=approx_tokens,
                            status="success",
                            provider=self.provider_name,
                        )
                    break
                try:
                    chunk = json.loads(data_str)
                    usage = chunk.get("usage")
                    if isinstance(usage, dict) and usage:
                        self.last_stream_usage = {
                            "prompt_tokens": int(usage.get("prompt_tokens") or 0),
                            "completion_tokens": int(usage.get("completion_tokens") or 0),
                        }
                    choices = chunk.get("choices", [])
                    if choices:
                        delta = choices[0].get("delta", {})
                        text = delta.get("content", "")
                        if text:
                            streamed_chars += len(text)
                            yield text
                except Exception:
                    logger.debug("Fluxo de streaming interrompido.", exc_info=True)
