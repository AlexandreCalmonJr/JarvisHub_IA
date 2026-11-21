"""Persistence contracts and adapters for gradual backend migration."""

from .auth_rate_limit import (
    AuthRateLimitRepository,
    SqlAlchemyAuthRateLimitRepository,
    SqliteAuthRateLimitRepository,
)
from .identity import (
    IdentityRepository,
    SqlAlchemyIdentityRepository,
    SqliteIdentityRepository,
)
from .project_memory import (
    ProjectMemoryRepository,
    SqlAlchemyProjectMemoryRepository,
    SqliteProjectMemoryRepository,
)
from .settings import (
    SettingsRepository,
    SqlAlchemySettingsRepository,
    SqliteSettingsRepository,
)
from .telemetry import (
    SqlAlchemyTelemetryRepository,
    SqliteTelemetryRepository,
    TelemetryRepository,
)

__all__ = [
    "AuthRateLimitRepository",
    "IdentityRepository",
    "ProjectMemoryRepository",
    "SettingsRepository",
    "SqlAlchemyAuthRateLimitRepository",
    "SqlAlchemyIdentityRepository",
    "SqlAlchemyProjectMemoryRepository",
    "SqlAlchemySettingsRepository",
    "SqlAlchemyTelemetryRepository",
    "SqliteAuthRateLimitRepository",
    "SqliteIdentityRepository",
    "SqliteProjectMemoryRepository",
    "SqliteSettingsRepository",
    "SqliteTelemetryRepository",
    "TelemetryRepository",
]
