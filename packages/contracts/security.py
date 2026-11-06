from datetime import UTC, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ProjectWorkMode(str, Enum):
    READ_ONLY = "read_only"
    PLAN_ONLY = "plan_only"
    EDIT_APPROVED = "edit_approved"
    TEST_APPROVED = "test_approved"
    RELEASE_APPROVED = "release_approved"


class AuditEventSeverity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    SECURITY_ALERT = "SECURITY_ALERT"
    CRITICAL = "CRITICAL"


class AuditEvent(BaseModel):
    id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    severity: AuditEventSeverity = Field(default=AuditEventSeverity.INFO)
    user_id: str | None = "system"
    agent_role: str | None = None
    project_id: str | None = None
    operation: str
    tool_name: str | None = None
    parameters_redacted: dict[str, Any] = Field(default_factory=dict)
    status: str  # SUCCESS, DENIED, FAILED, PENDING_APPROVAL
    reason: str | None = None
