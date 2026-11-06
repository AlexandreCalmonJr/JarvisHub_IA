from datetime import UTC, datetime
from enum import Enum

from pydantic import BaseModel, Field


class StackType(str, Enum):
    FLUTTER = "flutter"
    PYTHON = "python"
    REACT_TYPESCRIPT = "react_typescript"
    CSHARP = "csharp"
    SQL = "sql"
    GENERIC = "generic"


class FindingSeverity(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INFO = "INFO"


class FindingStatus(str, Enum):
    CONFIRMED = "CONFIRMED"
    SUSPICIOUS = "SUSPICIOUS"
    FALSE_POSITIVE = "FALSE_POSITIVE"


class SecurityFinding(BaseModel):
    rule_id: str
    severity: FindingSeverity
    status: FindingStatus = FindingStatus.CONFIRMED
    file_path: str | None = None
    line_number: int | None = None
    description: str
    snippet: str | None = None
    remediation: str | None = None


class PipelineGateResult(BaseModel):
    project_id: str
    stack: StackType
    passed: bool
    tests_passed: bool
    lint_passed: bool
    findings: list[SecurityFinding] = Field(default_factory=list)
    critical_count: int = 0
    high_count: int = 0
    summary: str
    evidence: list[str] = Field(default_factory=list)
    executed_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
