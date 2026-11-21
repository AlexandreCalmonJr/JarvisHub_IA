"""DB-API compatibility layer for running legacy SQL on PostgreSQL.

``DatabaseManager`` predates the SQLAlchemy models and is written against
``sqlite3``. Its SQL is deliberately kept as the single source of behaviour:
this module translates the small set of SQLite-only constructs that the facade
uses, instead of maintaining a second, divergent implementation of every
method.

Supported translations:

* ``?`` placeholders become psycopg ``%s`` placeholders.
* ``x IS ?`` and ``x IS <expression>`` become ``IS NOT DISTINCT FROM``.
* Literal percent signs are escaped for psycopg.
* ``datetime``/``date``/``time`` values returned by PostgreSQL are rendered as
  ISO strings, matching the legacy SQLite contract.

Unsupported SQLite-only statements fail loudly. Silent misinterpretation of
``INSERT OR REPLACE`` or ``datetime('now')`` would risk data loss.
"""

from __future__ import annotations

import logging
import re
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

from psycopg.rows import dict_row

from .config import DatabaseConfigurationError

logger = logging.getLogger("jarvis.database.sql_compat")

_IS_NOT_DISTINCT = re.compile(
    r"\bIS\s+(?!NULL\b|NOT\b|TRUE\b|FALSE\b|UNKNOWN\b|DISTINCT\b)"
    r"(excluded\.\w+|\?)",
    re.IGNORECASE,
)
_BOOL_COLS = r"(?:is_completed|is_read_only|is_approved|is_revoked|reversible|enabled|is_active)"
_SQL_BOOL_EQ_ZERO = re.compile(rf"\b({_BOOL_COLS})\s*=\s*0\b", re.IGNORECASE)
_SQL_BOOL_EQ_ONE = re.compile(rf"\b({_BOOL_COLS})\s*=\s*1\b", re.IGNORECASE)
_SQL_BOOL_SET_ZERO = re.compile(rf"\bSET\s+({_BOOL_COLS})\s*=\s*0\b", re.IGNORECASE)
_SQL_BOOL_SET_ONE = re.compile(rf"\bSET\s+({_BOOL_COLS})\s*=\s*1\b", re.IGNORECASE)

_SQLITE_ONLY_PATTERNS = (
    ("insert or replace", "INSERT OR REPLACE"),
    ("insert or ignore", "INSERT OR IGNORE"),
    ("insert or abort", "INSERT OR ABORT"),
    ("insert or fail", "INSERT OR FAIL"),
    ("datetime('now')", "datetime('now')"),
    ('datetime("now")', 'datetime("now")'),
)


def translate_sqlite_sql(sql: str) -> str:
    """Translate SQLite-flavoured SQL to psycopg-compatible SQL."""

    if not sql or not sql.strip():
        return sql

    lowered = sql.lower()
    for needle, label in _SQLITE_ONLY_PATTERNS:
        if needle in lowered:
            raise DatabaseConfigurationError(
                f"SQL SQLite-only não suportado em PostgreSQL: {label}. "
                "Use a variante portável (ON CONFLICT) ou o repositório SQLAlchemy."
            )

    translated = _IS_NOT_DISTINCT.sub(
        lambda match: f"IS NOT DISTINCT FROM {match.group(1)}", sql
    )
    translated = _SQL_BOOL_EQ_ZERO.sub(r"\1 = FALSE", translated)
    translated = _SQL_BOOL_EQ_ONE.sub(r"\1 = TRUE", translated)
    translated = _SQL_BOOL_SET_ZERO.sub(r"SET \1 = FALSE", translated)
    translated = _SQL_BOOL_SET_ONE.sub(r"SET \1 = TRUE", translated)

    result: list[str] = []
    index = 0
    quote: str | None = None
    length = len(translated)

    while index < length:
        char = translated[index]

        if quote is not None:
            if char == "%":
                result.append("%%")
            else:
                result.append(char)
            if char == quote:
                if index + 1 < length and translated[index + 1] == quote:
                    result.append(quote)
                    index += 2
                    continue
                quote = None
            index += 1
            continue

        if char in {"'", '"'}:
            quote = char
            result.append(char)
            index += 1
            continue

        if char == "-" and index + 1 < length and translated[index + 1] == "-":
            end = translated.find("\n", index)
            if end == -1:
                result.append(translated[index:].replace("%", "%%"))
                break
            result.append(translated[index:end].replace("%", "%%"))
            result.append("\n")
            index = end + 1
            continue

        if char == "/" and index + 1 < length and translated[index + 1] == "*":
            end = translated.find("*/", index + 2)
            if end == -1:
                result.append(translated[index:].replace("%", "%%"))
                break
            result.append(translated[index : end + 2].replace("%", "%%"))
            index = end + 2
            continue

        if char == "%":
            result.append("%%")
        elif char == "?":
            result.append("%s")
        else:
            result.append(char)
        index += 1

    return "".join(result)


def normalize_pg_value(value: Any) -> Any:
    """Render PostgreSQL scalar values using the legacy SQLite-shaped contract."""

    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, time):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


class PgRow(dict):
    """Dictionary representing a database row, also supporting tuple/index access like sqlite3.Row."""

    def __init__(self, mapping: dict[str, Any]):
        super().__init__(mapping)
        self._sequence = list(mapping.values())

    def __getitem__(self, item: Any) -> Any:
        if isinstance(item, int):
            return self._sequence[item]
        return super().__getitem__(item)


def normalize_pg_row(row: Any) -> PgRow | dict[str, Any]:
    if row is None:
        return {}
    return PgRow({key: normalize_pg_value(value) for key, value in dict(row).items()})


class PgCompatCursor:
    """Small cursor facade exposing the methods used by ``DatabaseManager``."""

    def __init__(self, cursor: Any, lastrowid: int | None = None):
        self._cursor = cursor
        self._lastrowid = lastrowid

    @property
    def rowcount(self) -> int:
        return int(self._cursor.rowcount or 0)

    @property
    def lastrowid(self) -> int | None:
        if self._lastrowid is not None:
            return self._lastrowid
        value = getattr(self._cursor, "lastrowid", None)
        return int(value) if value is not None else None

    def fetchone(self) -> dict[str, Any] | None:
        row = self._cursor.fetchone()
        return normalize_pg_row(row) if row is not None else None

    def fetchall(self) -> list[dict[str, Any]]:
        return [normalize_pg_row(row) for row in self._cursor.fetchall()]

    def fetchmany(self, size: int = 1) -> list[dict[str, Any]]:
        return [normalize_pg_row(row) for row in self._cursor.fetchmany(size)]

    def close(self) -> None:
        self._cursor.close()

    def __iter__(self):
        for row in self._cursor:
            yield normalize_pg_row(row)


class PgCompatConnection:
    """DB-API connection facade backed by a pooled psycopg connection.

    The context-manager semantics mirror ``sqlite3.Connection``: success
    commits, an exception rolls back, and the pooled connection is returned in
    either case.
    """

    def __init__(self, pooled_connection: Any):
        self._pooled = pooled_connection
        if hasattr(pooled_connection, "driver_connection"):
            self._raw = pooled_connection.driver_connection
        elif hasattr(pooled_connection, "connection") and hasattr(
            pooled_connection.connection, "driver_connection"
        ):
            self._raw = pooled_connection.connection.driver_connection
        elif hasattr(pooled_connection, "connection") and hasattr(
            pooled_connection.connection, "dbapi_connection"
        ):
            self._raw = pooled_connection.connection.dbapi_connection
        else:
            self._raw = getattr(pooled_connection, "_dbapi_connection", pooled_connection)

    @property
    def is_postgresql(self) -> bool:
        return True

    @property
    def in_transaction(self) -> bool:
        return bool(self._raw.info.transaction_status.name != "IDLE")

    def execute(self, sql: str, params: Any = ()) -> PgCompatCursor:
        cursor = self._raw.cursor(row_factory=dict_row)
        translated = translate_sqlite_sql(sql)
        lastrowid = None
        if (
            translated.strip().lower().startswith("insert into chat_messages")
            and "returning" not in translated.lower()
        ):
            translated = f"{translated.rstrip().rstrip(';')} RETURNING id"
            cursor.execute(translated, params if params else None)
            row = cursor.fetchone()
            if row is not None:
                lastrowid = int(list(row.values())[0])
            return PgCompatCursor(cursor, lastrowid=lastrowid)

        cursor.execute(translated, params if params else None)
        return PgCompatCursor(cursor)

    def cursor(self) -> PgCompatCursor:
        return PgCompatCursor(self._raw.cursor(row_factory=dict_row))

    def executescript(self, script: str) -> None:
        statements = [s.strip() for s in script.split(";") if s.strip()]
        is_schema_ddl = all(
            stmt.upper().startswith(
                ("CREATE TABLE", "CREATE INDEX", "PRAGMA", "ALTER TABLE", "DROP TABLE")
            )
            for stmt in statements
        )
        if is_schema_ddl:
            logger.debug(
                "Ignorando DDL de executescript em PostgreSQL: o schema é gerido por Alembic."
            )
            return
        for stmt in statements:
            self.execute(stmt)

    def commit(self) -> None:
        self._raw.commit()

    def rollback(self) -> None:
        self._raw.rollback()

    def close(self) -> None:
        try:
            if not self._raw.closed:
                if self._raw.info.transaction_status.name != "IDLE":
                    self._raw.rollback()
        finally:
            self._pooled.close()

    def __enter__(self) -> PgCompatConnection:
        return self

    def __exit__(self, exc_type, exc, traceback) -> bool:
        try:
            if exc_type is None:
                self._raw.commit()
            else:
                self._raw.rollback()
        finally:
            self.close()
        return False
