from datetime import UTC, datetime

from pydantic import BaseModel, Field


class SystemResourceUsage(BaseModel):
    cpu_percent: float
    ram_used_mb: float
    ram_total_mb: float
    ram_percent: float
    disk_free_gb: float
    disk_total_gb: float
    disk_percent: float
    inference_queue_active: int = 0
    inference_queue_waiting: int = 0
    is_throttled: bool = False
    offline_mode_active: bool = True
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ResourceBudget(BaseModel):
    max_ram_percent: float = 85.0
    min_disk_free_gb: float = 5.0
    max_cpu_percent: float = 95.0
    max_active_inferences: int = 1
