"""Alembic environment for the JARVIS Hub persistence layer.

The target database must be supplied explicitly through ``-x url=...``,
``sqlalchemy.url`` or ``JARVIS_DATABASE_URL``/``DATABASE_URL``. There is no
implicit fallback to the live SQLite file.
"""

from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from services.database.config import (
    DatabaseConfigurationError,
    settings_from_url,
)
from services.database.engine import create_database_engine
from services.database.models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _resolve_url() -> str:
    x_args = context.get_x_argument(as_dictionary=True)
    explicit = (x_args.get("url") or "").strip()
    if explicit:
        return explicit

    configured = (config.get_main_option("sqlalchemy.url") or "").strip()
    if configured:
        return configured

    env_url = (
        os.environ.get("JARVIS_DATABASE_URL") or os.environ.get("DATABASE_URL") or ""
    ).strip()
    if env_url:
        return env_url

    raise DatabaseConfigurationError(
        "Migrações exigem -x url=..., sqlalchemy.url ou JARVIS_DATABASE_URL."
    )


def run_migrations_offline() -> None:
    url = _resolve_url()
    dialect = settings_from_url(url).url
    context.configure(
        url=dialect,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    settings = settings_from_url(_resolve_url())
    connectable = create_database_engine(settings)
    try:
        with connectable.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                compare_type=True,
            )
            with context.begin_transaction():
                context.run_migrations()
    finally:
        connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
