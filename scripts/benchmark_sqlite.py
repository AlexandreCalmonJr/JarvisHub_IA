#!/usr/bin/env python3
"""Reproducible SQLite WAL microbenchmark for the JARVIS persistence layer.

This script measures SQLite only. It is not an HTTP/API or model-inference benchmark.
Run: python scripts/benchmark_sqlite.py --reads 1000 --writes 300 --readers 15 --writers 8
"""
from __future__ import annotations

import argparse
import json
import platform
import sqlite3
import statistics
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * pct)))
    return ordered[index]


def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=30.0)
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reads", type=int, default=1000)
    parser.add_argument("--writes", type=int, default=300)
    parser.add_argument("--readers", type=int, default=15)
    parser.add_argument("--writers", type=int, default=8)
    args = parser.parse_args()
    if min(args.reads, args.writes, args.readers, args.writers) < 1:
        parser.error("all workload and worker values must be >= 1")

    with tempfile.TemporaryDirectory(prefix="jarvis-sqlite-bench-") as tmp:
        db_path = Path(tmp) / "benchmark.sqlite3"
        with connect(db_path) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute("CREATE TABLE samples (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)")
            conn.execute("INSERT INTO samples(payload) VALUES (?)", ("seed",))

        def read_one(_: int) -> tuple[str, float]:
            started = time.perf_counter()
            with connect(db_path) as conn:
                conn.execute("SELECT payload FROM samples ORDER BY id DESC LIMIT 1").fetchone()
            return ("read", time.perf_counter() - started)

        def write_one(index: int) -> tuple[str, float]:
            started = time.perf_counter()
            with connect(db_path) as conn:
                conn.execute("INSERT INTO samples(payload) VALUES (?)", (f"payload-{index}",))
                conn.commit()
            return ("write", time.perf_counter() - started)

        started = time.perf_counter()
        read_latencies: list[float] = []
        write_latencies: list[float] = []
        with ThreadPoolExecutor(max_workers=args.readers + args.writers) as pool:
            futures = []
            futures.extend(pool.submit(read_one, i) for i in range(args.reads))
            futures.extend(pool.submit(write_one, i) for i in range(args.writes))
            for future in as_completed(futures):
                operation, latency = future.result()
                if operation == "read":
                    read_latencies.append(latency)
                else:
                    write_latencies.append(latency)
        elapsed = time.perf_counter() - started
        with connect(db_path) as conn:
            rows = conn.execute("SELECT COUNT(*) FROM samples").fetchone()[0]
            integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]

        result = {
            "benchmark": "sqlite_wal_microbenchmark",
            "scope": "SQLite persistence only; not HTTP/API or model inference",
            "platform": platform.platform(),
            "python": platform.python_version(),
            "sqlite": sqlite3.sqlite_version,
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
            "integrity_check": integrity,
        }
        print(json.dumps(result, indent=2))
        return 0 if integrity == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
