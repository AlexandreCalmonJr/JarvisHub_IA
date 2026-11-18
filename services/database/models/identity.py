"""Human identity SQLAlchemy model for the PostgreSQL target schema."""

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class HumanUser(Base):
    __tablename__ = "human_users"

    username: Mapped[str] = mapped_column(Text, primary_key=True)
    username_normalized: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("username_normalized", name="uq_human_users_username_normalized"),
        CheckConstraint(
            "role IN ('admin', 'developer', 'auditor')", name="ck_human_users_role"
        ),
    )
