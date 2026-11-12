import pytest

from packages.contracts.approval import ApprovalStatus
from services.memory.database import DatabaseManager
from services.security_core import SecurityCore
from services.security_core.approval_engine import ApprovalEngine
from services.security_core.device_auth import DeviceAuthManager, hash_token
from services.security_core.session_manager import SessionManager, UserRole


def test_approval_creation_and_persistence(tmp_path):
    """Verifica que novos pedidos de aprovação são salvos no SQLite com seus metadados."""
    db = DatabaseManager(str(tmp_path / "jarvis.db"))
    engine = ApprovalEngine(db_manager=db)

    req = engine.create_request(
        task_id="task-101",
        agent_role="jarvis_master",
        operation="file_write",
        impact_summary="Modificação de configuração do servidor",
        affected_resources=["config.py", "settings.json"],
        proposed_diff="--- a\n+++ b\n@@ -1 +1 @@\n-DEBUG = True\n+DEBUG = False\n",
        reversible=True,
    )

    assert req.id.startswith("appr-")
    assert req.status == ApprovalStatus.PENDING

    # Consulta diretamente no SQLite
    db_row = db.get_approval(req.id)
    assert db_row is not None
    assert db_row["id"] == req.id
    assert db_row["task_id"] == "task-101"
    assert db_row["agent_role"] == "jarvis_master"
    assert db_row["operation"] == "file_write"
    assert db_row["impact_summary"] == "Modificação de configuração do servidor"
    assert db_row["affected_resources"] == ["config.py", "settings.json"]
    assert "DEBUG = False" in db_row["proposed_diff"]
    assert db_row["status"] == "pending"
    assert db_row["reversible"] is True


def test_approval_recovery_after_restart(tmp_path):
    """Simula reinício do processo e garante recuperação de pedidos pendentes com diff e recursos."""
    db_path = str(tmp_path / "jarvis.db")
    db1 = DatabaseManager(db_path)
    engine1 = ApprovalEngine(db_manager=db1)

    req = engine1.create_request(
        task_id="task-restart-1",
        agent_role="software_architect",
        operation="git_commit",
        impact_summary="Commit de arquitetura",
        affected_resources=["architecture.md"],
        proposed_diff="+ Nova arquitetura",
    )

    # Simula reinício do processo instanciando novo motor com o mesmo banco
    db2 = DatabaseManager(db_path)
    engine2 = ApprovalEngine(db_manager=db2)

    pending = engine2.list_pending_requests()
    assert len(pending) == 1
    recovered = pending[0]
    assert recovered.id == req.id
    assert recovered.task_id == "task-restart-1"
    assert recovered.agent_role == "software_architect"
    assert recovered.affected_resources == ["architecture.md"]
    assert recovered.proposed_diff == "+ Nova arquitetura"
    assert recovered.status == ApprovalStatus.PENDING


def test_approval_decision_persistence_and_no_revert_to_pending(tmp_path):
    """Garante que decisões (aprovações e rejeições) são persistidas e NÃO voltam como pendentes."""
    db_path = str(tmp_path / "jarvis.db")
    db1 = DatabaseManager(db_path)
    engine1 = ApprovalEngine(db_manager=db1)

    req_appr = engine1.create_request(
        task_id="task-appr",
        agent_role="software_architect",
        operation="write_file",
        impact_summary="Deploy seguro",
        affected_resources=["main.py"],
    )
    req_rej = engine1.create_request(
        task_id="task-rej",
        agent_role="project_manager",
        operation="execute_script",
        impact_summary="Script duvidoso",
        affected_resources=["run.sh"],
    )

    engine1.approve_request(
        request_id=req_appr.id,
        decided_by="human_admin",
        decision_reason="Revisado e autorizado em produção",
    )
    engine1.reject_request(
        request_id=req_rej.id,
        decided_by="security_officer",
        reason="Risco elevado de segurança",
    )

    # Simula reinício do processo
    db2 = DatabaseManager(db_path)
    engine2 = ApprovalEngine(db_manager=db2)

    # Nenhuma das solicitações decididas pode retornar como pendente
    pending = engine2.list_pending_requests()
    assert len(pending) == 0

    # Os detalhes persistem intactos no histórico
    rec_appr = engine2.get_request(req_appr.id)
    assert rec_appr is not None
    assert rec_appr.status == ApprovalStatus.APPROVED
    assert rec_appr.decided_by == "human_admin"
    assert rec_appr.decision_reason == "Revisado e autorizado em produção"
    assert rec_appr.decided_at is not None

    rec_rej = engine2.get_request(req_rej.id)
    assert rec_rej is not None
    assert rec_rej.status == ApprovalStatus.REJECTED
    assert rec_rej.decided_by == "security_officer"
    assert rec_rej.decision_reason == "Risco elevado de segurança"
    assert rec_rej.decided_at is not None


def test_device_pairing_and_sqlite_persistence(tmp_path):
    """Garante que emparelhamento é salvo no SQLite sem expor o token em texto puro."""
    db = DatabaseManager(str(tmp_path / "jarvis.db"))
    device_auth = DeviceAuthManager(db_manager=db)

    reg = device_auth.pair_device(device_name="Admin Pixel 8", created_by="admin")

    assert reg.device_id.startswith("dev-")
    assert reg.device_token is not None
    assert reg.device_token.startswith("jrv_m_")

    # Verifica no SQLite: token_hash presente, device_token inexistente no banco
    db_row = db.get_device(reg.device_id)
    assert db_row is not None
    assert db_row["device_id"] == reg.device_id
    assert db_row["device_name"] == "Admin Pixel 8"
    assert db_row["token_hash"] == hash_token(reg.device_token)
    assert "device_token" not in db_row
    assert db_row["is_revoked"] is False

    # Validação de token com o hash correto
    validated = device_auth.validate_token(reg.device_token)
    assert validated.device_id == reg.device_id


def test_device_recovery_and_token_validation_across_restart(tmp_path):
    """Simula reinício e verifica que o token continua válido via hash persistido."""
    db_path = str(tmp_path / "jarvis.db")
    db1 = DatabaseManager(db_path)
    device_auth1 = DeviceAuthManager(db_manager=db1)

    reg = device_auth1.pair_device(device_name="Dev iPhone", created_by="admin")
    raw_token = reg.device_token

    # Simula reinício
    db2 = DatabaseManager(db_path)
    device_auth2 = DeviceAuthManager(db_manager=db2)

    # Lista pública nunca contém token
    devices = device_auth2.list_devices()
    assert len(devices) == 1
    assert devices[0].device_id == reg.device_id
    assert devices[0].device_token is None
    assert devices[0].token_hash == ""

    # Validação do token após reinício deve funcionar perfeitamente
    validated = device_auth2.validate_token(raw_token)
    assert validated.device_id == reg.device_id

    # Token forjado ou incorreto deve ser rejeitado
    with pytest.raises(PermissionError):
        device_auth2.validate_token("jrv_m_invalid_forged_token")


def test_device_revocation_persistence(tmp_path):
    """Garante que a revogação de dispositivos permanece válida após reinício."""
    db_path = str(tmp_path / "jarvis.db")
    db1 = DatabaseManager(db_path)
    device_auth1 = DeviceAuthManager(db_manager=db1)

    reg = device_auth1.pair_device(device_name="Stolen Phone", created_by="admin")
    raw_token = reg.device_token

    # Revoga o dispositivo
    device_auth1.revoke_device(reg.device_id, reason="Aparelho extraviado")

    with pytest.raises(PermissionError, match="revogado"):
        device_auth1.validate_token(raw_token)

    # Simula reinício do servidor
    db2 = DatabaseManager(db_path)
    device_auth2 = DeviceAuthManager(db_manager=db2)

    # Após reinício, acesso continua bloqueado
    with pytest.raises(PermissionError, match="revogado"):
        device_auth2.validate_token(raw_token)

    # Dispositivo na lista aparece como revogado
    devs = device_auth2.list_devices()
    assert len(devs) == 1
    assert devs[0].is_revoked is True


def test_session_lifecycle_and_invalidation_after_restart(tmp_path):
    """Garante que sessões ativas são recuperadas, mas expiradas e revogadas NUNCA são reativadas."""
    db_path = str(tmp_path / "jarvis.db")
    db1 = DatabaseManager(db_path)
    sm1 = SessionManager(default_expiry_hours=24, db_manager=db1)

    # 1. Sessão ativa e válida
    valid_sess = sm1.create_session(user_id="developer_1", role=UserRole.DEVELOPER, expiry_hours=12)

    # 2. Sessão já criada com expiração no passado
    expired_sess = sm1.create_session(
        user_id="developer_2", role=UserRole.DEVELOPER, expiry_hours=-1
    )

    # 3. Sessão válida que é revogada explicitamente
    revoked_sess = sm1.create_session(
        user_id="developer_3", role=UserRole.DEVELOPER, expiry_hours=10
    )
    sm1.revoke_session(revoked_sess.session_id)

    # Verificação inicial
    assert sm1.validate_session(valid_sess.session_id) is not None
    assert sm1.validate_session(expired_sess.session_id) is None
    assert sm1.validate_session(revoked_sess.session_id) is None

    # Simula reinício do processo com nova instância do SessionManager
    db2 = DatabaseManager(db_path)
    sm2 = SessionManager(default_expiry_hours=24, db_manager=db2)

    # Apenas a sessão ativa e válida deve ser restaurada
    active_sessions = sm2.list_sessions(include_revoked=False)
    assert len(active_sessions) == 1
    assert active_sessions[0].session_id == valid_sess.session_id

    # Validações após reinício
    assert sm2.validate_session(valid_sess.session_id) is not None
    assert sm2.validate_session(expired_sess.session_id) is None
    assert sm2.validate_session(revoked_sess.session_id) is None


def test_security_core_unified_wiring_across_restarts(tmp_path):
    """Testa a fachada unificada SecurityCore com persistência via DatabaseManager."""
    db_path = str(tmp_path / "jarvis.db")
    db1 = DatabaseManager(db_path)
    sec1 = SecurityCore(db_manager=db1)

    # Cria aprovação, dispositivo e sessão através da fachada SecurityCore
    appr = sec1.approval_engine.create_request(
        task_id="task-core-1",
        agent_role="jarvis_master",
        operation="db_migration",
        impact_summary="Migração de esquema",
        affected_resources=["database.py"],
    )
    dev = sec1.device_auth.pair_device("Tablet Admin")
    sess = sec1.sessions.create_session("admin_user", role=UserRole.ADMIN)

    # Simula reinício total
    db2 = DatabaseManager(db_path)
    sec2 = SecurityCore(db_manager=db2)

    # Verifica integridade de todos os subsistemas recuperados
    assert len(sec2.approval_engine.list_pending_requests()) == 1
    assert sec2.approval_engine.list_pending_requests()[0].id == appr.id

    assert sec2.device_auth.validate_token(dev.device_token).device_id == dev.device_id
    assert sec2.sessions.validate_session(sess.session_id).user_id == "admin_user"
