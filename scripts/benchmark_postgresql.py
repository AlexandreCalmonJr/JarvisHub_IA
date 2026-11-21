#!/usr/bin/env python3
"""Reproducible PostgreSQL microbenchmark for the JARVIS persistence layer.

This script measures PostgreSQL only. It is not an HTTP/API or model-inference
benchmark, and it deliberately refuses to run against a database whose name does
not end in ``_test``.

Run:
    set JARVIS_TEST_POSTGRES_URL=postgresql+psycopg://user:pass@127.0.0.1:5432/jarvis_hub_test
    python scripts/benchmark_postgresql.py --reads 1000 --writes 300 --readers 15 --writers 8
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import statistics
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * pct)))
    return ordered[index]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reads", type=int, default=1000)
    parser.add_argument("--writes", type=int, default=300)
    parser.add_argument("--readers", type=int, default=15)
    parser.add_argument("--writers", type=int, default=8)
    parser.add_argument(
        "--url",
        default=os.environ.get("JARVIS_TEST_POSTGRES_URL", ""),
        help="URL PostgreSQL de teste (por omissão JARVIS_TEST_POSTGRES_URL).",
    )
    args = parser.parse_args()
    if min(args.reads, args.writes, args.readers, args.writers) < 1:
        parser.error("all workload and worker values must be >= 1")
    if not args.url:
        parser.error("defina JARVIS_TEST_POSTGRES_URL ou passe --url")
    if not args.url.startswith("postgresql"):
        parser.error("--url tem de ser uma URL PostgreSQL")

    parsed = make_url(args.url)
    database = parsed.database or ""
    if not database.endswith("_test"):
        parser.error("a base de dados de teste PostgreSQL tem de terminar em '_test'")

    table = f"benchmark_samples_{uuid.uuid4().hex[:12]}"
    engine = create_engine(args.url, pool_size=args.readers + args.writers, max_overflow=4)
    errors: list[str] = []
    read_latencies: list[float] = []
    write_latencies: list[float] = []

    try:
        with engine.begin() as connection:
            server_version = str(
                connection.execute(text("SHOW server_version")).scalar_one()
            )
            connection.execute(
                text(
                    f"CREATE TABLE {table} ("
                    "id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, "
                    "payload TEXT NOT NULL)"
                )
            )
            connection.execute(
                text(f"INSERT INTO {table}(payload) VALUES ('seed')")
            )

        def read_one(_: int) -> tuple[str, float, str | None]:
            started = time.perf_counter()
            try:
                with engine.connect() as connection:
                    connection.execute(
                        text(f"SELECT payload FROM {table} ORDER BY id DESC LIMIT 1")
                    ).fetchone()
                return ("read", time.perf_counter() - started, None)
            except Exception as exc:  # pragma: no cover - benchmark diagnostics
                return ("read", time.perf_counter() - started, f"{type(exc).__name__}: {exc}")

        def write_one(index: int) -> tuple[str, float, str | None]:
            started = time.perf_counter()
            try:
                with engine.begin() as connection:
                    connection.execute(
                        text(f"INSERT INTO {table}(payload) VALUES (:payload)"),
                        {"payload": f"payload-{index}"},
                    )
                return ("write", time.perf_counter() - started, None)
            except Exception as exc:  # pragma: no cover - benchmark diagnostics
                return ("write", time.perf_counter() - started, f"{type(exc).__name__}: {exc}")

        started = time.perf_counter()
        with ThreadPoolExecutor(max_workers=args.readers + args.writers) as pool:
            futures = []
            futures.extend(pool.submit(read_one, i) for i in range(args.reads))
            futures.extend(pool.submit(write_one, i) for i in range(args.writes))
            for future in as_completed(futures):
                operation, latency, error = future.result()
                if error:
                    errors.append(error)
                if operation == "read":
                    read_latencies.append(latency)
                else:
                    write_latencies.append(latency)
        elapsed = time.perf_counter() - started

        with engine.connect() as connection:
            rows = int(
                connection.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar_one()
            )

        result = {
            "benchmark": "postgresql_oltp_microbenchmark",
            "scope": "PostgreSQL persistence only; not HTTP/API or model inference",
            "platform": platform.platform(),
            "python": platform.python_version(),
            "postgresql": server_version,
            "database": database,
            "workers": {"readers": args.readers, "writers": args.writers},
            "requested_operations": {"reads": args.reads, "writes": args.writes},
            "elapsed_seconds": round(elapsed, 6),
            "aggregate_ops_per_second": round((args.reads + args.writes) / elapsed, 2),
            "read_latency_ms": {
                "p50": round(statistics.median(read_latencies) * 1000, 3),
                "p95": round(percentile(read_latencies, 0.95) * 1000, 3),
            },
            "write_latency_ms": {
                "p50": round(statistics.median(write_latencies) * 1000, 3),
                "p95": round(percentile(write_latencies, 0.95) * 1000, 3),
            },
            "rows_after_test": rows,
            "errors": len(errors),
            "error_samples": errors[:5],
        }
        print(json.dumps(result, indent=2))
        return 0 if not errors else 1
    finally:
        try:
            with engine.begin() as connection:
                connection.execute(text(f"DROP TABLE IF EXISTS {table}"))
        finally:
            engine.dispose()


if __name__ == "__main__":
    sys.exit(main())
