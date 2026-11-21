import hashlib
import hmac
import json
import os
import secrets
from datetime import UTC, datetime
from pathlib import Path


def hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


class UserAlreadyExistsError(ValueError):
    """Conflito de unicidade do nome de utilizador (não é um erro de tipo)."""


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
    """Facade de compatibilidade para contas humanas; hashes permanecem nesta camada."""

    ITERATIONS = 310_000

    def __init__(self, database_path: Path | str, repository=None):
        from services.database.repositories.identity import SqliteIdentityRepository

        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._dummy_hash = self._hash_password(secrets.token_urlsafe(32))
        self._repository = repository or SqliteIdentityRepository(self.database_path)

    @classmethod
    def _hash_password(cls, password: str) -> str:
        import base64

        salt = secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, cls.ITERATIONS)
        return (
            "pbkdf2_sha256$"
            + str(cls.ITERATIONS)
            + "$"
            + base64.urlsafe_b64encode(salt).decode("ascii")
            + "$"
            + base64.urlsafe_b64encode(digest).decode("ascii")
        )

    @classmethod
    def _verify_password(cls, password: str, encoded: str) -> bool:
        import base64

        try:
            algorithm, iterations, salt_b64, digest_b64 = encoded.split("$", 3)
            if algorithm != "pbkdf2_sha256":
                return False
            rounds = int(iterations)
            if rounds < 1 or rounds > 2_000_000:
                return False
            salt = base64.urlsafe_b64decode(salt_b64.encode("ascii"))
            expected = base64.urlsafe_b64decode(digest_b64.encode("ascii"))
            actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, rounds)
            return hmac.compare_digest(actual, expected)
        except (ValueError, TypeError):
            return False

    def create_user(self, username: str, display_name: str, password: str, role: str) -> dict:
        if role not in {"admin", "developer", "auditor"}:
            raise ValueError("Perfil de acesso inválido.")
        try:
            self._repository.create_user(
                username=username,
                display_name=display_name,
                password_hash=self._hash_password(password),
                role=role,
                created_at=datetime.now(UTC).isoformat(),
            )
        except Exception as exc:
            import sqlite3

            if isinstance(exc, sqlite3.IntegrityError):
                raise UserAlreadyExistsError(
                    "Já existe uma conta com esse nome de utilizador."
                ) from exc
            raise
        return self.get_user(username)

    def authenticate(self, username: str, password: str) -> dict | None:
        row = self._repository.get_auth_record(username)
        if not row:
            self._verify_password(password, self._dummy_hash)
            return None
        if not row["is_active"]:
            self._verify_password(password, row["password_hash"])
            return None
        if not self._verify_password(password, row["password_hash"]):
            return None
        return {
            key: row[key] for key in ("username", "display_name", "role", "is_active", "created_at")
        }

    def get_user(self, username: str) -> dict | None:
        return self._repository.get_user(username)

    def list_users(self) -> list[dict]:
        return self._repository.list_users()

    def set_password(self, username: str, password: str) -> bool:
        return self._repository.set_password(
            username, self._hash_password(password), datetime.now(UTC).isoformat()
        )

    def set_active(self, username: str, is_active: bool) -> bool:
        return self._repository.set_active(username, is_active, datetime.now(UTC).isoformat())
