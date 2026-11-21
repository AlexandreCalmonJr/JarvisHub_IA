"""Command-line entry point for the SQLite → PostgreSQL data import."""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Sequence
from pathlib import Path

from services.database.config import (
    DatabaseConfigurationError,
    mask_database_url,
    settings_from_url,
)
from services.database.migration.importer import SqliteToPostgresMigrator


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m services.database.migration.cli",
        description=(
            "Importa dados SQLite para PostgreSQL usando cópias íntegras das "
            "origens. O destino deve estar migrado para a revisão Alembic atual."
        ),
    )
    parser.add_argument(
        "--source-dir",
        default="data",
        help="Diretório que contém jarvis.db, telemetry.db e auth/*.sqlite3.",
    )
    parser.add_argument(
        "--target-url",
        default=None,
        help="URL PostgreSQL de destino (por omissão JARVIS_DATABASE_URL/DATABASE_URL).",
    )
    parser.add_argument(
        "--backup-dir",
        default="data/migration-backups",
        help="Diretório onde as cópias de origem são guardadas.",
    )
    parser.add_argument(
        "--report",
        default=None,
        help="Escreve o relatório completo em JSON para este caminho.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Valida e produz relatório sem escrever no destino.",
    )
    parser.add_argument(
        "--allow-non-empty",
        action="store_true",
        help="Permite destino com dados; registos existentes são ignorados.",
    )
    parser.add_argument(
        "--include-auth-attempts",
        action="store_true",
        help="Importa também os baldes transitórios de rate-limit.",
    )
    parser.add_argument(
        "--include-inference-cache",
        action="store_true",
        help="Importa também a cache transitória de inferência (prompts crus).",
    )
    parser.add_argument(
        "--on-error",
        choices=("abort", "skip"),
        default="abort",
        help="Aborta em linhas inválidas (padrão) ou continua e reporta.",
    )
    return parser


def _resolve_target_url(explicit: str | None) -> str:
    url = (
        explicit or os.environ.get("JARVIS_DATABASE_URL") or os.environ.get("DATABASE_URL") or ""
    ).strip()
    if not url:
        raise DatabaseConfigurationError(
            "Defina --target-url, JARVIS_DATABASE_URL ou DATABASE_URL."
        )
    return url


def _print_summary(report) -> None:
    mode = "dry-run" if report.dry_run else "importação"
    print(f"Modo: {mode}")
    print(f"Destino: {mask_database_url(report.target_url)}")
    print(f"Revisão Alembic: {report.alembic_revision}")
    print(f"Cópias de origem: {len(report.copies)}")
    print()
    print(
        f"{'Tabela':32} {'lidas':>7} {'válidas':>8} {'escritas':>9} {'existentes':>11} {'inválidas':>10}"
    )
    for name, table in report.tables.items():
        print(
            f"{name:32} {table.read:>7} {table.valid:>8} "
            f"{table.inserted:>9} {table.skipped_existing:>11} {table.rejected:>10}"
        )
    if report.checks:
        print()
        print("Verificações de integridade:")
        for name, value in report.checks.items():
            print(f"  {name}: {value}")
    if report.warnings:
        print()
        print("Avisos:")
        for warning in report.warnings:
            print(f"  - {warning}")
    print()
    print(f"Estado: {report.status}")
    if report.status == "failed":
        for name, table in report.tables.items():
            for error in table.errors:
                print(f"  {name}[{error['identity']}]: {', '.join(error['errors'])}")


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        settings = settings_from_url(_resolve_target_url(args.target_url))
    except DatabaseConfigurationError as exc:
        print(f"Erro de configuração: {exc}", file=sys.stderr)
        return 2
    if settings.backend != "postgresql":
        print(
            "Erro de configuração: o destino da importação deve ser PostgreSQL.",
            file=sys.stderr,
        )
        return 2

    migrator = None
    report = None
    exit_code = 0
    try:
        migrator = SqliteToPostgresMigrator(
            settings,
            source_dir=args.source_dir,
            backup_dir=args.backup_dir,
            dry_run=args.dry_run,
            allow_non_empty=args.allow_non_empty,
            include_auth_attempts=args.include_auth_attempts,
            include_inference_cache=args.include_inference_cache,
            on_error=args.on_error,
        )
        report = migrator.run()
    except Exception as exc:
        report = migrator.report if migrator is not None else None
        print(f"Falha na migração: {exc}", file=sys.stderr)
        exit_code = 1
    finally:
        if args.report and report is not None:
            destination = Path(args.report)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(
                json.dumps(report.to_dict(), ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )

    if report is None:
        return exit_code
    _print_summary(report)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
