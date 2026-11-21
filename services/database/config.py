"""Explicit database backend configuration.

SQLite remains the default while the PostgreSQL adapters are rolled out. When
PostgreSQL is selected the configuration is fail-closed: a missing URL or a
mismatched backend raises instead of silently falling back to SQLite.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from os import environ as process_environ
from pathlib import Path
from typing import Literal

from sqlalchemy.engine import make_url

Backend = Literal["sqlite", "postgresql"]

VALID_BACKENDS = ("sqlite", "postgresql")
_POSTGRES_PREFIXES = ("postgres://", "postgresql://", "postgresql+")
_DEFAULT_SQLITE_PATH = Path("data") / "jarvis.db"


class DatabaseConfigurationError(RuntimeError):
    """Configuração de base de dados inválida ou incompleta."""


@dataclass(frozen=True, slots=True)
class DatabaseSettings:
    """Resolved database configuration.

    ``url`` is always a SQLAlchemy URL. PostgreSQL URLs are normalised to the
    synchronous ``psycopg`` driver because the current application contracts
    are synchronous; async SQLAlchemy is intentionally not introduced here.
    """

    backend: Backend
    url: str
    pool_size: int = 5
    max_overflow: int = 5
    pool_timeout: float = 30.0
    pool_recycle: int = 1800
    echo: bool = False

    @property
    def is_postgresql(self) -> bool:
        return self.backend == "postgresql"

    @classmethod
    def from_env(
        cls,
        environ: Mapping[str, str] | None = None,
        *,
        require_explicit_url: bool = False,
    ) -> DatabaseSettings:
        """Build settings from environment variables.

        ``require_explicit_url`` is used by Alembic: running migrations must
        always target an explicitly supplied database, never an implicit local
        file that could be mistaken for the application database.
        """

        env = process_environ if environ is None else environ
        raw_backend = str(env.get("JARVIS_DATABASE_BACKEND", "") or "").strip().lower()
        raw_url = str(env.get("JARVIS_DATABASE_URL") or env.get("DATABASE_URL") or "").strip()

        if raw_backend and raw_backend not in VALID_BACKENDS:
            raise DatabaseConfigurationError(
                "JARVIS_DATABASE_BACKEND deve ser 'sqlite' ou 'postgresql'."
            )

        if not raw_backend:
            raw_backend = "postgresql" if _looks_like_postgres(raw_url) else "sqlite"

        if raw_backend == "postgresql":
            if not raw_url:
                raise DatabaseConfigurationError(
                    "JARVIS_DATABASE_BACKEND=postgresql exige JARVIS_DATABASE_URL ou DATABASE_URL."
                )
            if not _looks_like_postgres(raw_url):
                raise DatabaseConfigurationError(
                    "A URL configurada não é PostgreSQL; recusando arranque fail-closed."
                )
            url = normalize_postgres_url(raw_url)
        else:
            if _looks_like_postgres(raw_url):
                raise DatabaseConfigurationError(
                    "JARVIS_DATABASE_BACKEND=sqlite contradiz uma URL PostgreSQL. "
                    "Corrija a configuração em vez de permitir fallback silencioso."
                )
            url = raw_url or _default_sqlite_url(env)
            if not url.startswith("sqlite"):
                raise DatabaseConfigurationError(
                    "JARVIS_DATABASE_URL deve usar o dialeto sqlite em modo SQLite."
                )

        if require_explicit_url and not raw_url:
            raise DatabaseConfigurationError(
                "Defina JARVIS_DATABASE_URL ou DATABASE_URL para executar migrações."
            )

        return cls(
            backend=raw_backend,  # type: ignore[arg-type]
            url=url,
            pool_size=_env_int(env, "JARVIS_DATABASE_POOL_SIZE", 5, minimum=1),
            max_overflow=_env_int(env, "JARVIS_DATABASE_MAX_OVERFLOW", 5, minimum=0),
            pool_timeout=_env_float(env, "JARVIS_DATABASE_POOL_TIMEOUT", 30.0, minimum=0.1),
            pool_recycle=_env_int(env, "JARVIS_DATABASE_POOL_RECYCLE", 1800, minimum=0),
            echo=_env_bool(env, "JARVIS_DATABASE_ECHO", False),
        )


def ensure_sqlite_runtime(environ: Mapping[str, str] | None = None) -> None:
    """Fail closed while SQLite is the only wired runtime backend.

    Ignoring a PostgreSQL selection would silently keep the SQLite
    implementation, which is exactly the fallback the migration policy forbids.
    The guard is removed only when the PostgreSQL adapters are active.
    """

    settings = DatabaseSettings.from_env(environ)
    if settings.is_postgresql:
        raise DatabaseConfigurationError(
            "JARVIS_DATABASE_BACKEND=postgresql está configurado, mas os "
            "adaptadores PostgreSQL ainda não estão ativos no runtime. Mantenha "
            "SQLite ou conclua a ativação; não há fallback silencioso."
        )


def settings_from_url(url: str, *, echo: bool = False) -> DatabaseSettings:
    """Build settings from an explicit URL (used by Alembic and scripts)."""

    value = str(url or "").strip()
    if not value:
        raise DatabaseConfigurationError("URL de base de dados vazia.")
    if _looks_like_postgres(value):
        return DatabaseSettings(backend="postgresql", url=normalize_postgres_url(value), echo=echo)
    if value.startswith("sqlite"):
        return DatabaseSettings(backend="sqlite", url=value, echo=echo)
    raise DatabaseConfigurationError("A URL deve usar sqlite ou PostgreSQL (psycopg).")


def normalize_postgres_url(url: str) -> str:
    """Return a synchronous SQLAlchemy PostgreSQL URL.

    ``postgres://`` and ``postgresql://`` are accepted aliases. ``asyncpg`` is
    rewritten to ``psycopg`` because this application layer is synchronous; the
    alternative would be a silent async/sync mismatch at engine creation.
    """

    value = url.strip()
    if value.startswith("postgres://"):
        value = "postgresql://" + value[len("postgres://") :]
    if value.startswith("postgresql://"):
        value = "postgresql+psycopg://" + value[len("postgresql://") :]
    if value.startswith("postgresql+asyncpg://"):
        value = "postgresql+psycopg://" + value[len("postgresql+asyncpg://") :]
    if value.startswith("postgresql+psycopg://"):
        return value
    if value.startswith("postgresql+"):
        driver = value.split("://", 1)[0].split("+", 1)[1]
        raise DatabaseConfigurationError(
            f"Driver PostgreSQL '{driver}' não suportado; use psycopg (síncrono)."
        )
    raise DatabaseConfigurationError("URL PostgreSQL inválida.")


def mask_database_url(url: str) -> str:
    """Render a URL without credentials for logs and error messages."""

    try:
        return make_url(url).render_as_string(hide_password=True)
    except Exception:
        return "<invalid database url>"


def redact_url_password(url: str) -> str:
    """Backward-friendly alias used by callers that only need safe logging."""

    return mask_database_url(url)


def _looks_like_postgres(url: str) -> bool:
    return bool(url) and url.startswith(_POSTGRES_PREFIXES)


def _default_sqlite_url(env: Mapping[str, str]) -> str:
    explicit_path = str(env.get("JARVIS_DATABASE_PATH", "") or "").strip()
    if explicit_path:
        return f"sqlite:///{Path(explicit_path).expanduser().as_posix()}"
    data_dir = str(env.get("JARVIS_DATA_DIR", "") or "").strip()
    base = Path(data_dir).expanduser() if data_dir else _DEFAULT_SQLITE_PATH.parent
    return f"sqlite:///{(base / _DEFAULT_SQLITE_PATH.name).as_posix()}"


def _env_int(env: Mapping[str, str], key: str, default: int, *, minimum: int) -> int:
    raw = str(env.get(key, "") or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise DatabaseConfigurationError(f"{key} deve ser um inteiro.") from exc
    if value < minimum:
        raise DatabaseConfigurationError(f"{key} deve ser >= {minimum}.")
    return value


def _env_float(env: Mapping[str, str], key: str, default: float, *, minimum: float) -> float:
    raw = str(env.get(key, "") or "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError as exc:
        raise DatabaseConfigurationError(f"{key} deve ser numérico.") from exc
    if value < minimum:
        raise DatabaseConfigurationError(f"{key} deve ser >= {minimum}.")
    return value


def _env_bool(env: Mapping[str, str], key: str, default: bool) -> bool:
    raw = str(env.get(key, "") or "").strip().lower()
    if not raw:
        return default
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    raise DatabaseConfigurationError(f"{key} deve ser um booleano (true/false).")
