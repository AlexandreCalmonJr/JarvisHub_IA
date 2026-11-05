from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone


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
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    severity: AuditEventSeverity = Field(default=AuditEventSeverity.INFO)
    user_id: Optional[str] = "system"
    agent_role: Optional[str] = None
    project_id: Optional[str] = None
    operation: str
    tool_name: Optional[str] = None
    parameters_redacted: Dict[str, Any] = Field(default_factory=dict)
    status: str  # SUCCESS, DENIED, FAILED, PENDING_APPROVAL
    reason: Optional[str] = None
