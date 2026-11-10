import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from packages.contracts.security import AuditEventSeverity
from services.security_core import ApprovalEngine, AuditTrail

from .adapter import BaseModelAdapter
from .types import InferenceRequest, InferenceResponse

PROVIDER_PRESETS: list[dict[str, Any]] = [
    {
        "id": "openai",
        "name": "OpenAI (GPT-4o / GPT-4o-mini)",
        "default_model": "gpt-4o-mini",
        "base_url": "https://api.openai.com/v1",
        "cost_per_1k_input": 0.00015,
        "cost_per_1k_output": 0.00060,
    },
    {
        "id": "gemini",
        "name": "Google Gemini (Gemini 2.5 Flash)",
        "default_model": "gemini-2.5-flash",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "cost_per_1k_input": 0.000075,
        "cost_per_1k_output": 0.00030,
    },
    {
        "id": "groq",
        "name": "Groq (Qwen 3.8 27B / LPU Ultra Rápido)",
        "default_model": "qwen/qwen3.8-27b",
        "base_url": "https://api.groq.com/openai/v1",
        "cost_per_1k_input": 0.00059,
        "cost_per_1k_output": 0.00079,
    },
    {
        "id": "deepseek",
        "name": "DeepSeek (V3 / R1 Reasoner)",
        "default_model": "deepseek-chat",
        "base_url": "https://api.deepseek.com",
        "cost_per_1k_input": 0.00014,
        "cost_per_1k_output": 0.00028,
    },
    {
        "id": "anthropic",
        "name": "Anthropic Claude (3.5 Sonnet / Haiku)",
        "default_model": "claude-3-5-haiku-20241022",
        "base_url": "https://api.anthropic.com/v1",
        "cost_per_1k_input": 0.00080,
        "cost_per_1k_output": 0.00400,
    },
    {
        "id": "custom",
        "name": "Personalizado / Compatível OpenAI",
        "default_model": "custom-model",
        "base_url": "https://api.openai.com/v1",
        "cost_per_1k_input": 0.00100,
        "cost_per_1k_output": 0.00200,
    },
]


class OnlineProviderConfig(BaseModel):
    provider_name: str = "openai"
    enabled: bool = False
    api_key: str | None = None
    base_url: str | None = None
    default_model: str = "gpt-4o-mini"
    max_budget_usd: float = 5.0
    current_spend_usd: float = 0.0
    cost_per_1k_input: float = 0.0015
    cost_per_1k_output: float = 0.0020

    def masked_api_key(self) -> str | None:
        if not self.api_key:
            return None
        key = self.api_key.strip()
        if len(key) <= 8:
            return "sk-...****"
        return f"{key[:4]}...{key[-4:]}"


def load_hybrid_config_from_disk(file_path: Path) -> OnlineProviderConfig:
    if file_path.exists():
        try:
            data = json.loads(file_path.read_text(encoding="utf-8"))
            return OnlineProviderConfig(**data)
        except Exception:
            pass
    return OnlineProviderConfig()


def save_hybrid_config_to_disk(cfg: OnlineProviderConfig, file_path: Path) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(cfg.model_dump_json(indent=2), encoding="utf-8")


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
        key_vault: Any | None = None,
    ):
        self.local_adapter = local_adapter
        self.online_config = online_config or OnlineProviderConfig(enabled=False)
        self.online_adapter = online_adapter
        self.approval_engine = approval_engine
        self.audit_trail = audit_trail
        self.key_vault = key_vault
        self._vault_adapters: dict[str, Any] = {}

    def get_adapter_for_key(self, key_id: str) -> BaseModelAdapter | None:
        """Recupera ou instancia dinamicamente um adaptador a partir do KeyVault."""
        if not self.key_vault:
            return None
        profile = self.key_vault.get_key(key_id)
        if not profile or not profile.api_key:
            return None
        if key_id not in self._vault_adapters:
            from services.model_runtime.adapter import UniversalOnlineAdapter
            self._vault_adapters[key_id] = UniversalOnlineAdapter(
                api_key=profile.api_key,
                provider_name=profile.provider,
                base_url=profile.base_url,
                default_model=profile.default_model,
            )
        return self._vault_adapters[key_id]

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
        # 0. Roteamento por Chave Específica do KeyVault (Multi-Chaves por Agente)
        req_key_id = getattr(request, "key_id", None)
        if req_key_id:
            vault_adapter = self.get_adapter_for_key(req_key_id)
            if vault_adapter:
                try:
                    k_prof = self.key_vault.get_key(req_key_id)
                    custom_req = request.model_copy()
                    if k_prof and k_prof.default_model and (not custom_req.model_name or custom_req.model_name in ("auto", "auto_hybrid")):
                        custom_req.model_name = k_prof.default_model
                    res = await vault_adapter.generate(custom_req)
                    return res, f"vault_key ({req_key_id} - {k_prof.provider if k_prof else 'custom'})"
                except Exception as exc:
                    logger.warning("Falha na inferência com a chave '%s': %s. Seguindo com fallback padrão.", req_key_id, exc)

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

    async def route_inference_stream(
        self,
        request: InferenceRequest,
        has_external_data_approval: bool = False,
    ):
        """Executa streaming de tokens respeitando a estratégia híbrida e fallback."""
        if not self.online_config.enabled or not self.online_adapter:
            async for chunk in self.local_adapter.generate_stream(request):
                yield chunk
            return

        if request.contains_sensitive_data and not has_external_data_approval:
            async for chunk in self.local_adapter.generate_stream(request):
                yield chunk
            return

        if self.online_config.current_spend_usd >= self.online_config.max_budget_usd:
            async for chunk in self.local_adapter.generate_stream(request):
                yield chunk
            return

        try:
            online_req = request.model_copy()
            online_req.model_name = self.online_config.default_model
            async for chunk in self.online_adapter.generate_stream(online_req):
                yield chunk
        except Exception:
            async for chunk in self.local_adapter.generate_stream(request):
                yield chunk
