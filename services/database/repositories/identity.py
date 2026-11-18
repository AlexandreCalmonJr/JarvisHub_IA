"""Identity persistence contracts and SQLite compatibility adapter.

Password hashing and authentication policy stay in UserCredentialStore. This
module owns only account-row persistence and its transactional invariants.
"""
from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from contextlib import contextmanager
from pathlib import Path
from typing import Protocol, Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from services.database.models.identity import HumanUser


class IdentityRepository(Protocol):
    def create_user(
        self,
        *,
        username: str,
        display_name: str,
        password_hash: str,
        role: str,
        created_at: str,
    ) -> None: ...
    def get_auth_record(self, username: str) -> dict[str, Any] | None: ...
    def get_user(self, username: str) -> dict[str, Any] | None: ...
    def list_users(self) -> list[dict[str, Any]]: ...
    def set_password(self, username: str, password_hash: str, updated_at: str) -> bool: ...
    def set_active(self, username: str, is_active: bool, updated_at: str) -> bool: ...


class SqliteIdentityRepository:
    """SQLite identity adapter preserving the legacy human_users schema."""

    def __init__(self, database_path: Path | str):
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.database_path, timeout=10, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=10000")
        return conn

    @contextmanager
    def _connection(self):
        conn = self._connect()
        try:
            yield conn
        finally:
            conn.close()

    def _initialize(self) -> None:
        with self._connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS human_users (
                    username TEXT PRIMARY KEY COLLATE NOCASE,
                    display_name TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('admin', 'developer', 'auditor')),
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            schema_row = conn.execute(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='human_users'"
            ).fetchone()
            if schema_row and "'admin'" not in (schema_row["sql"] or ""):
                conn.execute("BEGIN IMMEDIATE")
                try:
                    conn.execute("ALTER TABLE human_users RENAME TO human_users_legacy")
                    conn.execute(
                        """
                        CREATE TABLE human_users (
                            username TEXT PRIMARY KEY COLLATE NOCASE,
                            display_name TEXT NOT NULL,
                            password_hash TEXT NOT NULL,
                            role TEXT NOT NULL CHECK(role IN ('admin', 'developer', 'auditor')),
                            is_active INTEGER NOT NULL DEFAULT 1,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL
                        )
                        """
                    )
                    conn.execute(
                        """
                        INSERT INTO human_users
                        (username, display_name, password_hash, role, is_active, created_at, updated_at)
                        SELECT username, display_name, password_hash, role, is_active, created_at, updated_at
                        FROM human_users_legacy
                        """
                    )
                    conn.execute("DROP TABLE human_users_legacy")
                    conn.commit()
                except Exception:
                    conn.rollback()
                    raise

    def create_user(
        self,
        *,
        username: str,
        display_name: str,
        password_hash: str,
        role: str,
        created_at: str,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO human_users
                (username, display_name, password_hash, role, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, 1, ?, ?)
                """,
                (username, display_name, password_hash, role, created_at, created_at),
            )

    def get_auth_record(self, username: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM human_users WHERE username = ? COLLATE NOCASE", (username,)
            ).fetchone()
        return dict(row) if row else None

    def get_user(self, username: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT username, display_name, role, is_active, created_at, updated_at
                FROM human_users WHERE username = ? COLLATE NOCASE
                """,
                (username,),
            ).fetchone()
        return dict(row) if row else None

    def list_users(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT username, display_name, role, is_active, created_at, updated_at
                FROM human_users ORDER BY username COLLATE NOCASE
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def set_password(self, username: str, password_hash: str, updated_at: str) -> bool:
        with self._connect() as conn:
            cursor = conn.execute(
                """
                UPDATE human_users SET password_hash = ?, updated_at = ?
                WHERE username = ? COLLATE NOCASE
                """,
                (password_hash, updated_at, username),
            )
        return cursor.rowcount == 1

    def set_active(self, username: str, is_active: bool, updated_at: str) -> bool:
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            if not is_active:
                target = conn.execute(
                    "SELECT role, is_active FROM human_users WHERE username = ? COLLATE NOCASE",
                    (username,),
                ).fetchone()
                if target and target["role"] == "admin" and target["is_active"]:
                    active_admins = conn.execute(
                        "SELECT COUNT(*) FROM human_users WHERE role='admin' AND is_active=1"
                    ).fetchone()[0]
                    if active_admins <= 1:
                        raise ValueError(
                            "Não é permitido desativar o último administrador ativo."
                        )
            cursor = conn.execute(
                """
                UPDATE human_users SET is_active = ?, updated_at = ?
                WHERE username = ? COLLATE NOCASE
                """,
                (int(is_active), updated_at, username),
            )
            conn.commit()
            return cursor.rowcount == 1
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


class SqlAlchemyIdentityRepository:
    """SQLAlchemy identity adapter; receives the application's session factory."""

    def __init__(self, session_factory):
        self._session_factory = session_factory

    @staticmethod
    def _parse_datetime(value: str) -> datetime:
        parsed = datetime.fromisoformat(value)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)

    @staticmethod
    def _public_record(user: HumanUser, include_password: bool = False) -> dict[str, Any]:
        record = {
            "username": user.username,
            "display_name": user.display_name,
            "role": user.role,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat(),
            "updated_at": user.updated_at.isoformat(),
        }
        if include_password:
            record["password_hash"] = user.password_hash
        return record

    def create_user(
        self,
        *,
        username: str,
        display_name: str,
        password_hash: str,
        role: str,
        created_at: str,
    ) -> None:
        timestamp = self._parse_datetime(created_at)
        try:
            with self._session_factory.begin() as session:
                session.add(
                    HumanUser(
                        username=username,
                        username_normalized=username.casefold(),
                        display_name=display_name,
                        password_hash=password_hash,
                        role=role,
                        is_active=True,
                        created_at=timestamp,
                        updated_at=timestamp,
                    )
                )
        except IntegrityError as exc:
            raise ValueError(
                "Já existe uma conta com esse nome de utilizador."
            ) from exc

    def get_auth_record(self, username: str) -> dict[str, Any] | None:
        with self._session_factory() as session:
            user = session.scalar(
                select(HumanUser).where(
                    HumanUser.username_normalized == username.casefold()
                )
            )
            return self._public_record(user, include_password=True) if user else None

    def get_user(self, username: str) -> dict[str, Any] | None:
        with self._session_factory() as session:
            user = session.scalar(
                select(HumanUser).where(
                    HumanUser.username_normalized == username.casefold()
                )
            )
            return self._public_record(user) if user else None

    def list_users(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            users = session.scalars(
                select(HumanUser).order_by(HumanUser.username_normalized)
            ).all()
            return [self._public_record(user) for user in users]

    def set_password(self, username: str, password_hash: str, updated_at: str) -> bool:
        with self._session_factory.begin() as session:
            user = session.scalar(
                select(HumanUser).where(
                    HumanUser.username_normalized == username.casefold()
                )
            )
            if user is None:
                return False
            user.password_hash = password_hash
            user.updated_at = self._parse_datetime(updated_at)
            return True

    def set_active(self, username: str, is_active: bool, updated_at: str) -> bool:
        with self._session_factory.begin() as session:
            user = session.scalar(
                select(HumanUser).where(
                    HumanUser.username_normalized == username.casefold()
                )
            )
            if user is None:
                return False

            if not is_active and user.role == "admin" and user.is_active:
                # Lock every active administrator so concurrent deactivations
                # cannot both pass the last-admin invariant.
                active_admins = session.scalars(
                    select(HumanUser)
                    .where(HumanUser.role == "admin", HumanUser.is_active.is_(True))
                    .with_for_update()
                ).all()
                if len(active_admins) <= 1:
                    raise ValueError(
                        "Não é permitido desativar o último administrador ativo."
                    )

            user.is_active = is_active
            user.updated_at = self._parse_datetime(updated_at)
            return True
