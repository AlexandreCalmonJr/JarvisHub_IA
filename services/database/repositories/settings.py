"""Settings repository contract and SQLite compatibility adapter."""

from __future__ import annotations

from typing import Any, Protocol


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
