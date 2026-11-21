"""Settings repository contract and SQLite compatibility adapter."""

from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any, Protocol

from sqlalchemy import select

from services.database.models.settings import UserSetting


class SettingsRepository(Protocol):
    def get(self, key: str, owner_user_id: str | None = None) -> Any | None: ...

    def set(self, key: str, value: Any, owner_user_id: str | None = None) -> None: ...


class SqliteSettingsRepository:
    """Uses DatabaseManager's public settings API; no direct SQLite access."""

    def __init__(self, db_manager: Any):
        self._db = db_manager

    def get(self, key: str, owner_user_id: str | None = None) -> Any | None:
        return self._db.get_setting(key, owner_user_id=owner_user_id)

    def set(self, key: str, value: Any, owner_user_id: str | None = None) -> None:
        self._db.set_setting(key, value, owner_user_id=owner_user_id)


class SqlAlchemySettingsRepository:
    """SQLAlchemy adapter for account-scoped and global settings."""

    def __init__(self, session_factory: Any):
        self._session_factory = session_factory

    @staticmethod
    def _account_setting_key(key: str, owner_user_id: str | None) -> str:
        if owner_user_id and owner_user_id.strip():
            return f"usr:{owner_user_id.strip()}:{key.strip()}"
        return key.strip()

    @contextmanager
    def _session(self):
        if hasattr(self._session_factory, "begin"):
            with self._session_factory.begin() as session:
                yield session
        else:
            session = self._session_factory()
            try:
                with session.begin():
                    yield session
            finally:
                session.close()

    def get(self, key: str, owner_user_id: str | None = None) -> Any | None:
        effective_key = self._account_setting_key(key, owner_user_id)
        with self._session() as session:
            setting = session.scalar(
                select(UserSetting).where(UserSetting.key == effective_key)
            )
            if setting is None:
                return None
            try:
                return json.loads(setting.value_json)
            except Exception:
                return None

    def set(self, key: str, value: Any, owner_user_id: str | None = None) -> None:
        effective_key = self._account_setting_key(key, owner_user_id)
        now = datetime.now(UTC)
        val_json = json.dumps(value, ensure_ascii=False)
        with self._session() as session:
            setting = session.scalar(
                select(UserSetting).where(UserSetting.key == effective_key)
            )
            if setting is not None:
                setting.value_json = val_json
                setting.updated_at = now
            else:
                session.add(
                    UserSetting(
                        key=effective_key,
                        value_json=val_json,
                        updated_at=now,
                    )
                )
