"""Logical PostgreSQL backup and restore for the JARVIS persistence layer.

The backup is a gzip-compressed JSON document containing the rows of every
table managed by Alembic plus the current Alembic revision. It intentionally
does not dump schema DDL: schema changes stay under Alembic control, and a
restore only runs against a database already upgraded to the recorded revision.

The file contains credential hashes, session rows and audit events. Callers must
treat it as a secret and keep it outside version control with restrictive file
permissions.
"""

from __future__ import annotations

import base64
import gzip
import hashlib
import json
import os
from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, Integer, inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.sql.schema import Table

from services.database.config import DatabaseConfigurationError
from services.database.models import Base

BACKUP_FORMAT = "jarvis-postgresql-logical-backup"
BACKUP_FORMAT_VERSION = 1
_DEFAULT_DATABASE_SUFFIX = "_test"


@dataclass(frozen=True)
class BackupReport:
    path: str
    created_at: str
    database: str
    server_version: str
    alembic_revision: str
    tables: dict[str, int]
    payload_sha256: str
    file_sha256: str
    size_bytes: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "created_at": self.created_at,
            "database": self.database,
            "server_version": self.server_version,
            "alembic_revision": self.alembic_revision,
            "tables": dict(sorted(self.tables.items())),
            "payload_sha256": self.payload_sha256,
            "file_sha256": self.file_sha256,
            "size_bytes": self.size_bytes,
        }


@dataclass(frozen=True)
class RestoreReport:
    path: str
    database: str
    alembic_revision: str
    tables: dict[str, int]
    payload_sha256: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "database": self.database,
            "alembic_revision": self.alembic_revision,
            "tables": dict(sorted(self.tables.items())),
            "payload_sha256": self.payload_sha256,
        }


def create_postgresql_backup(
    engine: Engine,
    backup_dir: Path | str = Path("backups"),
    filename_prefix: str = "jarvis_backup",
) -> BackupReport:
    """Create a consistent logical snapshot of all Alembic-managed tables."""

    destination = Path(backup_dir)
    destination.mkdir(parents=True, exist_ok=True)

    tables = list(Base.metadata.sorted_tables)
    if not tables:
        raise DatabaseConfigurationError("Nenhuma tabela de modelo registada para backup.")

    expected_tables = {table.name for table in tables}
    with engine.connect() as connection:
        existing_tables = set(inspect(connection).get_table_names(schema="public"))
        missing = sorted(expected_tables - existing_tables)
        if missing:
            raise DatabaseConfigurationError(
                "Schema PostgreSQL incompleto; faltam tabelas para backup: "
                + ", ".join(missing)
            )

        revision = _read_alembic_revision(connection)
        database = str(
            connection.execute(text("SELECT current_database()")).scalar_one()
        )
        server_version = str(
            connection.execute(text("SHOW server_version")).scalar_one()
        )

        table_rows: dict[str, list[dict[str, Any]]] = {}
        for table in tables:
            rows = connection.execute(select(table)).mappings().all()
            table_rows[table.name] = [
                {key: _encode_value(value) for key, value in row.items()} for row in rows
            ]

    created_at = datetime.now(UTC).isoformat()
    payload: dict[str, Any] = {
        "format": BACKUP_FORMAT,
        "format_version": BACKUP_FORMAT_VERSION,
        "created_at": created_at,
        "database": database,
        "server_version": server_version,
        "alembic_revision": revision,
        "tables": table_rows,
    }
    payload_sha256 = _payload_checksum(payload)
    payload["sha256"] = payload_sha256

    backup_path = _unique_backup_path(destination, filename_prefix)
    serialized = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    with gzip.open(backup_path, "wb") as handle:
        handle.write(serialized)
    _restrict_permissions(backup_path)

    file_sha256 = _file_checksum(backup_path)
    return BackupReport(
        path=str(backup_path.resolve()),
        created_at=created_at,
        database=database,
        server_version=server_version,
        alembic_revision=revision,
        tables={name: len(rows) for name, rows in table_rows.items()},
        payload_sha256=payload_sha256,
        file_sha256=file_sha256,
        size_bytes=backup_path.stat().st_size,
    )


def restore_postgresql_backup(
    engine: Engine,
    snapshot_file: Path | str,
    *,
    allow_revision_mismatch: bool = False,
    allow_production: bool = False,
    expected_database_suffix: str = _DEFAULT_DATABASE_SUFFIX,
) -> RestoreReport:
    """Restore a logical snapshot into an already-migrated PostgreSQL database.

    Safeguards are intentional: the target database name must end with
    ``_test`` unless ``allow_production`` is explicitly true, and the Alembic
    revision must match unless ``allow_revision_mismatch`` is explicitly true.
    The whole restore runs in one transaction and rolls back on error.
    """

    snapshot_path = Path(snapshot_file)
    if not snapshot_path.exists():
        raise FileNotFoundError(f"Snapshot '{snapshot_path}' não encontrado.")

    payload = read_postgresql_backup(snapshot_path)
    snapshot_revision = str(payload["alembic_revision"])
    table_rows: dict[str, list[dict[str, Any]]] = payload["tables"]
    known_tables = list(Base.metadata.sorted_tables)
    known_names = {table.name for table in known_tables}

    missing = sorted(known_names - table_rows.keys())
    extra = sorted(table_rows.keys() - known_names)
    if missing or extra:
        raise DatabaseConfigurationError(
            "Snapshot incompatível com o schema atual. "
            f"Faltam: {missing or '-'} ; desconhecidas: {extra or '-'}."
        )

    table_by_name = {table.name: table for table in known_tables}
    restored_counts: dict[str, int] = {}

    with engine.begin() as connection:
        database = str(
            connection.execute(text("SELECT current_database()")).scalar_one()
        )
        if not allow_production and not database.endswith(expected_database_suffix):
            raise DatabaseConfigurationError(
                f"Restauro recusado em '{database}': o nome da base tem de terminar "
                f"em '{expected_database_suffix}'. Use allow_production=True apenas "
                "após confirmação explícita."
            )

        current_revision = _read_alembic_revision(connection)
        if current_revision != snapshot_revision and not allow_revision_mismatch:
            raise DatabaseConfigurationError(
                "Revisão Alembic incompatível: base em "
                f"{current_revision!r}, snapshot em {snapshot_revision!r}. "
                "Aplique as migrações ou use allow_revision_mismatch=True."
            )

        quoted_tables = ", ".join(
            connection.dialect.identifier_preparer.quote(table.name)
            for table in known_tables
        )
        connection.execute(
            text(f"TRUNCATE TABLE {quoted_tables} RESTART IDENTITY CASCADE")
        )

        for table in known_tables:
            rows = [
                _decode_row(table, row) for row in table_rows.get(table.name, [])
            ]
            if rows:
                connection.execute(table.insert(), rows)
            restored_counts[table.name] = len(rows)

        _reset_identity_sequences(connection, known_tables)

    return RestoreReport(
        path=str(snapshot_path.resolve()),
        database=database,
        alembic_revision=snapshot_revision,
        tables=restored_counts,
        payload_sha256=str(payload["sha256"]),
    )


def read_postgresql_backup(snapshot_file: Path | str) -> dict[str, Any]:
    """Read and verify a logical snapshot without touching a database."""

    snapshot_path = Path(snapshot_file)
    try:
        with gzip.open(snapshot_path, "rb") as handle:
            payload = json.loads(handle.read().decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise DatabaseConfigurationError(
            f"Snapshot PostgreSQL inválido ou corrompido: {snapshot_path.name}."
        ) from exc

    if not isinstance(payload, dict):
        raise DatabaseConfigurationError("Snapshot PostgreSQL sem objeto raiz.")
    if payload.get("format") != BACKUP_FORMAT:
        raise DatabaseConfigurationError("Formato de snapshot PostgreSQL desconhecido.")
    if payload.get("format_version") != BACKUP_FORMAT_VERSION:
        raise DatabaseConfigurationError(
            "Versão de snapshot PostgreSQL não suportada: "
            f"{payload.get('format_version')!r}."
        )

    recorded_checksum = str(payload.pop("sha256", "") or "")
    if not recorded_checksum:
        raise DatabaseConfigurationError("Snapshot PostgreSQL sem checksum.")
    actual_checksum = _payload_checksum(payload)
    if recorded_checksum != actual_checksum:
        raise DatabaseConfigurationError(
            "Checksum do snapshot PostgreSQL não coincide; ficheiro alterado."
        )

    required = {"created_at", "database", "server_version", "alembic_revision", "tables"}
    missing = sorted(required - payload.keys())
    if missing:
        raise DatabaseConfigurationError(
            "Snapshot PostgreSQL incompleto; faltam campos: " + ", ".join(missing)
        )
    if not isinstance(payload["tables"], dict):
        raise DatabaseConfigurationError("Snapshot PostgreSQL com tabelas inválidas.")
    payload["sha256"] = recorded_checksum
    return payload


def _read_alembic_revision(connection: Any) -> str:
    exists = connection.execute(
        text("SELECT to_regclass('public.alembic_version')")
    ).scalar()
    if not exists:
        raise DatabaseConfigurationError(
            "A base PostgreSQL não tem 'alembic_version'; execute as migrações."
        )
    revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
    if not revision:
        raise DatabaseConfigurationError("A base PostgreSQL não tem revisão Alembic.")
    return str(revision)


def _payload_checksum(payload: dict[str, Any]) -> str:
    serialized = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(serialized).hexdigest()


def _file_checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _unique_backup_path(destination: Path, prefix: str) -> Path:
    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    candidate = destination / f"{prefix}_{timestamp}.json.gz"
    counter = 1
    while candidate.exists():
        candidate = destination / f"{prefix}_{timestamp}_{counter}.json.gz"
        counter += 1
    return candidate


def _restrict_permissions(path: Path) -> None:
    try:
        os.chmod(path, 0o600)
    except OSError:
        # Windows may not support POSIX modes; the parent directory policy still
        # applies. Failure to tighten permissions must not discard a valid backup.
        pass


def _encode_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return {"__type__": "datetime", "value": value.isoformat()}
    if isinstance(value, date) and not isinstance(value, datetime):
        return {"__type__": "date", "value": value.isoformat()}
    if isinstance(value, time):
        return {"__type__": "time", "value": value.isoformat()}
    if isinstance(value, Decimal):
        return {"__type__": "decimal", "value": str(value)}
    if isinstance(value, bytes):
        return {
            "__type__": "bytes",
            "value": base64.b64encode(value).decode("ascii"),
        }
    if isinstance(value, UUID):
        return {"__type__": "uuid", "value": str(value)}
    return value


def _decode_row(table: Table, row: dict[str, Any]) -> dict[str, Any]:
    decoded: dict[str, Any] = {}
    for column in table.columns:
        if column.name not in row:
            raise DatabaseConfigurationError(
                f"Snapshot sem a coluna '{column.name}' da tabela '{table.name}'."
            )
        decoded[column.name] = _decode_value(column.type, row[column.name])
    return decoded


def _decode_value(column_type: Any, value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, dict) and "__type__" in value:
        marker = value["__type__"]
        raw = value.get("value")
        if marker == "datetime":
            return datetime.fromisoformat(str(raw))
        if marker == "date":
            return date.fromisoformat(str(raw))
        if marker == "time":
            return time.fromisoformat(str(raw))
        if marker == "decimal":
            return Decimal(str(raw))
        if marker == "bytes":
            return base64.b64decode(str(raw))
        if marker == "uuid":
            return UUID(str(raw))
        raise DatabaseConfigurationError(f"Valor de snapshot desconhecido: {marker!r}.")
    if isinstance(column_type, DateTime) and isinstance(value, str):
        return datetime.fromisoformat(value)
    if isinstance(column_type, Integer) and isinstance(value, bool):
        return int(value)
    return value


def _reset_identity_sequences(connection: Any, tables: list[Table]) -> None:
    preparer = connection.dialect.identifier_preparer
    for table in tables:
        for column in table.primary_key.columns:
            if not isinstance(column.type, Integer):
                continue
            sequence = connection.execute(
                text("SELECT pg_get_serial_sequence(:table_name, :column_name)"),
                {"table_name": table.name, "column_name": column.name},
            ).scalar()
            if not sequence:
                continue
            quoted_table = preparer.quote(table.name)
            quoted_column = preparer.quote(column.name)
            maximum = connection.execute(
                text(f"SELECT COALESCE(MAX({quoted_column}), 0) FROM {quoted_table}")
            ).scalar()
            maximum_value = int(maximum or 0)
            connection.execute(
                text("SELECT setval(:sequence, :value, :called)"),
                {
                    "sequence": sequence,
                    "value": maximum_value if maximum_value > 0 else 1,
                    "called": maximum_value > 0,
                },
            )
