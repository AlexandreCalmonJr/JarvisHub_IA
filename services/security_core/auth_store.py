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
