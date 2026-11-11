"""
Testes de Fortalecimento da Autenticação do Aplicativo Mobile no JARVIS AI HUB.

Cobre rigorosamente os 8 cenários exigidos:
1. Emparelhamento autorizado (exige autorização administrativa).
2. Tentativa de emparelhamento não autorizado (bloqueio 401/403 sem admin).
3. Token válido (acesso concedido às rotas permitidas para o perfil do dispositivo).
4. Token inválido (rejeição com 401 Unauthorized).
5. Token revogado (bloqueio imediato com 401 e auditoria do bloqueio).
6. Listagem de dispositivos sem exposição de tokens (device_token e token_hash ausentes).
7. Aprovações via mobile (identidade validada pelo servidor como device:dev-xxx, sem MobileUser arbitrário).
8. Kill Switch via mobile (autorizado com escopo security:kill, bloqueado sem ele).
"""

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.auth import auth_service
from apps.api.deps import security_core
from apps.api.main import app
from packages.contracts.agent import AgentRole
from packages.contracts.approval import ApprovalStatus
from packages.contracts.security import AuditEventSeverity


@pytest.fixture
def admin_token():
    """Gera token administrativo válido para testes."""
    return "jrv_admin_test_secret_for_suite_runs"


@pytest.mark.asyncio
async def test_01_authorized_mobile_pairing(admin_token):
    """1. Emparelhamento autorizado: apenas administradores podem registrar novos dispositivos."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/v1/mobile/pair",
            json={
                "device_name": "Google Pixel 8 Pro",
                "scopes": ["chat:read", "chat:use", "approvals:read", "approvals:decide", "system:read"],
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "paired"
        assert data["device_id"].startswith("dev-")
        assert data["device_name"] == "Google Pixel 8 Pro"
        assert data["device_token"].startswith("jrv_m_")
        assert "approvals:decide" in data["scopes"]


@pytest.mark.asyncio
async def test_02_unauthorized_pairing_attempt_blocked():
    """2. Tentativa de emparelhamento sem credencial ou com credencial não-admin é bloqueada."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # A. Sem credenciais (401)
        res_no_auth = await client.post(
            "/api/v1/mobile/pair",
            json={"device_name": "Invasor"},
            headers={"x-no-auth": "1"},
        )
        assert res_no_auth.status_code == 401

        # B. Com token de dispositivo comum (sem privilégio admin -> 403)
        dev = security_core.device_auth.pair_device("Dispositivo Comum")
        res_dev = await client.post(
            "/api/v1/mobile/pair",
            json={"device_name": "Tentativa Secundária"},
            headers={"X-Device-Token": dev.device_token},
        )
        assert res_dev.status_code == 403
        assert "permissão insuficiente" in res_dev.json().get("detail", "").lower()


@pytest.mark.asyncio
async def test_03_valid_device_token_access():
    """3. Token de dispositivo válido permite acesso às rotas autorizadas."""
    reg = security_core.device_auth.pair_device(
        "Tablet de Operações",
        scopes=["chat:read", "chat:use", "system:read", "approvals:read", "workspace:read"],
        owner_user_id="admin",
    )
    token = reg.device_token

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Acesso a aprovações com X-Device-Token
        res_appr = await client.get(
            "/api/v1/approvals",
            headers={"X-Device-Token": token},
        )
        assert res_appr.status_code == 200

        # Acesso a projetos com Authorization: Bearer jrv_m_...
        res_proj = await client.get(
            "/api/v1/workspace/projects",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_proj.status_code == 200

        # Acesso ao health do sistema recebendo components porque está autenticado
        res_health = await client.get(
            "/api/v1/system/health",
            headers={"X-Device-Token": token},
        )
        assert res_health.status_code == 200
        health_data = res_health.json()
        assert "components" in health_data


@pytest.mark.asyncio
async def test_04_invalid_device_token_rejected():
    """4. Token de dispositivo inexistente ou forjado é rejeitado com 401."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/approvals",
            headers={"X-Device-Token": "jrv_m_token_falsificado_invalido_xyz123"},
        )
        assert res.status_code == 401
        assert "Autenticação necessária" in res.json().get("detail", "")


@pytest.mark.asyncio
async def test_05_revoked_device_immediately_blocked():
    """5. Token revogado é bloqueado imediatamente e o evento é registrado na auditoria."""
    reg = security_core.device_auth.pair_device("Dispositivo a Revogar")
    token = reg.device_token
    device_id = reg.device_id

    # Revoga o dispositivo
    security_core.device_auth.revoke_device(device_id, reason="Perda do aparelho", revoked_by="admin_test")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/approvals",
            headers={"X-Device-Token": token},
        )
        assert res.status_code == 401

    # Verifica se evento de bloqueio foi auditado
    events = security_core.audit.list_events()
    blocked_events = [
        e for e in events
        if e.operation == "REVOKED_DEVICE_ACCESS_BLOCKED" and (
            (getattr(e, "parameters_redacted", None) or getattr(e, "parameters", {}) or {}).get("device_id") == device_id
        )
    ]
    assert len(blocked_events) > 0, "Tentativa de acesso de dispositivo revogado não foi auditada!"
    assert blocked_events[-1].severity == AuditEventSeverity.WARNING


@pytest.mark.asyncio
async def test_06_device_list_does_not_expose_tokens(admin_token):
    """6. A listagem de dispositivos NUNCA deve retornar device_token ou token_hash."""
    reg = security_core.device_auth.pair_device("Aparelho Confidencial")
    created_id = reg.device_id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/mobile/devices",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 200
        devices = res.json()
        assert len(devices) > 0

        target = next((d for d in devices if d["device_id"] == created_id), None)
        assert target is not None

        # O token original e o hash NUNCA devem estar presentes na resposta
        assert "device_token" not in target or target["device_token"] is None
        assert "token_hash" not in target or target["token_hash"] == ""
        assert target.get("device_token") is None
        assert target.get("token_hash") is None or target.get("token_hash") == ""


@pytest.mark.asyncio
async def test_07_mobile_approval_decision_validated_identity():
    """7. Decisão de aprovação via mobile usa a identidade validada pelo servidor (device:dev-xxx), sem MobileUser."""
    # Cria dispositivo com escopo approvals:decide
    reg = security_core.device_auth.pair_device(
        "Smartphone Homologado",
        scopes=["approvals:read", "approvals:decide"],
    )
    token = reg.device_token
    device_id = reg.device_id

    # Cria pedido de aprovação pendente no engine
    appr = security_core.approval_engine.create_request(
        task_id="mobile-test-task-1",
        agent_role=AgentRole.BACKEND_DEVELOPER.value,
        operation="schema_migration",
        impact_summary="Aplicar migration no banco",
        affected_resources=["migrations/001.sql"],
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Envia a decisão via mobile COM um decided_by falso no corpo
        res = await client.post(
            f"/api/v1/approvals/{appr.id}/decide",
            json={
                "action": "approve",
                "decided_by": "MobileUser",  # Valor arbitrário que DEVE ser ignorado pelo backend
                "reason": "Aprovado via aplicativo Android seguro",
            },
            headers={"X-Device-Token": token},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "approved"

    # Verifica no ApprovalEngine quem foi registrado como deliberador
    appr_after = security_core.approval_engine.get_request(appr.id)
    assert appr_after.status == ApprovalStatus.APPROVED
    assert appr_after.decided_by == f"device:{device_id}", (
        f"A identidade foi falsificada ou assumiu valor fixo! Esperado: device:{device_id}, Obtido: {appr_after.decided_by}"
    )


@pytest.mark.asyncio
async def test_08_mobile_kill_switch_scope_enforcement():
    """8. Kill Switch via mobile: permitido com scope security:kill, bloqueado com 403 sem ele."""
    # Dispositivo A: COM escopo security:kill
    dev_with_kill = security_core.device_auth.pair_device(
        "Terminal de Emergência",
        scopes=["security:kill"],
    )

    # Dispositivo B: SEM escopo security:kill
    dev_without_kill = security_core.device_auth.pair_device(
        "Visualizador Apenas",
        scopes=["chat:read", "system:read"],
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Dispositivo B tenta disparar o Kill Switch -> 403 Forbidden
        res_blocked = await client.post(
            "/api/v1/system/kill-switch",
            json={"target": "global", "reason": "Tentativa não autorizada"},
            headers={"X-Device-Token": dev_without_kill.device_token},
        )
        assert res_blocked.status_code == 403
        assert security_core.kill_switch.is_global_killed() is False

        # 2. Dispositivo A dispara o Kill Switch -> 200 OK
        res_allowed = await client.post(
            "/api/v1/system/kill-switch",
            json={"target": "global", "reason": "Parada de emergência autorizada pelo mobile"},
            headers={"X-Device-Token": dev_with_kill.device_token},
        )
        assert res_allowed.status_code == 200
        assert res_allowed.json()["status"] == "global_kill_activated"
        assert security_core.kill_switch.is_global_killed() is True

        # Restaura estado
        security_core.kill_switch.reset_global_kill(authorized_by="admin_test")
