import logging
import time
from typing import Any

from packages.contracts.security import AuditEventSeverity
from services.security_core import AuditTrail, KillSwitch

from .adapter import BaseModelAdapter, OllamaAdapter
from .inference_queue import InferenceQueue
from .types import InferenceRequest, InferenceResponse, ModelMetadata, ModelRoleMapping

logger = logging.getLogger(__name__)


class ModelManager:
    """
    Gestor central de modelos de IA local.
    Controla o ciclo de vida, adaptador, roteamento por perfil e enfileiramento seguro.
    """

    def __init__(
        self,
        adapter: BaseModelAdapter | None = None,
        max_concurrent_inferences: int = 1,
        kill_switch: KillSwitch | None = None,
        audit_trail: AuditTrail | None = None,
        hybrid_router: Any = None,
        telemetry_store: Any = None,
    ):
        self.adapter = adapter or OllamaAdapter()
        self.queue = InferenceQueue(max_concurrent=max_concurrent_inferences)
        self.kill_switch = kill_switch
        self.audit_trail = audit_trail
        self.hybrid_router = hybrid_router
        self.telemetry_store = telemetry_store

    def set_cpu_threads(self, threads: int | None) -> None:
        """Configura dinamicamente o número de threads do Ollama no adaptador ativo."""
        if hasattr(self.adapter, "set_cpu_threads"):
            self.adapter.set_cpu_threads(threads)

    async def check_health(self) -> bool:
        return await self.adapter.health_check()

    async def get_loaded_models(self) -> list[str]:
        """Retorna modelos carregados no runtime ativo."""
        if hasattr(self.adapter, "get_loaded_models"):
            return await self.adapter.get_loaded_models()
        return []

    async def evict_model(self, model_name: str) -> bool:
        """Descarrega modelo do runtime ativo para liberar RAM/VRAM."""
        if hasattr(self.adapter, "evict_model"):
            return await self.adapter.evict_model(model_name)
        return False


    async def list_available_models(self) -> list[ModelMetadata]:
        local_models = await self.adapter.list_models()
        if self.hybrid_router and self.hybrid_router.online_config.enabled and self.hybrid_router.online_adapter:
            try:
                online_models = await self.hybrid_router.online_adapter.list_models()
                return local_models + online_models
            except Exception:
                pass
        return local_models

    def select_model_for_role(self, role_str: str) -> str:
        """Seleciona o modelo mais adequado conforme a especialização do agente."""
        if any(term in role_str for term in ("developer", "code", "devops", "qa", "auditor")):
            return ModelRoleMapping.DEFAULT_CODER.value
        elif any(term in role_str for term in ("data", "intelligence", "threat", "soc")):
            return ModelRoleMapping.DEFAULT_REASONING.value
        return ModelRoleMapping.DEFAULT_MASTER.value

    async def generate(
        self,
        request: InferenceRequest,
        has_external_data_approval: bool = False,
    ) -> InferenceResponse:
        # 1. Verificação do Kill Switch
        if self.kill_switch:
            if self.kill_switch.is_global_killed():
                raise RuntimeError("Operações suspensas pelo Kill Switch Global.")
            if request.task_id and self.kill_switch.is_task_cancelled(request.task_id):
                raise RuntimeError(f"A tarefa '{request.task_id}' foi cancelada.")

        # 2. Execução protegida pela fila de concorrência com suporte a Hybrid Gateway
        used_provider = "ollama_local"
        started_at = time.perf_counter()

        async def _run_inference():
            nonlocal used_provider
            if self.hybrid_router and (self.hybrid_router.online_config.enabled or getattr(request, "key_id", None)):
                res, used_provider = await self.hybrid_router.route_inference(
                    request, has_external_data_approval=has_external_data_approval
                )
                return res
            return await self.adapter.generate(request)

        try:
            response = await self.queue.execute(
                _run_inference,
                task_id=request.task_id,
                timeout_seconds=request.timeout_seconds,
            )
        except Exception as exc:
            self._record_telemetry(
                request=request,
                provider=used_provider,
                status="failed",
                duration_ms=(time.perf_counter() - started_at) * 1000,
                error_type=type(exc).__name__,
            )
            raise

        measured_duration_ms = response.duration_ms or (time.perf_counter() - started_at) * 1000
        self._record_telemetry(
            request=request,
            provider=used_provider,
            status="success",
            duration_ms=measured_duration_ms,
            prompt_tokens=response.prompt_tokens,
            completion_tokens=response.completion_tokens,
            model_name=response.model_name,
        )

        # 3. Registo em auditoria
        if self.audit_trail:
            self.audit_trail.record_event(
                operation="INFERENCE_COMPLETED",
                status="SUCCESS",
                parameters={
                    "model": response.model_name,
                    "provider": used_provider,
                    "prompt_tokens": response.prompt_tokens,
                    "completion_tokens": response.completion_tokens,
                    "duration_ms": response.duration_ms,
                    "tokens_per_second": response.tokens_per_second,
                },
                severity=AuditEventSeverity.INFO,
            )

        return response

    def _record_telemetry(
        self,
        *,
        request: InferenceRequest,
        provider: str,
        status: str,
        duration_ms: float,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        error_type: str | None = None,
        model_name: str | None = None,
    ) -> None:
        """Persiste somente metadados operacionais, nunca prompts ou respostas."""
        if not self.telemetry_store:
            return
        try:
            self.telemetry_store.record_inference(
                owner_user_id=request.owner_user_id,
                task_id=request.task_id,
                agent_role=request.agent_role,
                model_name=model_name or request.model_name,
                provider=provider,
                status=status,
                duration_ms=duration_ms,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                error_type=error_type,
            )
        except Exception:
            # Falha de observabilidade não pode derrubar uma inferência válida.
            logger.exception("Não foi possível persistir a telemetria da inferência.")

    async def generate_stream(
        self,
        request: InferenceRequest,
        has_external_data_approval: bool = False,
    ):
        # 1. Verificação do Kill Switch
        if self.kill_switch:
            if self.kill_switch.is_global_killed():
                raise RuntimeError("Operações suspensas pelo Kill Switch Global.")
            if request.task_id and self.kill_switch.is_task_cancelled(request.task_id):
                raise RuntimeError(f"A tarefa '{request.task_id}' foi cancelada.")

        # 2. Streaming via Hybrid Router ou Adapter Local
        if self.hybrid_router and (self.hybrid_router.online_config.enabled or getattr(request, "key_id", None)):
            async for chunk in self.hybrid_router.route_inference_stream(
                request, has_external_data_approval=has_external_data_approval
            ):
                yield chunk
        else:
            async for chunk in self.adapter.generate_stream(request):
                yield chunk
