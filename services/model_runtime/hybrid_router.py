import asyncio
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from packages.contracts.security import AuditEventSeverity
from services.security_core import ApprovalEngine, AuditTrail, contains_sensitive_data

from .adapter import BaseModelAdapter
from .types import InferenceRequest, InferenceResponse

logger = logging.getLogger("jarvis.model_runtime.hybrid_router")

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


_PROVIDER_PRESETS_BY_ID: dict[str, dict[str, Any]] = {p["id"]: p for p in PROVIDER_PRESETS}


@dataclass(frozen=True)
class _ExternalCandidate:
    """Destino externo resolvido antes de qualquer verificação de segurança."""

    adapter: BaseModelAdapter
    provider: str
    route: str
    label: str
    model_name: str | None
    always_override_model: bool
    cost_per_1k_input: float
    cost_per_1k_output: float
    key_id: str | None = None


@dataclass(frozen=True)
class _ExternalPolicyDecision:
    """Resultado da política central para uma chamada externa (inclui reserva de orçamento)."""

    allowed: bool
    reason: str
    reservation_usd: float = 0.0


class OnlineProviderConfig(BaseModel):
    provider_name: str = "openai"
    enabled: bool = False
    api_key: str | None = Field(default=None, exclude=True)
    key_id: str | None = None
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
        self._reserved_spend_usd: float = 0.0
        self._budget_lock = asyncio.Lock()

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

    def _resolve_external_candidate(
        self, request: InferenceRequest
    ) -> _ExternalCandidate | None:
        """
        Resolve o destino externo (KeyVault ou gateway) sem executá-lo.

        A resolução não concede autorização: toda chamada externa ainda passa por
        `_authorize_external_call`, que aplica a mesma política aos dois caminhos.
        """
        if getattr(request, "force_local", False):
            return None

        req_key_id = getattr(request, "key_id", None)
        if req_key_id:
            try:
                profile = self.key_vault.get_key(req_key_id) if self.key_vault else None
                vault_adapter = self.get_adapter_for_key(req_key_id) if profile else None
            except Exception as exc:
                logger.warning(
                    "Falha ao resolver a chave '%s' do KeyVault: %s", req_key_id, exc
                )
                profile, vault_adapter = None, None

            if profile and vault_adapter:
                rate_in, rate_out = self._rates_for_provider(profile.provider)
                return _ExternalCandidate(
                    adapter=vault_adapter,
                    provider=profile.provider,
                    route="vault_key",
                    label=f"vault_key ({req_key_id} - {profile.provider})",
                    model_name=profile.default_model,
                    always_override_model=False,
                    cost_per_1k_input=rate_in,
                    cost_per_1k_output=rate_out,
                    key_id=req_key_id,
                )

        if self.online_config.enabled and self.online_adapter:
            return _ExternalCandidate(
                adapter=self.online_adapter,
                provider=self.online_config.provider_name,
                route="online_gateway",
                label=f"online_gateway ({self.online_config.provider_name})",
                model_name=self.online_config.default_model,
                always_override_model=True,
                cost_per_1k_input=self.online_config.cost_per_1k_input,
                cost_per_1k_output=self.online_config.cost_per_1k_output,
            )

        return None

    def _rates_for_provider(self, provider: str) -> tuple[float, float]:
        """Usa as tarifas do preset do provedor da chave; fallback para a configuração global."""
        preset = _PROVIDER_PRESETS_BY_ID.get((provider or "").lower())
        if preset:
            return float(preset["cost_per_1k_input"]), float(preset["cost_per_1k_output"])
        return self.online_config.cost_per_1k_input, self.online_config.cost_per_1k_output

    @staticmethod
    def _calculate_cost(
        prompt_tokens: int,
        completion_tokens: int,
        cost_per_1k_input: float,
        cost_per_1k_output: float,
    ) -> float:
        return (
            (prompt_tokens / 1000.0) * cost_per_1k_input
            + (completion_tokens / 1000.0) * cost_per_1k_output
        )

    def record_cost(
        self,
        prompt_tokens: int,
        completion_tokens: int,
        cost_per_1k_input: float | None = None,
        cost_per_1k_output: float | None = None,
    ) -> float:
        cost = self._calculate_cost(
            prompt_tokens,
            completion_tokens,
            self.online_config.cost_per_1k_input
            if cost_per_1k_input is None
            else cost_per_1k_input,
            self.online_config.cost_per_1k_output
            if cost_per_1k_output is None
            else cost_per_1k_output,
        )
        self.online_config.current_spend_usd += cost
        return round(cost, 6)

    def _estimate_request_cost(
        self, request: InferenceRequest, candidate: _ExternalCandidate
    ) -> float:
        """
        Estimativa conservadora usada apenas para RESERVAR orçamento antes da chamada.

        Não é contabilizada como custo final: o valor real é liquidado com a utilização
        devolvida pelo provedor (ou com estimativa explícita no streaming sem usage).
        """
        prompt_tokens = max(
            1, (len(request.prompt) + len(request.system_prompt or "")) // 4
        )
        completion_tokens = request.max_tokens or 2048
        return self._calculate_cost(
            prompt_tokens,
            completion_tokens,
            candidate.cost_per_1k_input,
            candidate.cost_per_1k_output,
        )

    async def _reserve_budget(self, estimated_cost_usd: float) -> bool:
        """Reserva orçamento de forma atômica para impedir estouro por chamadas concorrentes."""
        async with self._budget_lock:
            projected = self.online_config.current_spend_usd + self._reserved_spend_usd
            if projected >= self.online_config.max_budget_usd:
                return False
            if projected + estimated_cost_usd > self.online_config.max_budget_usd:
                return False
            self._reserved_spend_usd += estimated_cost_usd
            return True

    def _release_budget(self, reservation_usd: float) -> None:
        remaining = self._reserved_spend_usd - reservation_usd
        self._reserved_spend_usd = remaining if remaining > 1e-12 else 0.0

    def _settle_budget(self, reservation_usd: float, actual_cost_usd: float) -> None:
        """Libera a reserva e contabiliza o custo real uma única vez."""
        self._release_budget(reservation_usd)
        self.online_config.current_spend_usd = round(
            self.online_config.current_spend_usd + actual_cost_usd, 6
        )

    def _audit_event(
        self,
        operation: str,
        status: str,
        parameters: dict[str, Any],
        severity: AuditEventSeverity,
        reason: str | None = None,
    ) -> None:
        if self.audit_trail:
            self.audit_trail.record_event(
                operation=operation,
                status=status,
                parameters=parameters,
                severity=severity,
                reason=reason,
            )

    def _prepare_external_request(
        self, request: InferenceRequest, candidate: _ExternalCandidate
    ) -> InferenceRequest:
        prepared = request.model_copy()
        if candidate.model_name and (
            candidate.always_override_model
            or not prepared.model_name
            or prepared.model_name in ("auto", "auto_hybrid")
        ):
            prepared.model_name = candidate.model_name
        return prepared

    async def _authorize_external_call(
        self,
        request: InferenceRequest,
        candidate: _ExternalCandidate,
        has_external_data_approval: bool,
    ) -> _ExternalPolicyDecision:
        """
        Política central única para QUALQUER saída externa (KeyVault ou gateway).

        A chave do KeyVault identifica o provedor, mas nunca substitui:
        1. bloqueio de dados sensíveis sem aprovação humana;
        2. limite de orçamento com reserva atômica;
        3. identificação do provedor e trilha de auditoria.
        """
        audit_params = {
            "model": request.model_name,
            "provider": candidate.provider,
            "route": candidate.route,
            "vault_ref": candidate.key_id,
        }

        # 1. Dados sensíveis só saem com aprovação humana expressa.
        if request.contains_sensitive_data and not has_external_data_approval:
            self._audit_event(
                operation="SENSITIVE_DATA_LOCAL_CONTAINMENT",
                status="CONTAINED_LOCAL",
                parameters=audit_params,
                severity=AuditEventSeverity.WARNING,
                reason=(
                    "Requisição contém dados sensíveis sem aprovação humana para envio "
                    "externo. Mantida em inferência local."
                ),
            )
            return _ExternalPolicyDecision(False, "dados sensíveis retidos no local")

        # 2. Orçamento: reserva atômica antes de qualquer chamada externa.
        estimated_cost = round(self._estimate_request_cost(request, candidate), 6)
        if not await self._reserve_budget(estimated_cost):
            self._audit_event(
                operation="ONLINE_BUDGET_EXCEEDED_FALLBACK",
                status="FALLBACK_LOCAL",
                parameters={
                    **audit_params,
                    "spend": self.online_config.current_spend_usd,
                    "reserved": round(self._reserved_spend_usd, 6),
                    "max": self.online_config.max_budget_usd,
                    "estimated_cost": estimated_cost,
                },
                severity=AuditEventSeverity.WARNING,
                reason="Orçamento online esgotado. Redirecionando para inferência local.",
            )
            return _ExternalPolicyDecision(False, "fallback orçamento")

        # 3. Autorização registrada com provedor e rota identificados.
        self._audit_event(
            operation="EXTERNAL_INFERENCE_AUTHORIZED",
            status="AUTHORIZED",
            parameters={
                **audit_params,
                "reserved_usd": estimated_cost,
                "human_approval": has_external_data_approval,
            },
            severity=AuditEventSeverity.INFO,
            reason="Chamada externa autorizada pela política unificada de inferência.",
        )
        return _ExternalPolicyDecision(True, "", estimated_cost)

    # ------------------------------------------------------------------
    # Política aplicada aos provedores de chat (Coding Agent / Chat / Autónomo)
    # ------------------------------------------------------------------
    def _resolve_chat_candidate(
        self, provider_name: str, model_name: str | None
    ) -> _ExternalCandidate | None:
        """Resolve o destino online usado pelos provedores de chat."""
        if not (self.online_config.enabled and self.online_adapter):
            return None
        rate_in, rate_out = self._rates_for_provider(
            provider_name or self.online_config.provider_name
        )
        return _ExternalCandidate(
            adapter=self.online_adapter,
            provider=provider_name or self.online_config.provider_name,
            route="chat_provider",
            label=f"chat_provider ({provider_name})",
            model_name=model_name or self.online_config.default_model,
            always_override_model=False,
            cost_per_1k_input=rate_in,
            cost_per_1k_output=rate_out,
        )

    async def authorize_chat_egress(
        self,
        *,
        provider_name: str,
        model_name: str | None,
        text: str,
        contains_sensitive: bool | None = None,
        has_external_data_approval: bool = False,
        max_tokens: int = 2048,
    ) -> _ExternalPolicyDecision:
        """Aplica contenção de sensíveis, orçamento e auditoria a uma chamada de chat.

        Retorna uma decisão com `allowed=False` quando o chamador deve usar
        exclusivamente o provedor local. Nenhum provedor online pode ser chamado
        sem passar por este método.
        """
        candidate = self._resolve_chat_candidate(provider_name, model_name)
        if candidate is None:
            return _ExternalPolicyDecision(True, "local", 0.0)
        request = InferenceRequest(
            prompt=text,
            model_name=model_name or candidate.model_name or "",
            max_tokens=max_tokens,
            contains_sensitive_data=(
                contains_sensitive
                if contains_sensitive is not None
                else contains_sensitive_data(text)
            ),
        )
        return await self._authorize_external_call(
            request, candidate, has_external_data_approval
        )

    def settle_chat_egress(
        self,
        reservation_usd: float,
        *,
        provider_name: str,
        prompt_tokens: int,
        completion_tokens: int,
        route: str = "chat_provider",
    ) -> float:
        """Contabiliza o custo real de uma chamada de chat já concluída."""
        rate_in, rate_out = self._rates_for_provider(provider_name)
        cost = self._calculate_cost(prompt_tokens, completion_tokens, rate_in, rate_out)
        self._settle_budget(reservation_usd, cost)
        self._audit_event(
            operation="ONLINE_CHAT_COMPLETED",
            status="SUCCESS",
            parameters={
                "provider": provider_name,
                "route": route,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "cost_usd": round(cost, 6),
            },
            severity=AuditEventSeverity.INFO,
        )
        return cost

    def release_chat_egress(self, reservation_usd: float) -> None:
        """Libera uma reserva de orçamento quando a chamada externa falhou."""
        if reservation_usd:
            self._release_budget(reservation_usd)

    async def route_inference(
        self,
        request: InferenceRequest,
        has_external_data_approval: bool = False,
    ) -> tuple[InferenceResponse, str]:
        """
        Executa inferência com estratégia híbrida.
        Retorna (InferenceResponse, provider_used).
        """
        # 0. Resolve o destino externo (KeyVault ou gateway) sem executá-lo.
        candidate = self._resolve_external_candidate(request)
        if candidate is None:
            res = await self.local_adapter.generate(request)
            return res, "ollama_local"

        # 1. Política central: sensibilidade + orçamento + auditoria, para os dois caminhos.
        decision = await self._authorize_external_call(
            request, candidate, has_external_data_approval
        )
        if not decision.allowed:
            res = await self.local_adapter.generate(request)
            return res, f"ollama_local ({decision.reason})"

        # 2. Execução externa com contabilização única e fallback local em falhas.
        settled = False
        try:
            external_req = self._prepare_external_request(request, candidate)
            res = await candidate.adapter.generate(external_req)
            cost = self._calculate_cost(
                res.prompt_tokens,
                res.completion_tokens,
                candidate.cost_per_1k_input,
                candidate.cost_per_1k_output,
            )
            self._settle_budget(decision.reservation_usd, cost)
            settled = True
            self._audit_event(
                operation="ONLINE_INFERENCE_COMPLETED",
                status="SUCCESS",
                parameters={
                    "provider": candidate.provider,
                    "route": candidate.route,
                    "vault_ref": candidate.key_id,
                    "model": res.model_name,
                    "prompt_tokens": res.prompt_tokens,
                    "completion_tokens": res.completion_tokens,
                    "cost_usd": round(cost, 6),
                    "usage_source": "provider_reported",
                    "streaming": False,
                },
                severity=AuditEventSeverity.INFO,
            )
            return res.model_copy(update={"cost_usd": round(cost, 6)}), candidate.label

        except Exception as exc:
            if not settled:
                self._release_budget(decision.reservation_usd)
            # Fallback resiliente: falha externa NUNCA quebra a tarefa.
            self._audit_event(
                operation="ONLINE_GATEWAY_OUTAGE_FALLBACK",
                status="FALLBACK_LOCAL",
                parameters={
                    "error": str(exc),
                    "provider": candidate.provider,
                    "route": candidate.route,
                    "vault_ref": candidate.key_id,
                },
                severity=AuditEventSeverity.WARNING,
                reason=(
                    "Provedor externo indisponível ou falha de rede. "
                    "Fallback para Ollama local ativado."
                ),
            )
            res = await self.local_adapter.generate(request)
            return res, "ollama_local (fallback resiliência)"

    async def route_inference_stream(
        self,
        request: InferenceRequest,
        has_external_data_approval: bool = False,
    ):
        """Streaming de tokens com exatamente a mesma política de segurança da rota não-stream."""
        candidate = self._resolve_external_candidate(request)
        if candidate is None:
            async for chunk in self.local_adapter.generate_stream(request):
                yield chunk
            return

        decision = await self._authorize_external_call(
            request, candidate, has_external_data_approval
        )
        if not decision.allowed:
            async for chunk in self.local_adapter.generate_stream(request):
                yield chunk
            return

        external_req = self._prepare_external_request(request, candidate)
        streamed_chars = 0
        emitted = False
        settled = False
        try:
            async for chunk in candidate.adapter.generate_stream(external_req):
                emitted = True
                streamed_chars += len(chunk)
                yield chunk
        except Exception as exc:
            if emitted:
                self._audit_event(
                    operation="ONLINE_STREAM_INTERRUPTED",
                    status="FAILED",
                    parameters={
                        "error": str(exc),
                        "provider": candidate.provider,
                        "route": candidate.route,
                        "vault_ref": candidate.key_id,
                        "streamed_chars": streamed_chars,
                    },
                    severity=AuditEventSeverity.WARNING,
                    reason=(
                        "Streaming externo interrompido após envio parcial. "
                        "Fallback local não executado para evitar duplicação de tokens."
                    ),
                )
                return

            self._audit_event(
                operation="ONLINE_GATEWAY_OUTAGE_FALLBACK",
                status="FALLBACK_LOCAL",
                parameters={
                    "error": str(exc),
                    "provider": candidate.provider,
                    "route": candidate.route,
                    "vault_ref": candidate.key_id,
                },
                severity=AuditEventSeverity.WARNING,
                reason=(
                    "Provedor externo indisponível durante streaming. "
                    "Fallback para Ollama local ativado."
                ),
            )
            async for chunk in self.local_adapter.generate_stream(request):
                yield chunk
            return
        else:
            usage = getattr(candidate.adapter, "last_stream_usage", None)
            if usage and (usage.get("prompt_tokens") or usage.get("completion_tokens")):
                prompt_tokens = int(usage.get("prompt_tokens") or 0)
                completion_tokens = int(usage.get("completion_tokens") or 0)
                usage_source = "provider_reported"
            else:
                # O provedor não devolveu usage confiável: estimamos pelo texto e
                # registramos explicitamente a limitação. Nunca inventamos usage do provedor.
                prompt_tokens = max(
                    1, (len(request.prompt) + len(request.system_prompt or "")) // 4
                )
                completion_tokens = max(1, streamed_chars // 4)
                usage_source = "estimated_from_stream_text"
                self._audit_event(
                    operation="STREAM_USAGE_UNAVAILABLE",
                    status="ESTIMATED",
                    parameters={
                        "provider": candidate.provider,
                        "route": candidate.route,
                        "vault_ref": candidate.key_id,
                        "prompt_units_estimate": prompt_tokens,
                        "completion_units_estimate": completion_tokens,
                    },
                    severity=AuditEventSeverity.WARNING,
                    reason=(
                        "O provedor não retornou dados confiáveis de utilização em "
                        "streaming; custo contabilizado por estimativa explícita."
                    ),
                )

            cost = self._calculate_cost(
                prompt_tokens,
                completion_tokens,
                candidate.cost_per_1k_input,
                candidate.cost_per_1k_output,
            )
            self._settle_budget(decision.reservation_usd, cost)
            settled = True
            self._audit_event(
                operation="ONLINE_INFERENCE_COMPLETED",
                status="SUCCESS",
                parameters={
                    "provider": candidate.provider,
                    "route": candidate.route,
                    "vault_ref": candidate.key_id,
                    "model": external_req.model_name,
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "cost_usd": round(cost, 6),
                    "usage_source": usage_source,
                    "streaming": True,
                },
                severity=AuditEventSeverity.INFO,
            )
        finally:
            if not settled:
                self._release_budget(decision.reservation_usd)
