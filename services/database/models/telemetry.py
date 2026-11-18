"""SQLAlchemy models for privacy-scoped inference telemetry."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    Index,
    Integer,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class InferenceTelemetry(Base):
    __tablename__ = "inference_telemetry"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    owner_user_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    agent_role: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_name: Mapped[str] = mapped_column(Text, nullable=False)
    provider: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    duration_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    error_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_inference_telemetry_owner_created", "owner_user_id", "created_at"),
        Index("ix_inference_telemetry_task", "task_id"),
    )


class ModelSelectionDecision(Base):
    __tablename__ = "model_selection_decisions"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    owner_user_id: Mapped[str] = mapped_column(Text, nullable=False)
    task_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    agent_role: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_capability: Mapped[str | None] = mapped_column(Text, nullable=True)
    selected_model: Mapped[str] = mapped_column(Text, nullable=False)
    selected_provider: Mapped[str] = mapped_column(Text, nullable=False)
    selection_reason: Mapped[str] = mapped_column(Text, nullable=False)
    candidate_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    estimated_cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_model_selection_owner_created", "owner_user_id", "created_at"),
    )


class InferenceQualityFeedback(Base):
    __tablename__ = "inference_quality_feedback"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    owner_user_id: Mapped[str] = mapped_column(Text, nullable=False)
    inference_id: Mapped[str] = mapped_column(Text, nullable=False)
    model_name: Mapped[str] = mapped_column(Text, nullable=False)
    provider: Mapped[str] = mapped_column(Text, nullable=False)
    agent_role: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "owner_user_id", "inference_id", name="uq_quality_feedback_owner_inference"
        ),
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_quality_feedback_rating"),
        Index(
            "ix_quality_feedback_owner_model",
            "owner_user_id",
            "model_name",
            "provider",
            "agent_role",
        ),
    )
