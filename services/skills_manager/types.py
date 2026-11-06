from datetime import UTC, datetime

from pydantic import BaseModel, Field


class SkillMetadata(BaseModel):
    """Metadados e integridade de uma skill no JARVIS AI HUB."""

    id: str
    name: str
    version: str
    origin: str  # "internal" ou URL com commit específico
    license: str
    description: str
    domain: str  # flutter, web, backend, data, security, ops, management
    allowed_tools: list[str] = Field(default_factory=list)
    required_permissions: list[str] = Field(default_factory=list)
    assigned_agents: list[str] = Field(default_factory=list)
    content_hash: str
    is_approved: bool = False
    is_revoked: bool = False
    instructions: str
    templates: dict[str, str] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
