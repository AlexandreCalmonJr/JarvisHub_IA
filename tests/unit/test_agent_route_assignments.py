"""Rotas de chave + modelo por especialista e por conta."""

import pytest

from apps.api.auth import Principal
from apps.api.routers import agents as agents_router
from apps.api.schemas import AgentRouteUpdateRequest
from packages.contracts.agent import (
    AgentRole,
    AutonomousAgentRunConfig,
)
from packages.contracts.security import ProjectWorkMode
from services.autonomous_agent import AutonomousAgentRuntime
from services.coding_agent.broker import ApprovalBroker
from services.coding_agent.tools import CodingToolExecutor
from services.coding_agent.types import ChatTurn, ProviderReply, ToolSpec
from services.memory.database import DatabaseManager
from services.model_runtime.agent_routing import resolve_account_agent_route
from services.model_runtime.key_vault import KeyVaultService
from services.security_core import SecurityCore


def _vault(tmp_path) -> KeyVaultService:
    return KeyVaultService(vault_path=tmp_path / "routes-vault.json")


def _principal(user_id: str = "alice") -> Principal:
    return Principal(subject_id=user_id, kind="human", role="developer")


def test_agent_route_assignment_roundtrip_and_account_isolation(tmp_path):
    db = DatabaseManager(str(tmp_path / "routes.db"))

    db.set_agent_route("code_reviewer", "alice_key", "openai/gpt-oss-120b", "alice")
    db.set_agent_route("qa_engineer", "alice_key_2", "openai/gpt-oss-20b", "alice")

    alice_route = db.get_agent_route("code_reviewer", "alice")
    assert alice_route is not None
    assert alice_route["key_id"] == "alice_key"
    assert alice_route["model"] == "openai/gpt-oss-120b"
    assert [route["agent_role"] for route in db.list_agent_routes("alice")] == [
        "code_reviewer",
        "qa_engineer",
    ]

    assert db.get_agent_route("code_reviewer", "bob") is None
    assert db.list_agent_routes("bob") == []
    assert not db.delete_agent_route("code_reviewer", "bob")

    # Upsert substitui a rota existente em vez de duplicar.
    db.set_agent_route("code_reviewer", "alice_key_2", "openai/gpt-oss-20b", "alice")
    assert db.get_agent_route("code_reviewer", "alice")["key_id"] == "alice_key_2"
    assert db.delete_agent_route("code_reviewer", "alice")
    assert db.get_agent_route("code_reviewer", "alice") is None


def test_resolver_prefers_account_route_and_falls_back_safely(tmp_path):
    db = DatabaseManager(str(tmp_path / "routes.db"))
    vault = _vault(tmp_path)
    vault.save_key(
        "account_key",
        "Conta Alice",
        "groq",
        "gsk-account-secret",
        default_model="openai/gpt-oss-120b",
        owner_user_id="alice",
        is_default=True,
    )

    db.set_agent_route("code_reviewer", "account_key", "openai/gpt-oss-20b", "alice")
    route = resolve_account_agent_route(
        db_manager=db,
        key_vault=vault,
        owner_user_id="alice",
        agent_role="code_reviewer",
        fallback_key_id="global_key",
        fallback_model="llama3.2:3b",
    )
    assert route.source == "account"
    assert route.key_id == "account_key"
    assert route.model == "openai/gpt-oss-20b"
    assert route.provider == "groq"

    # Outra conta não herda a atribuição privada de Alice.
    bob_route = resolve_account_agent_route(
        db_manager=db,
        key_vault=vault,
        owner_user_id="bob",
        agent_role="code_reviewer",
        fallback_model="llama3.2:3b",
    )
    assert bob_route.source == "global"
    assert bob_route.key_id is None
    assert bob_route.model == "llama3.2:3b"

    # Uma chave global removida não é propagada para a inferência.
    stale_global_route = resolve_account_agent_route(
        db_manager=db,
        key_vault=vault,
        owner_user_id="alice",
        agent_role="qa_engineer",
        fallback_key_id="chave_global_removida",
        fallback_model="llama3.2:3b",
    )
    assert stale_global_route.key_id is None

    # Uma chave global com o mesmo ID não substitui a chave privada da conta.
    vault.save_key("only_global", "Global", "groq", "gsk-global-only")
    db.set_agent_route("research_analyst", "only_global", "openai/gpt-oss-120b", "alice")
    shadow_route = resolve_account_agent_route(
        db_manager=db,
        key_vault=vault,
        owner_user_id="alice",
        agent_role="research_analyst",
        fallback_model="llama3.2:3b",
    )
    assert shadow_route.source == "global"
    assert shadow_route.key_id is None

    # O fallback do perfil global usa o âmbito global, mesmo que a conta tenha
    # uma chave com o mesmo ID.
    vault.save_key(
        "shared_global",
        "Global partilhada",
        "groq",
        "gsk-global-shared",
        default_model="openai/gpt-oss-120b",
    )
    vault.save_key(
        "shared_global",
        "Conta Alice",
        "groq",
        "gsk-alice-shared",
        default_model="openai/gpt-oss-20b",
        owner_user_id="alice",
    )
    global_route = resolve_account_agent_route(
        db_manager=db,
        key_vault=vault,
        owner_user_id="alice",
        agent_role="qa_engineer",
        fallback_key_id="shared_global",
        fallback_model="llama3.2:3b",
    )
    assert global_route.source == "global"
    assert global_route.key_id == "shared_global"
    assert global_route.key_label == "Global partilhada"

    # Uma chave removida/desativada não deixa o especialista preso à rota inválida.
    vault.save_key(
        "account_key",
        "Conta Alice",
        "groq",
        "gsk-account-secret",
        owner_user_id="alice",
        is_active=False,
    )
    stale_route = resolve_account_agent_route(
        db_manager=db,
        key_vault=vault,
        owner_user_id="alice",
        agent_role="code_reviewer",
        fallback_model="llama3.2:3b",
    )
    assert stale_route.source == "global"
    assert stale_route.model == "llama3.2:3b"


@pytest.mark.asyncio
async def test_route_endpoints_save_list_and_delete_for_account(tmp_path, monkeypatch):
    db = DatabaseManager(str(tmp_path / "routes.db"))
    vault = _vault(tmp_path)
    vault.save_key(
        "account_key",
        "Conta Alice",
        "groq",
        "gsk-account-secret",
        default_model="openai/gpt-oss-120b",
        owner_user_id="alice",
        is_default=True,
    )
    vault.save_key(
        "global_key",
        "Global",
        "groq",
        "gsk-global-secret",
        default_model="openai/gpt-oss-120b",
    )
    monkeypatch.setattr(agents_router, "db_manager", db)
    monkeypatch.setattr(agents_router, "key_vault", vault)

    saved = await agents_router.set_agent_route_endpoint(
        "code_reviewer",
        AgentRouteUpdateRequest(key_id="account_key"),
        _principal(),
    )
    assert saved["model"] == "openai/gpt-oss-120b"
    assert db.get_agent_route("code_reviewer", "alice")["key_id"] == "account_key"

    listed = await agents_router.list_agent_routes_endpoint(_principal())
    assert len(listed["routes"]) == 1
    assert listed["routes"][0]["key_available"] is True
    assert listed["routes"][0]["provider"] == "groq"

    removed = await agents_router.delete_agent_route_endpoint("code_reviewer", _principal())
    assert removed["status"] == "deleted"
    assert db.get_agent_route("code_reviewer", "alice") is None

    with pytest.raises(Exception) as exc:
        await agents_router.set_agent_route_endpoint(
            "code_reviewer",
            AgentRouteUpdateRequest(key_id="missing_key"),
            _principal(),
        )
    assert "não encontrada" in str(exc.value)

    # Uma chave global não pode ser apropriada como rota privada da conta.
    with pytest.raises(Exception) as exc:
        await agents_router.set_agent_route_endpoint(
            "code_reviewer",
            AgentRouteUpdateRequest(key_id="global_key"),
            _principal(),
        )
    assert "não encontrada" in str(exc.value)


@pytest.mark.asyncio
async def test_autonomous_runtime_uses_account_route_key_and_model(tmp_path):
    db = DatabaseManager(str(tmp_path / "runtime.db"))
    vault = _vault(tmp_path)
    vault.save_key(
        "account_key",
        "Conta Alice",
        "groq",
        "gsk-account-secret",
        default_model="openai/gpt-oss-120b",
        owner_user_id="alice",
        is_default=True,
    )
    db.set_agent_route("code_reviewer", "account_key", "openai/gpt-oss-20b", "alice")

    class RecordingProvider:
        name = "recording"

        def __init__(self):
            self.models: list[str | None] = []

        def resolve_model(self, model: str | None) -> str:
            return model or "fallback"

        async def complete(
            self,
            turns: list[ChatTurn],
            tools: list[ToolSpec],
            model: str | None = None,
            temperature: float = 0.2,
            max_tokens: int = 2048,
            timeout_seconds: float = 60.0,
        ) -> ProviderReply:
            self.models.append(model)
            return ProviderReply(content="Revisão concluída.", model=model or "fallback")

    provider = RecordingProvider()
    routed_calls: list[tuple[str | None, str | None]] = []

    def routed_factory(key_id, owner_user_id):
        routed_calls.append((key_id, owner_user_id))
        return provider

    def unused_global_factory():
        raise AssertionError("O provider global não devia ser usado com rota da conta.")

    sec = SecurityCore()
    sec.permission_engine.register_project(
        "proj-route", str(tmp_path), mode=ProjectWorkMode.READ_ONLY
    )

    class Workspace:
        def get_project_dir(self, project_id: str):
            return tmp_path

    runtime = AutonomousAgentRuntime(
        security_core=sec,
        workspace_service=Workspace(),
        tools=CodingToolExecutor(security_core=sec, workspace_service=Workspace()),
        broker=ApprovalBroker(approval_engine=sec.approval_engine, audit_trail=sec.audit),
        db_manager=db,
        key_vault=vault,
        provider_factory=unused_global_factory,
        routed_provider_factory=routed_factory,
    )

    config = AutonomousAgentRunConfig(
        agent_role=AgentRole.CODE_REVIEWER,
        prompt="Revise o código.",
        project_id="proj-route",
        owner_user_id="alice",
    )
    contract = await runtime.run_task(config)

    assert routed_calls == [("account_key", "alice")]
    assert provider.models == ["openai/gpt-oss-20b"]
    assert contract.resource_usage.model_name == "openai/gpt-oss-20b"
