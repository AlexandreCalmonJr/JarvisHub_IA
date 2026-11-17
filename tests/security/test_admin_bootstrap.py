from pathlib import Path

from apps.api.auth import AuthService
from services.security_core.auth_store import UserCredentialStore


def _service(tmp_path: Path) -> AuthService:
    service = object.__new__(AuthService)
    service.auth_dir = tmp_path
    service.user_store = UserCredentialStore(tmp_path / "users.sqlite3")
    return service


def test_bootstrap_creates_admin_with_homologation_password(tmp_path, monkeypatch):
    monkeypatch.delenv("JARVIS_BOOTSTRAP_ADMIN_PASSWORD", raising=False)
    monkeypatch.setenv("JARVIS_ENVIRONMENT", "development")
    service = _service(tmp_path)

    service._ensure_initial_admin_user()

    assert service.user_store.authenticate("admin", "jarvishub") is not None
    assert service.user_store.get_user("admin")["role"] == "admin"
    assert (tmp_path / ".admin-bootstrap-password-initialized").exists()


def test_bootstrap_resets_existing_admin_once(tmp_path, monkeypatch):
    monkeypatch.delenv("JARVIS_BOOTSTRAP_ADMIN_PASSWORD", raising=False)
    monkeypatch.setenv("JARVIS_ENVIRONMENT", "development")
    service = _service(tmp_path)
    service.user_store.create_user(
        username="admin",
        display_name="Administrador",
        password="senha-antiga",
        role="admin",
    )

    service._ensure_initial_admin_user()
    assert service.user_store.authenticate("admin", "jarvishub") is not None

    # A inicialização seguinte não sobrescreve uma troca de senha posterior.
    service.user_store.set_password("admin", "senha-personalizada")
    service._ensure_initial_admin_user()
    assert service.user_store.authenticate("admin", "senha-personalizada") is not None
    assert service.user_store.authenticate("admin", "jarvishub") is None


def test_production_does_not_apply_known_default_password(tmp_path, monkeypatch):
    monkeypatch.delenv("JARVIS_BOOTSTRAP_ADMIN_PASSWORD", raising=False)
    monkeypatch.setenv("JARVIS_ENVIRONMENT", "production")
    service = _service(tmp_path)

    try:
        service._ensure_initial_admin_user()
    except RuntimeError as exc:
        assert "JARVIS_BOOTSTRAP_ADMIN_PASSWORD" in str(exc)
    else:
        raise AssertionError("A inicialização de produção deve exigir senha configurada.")
    assert service.user_store.get_user("admin") is None
