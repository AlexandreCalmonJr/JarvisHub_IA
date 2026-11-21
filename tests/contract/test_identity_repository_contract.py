"""Identity repository contract tests shared by future database adapters."""

from __future__ import annotations

import pytest

from services.security_core.auth_store import UserCredentialStore


@pytest.fixture
def identity_store(tmp_path):
    return UserCredentialStore(tmp_path / "identity.sqlite3")


def test_identity_repository_preserves_case_insensitive_usernames(identity_store):
    created = identity_store.create_user(
        "Operator", "Operator One", "correct horse battery staple", "admin"
    )
    assert created["username"] == "Operator"
    assert identity_store.get_user("operator")["role"] == "admin"

    with pytest.raises(ValueError, match="Já existe"):
        identity_store.create_user("operator", "Duplicate", "another password", "developer")


def test_identity_repository_authentication_keeps_pbkdf2_hashing(identity_store):
    identity_store.create_user("developer", "Developer", "strong-password", "developer")

    authenticated = identity_store.authenticate("DEVELOPER", "strong-password")
    assert authenticated is not None
    assert authenticated["role"] == "developer"
    assert "password_hash" not in authenticated
    assert identity_store.authenticate("developer", "wrong-password") is None
    assert identity_store.authenticate("missing", "wrong-password") is None


def test_identity_repository_prevents_disabling_last_active_admin(identity_store):
    identity_store.create_user("root", "Root", "root-password", "admin")

    with pytest.raises(ValueError, match="último administrador"):
        identity_store.set_active("root", False)

    assert identity_store.get_user("root")["is_active"] == 1


def test_identity_repository_allows_disabling_admin_when_another_is_active(identity_store):
    identity_store.create_user("root", "Root", "root-password", "admin")
    identity_store.create_user("backup", "Backup", "backup-password", "admin")

    assert identity_store.set_active("root", False) is True
    assert identity_store.get_user("root")["is_active"] == 0
    assert identity_store.get_user("backup")["is_active"] == 1


def test_sqlalchemy_identity_adapter_contract(tmp_path):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from services.database.models.base import Base
    from services.database.models.identity import HumanUser
    from services.database.repositories.identity import SqlAlchemyIdentityRepository

    engine = create_engine(f"sqlite:///{tmp_path / 'identity-sqlalchemy.db'}")
    Base.metadata.create_all(engine, tables=[HumanUser.__table__])
    session_factory = sessionmaker(engine, expire_on_commit=False)
    repository = SqlAlchemyIdentityRepository(session_factory)
    store = UserCredentialStore(tmp_path / "unused.sqlite3", repository=repository)

    store.create_user("SqlAdmin", "SQL Admin", "secure-password-123", "admin")
    assert store.authenticate("sqladmin", "secure-password-123")["role"] == "admin"
    with pytest.raises(ValueError, match="último administrador"):
        store.set_active("SQLADMIN", False)
    engine.dispose()
