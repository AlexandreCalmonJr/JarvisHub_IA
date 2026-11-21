"""SQLAlchemy engine creation with explicit, fail-closed connectivity checks."""

from __future__ import annotations

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import SQLAlchemyError

from .config import DatabaseSettings, mask_database_url


class DatabaseUnavailableError(RuntimeError):
    """The configured database cannot be reached."""


def create_database_engine(settings: DatabaseSettings, *, connect_timeout: int = 5) -> Engine:
    """Create an engine for the resolved settings.

    PostgreSQL uses a pre-ping pool with bounded waits. SQLite keeps a
    thread-safe file connection so FastAPI workers can share the engine.
    """

    if settings.is_postgresql:
        return create_engine(
            settings.url,
            pool_pre_ping=True,
            pool_size=settings.pool_size,
            max_overflow=settings.max_overflow,
            pool_timeout=settings.pool_timeout,
            pool_recycle=settings.pool_recycle,
            echo=settings.echo,
            connect_args={"connect_timeout": connect_timeout},
        )

    return create_engine(
        settings.url,
        pool_pre_ping=True,
        echo=settings.echo,
        connect_args={"check_same_thread": False, "timeout": 10.0},
    )


def verify_database_connection(engine: Engine) -> None:
    """Raise ``DatabaseUnavailableError`` if ``SELECT 1`` fails.

    There is deliberately no fallback to another backend: a misconfigured
    PostgreSQL deployment must stop startup rather than write to SQLite.
    """

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        safe_url = mask_database_url(str(engine.url))
        raise DatabaseUnavailableError(
            f"Base de dados indisponível em {safe_url}: {exc.__class__.__name__}"
        ) from exc
