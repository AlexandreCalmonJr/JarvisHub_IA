"""Runtime wiring for the SQLAlchemy database layer."""

from __future__ import annotations

import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass

from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from .config import DatabaseSettings
from .engine import create_database_engine, verify_database_connection


@dataclass(slots=True)
class DatabaseRuntime:
    """Owns the engine and session factory for one application process."""

    settings: DatabaseSettings
    engine: Engine
    session_factory: sessionmaker[Session]

    @classmethod
    def create(
        cls,
        settings: DatabaseSettings | None = None,
        *,
        verify: bool = True,
    ) -> DatabaseRuntime:
        resolved = settings or DatabaseSettings.from_env()
        engine = create_database_engine(resolved)
        if verify:
            try:
                verify_database_connection(engine)
            except Exception:
                engine.dispose()
                raise
        return cls(
            settings=resolved,
            engine=engine,
            session_factory=sessionmaker(bind=engine, expire_on_commit=False, autoflush=False),
        )

    @contextmanager
    def session_scope(self) -> Iterator[Session]:
        """Transactional scope: commit on success, rollback on failure."""

        session = self.session_factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def dispose(self) -> None:
        self.engine.dispose()


_shared_runtime: DatabaseRuntime | None = None
_runtime_lock = threading.Lock()


def get_database_runtime(
    settings: DatabaseSettings | None = None,
    *,
    verify: bool = True,
) -> DatabaseRuntime:
    """Return a shared DatabaseRuntime instance for the current process."""
    global _shared_runtime
    resolved = settings or DatabaseSettings.from_env()
    with _runtime_lock:
        if _shared_runtime is not None and _shared_runtime.settings == resolved:
            return _shared_runtime
        if _shared_runtime is not None:
            _shared_runtime.dispose()
            _shared_runtime = DatabaseRuntime.create(resolved, verify=verify)
        else:
            _shared_runtime = DatabaseRuntime.create(resolved, verify=verify)
        return _shared_runtime


def reset_database_runtime() -> None:
    """Dispose and clear the shared DatabaseRuntime instance."""
    global _shared_runtime
    with _runtime_lock:
        if _shared_runtime is not None:
            _shared_runtime.dispose()
            _shared_runtime = None

