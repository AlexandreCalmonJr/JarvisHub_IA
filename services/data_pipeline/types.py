from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class DataFormat(str, Enum):
    CSV = "csv"
    JSON = "json"
    SQLITE = "sqlite"


class QualityRule(BaseModel):
    column: str
    expected_type: str  # "int", "float", "str", "bool"
    allow_null: bool = True
    min_value: float | None = None
    max_value: float | None = None


class DataQualityReport(BaseModel):
    is_valid: bool
    total_rows: int
    total_columns: int
    null_counts: dict[str, int] = Field(default_factory=dict)
    duplicate_rows: int = 0
    violations: list[str] = Field(default_factory=list)
    summary_stats: dict[str, Any] = Field(default_factory=dict)


class ScheduledAutomation(BaseModel):
    id: str
    name: str
    interval_seconds: int
    task_func_name: str
    last_run_at: datetime | None = None
    runs_count: int = 0
    max_runs: int | None = None
    enabled: bool = True
