"""Controlled SQLite → PostgreSQL data import.

The importer never reads or writes the live SQLite files directly. Every source
database is first copied with the SQLite backup API, integrity-checked, and then
read through a read-only connection. Writes go to an explicitly supplied
PostgreSQL database that must already be migrated to the current Alembic head.

Defaults are deliberately conservative: a non-empty target is rejected, invalid
rows abort the whole import, and transient authentication rate-limit buckets are
not imported.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import Connection, Engine, func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import SQLAlchemyError

from services.database.config import DatabaseSettings, mask_database_url
from services.database.engine import create_database_engine
from services.database.models import Base

REPO_ROOT = Path(__file__).resolve().parents[3]
MAX_RECORDED_ERRORS = 100
BATCH_SIZE = 500


class MigrationError(RuntimeError):
    """The import cannot proceed without violating a safety invariant."""


@dataclass(frozen=True, slots=True)
class TableSpec:
    """Where a legacy table lives and whether it is imported by default."""

    table: str
    sources: tuple[str, ...]
    include_by_default: bool = True
    note: str | None = None


SOURCE_LAYOUT: tuple[TableSpec, ...] = (
    TableSpec("human_users", ("auth/users.sqlite3", "jarvis.db")),
    TableSpec("projects", ("jarvis.db",)),
    TableSpec("project_memory", ("jarvis.db",)),
    TableSpec("user_settings", ("jarvis.db",)),
    TableSpec("inference_telemetry", ("telemetry.db", "jarvis.db")),
    TableSpec("model_selection_decisions", ("telemetry.db", "jarvis.db")),
    TableSpec("inference_quality_feedback", ("telemetry.db", "jarvis.db")),
    TableSpec(
        "auth_attempts",
        ("auth/rate_limits.sqlite3",),
        include_by_default=False,
        note="Buckets de rate-limit são transitórios; importação apenas opt-in.",
    ),
    TableSpec("tasks", ("jarvis.db",), note="Tarefas e respetivo estado de execução."),
    TableSpec("approvals", ("jarvis.db",), note="Aprovações e respetivo estado."),
    TableSpec("chat_messages", ("jarvis.db",), note="Mensagens de chat com IDs explícitos."),
    TableSpec(
        "agent_memories",
        ("jarvis.db",),
        note="Memórias de agente com unicidade por dono.",
    ),
    TableSpec("agent_configs", ("jarvis.db",), note="Configuração dos agentes."),
    TableSpec(
        "agent_route_assignments",
        ("jarvis.db",),
        note="Atribuições de modelo por agente e dono.",
    ),
    TableSpec("user_skills", ("jarvis.db",), note="Skills definidas pelo utilizador."),
    TableSpec("knowledge_vault", ("jarvis.db",), note="Entradas do knowledge vault."),
    TableSpec("mobile_devices", ("jarvis.db",), note="Dispositivos móveis e hashes de token."),
    TableSpec("user_sessions", ("jarvis.db",), note="Sessões de utilizador."),
    TableSpec("audit_events", ("jarvis.db",), note="Trilho de auditoria."),
    TableSpec("mock_endpoints", ("jarvis.db",), note="Endpoints mock do Backend Studio."),
    TableSpec(
        "learning_progress",
        ("learning_progress.sqlite3", "jarvis.db"),
        note="Progresso de aprendizagem.",
    ),
    TableSpec(
        "inference_cache",
        ("jarvis.db",),
        include_by_default=False,
        note="Cache transitório com prompts crus; importação apenas opt-in.",
    ),
)

IMPORT_ORDER = [spec.table for spec in SOURCE_LAYOUT]


@dataclass(slots=True)
class TableMigrationReport:
    table: str
    source: str | None = None
    source_rows: int = 0
    read: int = 0
    valid: int = 0
    rejected: int = 0
    inserted: int = 0
    skipped_existing: int = 0
    before: int = 0
    after: int = 0
    errors: list[dict[str, Any]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "table": self.table,
            "source": self.source,
            "source_rows": self.source_rows,
            "read": self.read,
            "valid": self.valid,
            "rejected": self.rejected,
            "inserted": self.inserted,
            "skipped_existing": self.skipped_existing,
            "target_before": self.before,
            "target_after": self.after,
            "errors": self.errors,
            "notes": self.notes,
        }


@dataclass(slots=True)
class MigrationReport:
    dry_run: bool
    source_dir: str
    target_url: str
    started_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    finished_at: str | None = None
    backup_dir: str | None = None
    alembic_revision: str | None = None
    copies: list[dict[str, Any]] = field(default_factory=list)
    tables: dict[str, TableMigrationReport] = field(default_factory=dict)
    checks: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    status: str = "running"

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "dry_run": self.dry_run,
            "source_dir": self.source_dir,
            "target_url": mask_database_url(self.target_url),
            "backup_dir": self.backup_dir,
            "alembic_revision": self.alembic_revision,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "copies": self.copies,
            "tables": {name: report.to_dict() for name, report in self.tables.items()},
            "checks": self.checks,
            "warnings": self.warnings,
        }


@dataclass(slots=True)
class Snapshot:
    """Integrity-checked copy of one legacy SQLite database."""

    relative_path: str
    original: Path
    copy: Path
    sha256: str
    size_bytes: int
    quick_check: str

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(f"file:{self.copy.as_posix()}?mode=ro", uri=True, timeout=10.0)
        connection.row_factory = sqlite3.Row
        return connection

    def table_columns(self, table: str) -> set[str]:
        with self.connect() as connection:
            return {
                str(row["name"])
                for row in connection.execute(f"PRAGMA table_info({_quote_identifier(table)})")
            }

    def table_exists(self, table: str) -> bool:
        with self.connect() as connection:
            return self._table_exists(connection, table)

    def table_count(self, table: str) -> int:
        with self.connect() as connection:
            if not self._table_exists(connection, table):
                return 0
            return int(
                connection.execute(f"SELECT COUNT(*) FROM {_quote_identifier(table)}").fetchone()[0]
            )

    def _table_exists(self, connection: sqlite3.Connection, table: str) -> bool:
        row = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?", (table,)
        ).fetchone()
        return row is not None


class SnapshotStore:
    """Creates one isolated copy directory per migration run."""

    def __init__(self, source_dir: Path, backup_root: Path):
        self.source_dir = source_dir
        self.backup_root = backup_root
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        self.run_dir = backup_root / f"run-{stamp}-{_short_id()}"
        self._snapshots: dict[str, Snapshot] = {}

    def get(self, relative_path: str) -> Snapshot | None:
        existing = self._snapshots.get(relative_path)
        if existing is not None:
            return existing
        source = self.source_dir / relative_path
        if not source.is_file():
            return None
        snapshot = self._copy(source, relative_path)
        self._snapshots[relative_path] = snapshot
        return snapshot

    def _copy(self, source: Path, relative_path: str) -> Snapshot:
        destination = self.run_dir / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)

        try:
            source_connection = sqlite3.connect(str(source), timeout=30.0)
            destination_connection = sqlite3.connect(str(destination))
            try:
                source_connection.backup(destination_connection)
            finally:
                destination_connection.close()
                source_connection.close()

            with sqlite3.connect(str(destination)) as check_connection:
                quick_check = str(check_connection.execute("PRAGMA quick_check").fetchone()[0])
        except sqlite3.Error as exc:
            raise MigrationError(f"Falha ao copiar/verificar {source}: {exc}") from exc

        if quick_check.lower() != "ok":
            raise MigrationError(f"Cópia de {source} falhou no PRAGMA quick_check: {quick_check}")

        return Snapshot(
            relative_path=relative_path,
            original=source,
            copy=destination,
            sha256=_sha256(destination),
            size_bytes=destination.stat().st_size,
            quick_check=quick_check,
        )


@dataclass(slots=True)
class ValidationContext:
    """Cross-table facts collected during the validation pass."""

    collecting: bool = True
    projects: set[str] = field(default_factory=set)
    tasks: set[str] = field(default_factory=set)
    project_memory_keys: set[tuple[str, str, str]] = field(default_factory=set)
    normalized_usernames: dict[str, str] = field(default_factory=dict)
    telemetry_owners: dict[str, str | None] = field(default_factory=dict)
    feedback_keys: set[tuple[str, str]] = field(default_factory=set)
    agent_memory_legacy_keys: set[tuple[str, str, str]] = field(default_factory=set)
    agent_memory_owner_keys: set[tuple[str, str, str, str]] = field(default_factory=set)
    device_token_hashes: set[str] = field(default_factory=set)
    seen_primary_keys: dict[str, set[Any]] = field(default_factory=dict)


def _quote_identifier(value: str) -> str:
    if not value.replace("_", "").isalnum():
        raise MigrationError(f"Identificador SQL inválido: {value!r}")
    return f'"{value}"'


def _short_id() -> str:
    return uuid.uuid4().hex[:8]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _required_text(
    value: Any, field_name: str, errors: list[str], *, max_length: int | None = None
) -> str | None:
    if value is None:
        errors.append(f"{field_name}: obrigatório")
        return None
    text_value = str(value).strip()
    if not text_value:
        errors.append(f"{field_name}: obrigatório")
        return None
    if max_length is not None and len(text_value) > max_length:
        errors.append(f"{field_name}: excede {max_length} caracteres")
        return None
    return text_value


def _optional_text(value: Any, *, max_length: int | None = None) -> str | None:
    if value is None:
        return None
    text_value = str(value).strip()
    if not text_value:
        return None
    if max_length is not None and len(text_value) > max_length:
        return text_value[:max_length]
    return text_value


def _datetime_value(value: Any, field_name: str, errors: list[str]) -> datetime | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        errors.append(f"{field_name}: obrigatório")
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        try:
            return datetime.fromtimestamp(float(value), tz=UTC)
        except (OverflowError, OSError, ValueError):
            errors.append(f"{field_name}: timestamp inválido {value!r}")
            return None
    raw = str(value).strip()
    if raw.endswith(("Z", "z")):
        raw = raw[:-1] + "+00:00"
    if " " in raw and "T" not in raw:
        raw = raw.replace(" ", "T", 1)
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        errors.append(f"{field_name}: data inválida {value!r}")
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _number_value(
    value: Any,
    field_name: str,
    errors: list[str],
    *,
    integer: bool = False,
    minimum: float = 0.0,
) -> int | float | None:
    if value is None:
        errors.append(f"{field_name}: obrigatório")
        return None
    if isinstance(value, bool):
        errors.append(f"{field_name}: booleano não é um número válido")
        return None
    try:
        number = int(value) if integer else float(value)
    except (TypeError, ValueError):
        errors.append(f"{field_name}: valor numérico inválido {value!r}")
        return None
    if integer and float(value) != float(number):
        errors.append(f"{field_name}: valor inteiro inválido {value!r}")
        return None
    if number < minimum:
        errors.append(f"{field_name}: deve ser >= {minimum}")
        return None
    return number


def _json_value(
    value: Any,
    field_name: str,
    errors: list[str],
    *,
    default: str | None = None,
) -> str | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        if default is not None:
            return default
        errors.append(f"{field_name}: obrigatório")
        return None
    raw = str(value)
    try:
        json.loads(raw)
    except json.JSONDecodeError:
        errors.append(f"{field_name}: JSON inválido")
        return None
    return raw


def _bool_value(value: Any, field_name: str, errors: list[str]) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    if isinstance(value, str) and value.strip() in {"0", "1"}:
        return value.strip() == "1"
    errors.append(f"{field_name}: booleano inválido {value!r}")
    return None


def _raw_text(
    value: Any, field_name: str, errors: list[str], *, required: bool = False
) -> str | None:
    """Return free text exactly as stored, without trimming whitespace.

    Prompts, message content, diffs and decision reasons are user data. Leading
    and trailing whitespace is meaningful and must survive the import.
    """

    if value is None:
        if required:
            errors.append(f"{field_name}: obrigatório")
        return None
    return str(value)


def _optional_datetime(value: Any, field_name: str, errors: list[str]) -> datetime | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    return _datetime_value(value, field_name, errors)


def _optional_json(value: Any, field_name: str, errors: list[str]) -> str | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    return _json_value(value, field_name, errors)


def _track_primary_key(
    ctx: ValidationContext,
    table: str,
    value: Any,
    field_name: str,
    errors: list[str],
) -> None:
    if value is None or not ctx.collecting:
        return
    seen = ctx.seen_primary_keys.setdefault(table, set())
    if value in seen:
        errors.append(f"{field_name}: chave primária duplicada {value!r}")
    else:
        seen.add(value)


def _human_users(row: Mapping[str, Any], ctx: ValidationContext) -> tuple[dict | None, list[str]]:
    errors: list[str] = []
    username = _required_text(row.get("username"), "username", errors, max_length=150)
    display_name = _required_text(row.get("display_name"), "display_name", errors)
    password_hash = _required_text(row.get("password_hash"), "password_hash", errors)
    role = _required_text(row.get("role"), "role", errors)
    if role is not None and role not in {"admin", "developer", "auditor"}:
        errors.append(f"role: valor inválido {role!r}")
    is_active = _bool_value(row.get("is_active"), "is_active", errors)
    created_at = _datetime_value(row.get("created_at"), "created_at", errors)
    updated_at = _datetime_value(row.get("updated_at"), "updated_at", errors)

    normalized = username.casefold() if username else None
    if normalized is not None and ctx.collecting and not errors:
        previous = ctx.normalized_usernames.get(normalized)
        if previous is not None and previous != username:
            errors.append(f"username: colide com {previous!r} após normalização case-insensitive")
        else:
            ctx.normalized_usernames[normalized] = username

    if errors:
        return None, errors
    return {
        "username": username,
        "username_normalized": normalized,
        "display_name": display_name,
        "password_hash": password_hash,
        "role": role,
        "is_active": is_active,
        "created_at": created_at,
        "updated_at": updated_at,
    }, []


def _projects(row: Mapping[str, Any], ctx: ValidationContext) -> tuple[dict | None, list[str]]:
    errors: list[str] = []
    project_id = _required_text(row.get("id"), "id", errors)
    name = _required_text(row.get("name"), "name", errors)
    root_path = _required_text(row.get("root_path"), "root_path", errors)
    mode = _required_text(row.get("mode"), "mode", errors, max_length=32)
    created_at = _datetime_value(row.get("created_at"), "created_at", errors)
    updated_at = _datetime_value(row.get("updated_at"), "updated_at", errors)
    owner_user_id = _optional_text(row.get("owner_user_id"))

    if project_id is not None and ctx.collecting and not errors:
        ctx.projects.add(project_id)

    if errors:
        return None, errors
    return {
        "id": project_id,
        "name": name,
        "root_path": root_path,
        "mode": mode,
        "created_at": created_at,
        "updated_at": updated_at,
        "owner_user_id": owner_user_id,
    }, []


def _project_memory(
    row: Mapping[str, Any], ctx: ValidationContext
) -> tuple[dict | None, list[str]]:
    errors: list[str] = []
    memory_id = _required_text(row.get("id"), "id", errors)
    project_id = _required_text(row.get("project_id"), "project_id", errors)
    category = _required_text(row.get("category"), "category", errors)
    key = _required_text(row.get("key"), "key", errors)
    content = row.get("content")
    if content is None:
        errors.append("content: obrigatório")
    sources_json = _json_value(row.get("sources_json"), "sources_json", errors, default="[]")
    updated_at = _datetime_value(row.get("updated_at"), "updated_at", errors)
    owner_user_id = _optional_text(row.get("owner_user_id"))

    if project_id is not None and project_id not in ctx.projects:
        errors.append(f"project_id: projeto inexistente {project_id!r}")

    if project_id and category and key and ctx.collecting and not errors:
        unique_key = (project_id, category, key)
        if unique_key in ctx.project_memory_keys:
            errors.append("project_memory: chave (project_id, category, key) duplicada")
        else:
            ctx.project_memory_keys.add(unique_key)

    if errors:
        return None, errors
    return {
        "id": memory_id,
        "project_id": project_id,
        "category": category,
        "key": key,
        "content": "" if content is None else str(content),
        "sources_json": sources_json,
        "updated_at": updated_at,
        "owner_user_id": owner_user_id,
    }, []


def _user_settings(row: Mapping[str, Any], ctx: ValidationContext) -> tuple[dict | None, list[str]]:
    del ctx
    errors: list[str] = []
    key = _required_text(row.get("key"), "key", errors)
    value_json = _json_value(row.get("value_json"), "value_json", errors)
    updated_at = _datetime_value(row.get("updated_at"), "updated_at", errors)
    if errors:
        return None, errors
    return {
        "key": key,
        "value_json": value_json,
        "updated_at": updated_at,
    }, []


def _inference_telemetry(
    row: Mapping[str, Any], ctx: ValidationContext
) -> tuple[dict | None, list[str]]:
    errors: list[str] = []
    record_id = _required_text(row.get("id"), "id", errors)
    owner_user_id = _optional_text(row.get("owner_user_id"))
    task_id = _optional_text(row.get("task_id"))
    agent_role = _optional_text(row.get("agent_role"))
    model_name = _required_text(row.get("model_name"), "model_name", errors)
    provider = _required_text(row.get("provider"), "provider", errors)
    status = _required_text(row.get("status"), "status", errors)
    if status is not None and status not in {"success", "failed"}:
        errors.append(f"status: valor inválido {status!r}")
    duration_ms = _number_value(row.get("duration_ms"), "duration_ms", errors)
    prompt_tokens = _number_value(row.get("prompt_tokens"), "prompt_tokens", errors, integer=True)
    completion_tokens = _number_value(
        row.get("completion_tokens"), "completion_tokens", errors, integer=True
    )
    cost_usd = _number_value(row.get("cost_usd"), "cost_usd", errors)
    error_type = _optional_text(row.get("error_type"))
    created_at = _datetime_value(row.get("created_at"), "created_at", errors)

    if record_id is not None and ctx.collecting and not errors:
        ctx.telemetry_owners[record_id] = owner_user_id

    if errors:
        return None, errors
    return {
        "id": record_id,
        "owner_user_id": owner_user_id,
        "task_id": task_id,
        "agent_role": agent_role,
        "model_name": model_name,
        "provider": provider,
        "status": status,
        "duration_ms": duration_ms,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "cost_usd": cost_usd,
        "error_type": error_type,
        "created_at": created_at,
    }, []


def _model_selection_decisions(
    row: Mapping[str, Any], ctx: ValidationContext
) -> tuple[dict | None, list[str]]:
    del ctx
    errors: list[str] = []
    record_id = _required_text(row.get("id"), "id", errors)
    owner_user_id = _required_text(row.get("owner_user_id"), "owner_user_id", errors)
    task_id = _optional_text(row.get("task_id"))
    agent_role = _optional_text(row.get("agent_role"))
    task_capability = _optional_text(row.get("task_capability"))
    selected_model = _required_text(row.get("selected_model"), "selected_model", errors)
    selected_provider = _required_text(row.get("selected_provider"), "selected_provider", errors)
    selection_reason = _required_text(row.get("selection_reason"), "selection_reason", errors)
    candidate_count = _number_value(
        row.get("candidate_count"), "candidate_count", errors, integer=True
    )
    estimated_cost_usd = _number_value(row.get("estimated_cost_usd"), "estimated_cost_usd", errors)
    created_at = _datetime_value(row.get("created_at"), "created_at", errors)
    if errors:
        return None, errors
    return {
        "id": record_id,
        "owner_user_id": owner_user_id,
        "task_id": task_id,
        "agent_role": agent_role,
        "task_capability": task_capability,
        "selected_model": selected_model,
        "selected_provider": selected_provider,
        "selection_reason": selection_reason,
        "candidate_count": candidate_count,
        "estimated_cost_usd": estimated_cost_usd,
        "created_at": created_at,
    }, []


def _inference_quality_feedback(
    row: Mapping[str, Any], ctx: ValidationContext
) -> tuple[dict | None, list[str]]:
    errors: list[str] = []
    record_id = _required_text(row.get("id"), "id", errors)
    owner_user_id = _required_text(row.get("owner_user_id"), "owner_user_id", errors)
    inference_id = _required_text(row.get("inference_id"), "inference_id", errors)
    model_name = _required_text(row.get("model_name"), "model_name", errors)
    provider = _required_text(row.get("provider"), "provider", errors)
    agent_role = _optional_text(row.get("agent_role"))
    task_id = _optional_text(row.get("task_id"))
    rating = _number_value(row.get("rating"), "rating", errors, integer=True, minimum=1)
    if rating is not None and int(rating) > 5:
        errors.append("rating: deve ser <= 5")
    created_at = _datetime_value(row.get("created_at"), "created_at", errors)

    if inference_id is not None:
        if inference_id not in ctx.telemetry_owners:
            errors.append(f"inference_id: inferência inexistente {inference_id!r}")
        else:
            telemetry_owner = ctx.telemetry_owners[inference_id]
            if telemetry_owner != owner_user_id:
                errors.append("owner_user_id: não corresponde ao proprietário da inferência")

    if owner_user_id and inference_id and ctx.collecting and not errors:
        unique_key = (owner_user_id, inference_id)
        if unique_key in ctx.feedback_keys:
            errors.append("inference_quality_feedback: avaliação duplicada")
        else:
            ctx.feedback_keys.add(unique_key)

    if errors:
        return None, errors
    return {
        "id": record_id,
        "owner_user_id": owner_user_id,
        "inference_id": inference_id,
        "model_name": model_name,
        "provider": provider,
        "agent_role": agent_role,
        "task_id": task_id,
        "rating": rating,
        "created_at": created_at,
    }, []


def _tasks(row: Mapping[str, Any], ctx: ValidationContext) -> tuple[dict | None, list[str]]:
    errors: list[str] = []
    task_id = _required_text(row.get("id"), "id", errors)
    session_id = _required_text(row.get("session_id"), "session_id", errors)
    project_id = _optional_text(row.get("project_id"))
    prompt = _raw_text(row.get("prompt"), "prompt", errors, required=True)
    intent = _optional_text(row.get("intent"))
    state_json = _json_value(row.get("state_json"), "state_json", errors, default="{}")
    is_completed = _bool_value(row.get("is_completed"), "is_completed", errors)
    created_at = _datetime_value(row.get("created_at"), "created_at", errors)
    updated_at = _datetime_value(row.get("updated_at"), "updated_at", errors)
    owner_user_id = _optional_text(row.get("owner_user_id"))

    if project_id is not None and project_id not in ctx.projects:
        errors.append(f"project_id: projeto inexistente {project_id!r}")
    if task_id is not None and ctx.collecting and not errors:
        ctx.tasks.add(task_id)
    _track_primary_key(ctx, "tasks", task_id, "id", errors)

    if errors:
        return None, errors
    return {
        "id": task_id,
        "session_id": session_id,
        "project_id": project_id,
        "prompt": prompt,
        "intent": intent,
        "state_json": state_json,
        "is_completed": is_completed,
        "created_at": created_at,
        "updated_at": updated_at,
        "owner_user_id": owner_user_id,
    }, []


def _chat_messages(row: Mapping[str, Any], ctx: ValidationContext) -> tuple[dict | None, list[str]]:
    errors: list[str] = []
    message_id = _number_value(row.get("id"), "id", errors, integer=True, minimum=1)
    session_id = _required_text(row.get("session_id"), "session_id", errors)
    project_id = _optional_text(row.get("project_id"))
    role = _required_text(row.get("role"), "role", errors)
    content = _raw_text(row.get("content"), "content", errors, required=True)
    tool_calls_json = _optional_json(row.get("tool_calls_json"), "tool_calls_json", errors)
    tool_call_id = _optional_text(row.get("tool_call_id"))
    tool_name = _optional_text(row.get("tool_name"))
    created_at = _datetime_value(row.get("created_at"), "created_at", errors)
    owner_user_id = _optional_text(row.get("owner_user_id"))
    _track_primary_key(ctx, "chat_messages", message_id, "id", errors)

    if errors:
        return None, errors
    return {
        "id": message_id,
        "session_id": session_id,
        "project_id": project_id,
        "role": role,
        "content": content,
        "tool_calls_json": tool_calls_json,
        "tool_call_id": tool_call_id,
        "tool_name": tool_name,
        "created_at": created_at,
        "owner_user_id": owner_user_id,
    }, []


def _approvals(row: Mapping[str, Any], ctx: ValidationContext) -> tuple[dict | None, list[str]]:
    errors: list[str] = []
    approval_id = _required_text(row.get("id"), "id", errors)
    task_id = _required_text(row.get("task_id"), "task_id", errors)
    agent_role = _required_text(row.get("agent_role"), "agent_role", errors)
    operation = _required_text(row.get("operation"), "operation", errors)
    impact_summary = _raw_text(row.get("impact_summary"), "impact_summary", errors, required=True)
    affected_resources_json = _json_value(
        row.get("affected_resources_json"), "affected_resources_json", errors
    )
    proposed_diff = _raw_text(row.get("proposed_diff"), "proposed_diff", errors)
    status = _required_text(row.get("status"), "status", errors)
    decided_by = _optional_text(row.get("decided_by"))
    decision_reason = _raw_text(row.get("decision_reason"), "decision_reason", errors)
    requested_at = _datetime_value(row.get("requested_at"), "requested_at", errors)
    decided_at = _optional_datetime(row.get("decided_at"), "decided_at", errors)
    reversible = _bool_value(row.get("reversible"), "reversible", errors)
    owner_user_id = _optional_text(row.get("owner_user_id"))

    if task_id is not None and task_id not in ctx.tasks:
        errors.append(f"task_id: tarefa inexistente {task_id!r}")
    _track_primary_key(ctx, "approvals", approval_id, "id", errors)

    if errors:
        return None, errors
    return {
        "id": approval_id,
        "task_id": task_id,
        "agent_role": agent_role,
        "operation": operation,
        "impact_summary": impact_summary,
        "affected_resources_json": affected_resources_json,
        "proposed_diff": proposed_diff,
        "status": status,
        "decided_by": decided_by,
        "decision_reason": decision_reason,
        "requested_at": requested_at,
        "decided_at": decided_at,
        "reversible": reversible,
        "owner_user_id": owner_user_id,
    }, []


def _agent_memories(
    row: Mapping[str, Any], ctx: ValidationContext
) -> tuple[dict | None, list[str]]:
    errors: list[str] = []
    memory_id = _required_text(row.get("id"), "id", errors)
    agent_role = _required_text(row.get("agent_role"), "agent_role", errors)
    category = _required_text(row.get("category"), "category", errors)
    key = _required_text(row.get("key"), "key", errors)
    content = _raw_text(row.get("content"), "content", errors, required=True)
    context = _raw_text(row.get("context"), "context", errors)
    importance_value = row.get("importance")
    importance = _number_value(
        1 if importance_value is None else importance_value,
        "importance",
        errors,
        integer=True,
    )
    created_at = _datetime_value(row.get("created_at"), "created_at", errors)
    updated_at = _datetime_value(row.get("updated_at"), "updated_at", errors)
    owner_user_id = _optional_text(row.get("owner_user_id"))

    if agent_role and category and key and ctx.collecting and not errors:
        if owner_user_id is None:
            unique_key: tuple[str, ...] = (agent_role, category, key)
            bucket = ctx.agent_memory_legacy_keys
        else:
            unique_key = (owner_user_id, agent_role, category, key)
            bucket = ctx.agent_memory_owner_keys
        if unique_key in bucket:
            errors.append("agent_memories: chave única (agente, categoria, chave) duplicada")
        else:
            bucket.add(unique_key)
    _track_primary_key(ctx, "agent_memories", memory_id, "id", errors)

    if errors:
        return None, errors
    return {
        "id": memory_id,
        "agent_role": agent_role,
        "category": category,
        "key": key,
        "content": content,
        "context": context,
        "importance": importance,
        "created_at": created_at,
        "updated_at": updated_at,
        "owner_user_id": owner_user_id,
    }, []


def _agent_configs(row: Mapping[str, Any], ctx: ValidationContext) -> tuple[dict | None, list[str]]:
    errors: list[str] = []
    role = _required_text(row.get("role"), "role", errors)
    system_prompt = _raw_text(row.get("system_prompt"), "system_prompt", errors)
    preferred_model = _optional_text(row.get("preferred_model"))
    allowed_tools_json = _optional_json(row.get("allowed_tools_json"), "allowed_tools_json", errors)
    is_read_only = _bool_value(row.get("is_read_only"), "is_read_only", errors)
    assigned_key_id = _optional_text(row.get("assigned_key_id"))
    updated_at = _datetime_value(row.get("updated_at"), "updated_at", errors)
    _track_primary_key(ctx, "agent_configs", role, "role", errors)

    if errors:
        return None, errors
    return {
        "role": role,
        "system_prompt": system_prompt,
        "preferred_model": preferred_model,
        "allowed_tools_json": allowed_tools_json,
        "is_read_only": is_read_only,
        "assigned_key_id": assigned_key_id,
        "updated_at": updated_at,
    }, []


def _agent_route_assignments(
    row: Mapping[str, Any], ctx: ValidationContext
) -> tuple[dict | None, list[str]]:
    errors: list[str] = []
    owner_user_id = _required_text(row.get("owner_user_id"), "owner_user_id", errors)
    agent_role = _required_text(row.get("agent_role"), "agent_role", errors)
    key_id = _required_text(row.get("key_id"), "key_id", errors)
    model = _required_text(row.get("model"), "model", errors)
    updated_at = _datetime_value(row.get("updated_at"), "updated_at", errors)
    _track_primary_key(
        ctx,
        "agent_route_assignments",
        (owner_user_id, agent_role),
        "owner_user_id/agent_role",
        errors,
    )

    if errors:
        return None, errors
    return {
        "owner_user_id": owner_user_id,
        "agent_role": agent_role,
        "key_id": key_id,
        "model": model,
        "updated_at": updated_at,
    }, []


def _user_skills(row: Mapping[str, Any], ctx: ValidationContext) -> tuple[dict | None, list[str]]:
    errors: list[str] = []
    skill_id = _required_text(row.get("id"), "id", errors)
    name = _required_text(row.get("name"), "name", errors)
    version = _required_text(row.get("version") or "1.0.0", "version", errors)
    origin = _required_text(row.get("origin") or "user_created", "origin", errors)
    domain = _required_text(row.get("domain"), "domain", errors)
    description = _raw_text(row.get("description"), "description", errors, required=True)
    instructions = _raw_text(row.get("instructions"), "instructions", errors, required=True)
    assigned_agents_json = _json_value(
        row.get("assigned_agents_json"), "assigned_agents_json", errors, default="[]"
    )
    is_approved = _bool_value(row.get("is_approved"), "is_approved", errors)
    created_at = _datetime_value(row.get("created_at"), "created_at", errors)
    updated_at = _datetime_value(row.get("updated_at"), "updated_at", errors)
    owner_user_id = _optional_text(row.get("owner_user_id"))
    _track_primary_key(ctx, "user_skills", skill_id, "id", errors)

    if errors:
        return None, errors
    return {
        "id": skill_id,
        "name": name,
        "version": version,
        "origin": origin,
        "domain": domain,
        "description": description,
        "instructions": instructions,
        "assigned_agents_json": assigned_agents_json,
        "is_approved": is_approved,
        "created_at": created_at,
        "updated_at": updated_at,
        "owner_user_id": owner_user_id,
    }, []


def _knowledge_vault(
    row: Mapping[str, Any], ctx: ValidationContext
) -> tuple[dict | None, list[str]]:
    errors: list[str] = []
    entry_id = _required_text(row.get("id"), "id", errors)
    doc_name = _required_text(row.get("doc_name"), "doc_name", errors)
    file_type = _required_text(row.get("file_type"), "file_type", errors)
    category = _required_text(row.get("category") or "geral", "category", errors)
    chunk_index_value = row.get("chunk_index")
    chunk_index = _number_value(
        0 if chunk_index_value is None else chunk_index_value,
        "chunk_index",
        errors,
        integer=True,
    )
    content = _raw_text(row.get("content"), "content", errors, required=True)
    file_size_formatted = _optional_text(row.get("file_size_formatted"))
    source_path = _raw_text(row.get("source_path"), "source_path", errors)
    created_at = _datetime_value(row.get("created_at"), "created_at", errors)
    owner_user_id = _optional_text(row.get("owner_user_id"))
    _track_primary_key(ctx, "knowledge_vault", entry_id, "id", errors)

    if errors:
        return None, errors
    return {
        "id": entry_id,
        "doc_name": doc_name,
        "file_type": file_type,
        "category": category,
        "chunk_index": chunk_index,
        "content": content,
        "file_size_formatted": file_size_formatted,
        "source_path": source_path,
        "created_at": created_at,
        "owner_user_id": owner_user_id,
    }, []


def _mobile_devices(
    row: Mapping[str, Any], ctx: ValidationContext
) -> tuple[dict | None, list[str]]:
    errors: list[str] = []
    device_id = _required_text(row.get("device_id"), "device_id", errors)
    device_name = _required_text(row.get("device_name"), "device_name", errors)
    token_hash = _required_text(row.get("token_hash"), "token_hash", errors)
    scopes_json = _json_value(row.get("scopes_json"), "scopes_json", errors, default="[]")
    is_revoked = _bool_value(row.get("is_revoked"), "is_revoked", errors)
    paired_at = _datetime_value(row.get("paired_at"), "paired_at", errors)
    last_seen_at = _datetime_value(row.get("last_seen_at"), "last_seen_at", errors)
    owner_user_id = _optional_text(row.get("owner_user_id"))

    if token_hash and ctx.collecting and not errors:
        if token_hash in ctx.device_token_hashes:
            errors.append("token_hash: hash de token duplicado")
        else:
            ctx.device_token_hashes.add(token_hash)
    _track_primary_key(ctx, "mobile_devices", device_id, "device_id", errors)

    if errors:
        return None, errors
    return {
        "device_id": device_id,
        "device_name": device_name,
        "token_hash": token_hash,
        "scopes_json": scopes_json,
        "is_revoked": is_revoked,
        "paired_at": paired_at,
        "last_seen_at": last_seen_at,
        "owner_user_id": owner_user_id,
    }, []


def _user_sessions(row: Mapping[str, Any], ctx: ValidationContext) -> tuple[dict | None, list[str]]:
    errors: list[str] = []
    session_id = _required_text(row.get("session_id"), "session_id", errors)
    user_id = _required_text(row.get("user_id"), "user_id", errors)
    role = _required_text(row.get("role"), "role", errors)
    scopes_json = _json_value(row.get("scopes_json"), "scopes_json", errors, default="[]")
    created_at = _datetime_value(row.get("created_at"), "created_at", errors)
    expires_at = _datetime_value(row.get("expires_at"), "expires_at", errors)
    last_seen_at = _datetime_value(row.get("last_seen_at"), "last_seen_at", errors)
    is_revoked = _bool_value(row.get("is_revoked"), "is_revoked", errors)
    _track_primary_key(ctx, "user_sessions", session_id, "session_id", errors)

    if errors:
        return None, errors
    return {
        "session_id": session_id,
        "user_id": user_id,
        "role": role,
        "scopes_json": scopes_json,
        "created_at": created_at,
        "expires_at": expires_at,
        "last_seen_at": last_seen_at,
        "is_revoked": is_revoked,
    }, []


def _audit_events(row: Mapping[str, Any], ctx: ValidationContext) -> tuple[dict | None, list[str]]:
    errors: list[str] = []
    event_id = _required_text(row.get("id"), "id", errors)
    timestamp = _datetime_value(row.get("timestamp"), "timestamp", errors)
    severity = _required_text(row.get("severity"), "severity", errors)
    user_id = _optional_text(row.get("user_id"))
    agent_role = _optional_text(row.get("agent_role"))
    project_id = _optional_text(row.get("project_id"))
    operation = _required_text(row.get("operation"), "operation", errors)
    tool_name = _optional_text(row.get("tool_name"))
    parameters_redacted_json = _optional_json(
        row.get("parameters_redacted_json"), "parameters_redacted_json", errors
    )
    status = _required_text(row.get("status"), "status", errors)
    reason = _raw_text(row.get("reason"), "reason", errors)
    _track_primary_key(ctx, "audit_events", event_id, "id", errors)

    if errors:
        return None, errors
    return {
        "id": event_id,
        "timestamp": timestamp,
        "severity": severity,
        "user_id": user_id,
        "agent_role": agent_role,
        "project_id": project_id,
        "operation": operation,
        "tool_name": tool_name,
        "parameters_redacted_json": parameters_redacted_json,
        "status": status,
        "reason": reason,
    }, []


def _mock_endpoints(
    row: Mapping[str, Any], ctx: ValidationContext
) -> tuple[dict | None, list[str]]:
    errors: list[str] = []
    endpoint_id = _required_text(row.get("id"), "id", errors)
    name = _required_text(row.get("name"), "name", errors)
    method = _required_text(row.get("method") or "GET", "method", errors)
    path = _required_text(row.get("path"), "path", errors)
    status_code_value = row.get("status_code")
    status_code = _number_value(
        200 if status_code_value is None else status_code_value,
        "status_code",
        errors,
        integer=True,
        minimum=100,
    )
    if status_code is not None and int(status_code) > 599:
        errors.append("status_code: deve ser <= 599")
    response_body = _raw_text(row.get("response_body"), "response_body", errors, required=True)
    headers_json = _json_value(row.get("headers_json"), "headers_json", errors, default="{}")
    latency_ms_value = row.get("latency_ms")
    latency_ms = _number_value(
        0 if latency_ms_value is None else latency_ms_value,
        "latency_ms",
        errors,
        integer=True,
    )
    enabled = _bool_value(row.get("enabled"), "enabled", errors)
    created_at = _datetime_value(row.get("created_at"), "created_at", errors)
    updated_at = _datetime_value(row.get("updated_at"), "updated_at", errors)
    owner_user_id = _optional_text(row.get("owner_user_id"))
    _track_primary_key(ctx, "mock_endpoints", endpoint_id, "id", errors)

    if errors:
        return None, errors
    return {
        "id": endpoint_id,
        "name": name,
        "method": method,
        "path": path,
        "status_code": status_code,
        "response_body": response_body,
        "headers_json": headers_json,
        "latency_ms": latency_ms,
        "enabled": enabled,
        "created_at": created_at,
        "updated_at": updated_at,
        "owner_user_id": owner_user_id,
    }, []


def _learning_progress(
    row: Mapping[str, Any], ctx: ValidationContext
) -> tuple[dict | None, list[str]]:
    errors: list[str] = []
    owner_user_id = _required_text(row.get("owner_user_id"), "owner_user_id", errors)
    completed_ids_json = _json_value(
        row.get("completed_ids_json"), "completed_ids_json", errors, default="[]"
    )
    updated_at = _datetime_value(row.get("updated_at"), "updated_at", errors)
    _track_primary_key(ctx, "learning_progress", owner_user_id, "owner_user_id", errors)

    if errors:
        return None, errors
    return {
        "owner_user_id": owner_user_id,
        "completed_ids_json": completed_ids_json,
        "updated_at": updated_at,
    }, []


def _inference_cache(
    row: Mapping[str, Any], ctx: ValidationContext
) -> tuple[dict | None, list[str]]:
    errors: list[str] = []
    prompt_hash = _required_text(row.get("prompt_hash"), "prompt_hash", errors)
    prompt = _raw_text(row.get("prompt"), "prompt", errors, required=True)
    model_name = _required_text(row.get("model_name"), "model_name", errors)
    response_text = _raw_text(row.get("response_text"), "response_text", errors, required=True)
    created_at = _datetime_value(row.get("created_at"), "created_at", errors)
    hit_count_value = row.get("hit_count")
    hit_count = _number_value(
        1 if hit_count_value is None else hit_count_value,
        "hit_count",
        errors,
        integer=True,
    )
    _track_primary_key(ctx, "inference_cache", prompt_hash, "prompt_hash", errors)

    if errors:
        return None, errors
    return {
        "prompt_hash": prompt_hash,
        "prompt": prompt,
        "model_name": model_name,
        "response_text": response_text,
        "created_at": created_at,
        "hit_count": hit_count,
    }, []


def _auth_attempts(row: Mapping[str, Any], ctx: ValidationContext) -> tuple[dict | None, list[str]]:
    del ctx
    errors: list[str] = []
    bucket_key = _required_text(row.get("bucket_key"), "bucket_key", errors)
    attempted_at = _number_value(row.get("attempted_at"), "attempted_at", errors, minimum=0.0)

    if errors:
        return None, errors
    return {"bucket_key": bucket_key, "attempted_at": attempted_at}, []


VALIDATORS: dict[
    str, Callable[[Mapping[str, Any], ValidationContext], tuple[dict | None, list[str]]]
] = {
    "human_users": _human_users,
    "projects": _projects,
    "project_memory": _project_memory,
    "user_settings": _user_settings,
    "inference_telemetry": _inference_telemetry,
    "model_selection_decisions": _model_selection_decisions,
    "inference_quality_feedback": _inference_quality_feedback,
    "auth_attempts": _auth_attempts,
    "tasks": _tasks,
    "chat_messages": _chat_messages,
    "approvals": _approvals,
    "agent_memories": _agent_memories,
    "agent_configs": _agent_configs,
    "agent_route_assignments": _agent_route_assignments,
    "user_skills": _user_skills,
    "knowledge_vault": _knowledge_vault,
    "mobile_devices": _mobile_devices,
    "user_sessions": _user_sessions,
    "audit_events": _audit_events,
    "mock_endpoints": _mock_endpoints,
    "learning_progress": _learning_progress,
    "inference_cache": _inference_cache,
}


class SqliteToPostgresMigrator:
    """Runs a validated, transactional import into PostgreSQL."""

    def __init__(
        self,
        settings: DatabaseSettings,
        *,
        source_dir: Path | str = "data",
        backup_dir: Path | str = "data/migration-backups",
        dry_run: bool = False,
        allow_non_empty: bool = False,
        include_auth_attempts: bool = False,
        include_inference_cache: bool = False,
        on_error: str = "abort",
    ):
        if settings.backend != "postgresql":
            raise MigrationError(
                f"O destino da importação deve ser PostgreSQL; recebido {settings.backend!r}."
            )
        if on_error not in {"abort", "skip"}:
            raise MigrationError("on_error deve ser 'abort' ou 'skip'.")
        self.settings = settings
        self.source_dir = Path(source_dir)
        self.backup_dir = Path(backup_dir)
        self.dry_run = dry_run
        self.allow_non_empty = allow_non_empty
        self.include_auth_attempts = include_auth_attempts
        self.include_inference_cache = include_inference_cache
        self.on_error = on_error
        self.engine: Engine = create_database_engine(settings)
        self.report = MigrationReport(
            dry_run=dry_run,
            source_dir=str(self.source_dir),
            target_url=settings.url,
            backup_dir=str(self.backup_dir),
        )
        self.store = SnapshotStore(self.source_dir, self.backup_dir)

    # -- public API -----------------------------------------------------

    def run(self) -> MigrationReport:
        try:
            self.report.alembic_revision = self._check_target_schema()
            snapshots = self._copy_sources()
            specs = self._selected_specs()
            self._preflight_target(specs)
            ctx = self._build_context(snapshots, specs)
            self._abort_on_rejections()
            if self.dry_run:
                self._record_dry_run(specs)
            else:
                self._execute_import(snapshots, specs, ctx)
            self.report.status = "dry_run" if self.dry_run else "success"
        except Exception:
            self.report.status = "failed"
            raise
        finally:
            self.report.finished_at = datetime.now(UTC).isoformat()
            self.engine.dispose()
        return self.report

    # -- target checks --------------------------------------------------

    def _check_target_schema(self) -> str:
        try:
            with self.engine.connect() as connection:
                revision = connection.execute(
                    text("SELECT version_num FROM alembic_version")
                ).scalar()
        except SQLAlchemyError as exc:
            raise MigrationError(
                "Destino inacessível ou sem schema Alembic; execute "
                "'alembic upgrade head' antes de importar."
            ) from exc
        if not revision:
            raise MigrationError(
                "O destino não tem revisão Alembic; execute 'alembic upgrade head'."
            )
        config = Config(str(REPO_ROOT / "alembic.ini"))
        head = ScriptDirectory.from_config(config).get_current_head()
        if revision != head:
            raise MigrationError(
                f"Destino em revisão {revision!r}, esperado {head!r}. "
                "Execute 'alembic upgrade head' antes de importar."
            )
        missing = sorted(set(IMPORT_ORDER) - set(Base.metadata.tables))
        if missing:
            raise MigrationError(f"Modelos em falta para: {', '.join(missing)}")
        return str(revision)

    def _copy_sources(self) -> dict[str, Snapshot | None]:
        snapshots: dict[str, Snapshot | None] = {}
        for path in sorted({path for spec in SOURCE_LAYOUT for path in spec.sources}):
            snapshot = self.store.get(path)
            snapshots[path] = snapshot
            if snapshot is not None:
                self.report.copies.append(
                    {
                        "source": path,
                        "copy": str(snapshot.copy),
                        "sha256": snapshot.sha256,
                        "size_bytes": snapshot.size_bytes,
                        "quick_check": snapshot.quick_check,
                    }
                )
        if not any(snapshot is not None for snapshot in snapshots.values()):
            raise MigrationError(
                f"Nenhum ficheiro SQLite conhecido encontrado em {self.source_dir}."
            )
        return snapshots

    def _selected_specs(self) -> list[TableSpec]:
        specs = []
        for spec in SOURCE_LAYOUT:
            if spec.table == "auth_attempts" and not self.include_auth_attempts:
                continue
            if spec.table == "inference_cache" and not self.include_inference_cache:
                continue
            specs.append(spec)
        return specs

    def _resolve_snapshot(
        self, spec: TableSpec, snapshots: Mapping[str, Snapshot | None]
    ) -> tuple[Snapshot | None, str | None]:
        for candidate in spec.sources:
            snapshot = snapshots.get(candidate)
            if snapshot is None:
                continue
            if snapshot.table_exists(spec.table) and snapshot.table_columns(spec.table):
                return snapshot, candidate
        return None, None

    # -- context and validation ----------------------------------------

    def _build_context(
        self, snapshots: Mapping[str, Snapshot | None], specs: Sequence[TableSpec]
    ) -> ValidationContext:
        ctx = ValidationContext(collecting=True)
        self._seed_context_from_target(ctx)
        for spec in specs:
            snapshot, relative = self._resolve_snapshot(spec, snapshots)
            if snapshot is None:
                report = self._table_report(spec.table)
                report.notes.append("Tabela não encontrada nas origens conhecidas.")
                continue
            self._validate_table(snapshot, relative, spec, ctx)
        ctx.collecting = False
        return ctx

    def _seed_context_from_target(self, ctx: ValidationContext) -> None:
        """Allow project/feedback rows that reference data already in the target.

        Only used with ``--allow-non-empty``; a fresh target must be empty and
        therefore has nothing to seed.
        """

        if not self.allow_non_empty:
            return
        with self.engine.connect() as connection:
            for row in connection.execute(text("SELECT username FROM human_users")):
                ctx.normalized_usernames[str(row[0]).casefold()] = str(row[0])
            for row in connection.execute(text("SELECT id FROM projects")):
                ctx.projects.add(str(row[0]))
            for row in connection.execute(text("SELECT id FROM tasks")):
                ctx.tasks.add(str(row[0]))
            for row in connection.execute(
                text("SELECT id, owner_user_id FROM inference_telemetry")
            ):
                ctx.telemetry_owners[str(row[0])] = row[1]

    def _validate_table(
        self,
        snapshot: Snapshot,
        relative: str,
        spec: TableSpec,
        ctx: ValidationContext,
    ) -> None:
        report = self._table_report(spec.table)
        report.source = relative
        report.source_rows = snapshot.table_count(spec.table)
        validator = VALIDATORS[spec.table]
        seen = 0
        with snapshot.connect() as connection:
            cursor = connection.execute(f"SELECT * FROM {_quote_identifier(spec.table)}")
            for row in cursor:
                seen += 1
                report.read += 1
                value, errors = validator(dict(row), ctx)
                if errors:
                    report.rejected += 1
                    self._record_error(report, seen, self._row_identity(dict(row)), errors)
                elif value is not None:
                    report.valid += 1
        report.notes.append(f"linhas lidas na origem: {seen}")

    def _row_identity(self, row: Mapping[str, Any]) -> str:
        for key in ("username", "id", "key", "session_id"):
            if row.get(key) is not None:
                return str(row[key])
        return "?"

    def _record_error(
        self, report: TableMigrationReport, position: int, identity: str, errors: list[str]
    ) -> None:
        if len(report.errors) < MAX_RECORDED_ERRORS:
            report.errors.append({"row": position, "identity": identity, "errors": errors})

    def _abort_on_rejections(self) -> None:
        rejected = {
            name: report.rejected for name, report in self.report.tables.items() if report.rejected
        }
        if rejected and self.on_error == "abort":
            details = ", ".join(f"{name}={count}" for name, count in rejected.items())
            raise MigrationError(
                f"Linhas inválidas encontradas ({details}); importação abortada. "
                "Use --on-error skip apenas após revisão do relatório."
            )

    # -- target preflight ----------------------------------------------

    def _preflight_target(self, specs: Sequence[TableSpec]) -> None:
        with self.engine.connect() as connection:
            for spec in specs:
                table = Base.metadata.tables[spec.table]
                count = int(
                    connection.execute(select(func.count()).select_from(table)).scalar() or 0
                )
                report = self._table_report(spec.table)
                report.before = count
        occupied = {
            name: report.before for name, report in self.report.tables.items() if report.before
        }
        if self.include_auth_attempts and occupied.get("auth_attempts"):
            raise MigrationError(
                "auth_attempts não tem chave natural idempotente; importe-o apenas "
                "para uma tabela de destino vazia."
            )
        if occupied and not self.allow_non_empty:
            details = ", ".join(f"{name}={count}" for name, count in occupied.items())
            raise MigrationError(
                f"Destino não está vazio ({details}). Use --allow-non-empty para "
                "importar apenas registos em falta."
            )

    def _record_dry_run(self, specs: Sequence[TableSpec]) -> None:
        for spec in specs:
            report = self._table_report(spec.table)
            report.notes.append("dry-run: nenhuma linha foi escrita no destino.")

    # -- import ---------------------------------------------------------

    def _execute_import(
        self,
        snapshots: Mapping[str, Snapshot | None],
        specs: Sequence[TableSpec],
        ctx: ValidationContext,
    ) -> None:
        with self.engine.begin() as connection:
            for spec in specs:
                snapshot, relative = self._resolve_snapshot(spec, snapshots)
                report = self._table_report(spec.table)
                if snapshot is None:
                    report.after = report.before
                    continue
                report.source = relative
                validator = VALIDATORS[spec.table]
                batch: list[dict[str, Any]] = []
                inserted = 0
                with snapshot.connect() as source:
                    cursor = source.execute(f"SELECT * FROM {_quote_identifier(spec.table)}")
                    for row in cursor:
                        value, errors = validator(dict(row), ctx)
                        if errors or value is None:
                            continue
                        batch.append(value)
                        if len(batch) >= BATCH_SIZE:
                            inserted += self._insert_batch(connection, spec.table, batch)
                            batch.clear()
                if batch:
                    inserted += self._insert_batch(connection, spec.table, batch)
                report.inserted = inserted
                report.skipped_existing = max(0, report.valid - inserted)
                report.after = report.before + inserted

            self._run_post_checks(connection, specs)

    def _insert_batch(
        self, connection: Connection, table_name: str, rows: list[dict[str, Any]]
    ) -> int:
        if not rows:
            return 0
        table = Base.metadata.tables[table_name]
        primary_key = list(table.primary_key.columns)
        statement = pg_insert(table).values(rows).on_conflict_do_nothing()
        if primary_key:
            statement = statement.returning(*primary_key)
        result = connection.execute(statement)
        if primary_key:
            return len(result.fetchall())
        return max(0, int(result.rowcount or 0))

    def _run_post_checks(self, connection: Connection, specs: Sequence[TableSpec]) -> None:
        checks: dict[str, Any] = {}
        checks["project_memory_orphans"] = int(
            connection.execute(
                text(
                    "SELECT COUNT(*) FROM project_memory pm "
                    "LEFT JOIN projects p ON p.id = pm.project_id "
                    "WHERE p.id IS NULL"
                )
            ).scalar()
            or 0
        )
        checks["inference_feedback_orphans"] = int(
            connection.execute(
                text(
                    "SELECT COUNT(*) FROM inference_quality_feedback f "
                    "LEFT JOIN inference_telemetry i "
                    "ON i.id = f.inference_id "
                    "AND i.owner_user_id = f.owner_user_id "
                    "WHERE i.id IS NULL"
                )
            ).scalar()
            or 0
        )
        checks["human_users_duplicate_normalized"] = int(
            connection.execute(
                text(
                    "SELECT COUNT(*) FROM ("
                    "SELECT username_normalized FROM human_users "
                    "GROUP BY username_normalized HAVING COUNT(*) > 1"
                    ") AS duplicates"
                )
            ).scalar()
            or 0
        )
        checks["tasks_project_orphans"] = int(
            connection.execute(
                text(
                    "SELECT COUNT(*) FROM tasks t "
                    "LEFT JOIN projects p ON p.id = t.project_id "
                    "WHERE t.project_id IS NOT NULL AND p.id IS NULL"
                )
            ).scalar()
            or 0
        )
        checks["chat_messages_project_orphans"] = int(
            connection.execute(
                text(
                    "SELECT COUNT(*) FROM chat_messages m "
                    "LEFT JOIN projects p ON p.id = m.project_id "
                    "WHERE m.project_id IS NOT NULL AND p.id IS NULL"
                )
            ).scalar()
            or 0
        )
        checks["approvals_task_orphans"] = int(
            connection.execute(
                text(
                    "SELECT COUNT(*) FROM approvals a "
                    "LEFT JOIN tasks t ON t.id = a.task_id "
                    "WHERE t.id IS NULL"
                )
            ).scalar()
            or 0
        )
        checks["identity_sequences"] = self._reset_identity_sequences(connection)
        self.report.checks = checks
        orphaned = {
            name: count
            for name, count in checks.items()
            if name.endswith("orphans") and int(count) > 0
        }
        if orphaned:
            details = ", ".join(f"{name}={count}" for name, count in orphaned.items())
            raise MigrationError(f"Verificação de integridade falhou: {details}")

        mismatches: list[str] = []
        for spec in specs:
            table = Base.metadata.tables[spec.table]
            actual = int(connection.execute(select(func.count()).select_from(table)).scalar() or 0)
            report = self._table_report(spec.table)
            report.after = actual
            expected = report.before + report.inserted
            if actual != expected:
                mismatches.append(f"{spec.table}: contagem final {actual} != {expected}")
        if mismatches:
            raise MigrationError("; ".join(mismatches))

    def _reset_identity_sequences(self, connection: Connection) -> dict[str, int]:
        """Align PostgreSQL identity sequences with explicitly imported IDs.

        Chat messages preserve their legacy integer IDs. Without resetting the
        identity sequence, the next INSERT without an explicit ID would collide
        with an imported row.
        """

        reset: dict[str, int] = {}
        for table in Base.metadata.sorted_tables:
            for column in table.columns:
                if column.identity is None:
                    continue
                sequence = connection.execute(
                    text("SELECT pg_get_serial_sequence(:table, :column)"),
                    {"table": table.name, "column": column.name},
                ).scalar()
                if not sequence:
                    continue
                maximum = connection.execute(
                    text(f'SELECT COALESCE(MAX("{column.name}"), 0) FROM "{table.name}"')
                ).scalar()
                next_value = int(maximum or 0) + 1
                connection.execute(
                    text("SELECT setval(CAST(:sequence AS regclass), :value, false)"),
                    {"sequence": sequence, "value": next_value},
                )
                reset[table.name] = int(maximum or 0)
        return reset

    # -- helpers --------------------------------------------------------

    def _table_report(self, table: str) -> TableMigrationReport:
        report = self.report.tables.get(table)
        if report is None:
            report = TableMigrationReport(table=table)
            self.report.tables[table] = report
        note = next((spec.note for spec in SOURCE_LAYOUT if spec.table == table), None)
        if note and note not in report.notes:
            report.notes.append(note)
        return report


def run_migration(
    settings: DatabaseSettings,
    *,
    source_dir: Path | str = "data",
    backup_dir: Path | str = "data/migration-backups",
    dry_run: bool = False,
    allow_non_empty: bool = False,
    include_auth_attempts: bool = False,
    include_inference_cache: bool = False,
    on_error: str = "abort",
) -> MigrationReport:
    """Convenience wrapper used by the CLI and tests."""

    migrator = SqliteToPostgresMigrator(
        settings,
        source_dir=source_dir,
        backup_dir=backup_dir,
        dry_run=dry_run,
        allow_non_empty=allow_non_empty,
        include_auth_attempts=include_auth_attempts,
        include_inference_cache=include_inference_cache,
        on_error=on_error,
    )
    return migrator.run()
