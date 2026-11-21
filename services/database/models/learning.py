"""Learning progress SQLAlchemy model."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class LearningProgress(Base):
    __tablename__ = "learning_progress"

    owner_user_id: Mapped[str] = mapped_column(Text, primary_key=True)
    completed_ids_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
