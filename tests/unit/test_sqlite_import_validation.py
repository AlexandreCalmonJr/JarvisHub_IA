"""Validation and snapshot-safety tests for the SQLite → PostgreSQL importer."""

from __future__ import annotations

import json
import sqlite3

import pytest

from services.database.config import settings_from_url
from services.database.migration.importer import (
    SOURCE_LAYOUT,
    VALIDATORS,
    MigrationError,
    MigrationReport,
    SnapshotStore,
    ValidationContext,
    run_migration,
)


def _valid_user(**overrides):
    row = {
        "username": "Admin",
        "display_name": "Administrador",
        "password_hash": "pbkdf2_sha256$600000$salt$hash",
        "role": "admin",
        "is_active": 1,
        "created_at": "2026-01-02 03:04:05",
        "updated_at": "2026-01-02T03:04:05+00:00",
    }
    row.update(overrides)
    return row


def _valid_project(**overrides):
    row = {
        "id": "proj-1",
        "name": "Projeto",
        "root_path": "C:/work/proj",
        "mode": "read_only",
        "created_at": "2026-01-02T03:04:05+00:00",
        "updated_at": "2026-01-02T03:04:05+00:00",
        "owner_user_id": "admin",
    }
    row.update(overrides)
    return row


def _valid_memory(**overrides):
    row = {
        "id": "mem-1",
        "project_id": "proj-1",
        "category": "decision",
        "key": "stack",
        "content": "FastAPI",
        "sources_json": "[]",
        "updated_at": "2026-01-02T03:04:05+00:00",
        "owner_user_id": "admin",
    }
    row.update(overrides)
    return row


def _valid_telemetry(**overrides):
    row = {
        "id": "inf-1",
        "owner_user_id": "admin",
        "task_id": "task-1",
        "agent_role": "developer",
        "model_name": "model",
        "provider": "provider",
        "status": "success",
        "duration_ms": 12.5,
        "prompt_tokens": 10,
        "completion_tokens": 5,
        "cost_usd": 0.001,
        "error_type": None,
        "created_at": "2026-01-02T03:04:05+00:00",
    }
    row.update(overrides)
    return row


def _valid_feedback(**overrides):
    row = {
        "id": "fb-1",
        "owner_user_id": "admin",
        "inference_id": "inf-1",
        "model_name": "model",
        "provider": "provider",
        "agent_role": "developer",
        "task_id": "task-1",
        "rating": 5,
        "created_at": "2026-01-02T03:04:05+00:00",
    }
    row.update(overrides)
    return row


def test_human_user_is_normalized_and_dates_become_utc_aware():
    value, errors = VALIDATORS["human_users"](_valid_user(), ValidationContext())

    assert errors == []
    assert value["username_normalized"] == "admin"
    assert value["is_active"] is True
    assert value["created_at"].utcoffset().total_seconds() == 0
    assert value["updated_at"].utcoffset().total_seconds() == 0


def test_human_user_rejects_invalid_role_and_missing_password():
    value, errors = VALIDATORS["human_users"](
        _valid_user(role="superuser", password_hash=""),
        ValidationContext(),
    )

    assert value is None
    assert any("role" in error for error in errors)
    assert any("password_hash" in error for error in errors)


def test_human_users_casefold_collision_is_rejected():
    ctx = ValidationContext()
    first, first_errors = VALIDATORS["human_users"](_valid_user(), ctx)
    second, second_errors = VALIDATORS["human_users"](
        _valid_user(username="admin", display_name="Outro"), ctx
    )

    assert first_errors == []
    assert first is not None
    assert second is None
    assert any("normalização" in error for error in second_errors)


def test_project_memory_requires_an_existing_project():
    ctx = ValidationContext()
    value, errors = VALIDATORS["project_memory"](_valid_memory(), ctx)

    assert value is None
    assert any("projeto inexistente" in error for error in errors)

    ctx.projects.add("proj-1")
    value, errors = VALIDATORS["project_memory"](_valid_memory(), ctx)

    assert errors == []
    assert value["project_id"] == "proj-1"


def test_project_memory_duplicate_key_is_rejected():
    ctx = ValidationContext()
    ctx.projects.add("proj-1")

    first, first_errors = VALIDATORS["project_memory"](_valid_memory(), ctx)
    second, second_errors = VALIDATORS["project_memory"](_valid_memory(id="mem-2"), ctx)

    assert first_errors == []
    assert first is not None
    assert second is None
    assert any("duplicada" in error for error in second_errors)


def test_user_settings_require_valid_json():
    valid, valid_errors = VALIDATORS["user_settings"](
        {
            "key": "theme",
            "value_json": '"dark"',
            "updated_at": "2026-01-02T03:04:05+00:00",
        },
        ValidationContext(),
    )
    invalid, invalid_errors = VALIDATORS["user_settings"](
        {
            "key": "broken",
            "value_json": "{not-json",
            "updated_at": "2026-01-02T03:04:05+00:00",
        },
        ValidationContext(),
    )

    assert valid_errors == []
    assert valid is not None
    assert invalid is None
    assert any("JSON inválido" in error for error in invalid_errors)


def test_telemetry_rejects_invalid_status_and_negative_numbers():
    value, errors = VALIDATORS["inference_telemetry"](
        _valid_telemetry(status="timeout", cost_usd=-1, prompt_tokens=-2),
        ValidationContext(),
    )

    assert value is None
    assert any("status" in error for error in errors)
    assert any("cost_usd" in error for error in errors)
    assert any("prompt_tokens" in error for error in errors)


def test_feedback_requires_a_matching_telemetry_owner():
    ctx = ValidationContext()
    ctx.telemetry_owners["inf-1"] = "other-user"

    value, errors = VALIDATORS["inference_quality_feedback"](_valid_feedback(), ctx)

    assert value is None
    assert any("proprietário" in error for error in errors)

    ctx.telemetry_owners["inf-1"] = "admin"
    value, errors = VALIDATORS["inference_quality_feedback"](_valid_feedback(), ctx)

    assert errors == []
    assert value["rating"] == 5


def test_feedback_rejects_out_of_range_rating():
    ctx = ValidationContext()
    ctx.telemetry_owners["inf-1"] = "admin"

    value, errors = VALIDATORS["inference_quality_feedback"](_valid_feedback(rating=6), ctx)

    assert value is None
    assert any("rating" in error for error in errors)


def test_model_selection_requires_owner_and_non_negative_cost():
    value, errors = VALIDATORS["model_selection_decisions"](
        {
            "id": "sel-1",
            "owner_user_id": "",
            "task_id": None,
            "agent_role": None,
            "task_capability": None,
            "selected_model": "model",
            "selected_provider": "provider",
            "selection_reason": "reason",
            "candidate_count": -1,
            "estimated_cost_usd": -0.1,
            "created_at": "2026-01-02T03:04:05+00:00",
        },
        ValidationContext(),
    )

    assert value is None
    assert any("owner_user_id" in error for error in errors)
    assert any("candidate_count" in error for error in errors)
    assert any("estimated_cost_usd" in error for error in errors)


def test_auth_attempts_are_opt_in_and_reject_negative_timestamps():
    spec = next(item for item in SOURCE_LAYOUT if item.table == "auth_attempts")
    assert spec.include_by_default is False

    value, errors = VALIDATORS["auth_attempts"](
        {"bucket_key": "ip:127.0.0.1", "attempted_at": -1},
        ValidationContext(),
    )

    assert value is None
    assert any("attempted_at" in error for error in errors)


def test_auth_attempts_accept_repeated_bucket_timestamps():
    ctx = ValidationContext()
    row = {"bucket_key": "ip:127.0.0.1", "attempted_at": 1700000000.0}

    first, first_errors = VALIDATORS["auth_attempts"](row, ctx)
    second, second_errors = VALIDATORS["auth_attempts"](row, ctx)

    assert first_errors == []
    assert second_errors == []
    assert first == second == {"bucket_key": "ip:127.0.0.1", "attempted_at": 1700000000.0}


def test_snapshot_store_copies_without_touching_the_source(tmp_path):
    source_dir = tmp_path / "data"
    source_dir.mkdir()
    source = source_dir / "app.db"
    with sqlite3.connect(source) as connection:
        connection.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)")
        connection.execute("INSERT INTO items (name) VALUES ('original')")
    original_bytes = source.read_bytes()

    store = SnapshotStore(source_dir, tmp_path / "backups")
    snapshot = store.get("app.db")

    assert snapshot is not None
    assert source.read_bytes() == original_bytes
    assert snapshot.copy.exists()
    assert snapshot.quick_check == "ok"
    assert snapshot.table_count("items") == 1
    with snapshot.connect() as connection:
        assert connection.execute("SELECT name FROM items").fetchone()[0] == "original"


def test_importer_refuses_a_sqlite_target(tmp_path):
    settings = settings_from_url(f"sqlite:///{(tmp_path / 'target.db').as_posix()}")

    with pytest.raises(MigrationError, match="deve ser PostgreSQL"):
        run_migration(settings, source_dir=tmp_path, backup_dir=tmp_path / "backups")


def test_report_masks_the_target_password():
    report = MigrationReport(
        dry_run=True,
        source_dir="data",
        target_url="postgresql+psycopg://user:super-secret@localhost:5432/db",
    )

    serialized = json.dumps(report.to_dict())

    assert "super-secret" not in serialized
    assert "postgresql+psycopg://user" in serialized


def test_tasks_preserve_raw_prompt_and_require_an_existing_project():
    ctx = ValidationContext()
    ctx.projects.add("proj-1")
    prompt = "  linha 1\nlinha 2  "
    value, errors = VALIDATORS["tasks"](
        {
            "id": "task-1",
            "session_id": "sess-1",
            "project_id": "proj-1",
            "prompt": prompt,
            "intent": "build",
            "state_json": "{}",
            "is_completed": 0,
            "created_at": "2026-01-02T03:04:05+00:00",
            "updated_at": "2026-01-02T03:04:05+00:00",
            "owner_user_id": None,
        },
        ctx,
    )

    assert errors == []
    assert value["prompt"] == prompt
    assert value["is_completed"] is False

    value, errors = VALIDATORS["tasks"](
        {
            "id": "task-2",
            "session_id": "sess-1",
            "project_id": "missing",
            "prompt": "x",
            "state_json": "{}",
            "is_completed": 0,
            "created_at": "2026-01-02T03:04:05+00:00",
            "updated_at": "2026-01-02T03:04:05+00:00",
        },
        ValidationContext(),
    )

    assert value is None
    assert any("projeto inexistente" in error for error in errors)


def test_chat_messages_preserve_content_and_reject_duplicate_ids():
    ctx = ValidationContext()
    row = {
        "id": 1,
        "session_id": "chat-1",
        "project_id": None,
        "role": "assistant",
        "content": "  resposta  ",
        "tool_calls_json": None,
        "tool_call_id": None,
        "tool_name": None,
        "created_at": "2026-01-02T03:04:05+00:00",
        "owner_user_id": None,
    }

    first, first_errors = VALIDATORS["chat_messages"](row, ctx)
    second, second_errors = VALIDATORS["chat_messages"](row, ctx)

    assert first_errors == []
    assert first["content"] == "  resposta  "
    assert second is None
    assert any("chave primária duplicada" in error for error in second_errors)


def test_approvals_require_existing_tasks_and_preserve_diffs():
    ctx = ValidationContext()
    ctx.tasks.add("task-1")
    row = {
        "id": "appr-1",
        "task_id": "task-1",
        "agent_role": "developer",
        "operation": "write",
        "impact_summary": "Alterar ficheiro",
        "affected_resources_json": '["a.py"]',
        "proposed_diff": "  -a\n+ b  ",
        "status": "pending",
        "decided_by": None,
        "decision_reason": None,
        "requested_at": "2026-01-02T03:04:05+00:00",
        "decided_at": None,
        "reversible": 1,
        "owner_user_id": None,
    }

    value, errors = VALIDATORS["approvals"](row, ctx)

    assert errors == []
    assert value["proposed_diff"] == "  -a\n+ b  "
    assert value["decided_at"] is None

    value, errors = VALIDATORS["approvals"](row, ValidationContext())

    assert value is None
    assert any("tarefa inexistente" in error for error in errors)


def test_agent_memories_scope_uniqueness_by_owner():
    ctx = ValidationContext()
    legacy = {
        "id": "mem-1",
        "agent_role": "jarvis",
        "category": "decision",
        "key": "stack",
        "content": "  FastAPI  ",
        "context": None,
        "importance": 1,
        "created_at": "2026-01-02T03:04:05+00:00",
        "updated_at": "2026-01-02T03:04:05+00:00",
        "owner_user_id": None,
    }

    first, first_errors = VALIDATORS["agent_memories"](legacy, ctx)
    duplicate, duplicate_errors = VALIDATORS["agent_memories"]({**legacy, "id": "mem-2"}, ctx)
    owned, owned_errors = VALIDATORS["agent_memories"](
        {**legacy, "id": "mem-3", "owner_user_id": "admin"}, ctx
    )

    assert first_errors == []
    assert first["content"] == "  FastAPI  "
    assert duplicate is None
    assert any("chave única" in error for error in duplicate_errors)
    assert owned_errors == []


def test_mobile_devices_reject_duplicate_hashes_and_accept_non_human_audit_users():
    ctx = ValidationContext()
    device = {
        "device_id": "dev-1",
        "device_name": "Telefone",
        "token_hash": "hash-1",
        "scopes_json": '["chat:read"]',
        "is_revoked": 0,
        "paired_at": "2026-01-02T03:04:05+00:00",
        "last_seen_at": "2026-01-02T03:04:05+00:00",
        "owner_user_id": "admin",
    }

    first, first_errors = VALIDATORS["mobile_devices"](device, ctx)
    duplicate, duplicate_errors = VALIDATORS["mobile_devices"](
        {**device, "device_id": "dev-2"}, ctx
    )

    assert first_errors == []
    assert duplicate is None
    assert any("token duplicado" in error for error in duplicate_errors)

    audit, audit_errors = VALIDATORS["audit_events"](
        {
            "id": "aud-1",
            "timestamp": "2026-01-02T03:04:05+00:00",
            "severity": "INFO",
            "user_id": "telegram_1234",
            "agent_role": None,
            "project_id": None,
            "operation": "LOGIN",
            "tool_name": None,
            "parameters_redacted_json": "{}",
            "status": "SUCCESS",
            "reason": "  motivo  ",
        },
        ValidationContext(),
    )

    assert audit_errors == []
    assert audit["user_id"] == "telegram_1234"
    assert audit["reason"] == "  motivo  "


def test_agent_configs_and_routes_validate_json_and_composite_keys():
    ctx = ValidationContext()
    config = {
        "role": "jarvis",
        "system_prompt": "  prompt  ",
        "preferred_model": "model",
        "allowed_tools_json": '["read_file"]',
        "is_read_only": 1,
        "assigned_key_id": None,
        "updated_at": "2026-01-02T03:04:05+00:00",
    }

    value, errors = VALIDATORS["agent_configs"](config, ctx)

    assert errors == []
    assert value["system_prompt"] == "  prompt  "

    value, errors = VALIDATORS["agent_configs"](
        {**config, "role": "other", "allowed_tools_json": "{broken"}, ctx
    )

    assert value is None
    assert any("JSON inválido" in error for error in errors)

    route = {
        "owner_user_id": "admin",
        "agent_role": "jarvis",
        "key_id": "key-1",
        "model": "model",
        "updated_at": "2026-01-02T03:04:05+00:00",
    }
    first, first_errors = VALIDATORS["agent_route_assignments"](route, ctx)
    second, second_errors = VALIDATORS["agent_route_assignments"]({**route, "model": "other"}, ctx)

    assert first_errors == []
    assert second is None
    assert any("chave primária duplicada" in error for error in second_errors)


def test_remaining_domain_validators_cover_defaults_and_free_text():
    knowledge, knowledge_errors = VALIDATORS["knowledge_vault"](
        {
            "id": "kv-1",
            "doc_name": "manual",
            "file_type": "md",
            "category": None,
            "chunk_index": None,
            "content": "  conteúdo  ",
            "file_size_formatted": None,
            "source_path": None,
            "created_at": "2026-01-02T03:04:05+00:00",
            "owner_user_id": None,
        },
        ValidationContext(),
    )
    endpoint, endpoint_errors = VALIDATORS["mock_endpoints"](
        {
            "id": "mock-1",
            "name": "Endpoint",
            "method": None,
            "path": "/x",
            "status_code": None,
            "response_body": "  corpo  ",
            "headers_json": None,
            "latency_ms": None,
            "enabled": 1,
            "created_at": "2026-01-02T03:04:05+00:00",
            "updated_at": "2026-01-02T03:04:05+00:00",
            "owner_user_id": None,
        },
        ValidationContext(),
    )
    cache, cache_errors = VALIDATORS["inference_cache"](
        {
            "prompt_hash": "hash",
            "prompt": "  pergunta  ",
            "model_name": "model",
            "response_text": "  resposta  ",
            "created_at": "2026-01-02T03:04:05+00:00",
            "hit_count": None,
        },
        ValidationContext(),
    )

    assert knowledge_errors == []
    assert knowledge["category"] == "geral"
    assert knowledge["chunk_index"] == 0
    assert knowledge["content"] == "  conteúdo  "
    assert endpoint_errors == []
    assert endpoint["method"] == "GET"
    assert endpoint["status_code"] == 200
    assert endpoint["response_body"] == "  corpo  "
    assert cache_errors == []
    assert cache["prompt"] == "  pergunta  "
    assert cache["hit_count"] == 1


def test_transient_tables_are_opt_in():
    specs = {spec.table: spec for spec in SOURCE_LAYOUT}

    assert specs["auth_attempts"].include_by_default is False
    assert specs["inference_cache"].include_by_default is False
    assert specs["learning_progress"].sources == (
        "learning_progress.sqlite3",
        "jarvis.db",
    )
