"""Remaining domain tables for the controlled SQLite → PostgreSQL import.

Revision ID: 0002_remaining_domains
Revises: 0001_initial_schema
Create Date: 2026-11-20

The tables mirror the SQLAlchemy models in ``services/database/models`` for the
domains that still lived only in the legacy SQLite files. No legacy table is
modified by this migration; data import remains a separate, explicit step.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_remaining_domains"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tasks",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("session_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=True),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("intent", sa.Text(), nullable=True),
        sa.Column("state_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("is_completed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("owner_user_id", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tasks_session", "tasks", ["session_id"], unique=False)
    op.create_index("ix_tasks_created", "tasks", ["created_at"], unique=False)
    op.create_index("ix_tasks_project", "tasks", ["project_id"], unique=False)
    op.create_index("ix_tasks_owner_user", "tasks", ["owner_user_id"], unique=False)

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("session_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=True),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("tool_calls_json", sa.Text(), nullable=True),
        sa.Column("tool_call_id", sa.Text(), nullable=True),
        sa.Column("tool_name", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("owner_user_id", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_chat_messages_session",
        "chat_messages",
        ["session_id", "id"],
        unique=False,
    )
    op.create_index(
        "ix_chat_messages_owner_user",
        "chat_messages",
        ["owner_user_id"],
        unique=False,
    )

    op.create_table(
        "approvals",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("task_id", sa.Text(), nullable=False),
        sa.Column("agent_role", sa.Text(), nullable=False),
        sa.Column("operation", sa.Text(), nullable=False),
        sa.Column("impact_summary", sa.Text(), nullable=False),
        sa.Column("affected_resources_json", sa.Text(), nullable=False),
        sa.Column("proposed_diff", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("decided_by", sa.Text(), nullable=True),
        sa.Column("decision_reason", sa.Text(), nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reversible", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("owner_user_id", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_approvals_task", "approvals", ["task_id"], unique=False)
    op.create_index("ix_approvals_status", "approvals", ["status"], unique=False)
    op.create_index("ix_approvals_owner_user", "approvals", ["owner_user_id"], unique=False)

    op.create_table(
        "agent_memories",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("agent_role", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("context", sa.Text(), nullable=True),
        sa.Column("importance", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("owner_user_id", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_memories_role", "agent_memories", ["agent_role"], unique=False)
    op.create_index(
        "ix_agent_memories_owner_user",
        "agent_memories",
        ["owner_user_id"],
        unique=False,
    )
    op.create_index(
        "uq_agent_memories_legacy",
        "agent_memories",
        ["agent_role", "category", "key"],
        unique=True,
        postgresql_where=sa.text("owner_user_id IS NULL"),
        sqlite_where=sa.text("owner_user_id IS NULL"),
    )
    op.create_index(
        "uq_agent_memories_owner",
        "agent_memories",
        ["owner_user_id", "agent_role", "category", "key"],
        unique=True,
        postgresql_where=sa.text("owner_user_id IS NOT NULL"),
        sqlite_where=sa.text("owner_user_id IS NOT NULL"),
    )

    op.create_table(
        "agent_configs",
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("system_prompt", sa.Text(), nullable=True),
        sa.Column("preferred_model", sa.Text(), nullable=True),
        sa.Column("allowed_tools_json", sa.Text(), nullable=True),
        sa.Column("is_read_only", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("assigned_key_id", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("role"),
    )

    op.create_table(
        "agent_route_assignments",
        sa.Column("owner_user_id", sa.Text(), nullable=False),
        sa.Column("agent_role", sa.Text(), nullable=False),
        sa.Column("key_id", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("owner_user_id", "agent_role"),
    )

    op.create_table(
        "user_skills",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("version", sa.Text(), nullable=False, server_default="1.0.0"),
        sa.Column("origin", sa.Text(), nullable=False, server_default="user_created"),
        sa.Column("domain", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=False),
        sa.Column("assigned_agents_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("is_approved", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("owner_user_id", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_user_skills_owner_user",
        "user_skills",
        ["owner_user_id"],
        unique=False,
    )

    op.create_table(
        "knowledge_vault",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("doc_name", sa.Text(), nullable=False),
        sa.Column("file_type", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=False, server_default="geral"),
        sa.Column("chunk_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("file_size_formatted", sa.Text(), nullable=True),
        sa.Column("source_path", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("owner_user_id", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_kv_doc", "knowledge_vault", ["doc_name"], unique=False)
    op.create_index("ix_kv_cat", "knowledge_vault", ["category"], unique=False)
    op.create_index(
        "ix_knowledge_vault_owner_user",
        "knowledge_vault",
        ["owner_user_id"],
        unique=False,
    )

    op.create_table(
        "mobile_devices",
        sa.Column("device_id", sa.Text(), nullable=False),
        sa.Column("device_name", sa.Text(), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("scopes_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("is_revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("paired_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("owner_user_id", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("device_id"),
        sa.UniqueConstraint("token_hash", name="uq_mobile_devices_token_hash"),
    )
    op.create_index("ix_devices_hash", "mobile_devices", ["token_hash"], unique=False)
    op.create_index("ix_devices_revoked", "mobile_devices", ["is_revoked"], unique=False)
    op.create_index("ix_devices_owner_user", "mobile_devices", ["owner_user_id"], unique=False)

    op.create_table(
        "user_sessions",
        sa.Column("session_id", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("scopes_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.PrimaryKeyConstraint("session_id"),
    )
    op.create_index("ix_sessions_user", "user_sessions", ["user_id"], unique=False)
    op.create_index("ix_sessions_expires", "user_sessions", ["expires_at"], unique=False)
    op.create_index("ix_sessions_revoked", "user_sessions", ["is_revoked"], unique=False)

    op.create_table(
        "audit_events",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("severity", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=True),
        sa.Column("agent_role", sa.Text(), nullable=True),
        sa.Column("project_id", sa.Text(), nullable=True),
        sa.Column("operation", sa.Text(), nullable=False),
        sa.Column("tool_name", sa.Text(), nullable=True),
        sa.Column("parameters_redacted_json", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_timestamp", "audit_events", ["timestamp"], unique=False)
    op.create_index("ix_audit_operation", "audit_events", ["operation"], unique=False)

    op.create_table(
        "mock_endpoints",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("method", sa.Text(), nullable=False, server_default="GET"),
        sa.Column("path", sa.Text(), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False, server_default="200"),
        sa.Column("response_body", sa.Text(), nullable=False),
        sa.Column("headers_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("owner_user_id", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mock_method_path", "mock_endpoints", ["method", "path"], unique=False)
    op.create_index(
        "ix_mock_owner_method_path",
        "mock_endpoints",
        ["owner_user_id", "method", "path"],
        unique=False,
    )

    op.create_table(
        "learning_progress",
        sa.Column("owner_user_id", sa.Text(), nullable=False),
        sa.Column("completed_ids_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("owner_user_id"),
    )

    op.create_table(
        "inference_cache",
        sa.Column("prompt_hash", sa.Text(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("model_name", sa.Text(), nullable=False),
        sa.Column("response_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("hit_count", sa.Integer(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("prompt_hash"),
    )


def downgrade() -> None:
    op.drop_table("inference_cache")
    op.drop_table("learning_progress")
    op.drop_table("mock_endpoints")
    op.drop_table("audit_events")
    op.drop_table("user_sessions")
    op.drop_table("mobile_devices")
    op.drop_table("knowledge_vault")
    op.drop_table("user_skills")
    op.drop_table("agent_route_assignments")
    op.drop_table("agent_configs")
    op.drop_table("agent_memories")
    op.drop_table("chat_messages")
    op.drop_table("approvals")
    op.drop_table("tasks")
