"""Persistence contracts and adapters for gradual backend migration."""

from .repositories import (
    AuthRateLimitRepository,
    IdentityRepository,
    ProjectMemoryRepository,
    SettingsRepository,
    SqlAlchemyIdentityRepository,
    SqliteAuthRateLimitRepository,
    SqliteIdentityRepository,
    SqliteProjectMemoryRepository,
    SqliteSettingsRepository,
    SqliteTelemetryRepository,
    TelemetryRepository,
)

__all__ = [
    "AuthRateLimitRepository",
    "IdentityRepository",
    "ProjectMemoryRepository",
    "SettingsRepository",
    "SqlAlchemyIdentityRepository",
    "SqliteAuthRateLimitRepository",
    "SqliteIdentityRepository",
    "SqliteProjectMemoryRepository",
    "SqliteSettingsRepository",
    "SqliteTelemetryRepository",
    "TelemetryRepository",
]
