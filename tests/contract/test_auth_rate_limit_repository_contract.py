"""Authentication rate-limit repository contract tests."""
import sqlite3

from services.database.repositories.auth_rate_limit import SqliteAuthRateLimitRepository


def test_rate_limit_persists_across_repository_instances(tmp_path):
    path = tmp_path / "rate-limits.sqlite3"
    first = SqliteAuthRateLimitRepository(path)
    assert first.allow_attempt(key="login:127.0.0.1", limit=1, window_seconds=60)

    restarted = SqliteAuthRateLimitRepository(path)
    assert restarted.allow_attempt(
        key="login:127.0.0.1", limit=1, window_seconds=60
    ) is False


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
