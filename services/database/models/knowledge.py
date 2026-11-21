"""Knowledge vault SQLAlchemy model."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class KnowledgeVaultEntry(Base):
    __tablename__ = "knowledge_vault"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    doc_name: Mapped[str] = mapped_column(Text, nullable=False)
    file_type: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False, default="geral")
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    file_size_formatted: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    owner_user_id: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_kv_doc", "doc_name"),
        Index("ix_kv_cat", "category"),
        Index("ix_knowledge_vault_owner_user", "owner_user_id"),
    )
