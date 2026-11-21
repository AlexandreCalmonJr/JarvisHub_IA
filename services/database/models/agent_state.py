"""Agent memory, configuration, routing and user-skill SQLAlchemy models."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, Integer, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class AgentMemory(Base):
    __tablename__ = "agent_memories"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    agent_role: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    key: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    importance: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    owner_user_id: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_agent_memories_role", "agent_role"),
        Index("ix_agent_memories_owner_user", "owner_user_id"),
        Index(
            "uq_agent_memories_legacy",
            "agent_role",
            "category",
            "key",
            unique=True,
            postgresql_where=text("owner_user_id IS NULL"),
            sqlite_where=text("owner_user_id IS NULL"),
        ),
        Index(
            "uq_agent_memories_owner",
            "owner_user_id",
            "agent_role",
            "category",
            "key",
            unique=True,
            postgresql_where=text("owner_user_id IS NOT NULL"),
            sqlite_where=text("owner_user_id IS NOT NULL"),
        ),
    )


class AgentConfig(Base):
    __tablename__ = "agent_configs"

    role: Mapped[str] = mapped_column(Text, primary_key=True)
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    preferred_model: Mapped[str | None] = mapped_column(Text, nullable=True)
    allowed_tools_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_read_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    assigned_key_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AgentRouteAssignment(Base):
    __tablename__ = "agent_route_assignments"

    owner_user_id: Mapped[str] = mapped_column(Text, primary_key=True)
    agent_role: Mapped[str] = mapped_column(Text, primary_key=True)
    key_id: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class UserSkill(Base):
    __tablename__ = "user_skills"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    version: Mapped[str] = mapped_column(Text, nullable=False, default="1.0.0")
    origin: Mapped[str] = mapped_column(Text, nullable=False, default="user_created")
    domain: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    instructions: Mapped[str] = mapped_column(Text, nullable=False)
    assigned_agents_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    is_approved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    owner_user_id: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (Index("ix_user_skills_owner_user", "owner_user_id"),)
