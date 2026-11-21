"""Authentication rate-limit SQLAlchemy model."""

from sqlalchemy import BigInteger, Float, Identity, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class AuthAttempt(Base):
    __tablename__ = "auth_attempts"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), Identity(), primary_key=True, autoincrement=True
    )
    bucket_key: Mapped[str] = mapped_column(Text, nullable=False)
    attempted_at: Mapped[float] = mapped_column(Float, nullable=False)

    __table_args__ = (Index("ix_auth_attempts_key_time", "bucket_key", "attempted_at"),)
