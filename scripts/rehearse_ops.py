"""Ensaio operacional de backup/restauro e webhooks do JARVIS AI HUB.

O ensaio não altera a base de dados de origem:

1. Cria um backup atómico da BD indicada (API nativa do SQLite).
2. Restaura o backup para um ficheiro temporário.
3. Compara integridade, schema, contagens por tabela e chaves estrangeiras.
4. Testa o dispatch de Discord/Telegram com transporte local simulado.
5. Escreve evidência JSON e devolve código de saída 0/1.

Uso:
    python scripts/rehearse_ops.py
    python scripts/rehearse_ops.py --source-db data/jarvis.db --output data/ops_rehearsal.json
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sqlite3
import sys
from datetime import UTC, datetime
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.memory.backup_restore import DatabaseBackupManager
from services.memory.database import DatabaseManager
from services.proactive_operations.webhook_service import WebhookNotificationService


def _integrity(path: Path) -> list[str]:
    with sqlite3.connect(str(path)) as conn:
        return [str(row[0]) for row in conn.execute("PRAGMA integrity_check").fetchall()]


def _foreign_key_violations(path: Path) -> int:
    with sqlite3.connect(str(path)) as conn:
        return len(conn.execute("PRAGMA foreign_key_check").fetchall())


def _table_counts(path: Path) -> dict[str, int]:
    with sqlite3.connect(str(path)) as conn:
        tables = [
            str(row[0])
            for row in conn.execute(
                "SELECT name FROM sqlite_master "
                "WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            ).fetchall()
        ]
        return {
            table: int(conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0])
            for table in tables
        }


def _schema_fingerprint(path: Path) -> str:
    with sqlite3.connect(str(path)) as conn:
        rows = conn.execute(
            "SELECT type, name, sql FROM sqlite_master "
            "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
        ).fetchall()
    payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _webhook_rehearsal(work_dir: Path) -> dict[str, object]:
    db = DatabaseManager(db_path=str(work_dir / "webhook_rehearsal.db"))
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        if request.url.host == "discord.com":
            return httpx.Response(204)
        if request.url.host == "api.telegram.org":
            return httpx.Response(200, json={"ok": True})
        return httpx.Response(404)

    service = WebhookNotificationService(db, transport=httpx.MockTransport(handler))
    masked = service.save_config(
        {
            "enabled": True,
            "discord_webhook_url": (
                "https://discord.com/api/webhooks/123456789/abcdefghijklmnopqrstuvwxyz"
            ),
            "telegram_bot_token": "123456789:ABCDEF_secret_token_here",
            "telegram_chat_id": "-100123456789",
            "notify_on_export": True,
            "notify_on_dockerize": True,
            "notify_on_long_task": True,
        }
    )
    dispatch = asyncio.run(service.test_webhook())

    discord_payload: dict[str, object] = {}
    telegram_payload: dict[str, object] = {}
    if captured:
        discord_payload = json.loads(captured[0].content)
    if len(captured) > 1:
        telegram_payload = json.loads(captured[1].content)

    embed = (discord_payload.get("embeds") or [{}])[0]
    discord_ok = (
        "JARVIS AI Hub" in str(embed.get("title", ""))
        and "Teste de Notificação" in str(embed.get("title", ""))
        and embed.get("footer", {}).get("text") == "Evento: test | 100% Local-First"
    )
    telegram_ok = (
        telegram_payload.get("chat_id") == "-100123456789"
        and telegram_payload.get("parse_mode") == "Markdown"
        and "Teste de Notificação" in str(telegram_payload.get("text", ""))
        and "Evento: test" in str(telegram_payload.get("text", ""))
    )

    service.save_config({"enabled": False})
    disabled = asyncio.run(service.test_webhook())
    disabled_ok = disabled.get("sent") is False and not captured[2:]

    ok = (
        dispatch.get("sent") is True
        and dispatch.get("channels") == ["discord", "telegram"]
        and not dispatch.get("errors")
        and len(captured) == 2
        and discord_ok
        and telegram_ok
        and disabled_ok
        and "..." in str(masked.get("discord_webhook_url", ""))
        and "..." in str(masked.get("telegram_bot_token", ""))
    )
    return {
        "ok": ok,
        "masked_config": masked,
        "dispatch": dispatch,
        "request_hosts": [request.url.host for request in captured],
        "discord_payload_ok": discord_ok,
        "telegram_payload_ok": telegram_ok,
        "disabled_result": disabled,
        "disabled_ok": disabled_ok,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-db", type=Path, default=ROOT / "data" / "jarvis.db")
    parser.add_argument(
        "--work-dir",
        type=Path,
        default=ROOT / "backups" / "ops_rehearsal",
        help="Diretório para backup, restauro e BD isolada dos webhooks.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "data" / "ops_rehearsal.json",
        help="Ficheiro JSON com a evidência do ensaio.",
    )
    args = parser.parse_args()

    source_db = args.source_db.resolve()
    if not source_db.exists():
        parser.error(f"Base de dados não encontrada: {source_db}")

    run_dir = args.work_dir.resolve() / datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    run_dir.mkdir(parents=True, exist_ok=True)
    restore_path = run_dir / "restored.db"

    started = datetime.now(UTC)
    source_integrity = _integrity(source_db)
    source_counts = _table_counts(source_db)
    source_schema = _schema_fingerprint(source_db)
    source_fk = _foreign_key_violations(source_db)

    db = DatabaseManager(db_path=str(source_db))
    backup_path = DatabaseBackupManager.backup_database(db, run_dir)
    backup_integrity = _integrity(backup_path)
    backup_counts = _table_counts(backup_path)
    backup_schema = _schema_fingerprint(backup_path)
    backup_fk = _foreign_key_violations(backup_path)

    restored = DatabaseBackupManager.restore_database(backup_path, restore_path)
    restore_integrity = _integrity(restored.db_path)
    restore_counts = _table_counts(restored.db_path)
    restore_schema = _schema_fingerprint(restored.db_path)
    restore_fk = _foreign_key_violations(restored.db_path)

    webhook = _webhook_rehearsal(run_dir)
    integrity_ok = all(
        result == ["ok"] for result in (source_integrity, backup_integrity, restore_integrity)
    )
    schema_ok = source_schema == backup_schema == restore_schema
    counts_ok = source_counts == backup_counts == restore_counts
    foreign_keys_ok = source_fk == backup_fk == restore_fk
    ok = integrity_ok and schema_ok and counts_ok and foreign_keys_ok and bool(webhook["ok"])

    evidence = {
        "timestamp": started.isoformat(),
        "duration_ms": round((datetime.now(UTC) - started).total_seconds() * 1000, 2),
        "source_db": str(source_db),
        "source_size_bytes": source_db.stat().st_size,
        "backup_path": str(backup_path.resolve()),
        "backup_size_bytes": backup_path.stat().st_size,
        "restore_path": str(restore_path.resolve()),
        "restore_size_bytes": restore_path.stat().st_size,
        "integrity": {
            "source": source_integrity,
            "backup": backup_integrity,
            "restore": restore_integrity,
        },
        "integrity_ok": integrity_ok,
        "schema_fingerprint_match": schema_ok,
        "table_counts_match": counts_ok,
        "tables": source_counts,
        "foreign_key_violations": {
            "source": source_fk,
            "backup": backup_fk,
            "restore": restore_fk,
        },
        "foreign_keys_ok": foreign_keys_ok,
        "webhook": webhook,
        "ok": ok,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "ok": ok,
                "backup": str(backup_path),
                "tables": len(source_counts),
                "rows": sum(source_counts.values()),
                "webhook_ok": webhook["ok"],
                "evidence": str(args.output.resolve()),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
