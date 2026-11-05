from typing import Optional, List
from services.security_core import KillSwitch, AuditTrail
from packages.contracts.security import AuditEventSeverity
from .types import InferenceRequest, InferenceResponse, ModelMetadata, ModelRoleMapping
from .adapter import BaseModelAdapter, OllamaAdapter
from .inference_queue import InferenceQueue, InferenceQueueError


class ModelManager:
    """
    Gestor central de modelos de IA local.
    Controla o ciclo de vida, adaptador, roteamento por perfil e enfileiramento seguro.
    """

    def __init__(
        self,
        adapter: Optional[BaseModelAdapter] = None,
        max_concurrent_inferences: int = 1,
        kill_switch: Optional[KillSwitch] = None,
        audit_trail: Optional[AuditTrail] = None,
    ):
        self.adapter = adapter or OllamaAdapter()
        self.queue = InferenceQueue(max_concurrent=max_concurrent_inferences)
        self.kill_switch = kill_switch
        self.audit_trail = audit_trail

    async def check_health(self) -> bool:
        return await self.adapter.health_check()

    async def list_available_models(self) -> List[ModelMetadata]:
        return await self.adapter.list_models()

    def select_model_for_role(self, role_str: str) -> str:
        """Seleciona o modelo mais adequado conforme a especialização do agente."""
        if any(term in role_str for term in ("developer", "code", "devops", "qa", "auditor")):
            return ModelRoleMapping.DEFAULT_CODER.value
        elif any(term in role_str for term in ("data", "intelligence", "threat", "soc")):
            return ModelRoleMapping.DEFAULT_REASONING.value
        return ModelRoleMapping.DEFAULT_MASTER.value

    async def generate(self, request: InferenceRequest) -> InferenceResponse:
        # 1. Verificação do Kill Switch
        if self.kill_switch:
            if self.kill_switch.is_global_killed():
                raise RuntimeError("Operações suspensas pelo Kill Switch Global.")
            if request.task_id and self.kill_switch.is_task_cancelled(request.task_id):
                raise RuntimeError(f"A tarefa '{request.task_id}' foi cancelada.")

        # 2. Execução protegida pela fila de concorrência
        async def _run_inference():
            return await self.adapter.generate(request)

        response = await self.queue.execute(
            _run_inference,
            task_id=request.task_id,
            timeout_seconds=request.timeout_seconds,
        )

        # 3. Registo em auditoria
        if self.audit_trail:
            self.audit_trail.record_event(
                operation="INFERENCE_COMPLETED",
                status="SUCCESS",
                parameters={
                    "model": response.model_name,
                    "prompt_tokens": response.prompt_tokens,
                    "completion_tokens": response.completion_tokens,
                    "duration_ms": response.duration_ms,
                    "tokens_per_second": response.tokens_per_second,
                },
                severity=AuditEventSeverity.INFO,
            )

        return response
