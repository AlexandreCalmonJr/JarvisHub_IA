import pytest

from services.security_core.auth_store import UserCredentialStore


def test_user_passwords_are_hashed_and_authenticate(tmp_path):
    store = UserCredentialStore(tmp_path / "users.sqlite3")
    created = store.create_user(
        username="partner",
        display_name="Parceiro",
        password="correct-horse-battery",
        role="developer",
    )

    assert created["username"] == "partner"
    assert store.authenticate("partner", "correct-horse-battery")["role"] == "developer"
    assert store.authenticate("partner", "wrong-password") is None

    import sqlite3

    with sqlite3.connect(tmp_path / "users.sqlite3") as conn:
        stored_hash = conn.execute(
            "SELECT password_hash FROM human_users WHERE username = 'partner'"
        ).fetchone()[0]
    assert stored_hash != "correct-horse-battery"
    assert stored_hash.startswith("pbkdf2_sha256$")


def test_disabled_user_cannot_authenticate_and_password_reset_works(tmp_path):
    store = UserCredentialStore(tmp_path / "users.sqlite3")
    store.create_user("auditor", "Auditor", "first-password-123", "auditor")

    assert store.set_active("auditor", False)
    assert store.authenticate("auditor", "first-password-123") is None

    assert store.set_active("auditor", True)
    assert store.set_password("auditor", "replacement-password-456")
    assert store.authenticate("auditor", "first-password-123") is None
    assert store.authenticate("auditor", "replacement-password-456")["role"] == "auditor"


def test_usernames_are_case_insensitive_and_duplicates_are_rejected(tmp_path):
    store = UserCredentialStore(tmp_path / "users.sqlite3")
    store.create_user("Partner", "Parceiro", "strong-password-123", "developer")

    assert store.authenticate("partner", "strong-password-123") is not None
    try:
        store.create_user("partner", "Duplicado", "another-password-123", "auditor")
    except ValueError as exc:
        assert "Já existe" in str(exc)
    else:
        raise AssertionError("A criação de utilizador duplicado deveria falhar.")


@pytest.mark.asyncio
async def test_password_login_issues_http_only_session_cookie():
    import uuid

    from httpx import ASGITransport, AsyncClient

    from apps.api.auth import auth_service
    from apps.api.main import app

    username = "login_" + uuid.uuid4().hex[:10]
    auth_service.user_store.create_user(
        username=username,
        display_name="Login Test",
        password="test-password-12345",
        role="developer",
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/auth/password-login",
            json={"username": username, "password": "test-password-12345"},
        )
        assert response.status_code == 200
        assert response.json()["user_id"] == username
        assert response.cookies.get("jarvis_session")
        assert "httponly" in response.headers.get("set-cookie", "").lower()

        me = await client.get("/api/v1/auth/me")
        assert me.status_code == 200
        assert me.json()["user_id"] == username


def test_named_admin_account_cannot_disable_last_active_admin(tmp_path):
    store = UserCredentialStore(tmp_path / "users.sqlite3")
    store.create_user("owner", "Owner", "owner-password-123", "admin")

    try:
        store.set_active("owner", False)
    except ValueError as exc:
        assert "último administrador" in str(exc)
    else:
        raise AssertionError("O último administrador ativo não pode ser desativado.")

    assert store.authenticate("owner", "owner-password-123")["role"] == "admin"
