"""Authentication rate-limit repository contract tests."""

import sqlite3

from services.database.repositories.auth_rate_limit import (
    SqlAlchemyAuthRateLimitRepository,
    SqliteAuthRateLimitRepository,
)


def test_rate_limit_persists_across_repository_instances(tmp_path):
    path = tmp_path / "rate-limits.sqlite3"
    first = SqliteAuthRateLimitRepository(path)
    assert first.allow_attempt(key="login:127.0.0.1", limit=1, window_seconds=60)

    restarted = SqliteAuthRateLimitRepository(path)
    assert restarted.allow_attempt(key="login:127.0.0.1", limit=1, window_seconds=60) is False


def test_rate_limit_isolated_by_bucket(tmp_path):
    repository = SqliteAuthRateLimitRepository(tmp_path / "rate-limits.sqlite3")

    assert repository.allow_attempt(key="login:user-a", limit=1, window_seconds=60)
    assert repository.allow_attempt(key="login:user-b", limit=1, window_seconds=60)
    assert repository.allow_attempt(key="login:user-a", limit=1, window_seconds=60) is False


def test_rate_limit_fails_closed_when_storage_is_unavailable(tmp_path, monkeypatch):
    repository = SqliteAuthRateLimitRepository(tmp_path / "rate-limits.sqlite3")

    def unavailable():
        raise sqlite3.OperationalError("simulated storage failure")

    monkeypatch.setattr(repository, "_connect", unavailable)
    assert repository.allow_attempt(key="login:unknown", limit=8, window_seconds=60) is False


def test_sqlalchemy_auth_rate_limit_contract(tmp_path):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from services.database.models.auth_rate_limit import AuthAttempt
    from services.database.models.base import Base

    engine = create_engine(f"sqlite:///{tmp_path / 'rate-limits-sa.db'}")
    Base.metadata.create_all(engine, tables=[AuthAttempt.__table__])
    session_factory = sessionmaker(engine, expire_on_commit=False)
    repo = SqlAlchemyAuthRateLimitRepository(session_factory)

    assert repo.allow_attempt(key="login:user-1", limit=2, window_seconds=60) is True
    assert repo.allow_attempt(key="login:user-1", limit=2, window_seconds=60) is True
    assert repo.allow_attempt(key="login:user-1", limit=2, window_seconds=60) is False
    assert repo.allow_attempt(key="login:user-2", limit=2, window_seconds=60) is True

    # Fails closed on broken session factory
    broken_repo = SqlAlchemyAuthRateLimitRepository(lambda: None)
    assert broken_repo.allow_attempt(key="login:fail", limit=5, window_seconds=60) is False

    engine.dispose()
