from pydantic import BaseModel

from packages.contracts.security import AuditEventSeverity
from services.security_core import ApprovalEngine, AuditTrail

from .adapter import BaseModelAdapter
from .types import InferenceRequest, InferenceResponse


class OnlineProviderConfig(BaseModel):
    provider_name: str = "openai"
    enabled: bool = False
    api_key: str | None = None
    default_model: str = "gpt-4o-mini"
    max_budget_usd: float = 5.0
    current_spend_usd: float = 0.0
    cost_per_1k_input: float = 0.0015
    cost_per_1k_output: float = 0.0020


class CostBudgetExceededError(Exception):
    pass


class HybridModelRouter:
    """
    Roteador Híbrido de Modelos (Local-First com Gateway Online Opcional).
    Garante:
    1. Operação padrão 100% local sem necessidade de chaves de API.
    2. Fallback automático para Ollama local em caso de falha de rede/provedor externo.
    3. Bloqueio por limites de orçamento em dólares ($).
    4. Proteção de dados: código/dados sensíveis exigem autorização expressa antes do envio externo.
    """

    def __init__(
        self,
        local_adapter: BaseModelAdapter,
        online_config: OnlineProviderConfig | None = None,
        online_adapter: BaseModelAdapter | None = None,
        approval_engine: ApprovalEngine | None = None,
        audit_trail: AuditTrail | None = None,
    ):
        self.local_adapter = local_adapter
        self.online_config = online_config or OnlineProviderConfig(enabled=False)
        self.online_adapter = online_adapter
        self.approval_engine = approval_engine
        self.audit_trail = audit_trail

    def record_cost(self, prompt_tokens: int, completion_tokens: int) -> float:
        cost = (
            (prompt_tokens / 1000.0) * self.online_config.cost_per_1k_input
            + (completion_tokens / 1000.0) * self.online_config.cost_per_1k_output
        )
        self.online_config.current_spend_usd += cost
        return round(cost, 6)

    async def route_inference(
        self,
        request: InferenceRequest,
        has_external_data_approval: bool = False,
    ) -> tuple[InferenceResponse, str]:
        """
        Executa inferência com estratégia híbrida.
        Retorna (InferenceResponse, provider_used).
        """
        # 1. Se online não estiver habilitado ou faltar adaptador, utiliza sempre a rota local
        if not self.online_config.enabled or not self.online_adapter:
            res = await self.local_adapter.generate(request)
            return res, "ollama_local"

        # 2. Proteção de dados sensíveis: se a requisição contiver dados sensíveis e não houver aprovação humana expressa
        if request.contains_sensitive_data and not has_external_data_approval:
            if self.audit_trail:
                self.audit_trail.record_event(
                    operation="SENSITIVE_DATA_LOCAL_CONTAINMENT",
                    status="CONTAINED_LOCAL",
                    parameters={"model": request.model_name},
                    severity=AuditEventSeverity.WARNING,
                    reason="Requisição contém dados sensíveis sem aprovação humana para envio externo. Mantida em inferência local.",
                )
            res = await self.local_adapter.generate(request)
            return res, "ollama_local (dados sensíveis retidos no local)"

        # 3. Verifica se o orçamento em dólares foi atingido
        if self.online_config.current_spend_usd >= self.online_config.max_budget_usd:
            if self.audit_trail:
                self.audit_trail.record_event(
                    operation="ONLINE_BUDGET_EXCEEDED_FALLBACK",
                    status="FALLBACK_LOCAL",
                    parameters={"spend": self.online_config.current_spend_usd, "max": self.online_config.max_budget_usd},
                    severity=AuditEventSeverity.WARNING,
                    reason="Orçamento online esgotado. Redirecionando para inferência local.",
                )
            res = await self.local_adapter.generate(request)
            return res, "ollama_local (fallback orçamento)"

        # 4. Tenta execução online com tratamento de falhas e fallback transparente
        try:
            online_req = request.model_copy()
            online_req.model_name = self.online_config.default_model

            res = await self.online_adapter.generate(online_req)
            cost = self.record_cost(res.prompt_tokens, res.completion_tokens)

            if self.audit_trail:
                self.audit_trail.record_event(
                    operation="ONLINE_INFERENCE_COMPLETED",
                    status="SUCCESS",
                    parameters={"provider": self.online_config.provider_name, "cost_usd": cost},
                    severity=AuditEventSeverity.INFO,
                )
            return res, f"online_gateway ({self.online_config.provider_name})"

        except Exception as exc:
            # Fallback resiliente: falha de internet ou erro do fornecedor NUNCA quebra a tarefa
            if self.audit_trail:
                self.audit_trail.record_event(
                    operation="ONLINE_GATEWAY_OUTAGE_FALLBACK",
                    status="FALLBACK_LOCAL",
                    parameters={"error": str(exc)},
                    severity=AuditEventSeverity.WARNING,
                    reason="Provedor externo indisponível ou falha de rede. Fallback para Ollama local ativado.",
                )
            res = await self.local_adapter.generate(request)
            return res, "ollama_local (fallback resiliência)"
