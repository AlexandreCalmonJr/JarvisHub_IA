import hashlib
import hmac
import json
import os
import secrets
from datetime import UTC, datetime
from pathlib import Path


def hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


class AdminCredentialStore:
    """
    Guarda a credencial de administrador apenas como hash SHA-256 de um token
    aleatório de 256 bits. Não existe password partilhada nem bypass por IP.
    """

    def __init__(self, store_path: Path | str):
        self.store_path = Path(store_path)
        self._data: dict = {}
        self._load()

    def _load(self) -> None:
        if not self.store_path.exists():
            self._data = {}
            return
        try:
            self._data = json.loads(self.store_path.read_text(encoding="utf-8"))
        except Exception:
            self._data = {}

    def _save(self) -> None:
        self.store_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.store_path.with_suffix(self.store_path.suffix + ".tmp")
        tmp_path.write_text(json.dumps(self._data, indent=2), encoding="utf-8")
        try:
            os.chmod(tmp_path, 0o600)
        except OSError:
            pass
        os.replace(tmp_path, self.store_path)

    @property
    def has_credential(self) -> bool:
        return bool(self._data.get("admin_token_hash"))

    def set_token(self, token: str) -> None:
        self._data = {
            "admin_token_hash": hash_secret(token),
            "created_at": datetime.now(UTC).isoformat(),
        }
        self._save()

    def generate_token(self) -> str:
        token = f"jrv_admin_{secrets.token_urlsafe(32)}"
        self.set_token(token)
        return token

    def verify(self, token: str) -> bool:
        stored = self._data.get("admin_token_hash")
        if not stored or not token:
            return False
        return hmac.compare_digest(stored, hash_secret(token))

    def clear(self) -> None:
        self._data = {}
        self._save()


class UserCredentialStore:
    """Contas humanas locais; passwords armazenadas com PBKDF2-HMAC-SHA256."""

    ITERATIONS = 310_000

    def __init__(self, database_path: Path | str):
        import sqlite3

        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._dummy_hash = self._hash_password(secrets.token_urlsafe(32))
        with sqlite3.connect(self.database_path, timeout=10) as conn:
            conn.execute("PRAGMA busy_timeout=10000")
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
                "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'human_users'"
            ).fetchone()
            if schema_row and "'admin'" not in (schema_row[0] or ""):
                conn.execute("ALTER TABLE human_users RENAME TO human_users_legacy")
                conn.execute(
                    """CREATE TABLE human_users (
                        username TEXT PRIMARY KEY COLLATE NOCASE,
                        display_name TEXT NOT NULL,
                        password_hash TEXT NOT NULL,
                        role TEXT NOT NULL CHECK(role IN ('admin', 'developer', 'auditor')),
                        is_active INTEGER NOT NULL DEFAULT 1,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )"""
                )
                conn.execute(
                    """INSERT INTO human_users
                    (username, display_name, password_hash, role, is_active, created_at, updated_at)
                    SELECT username, display_name, password_hash, role, is_active, created_at, updated_at
                    FROM human_users_legacy"""
                )
                conn.execute("DROP TABLE human_users_legacy")

    @classmethod
    def _hash_password(cls, password: str) -> str:
        import base64

        salt = secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, cls.ITERATIONS)
        return "pbkdf2_sha256$" + str(cls.ITERATIONS) + "$" + base64.urlsafe_b64encode(salt).decode("ascii") + "$" + base64.urlsafe_b64encode(digest).decode("ascii")

    @classmethod
    def _verify_password(cls, password: str, encoded: str) -> bool:
        import base64

        try:
            algorithm, iterations, salt_b64, digest_b64 = encoded.split("$", 3)
            if algorithm != "pbkdf2_sha256":
                return False
            salt = base64.urlsafe_b64decode(salt_b64.encode("ascii"))
            expected = base64.urlsafe_b64decode(digest_b64.encode("ascii"))
            actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
            return hmac.compare_digest(actual, expected)
        except (ValueError, TypeError):
            return False

    def create_user(self, username: str, display_name: str, password: str, role: str) -> dict:
        import sqlite3

        if role not in {"admin", "developer", "auditor"}:
            raise ValueError("Perfil de acesso inválido.")
        now = datetime.now(UTC).isoformat()
        password_hash = self._hash_password(password)
        try:
            with sqlite3.connect(self.database_path, timeout=10) as conn:
                conn.execute("PRAGMA busy_timeout=10000")
                conn.execute(
                    """INSERT INTO human_users
                    (username, display_name, password_hash, role, is_active, created_at, updated_at)
                    VALUES (?, ?, ?, ?, 1, ?, ?)""",
                    (username, display_name, password_hash, role, now, now),
                )
        except sqlite3.IntegrityError as exc:
            raise ValueError("Já existe uma conta com esse nome de utilizador.") from exc
        return self.get_user(username)

    def authenticate(self, username: str, password: str) -> dict | None:
        import sqlite3

        with sqlite3.connect(self.database_path, timeout=10) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM human_users WHERE username = ? COLLATE NOCASE",
                (username,),
            ).fetchone()
        if not row:
            self._verify_password(password, self._dummy_hash)
            return None
        if not row["is_active"]:
            self._verify_password(password, row["password_hash"])
            return None
        if not self._verify_password(password, row["password_hash"]):
            return None
        return {key: row[key] for key in ("username", "display_name", "role", "is_active", "created_at")}

    def get_user(self, username: str) -> dict | None:
        import sqlite3

        with sqlite3.connect(self.database_path, timeout=10) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                """SELECT username, display_name, role, is_active, created_at, updated_at
                FROM human_users WHERE username = ? COLLATE NOCASE""",
                (username,),
            ).fetchone()
        return dict(row) if row else None

    def list_users(self) -> list[dict]:
        import sqlite3

        with sqlite3.connect(self.database_path, timeout=10) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """SELECT username, display_name, role, is_active, created_at, updated_at
                FROM human_users ORDER BY username COLLATE NOCASE"""
            ).fetchall()
        return [dict(row) for row in rows]

    def set_password(self, username: str, password: str) -> bool:
        import sqlite3

        with sqlite3.connect(self.database_path, timeout=10) as conn:
            cursor = conn.execute(
                "UPDATE human_users SET password_hash = ?, updated_at = ? WHERE username = ? COLLATE NOCASE",
                (self._hash_password(password), datetime.now(UTC).isoformat(), username),
            )
        return cursor.rowcount == 1

    def set_active(self, username: str, is_active: bool) -> bool:
        import sqlite3

        with sqlite3.connect(self.database_path, timeout=10) as conn:
            conn.execute("PRAGMA busy_timeout=10000")
            if not is_active:
                target = conn.execute(
                    "SELECT role, is_active FROM human_users WHERE username = ? COLLATE NOCASE",
                    (username,),
                ).fetchone()
                if target and target[0] == "admin" and target[1]:
                    active_admins = conn.execute(
                        "SELECT COUNT(*) FROM human_users WHERE role = 'admin' AND is_active = 1"
                    ).fetchone()[0]
                    if active_admins <= 1:
                        raise ValueError("Não é permitido desativar o último administrador ativo.")
            cursor = conn.execute(
                "UPDATE human_users SET is_active = ?, updated_at = ? WHERE username = ? COLLATE NOCASE",
                (int(is_active), datetime.now(UTC).isoformat(), username),
            )
        return cursor.rowcount == 1
