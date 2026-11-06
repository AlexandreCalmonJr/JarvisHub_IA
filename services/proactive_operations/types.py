from datetime import UTC, datetime

from pydantic import BaseModel, Field


class ProactivePolicy(BaseModel):
    enabled: bool = True
    max_cpu_percent: float = 50.0
    max_inspections_per_day: int = 24
    current_inspections_today: int = 0
    allowed_start_hour: int = 0  # 0h às 24h permitido por padrão
    allowed_end_hour: int = 24
    require_human_approval_for_all_changes: bool = True


class ProactiveFinding(BaseModel):
    id: str
    project_id: str
    title: str
    description: str
    severity: str = "MEDIUM"  # LOW, MEDIUM, HIGH, CRITICAL
    proposed_patch: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    approval_request_id: str | None = None
