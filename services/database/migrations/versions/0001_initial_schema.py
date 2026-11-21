"""Initial relational schema for identity, workspace, settings and telemetry.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-11-19

The schema mirrors the SQLAlchemy models in ``services/database/models``.
Legacy SQLite tables are not modified by this migration; data import is a
separate, explicit step.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "human_users",
        sa.Column("username", sa.Text(), nullable=False),
        sa.Column("username_normalized", sa.Text(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("role IN ('admin', 'developer', 'auditor')", name="ck_human_users_role"),
        sa.PrimaryKeyConstraint("username"),
        sa.UniqueConstraint("username_normalized", name="uq_human_users_username_normalized"),
    )

    op.create_table(
        "auth_attempts",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("bucket_key", sa.Text(), nullable=False),
        sa.Column("attempted_at", sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_auth_attempts_key_time",
        "auth_attempts",
        ["bucket_key", "attempted_at"],
        unique=False,
    )

    op.create_table(
        "projects",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("root_path", sa.Text(), nullable=False),
        sa.Column("mode", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("owner_user_id", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_projects_owner_updated",
        "projects",
        ["owner_user_id", "updated_at"],
        unique=False,
    )

    op.create_table(
        "project_memory",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sources_json", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("owner_user_id", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "project_id",
            "category",
            "key",
            name="uq_project_memory_project_category_key",
        ),
    )
    op.create_index(
        "ix_project_memory_owner_project",
        "project_memory",
        ["owner_user_id", "project_id"],
        unique=False,
    )

    op.create_table(
        "user_settings",
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("value_json", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )

    op.create_table(
        "inference_telemetry",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("owner_user_id", sa.Text(), nullable=True),
        sa.Column("task_id", sa.Text(), nullable=True),
        sa.Column("agent_role", sa.Text(), nullable=True),
        sa.Column("model_name", sa.Text(), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("duration_ms", sa.Float(), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False),
        sa.Column("completion_tokens", sa.Integer(), nullable=False),
        sa.Column("cost_usd", sa.Float(), nullable=False),
        sa.Column("error_type", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_inference_telemetry_owner_created",
        "inference_telemetry",
        ["owner_user_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_inference_telemetry_task",
        "inference_telemetry",
        ["task_id"],
        unique=False,
    )

    op.create_table(
        "model_selection_decisions",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("owner_user_id", sa.Text(), nullable=False),
        sa.Column("task_id", sa.Text(), nullable=True),
        sa.Column("agent_role", sa.Text(), nullable=True),
        sa.Column("task_capability", sa.Text(), nullable=True),
        sa.Column("selected_model", sa.Text(), nullable=False),
        sa.Column("selected_provider", sa.Text(), nullable=False),
        sa.Column("selection_reason", sa.Text(), nullable=False),
        sa.Column("candidate_count", sa.Integer(), nullable=False),
        sa.Column("estimated_cost_usd", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_model_selection_owner_created",
        "model_selection_decisions",
        ["owner_user_id", "created_at"],
        unique=False,
    )

    op.create_table(
        "inference_quality_feedback",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("owner_user_id", sa.Text(), nullable=False),
        sa.Column("inference_id", sa.Text(), nullable=False),
        sa.Column("model_name", sa.Text(), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("agent_role", sa.Text(), nullable=True),
        sa.Column("task_id", sa.Text(), nullable=True),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_quality_feedback_rating"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "owner_user_id",
            "inference_id",
            name="uq_quality_feedback_owner_inference",
        ),
    )
    op.create_index(
        "ix_quality_feedback_owner_model",
        "inference_quality_feedback",
        ["owner_user_id", "model_name", "provider", "agent_role"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_quality_feedback_owner_model",
        table_name="inference_quality_feedback",
    )
    op.drop_table("inference_quality_feedback")

    op.drop_index("ix_model_selection_owner_created", table_name="model_selection_decisions")
    op.drop_table("model_selection_decisions")

    op.drop_index("ix_inference_telemetry_task", table_name="inference_telemetry")
    op.drop_index("ix_inference_telemetry_owner_created", table_name="inference_telemetry")
    op.drop_table("inference_telemetry")

    op.drop_table("user_settings")

    op.drop_index("ix_project_memory_owner_project", table_name="project_memory")
    op.drop_table("project_memory")

    op.drop_index("ix_projects_owner_updated", table_name="projects")
    op.drop_table("projects")

    op.drop_index("ix_auth_attempts_key_time", table_name="auth_attempts")
    op.drop_table("auth_attempts")

    op.drop_table("human_users")
