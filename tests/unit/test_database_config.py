"""Database backend configuration is explicit and fail-closed."""

from __future__ import annotations

import pytest

from services.database.config import (
    DatabaseConfigurationError,
    DatabaseSettings,
    ensure_sqlite_runtime,
    mask_database_url,
    normalize_postgres_url,
    settings_from_url,
)


def test_default_backend_is_sqlite_without_fallback_surprises(tmp_path):
    settings = DatabaseSettings.from_env(
        {"JARVIS_DATA_DIR": str(tmp_path / "data")}, require_explicit_url=False
    )

    assert settings.backend == "sqlite"
    assert settings.url.startswith("sqlite:///")
    assert settings.url.endswith("jarvis.db")


def test_sqlite_path_can_be_configured_directly(tmp_path):
    settings = DatabaseSettings.from_env({"JARVIS_DATABASE_PATH": str(tmp_path / "custom.db")})

    assert settings.backend == "sqlite"
    assert settings.url.endswith("custom.db")


def test_postgresql_requires_an_explicit_url():
    with pytest.raises(DatabaseConfigurationError, match="exige"):
        DatabaseSettings.from_env({"JARVIS_DATABASE_BACKEND": "postgresql"})


def test_postgresql_aliases_are_normalized_to_psycopg():
    for alias in (
        "postgres://user:pass@localhost:5432/db",
        "postgresql://user:pass@localhost:5432/db",
        "postgresql+asyncpg://user:pass@localhost:5432/db",
    ):
        assert normalize_postgres_url(alias) == "postgresql+psycopg://user:pass@localhost:5432/db"


def test_explicit_sqlite_backend_rejects_a_postgresql_url():
    with pytest.raises(DatabaseConfigurationError, match="contradiz"):
        DatabaseSettings.from_env(
            {
                "JARVIS_DATABASE_BACKEND": "sqlite",
                "JARVIS_DATABASE_URL": "postgresql://user:pass@localhost/db",
            }
        )


def test_invalid_backend_and_pool_values_are_rejected():
    with pytest.raises(DatabaseConfigurationError, match="JARVIS_DATABASE_BACKEND"):
        DatabaseSettings.from_env({"JARVIS_DATABASE_BACKEND": "mysql"})

    with pytest.raises(DatabaseConfigurationError, match="POOL_SIZE"):
        DatabaseSettings.from_env({"JARVIS_DATABASE_POOL_SIZE": "zero"})


def test_migrations_require_an_explicit_url():
    with pytest.raises(DatabaseConfigurationError, match="migrações"):
        DatabaseSettings.from_env({}, require_explicit_url=True)


def test_runtime_guard_accepts_sqlite_defaults():
    ensure_sqlite_runtime({})


def test_runtime_guard_rejects_configured_postgresql():
    with pytest.raises(DatabaseConfigurationError, match="runtime"):
        ensure_sqlite_runtime(
            {
                "JARVIS_DATABASE_BACKEND": "postgresql",
                "JARVIS_DATABASE_URL": "postgresql://user:pass@localhost/jarvis",
            }
        )


def test_database_manager_refuses_postgresql_without_creating_a_file(tmp_path, monkeypatch):
    from services.memory.database import DatabaseManager

    monkeypatch.setenv("JARVIS_DATABASE_BACKEND", "postgresql")
    monkeypatch.setenv("JARVIS_DATABASE_URL", "postgresql://user:pass@localhost/jarvis")
    target = tmp_path / "jarvis.db"

    with pytest.raises(DatabaseConfigurationError, match="runtime"):
        DatabaseManager(db_path=str(target))

    assert not target.exists()


def test_mask_database_url_hides_the_password():
    masked = mask_database_url("postgresql+psycopg://user:super-secret@localhost:5432/db")

    assert "super-secret" not in masked
    assert "user" in masked
    assert "db" in masked


def test_settings_from_url_supports_sqlite_and_postgresql(tmp_path):
    sqlite_settings = settings_from_url(f"sqlite:///{tmp_path / 'db.sqlite'}")
    assert sqlite_settings.backend == "sqlite"

    postgres_settings = settings_from_url("postgresql://user:pass@localhost:5432/jarvis_test")
    assert postgres_settings.backend == "postgresql"
    assert postgres_settings.url.startswith("postgresql+psycopg://")

    with pytest.raises(DatabaseConfigurationError):
        settings_from_url("mysql://user:pass@localhost/db")
