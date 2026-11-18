"""Persistence contracts and adapters for gradual backend migration."""

from .auth_rate_limit import AuthRateLimitRepository, SqliteAuthRateLimitRepository
from .identity import (
    IdentityRepository,
    SqlAlchemyIdentityRepository,
    SqliteIdentityRepository,
)
from .project_memory import ProjectMemoryRepository, SqliteProjectMemoryRepository
from .settings import SettingsRepository, SqliteSettingsRepository
from .telemetry import SqliteTelemetryRepository, TelemetryRepository

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
