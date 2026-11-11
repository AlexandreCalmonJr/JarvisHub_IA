"""
Testes obrigatórios da Autenticação Centralizada e Autorização RBAC da API do JARVIS AI HUB.

Cobre os 10 cenários especificados:
1. Requisição sem credenciais.
2. Token inválido.
3. Sessão expirada.
4. Sessão revogada.
5. Usuário sem permissão administrativa.
6. Dispositivo autorizado.
7. Dispositivo revogado.
8. Acesso não autorizado ao Kill Switch.
9. Tentativa de aprovação usando identidade falsificada.
10. Funcionamento do dashboard após implementação.
"""

from datetime import UTC, datetime, timedelta
import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.auth import AuthService, auth_service
from apps.api.main import app
from packages.contracts.agent import AgentRole


@pytest.mark.asyncio
async def test_01_unauthenticated_request_rejected():
    """1. Requisição sem credenciais deve retornar 401 Unauthorized."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/approvals", headers={"x-no-auth": "1"})
        assert res.status_code == 401
        assert "Autenticação necessária" in res.json().get("detail", "")


@pytest.mark.asyncio
async def test_02_invalid_token_rejected():
    """2. Token inválido deve retornar 401 Unauthorized."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/approvals",
            headers={"Authorization": "Bearer token_falsificado_invalido_xyz"},
        )
        assert res.status_code == 401
        assert "Autenticação necessária" in res.json().get("detail", "")


@pytest.mark.asyncio
async def test_03_expired_session_rejected():
    """3. Sessão expirada deve retornar 401 Unauthorized."""
    # Cria sessão válida e depois retroage sua expiração
    session = auth_service.create_session("dev_tester", "developer", expiry_hours=1)
    session.expires_at = datetime.now(UTC) - timedelta(minutes=5)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/approvals",
            headers={"Authorization": f"Bearer {session.session_id}"},
        )
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_04_revoked_session_rejected():
    """4. Sessão revogada deve retornar 401 Unauthorized."""
    session = auth_service.create_session("dev_to_revoke", "developer", expiry_hours=2)
    auth_service.security.sessions.revoke_session(session.session_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/approvals",
            headers={"Authorization": f"Bearer {session.session_id}"},
        )
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_05_non_admin_forbidden_from_admin_endpoints():
    """5. Usuário sem permissão administrativa deve receber 403 Forbidden em rotas admin."""
    session = auth_service.create_session("dev_regular", "developer")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # A listagem global de dispositivos continua restrita a administradores.
        res = await client.get(
            "/api/v1/mobile/devices",
            headers={"Authorization": f"Bearer {session.session_id}"},
        )
        assert res.status_code == 403
        assert "Apenas administradores" in res.json().get("detail", "") or "Permissão insuficiente" in res.json().get("detail", "")


@pytest.mark.asyncio
async def test_06_authorized_device_access():
    """6. Dispositivo móvel autorizado com scopes adequados acessa com sucesso."""
    device_reg = auth_service.security.device_auth.pair_device(
        device_name="Tablet de Teste",
        scopes=["approvals:read", "approvals:decide"],
        created_by="admin_test",
        owner_user_id="admin",
    )
    device_token = device_reg.device_token

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/approvals",
            headers={"X-Device-Token": device_token},
        )
        assert res.status_code == 200
        assert isinstance(res.json(), list)


@pytest.mark.asyncio
async def test_07_revoked_device_rejected():
    """7. Dispositivo revogado deve ter o acesso bloqueado imediatamente com 401."""
    device_reg = auth_service.security.device_auth.pair_device(
        device_name="Dispositivo a Revogar",
        scopes=["approvals:read"],
        created_by="admin_test",
    )
    token = device_reg.device_token
    auth_service.security.device_auth.revoke_device(device_reg.device_id, reason="Teste de revogação")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/approvals",
            headers={"X-Device-Token": token},
        )
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_08_unauthorized_kill_switch_access():
    """8. Acesso não autorizado ao Kill Switch (sem scope security:kill) deve ser bloqueado com 403."""
    dev_session = auth_service.create_session("dev_sem_kill", "developer")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/v1/system/kill-switch",
            json={"target": "global", "reason": "Tentativa não autorizada"},
            headers={"Authorization": f"Bearer {dev_session.session_id}"},
        )
        assert res.status_code == 403


@pytest.mark.asyncio
async def test_09_approval_spoofed_identity_ignored():
    """9. Tentativa de aprovação usando identidade falsificada: o servidor usa a identidade real autenticada."""
    from apps.api.deps import coding_broker

    # Cria uma requisição de aprovação pendente no motor do coding broker
    ticket = coding_broker.create(
        task_id="task_spoof_test_1",
        agent_role="architect",
        operation="file_write",
        impact_summary="Teste de falsificação de identidade",
        affected_resources=["config.py"],
        owner_user_id="legit_developer",
    )

    # Usuário desenvolvedor autenticado
    dev_session = auth_service.create_session("legit_developer", "developer")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Envia decided_by forjado como "super_admin_falsificado"
        res = await client.post(
            f"/api/v1/approvals/{ticket.request.id}/decide",
            json={
                "action": "approve",
                "decided_by": "super_admin_falsificado",
                "reason": "Aprovação legítima com payload sujo",
            },
            headers={"Authorization": f"Bearer {dev_session.session_id}"},
        )
        assert res.status_code == 200

        # Verifica que o servidor registrou 'legit_developer' e IGNOROU 'super_admin_falsificado'
        stored_req = auth_service.security.approval_engine.get_request(ticket.request.id)
        assert stored_req is not None
        assert stored_req.decided_by == "legit_developer"
        assert stored_req.decided_by != "super_admin_falsificado"

        # Agora testa tentativa de aprovação com identidade de agente (deve retornar 403)
        ticket_agent = coding_broker.create(
            task_id="task_spoof_test_2",
            agent_role="architect",
            operation="file_write",
            impact_summary="Tentativa com papel de agente",
            affected_resources=["main.py"],
            owner_user_id="legit_developer",
        )
        res_agent = await client.post(
            f"/api/v1/approvals/{ticket_agent.request.id}/decide",
            json={
                "action": "approve",
                "decided_by": AgentRole.JARVIS_MASTER.value,
            },
            headers={"Authorization": f"Bearer {dev_session.session_id}"},
        )
        assert res_agent.status_code == 403


@pytest.mark.asyncio
async def test_10_dashboard_and_public_routes_accessible_without_auth():
    """10. Funcionamento do dashboard e rotas públicas após implementação: acessíveis sem 401."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Rotas públicas mínimas
        res_root_api = await client.get("/api", headers={"x-no-auth": "1"})
        assert res_root_api.status_code == 200
        assert res_root_api.json().get("status") in {"online", "operational"}

        res_health = await client.get("/api/v1/system/health", headers={"x-no-auth": "1"})
        assert res_health.status_code == 200
        assert "status" in res_health.json()

        # Rota de frontend SPA / dashboard estático
        res_dash = await client.get("/", headers={"x-no-auth": "1"})
        assert res_dash.status_code == 200


def test_11_rate_limit_persists_across_auth_service_instances(monkeypatch, tmp_path):
    """Tentativas de login permanecem limitadas após recriar o serviço."""
    monkeypatch.setenv("JARVIS_ISSUE_BOOTSTRAP", "0")
    first = AuthService(auth_service.security, tmp_path / "auth")
    assert first.check_rate_limit("login:127.0.0.77", limit=1, window_seconds=60)

    restarted = AuthService(auth_service.security, tmp_path / "auth")
    assert restarted.check_rate_limit("login:127.0.0.77", limit=1, window_seconds=60) is False

@pytest.mark.asyncio
async def test_12_mock_server_requires_dedicated_authenticated_permission():
    """Mock routes are available to developers but not to read-only auditors."""
    auditor = auth_service.create_session("mock_auditor", "auditor")
    developer = auth_service.create_session("mock_developer", "developer")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        denied = await client.get(
            "/api/v1/mock/health",
            headers={"Authorization": f"Bearer {auditor.session_id}"},
        )
        assert denied.status_code == 403

        allowed = await client.get(
            "/api/v1/mock/health",
            headers={"Authorization": f"Bearer {developer.session_id}"},
        )
        # 404 proves the mock route's permission gate passed; no mock is configured.
        assert allowed.status_code == 404
