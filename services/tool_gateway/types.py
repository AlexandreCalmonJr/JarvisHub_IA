from datetime import UTC, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ToolCategory(str, Enum):
    READ_ONLY = "read_only"
    SEARCH = "search"
    GIT_READ = "git_read"
    TEST_RUNNER = "test_runner"
    LINTER = "linter"
    MUTATION = "mutation"


class ToolDefinition(BaseModel):
    name: str
    description: str
    category: ToolCategory
    requires_approval: bool = False
    allowed_roles: list[str] = Field(default_factory=list)


class ToolExecutionRequest(BaseModel):
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    agent_role: str
    project_id: str
    task_id: str | None = None
    approval_id: str | None = None


class ToolExecutionResult(BaseModel):
    tool_name: str
    success: bool
    exit_code: int = 0
    stdout: str = ""
    stderr: str = ""
    duration_ms: float = 0.0
    redacted: bool = True
    error_message: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
