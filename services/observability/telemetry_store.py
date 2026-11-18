"""Backward-compatible import for the telemetry repository adapter."""

from services.database.repositories.telemetry import (
    SqliteTelemetryRepository,
    TelemetryRepository,
)

# Keep the historical class name used by dependency wiring and external modules.
SqliteTelemetryStore = SqliteTelemetryRepository

__all__ = ["SqliteTelemetryRepository", "SqliteTelemetryStore", "TelemetryRepository"]
