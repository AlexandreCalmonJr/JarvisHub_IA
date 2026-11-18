"""
Async Write Buffer for SQLite in JARVIS AI HUB.
Buffers non-blocking writes using asyncio.Queue and commits them in batches using aiosqlite,
eliminating SQLite write contention and 'database is locked' errors under concurrent load.
"""

from __future__ import annotations

import asyncio
import logging
import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    import aiosqlite
except ImportError:
    aiosqlite = None  # type: ignore

logger = logging.getLogger("jarvis.persistence.write_buffer")


@dataclass
class WriteOperation:
    sql: str
    params: tuple[Any, ...] = field(default_factory=tuple)
    future: asyncio.Future | None = None
    is_script: bool = False


@dataclass
class BufferStats:
    items_queued: int = 0
    items_written: int = 0
    batches_flushed: int = 0
    failed_writes: int = 0
    last_flush_time: float = 0.0
    avg_batch_duration_ms: float = 0.0


class AsyncWriteBuffer:
    """
    Asynchronous write buffer for SQLite.
    Batches SQL statements in a background worker to avoid database locks.
    """

    def __init__(
        self,
        db_path: str | Path = "data/jarvis.db",
        batch_size: int = 50,
        flush_interval_seconds: float = 0.5,
    ):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.batch_size = batch_size
        self.flush_interval = flush_interval_seconds
        self.queue: asyncio.Queue[WriteOperation | None] = asyncio.Queue()
        self.stats = BufferStats()
        self._worker_task: asyncio.Task | None = None
        self._running = False
        self._connection: Any | None = None
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        """Starts the background worker task."""
        if self._running:
            return

        if aiosqlite is None:
            logger.warning(
                "aiosqlite not installed. Async write buffer running in sync fallback mode."
            )
            return

        self._running = True
        self._worker_task = asyncio.create_task(self._worker(), name="AsyncWriteBufferWorker")
        logger.info(
            f"AsyncWriteBuffer started for {self.db_path} (batch_size={self.batch_size}, flush_interval={self.flush_interval}s)"
        )

    async def stop(self) -> None:
        """Stops the worker and flushes remaining queue items."""
        if not self._running:
            return

        self._running = False
        # Put sentinel to notify worker
        await self.queue.put(None)
        if self._worker_task:
            try:
                await asyncio.wait_for(self._worker_task, timeout=5.0)
            except (TimeoutError, asyncio.CancelledError):
                logger.warning("AsyncWriteBuffer worker timeout during shutdown.")
            self._worker_task = None

        if self._connection:
            try:
                await self._connection.close()
            except Exception as e:
                logger.debug(f"Error closing aiosqlite connection: {e}")
            self._connection = None

        logger.info(
            f"AsyncWriteBuffer stopped. Total written: {self.stats.items_written}, batches: {self.stats.batches_flushed}"
        )

    async def enqueue(
        self,
        sql: str,
        params: tuple[Any, ...] = (),
        wait_for_commit: bool = False,
        is_script: bool = False,
    ) -> Any:
        """
        Enqueues a write statement.
        If wait_for_commit is True, awaits the transaction commit.
        """
        self.stats.items_queued += 1

        # Fallback if aiosqlite missing or worker not started
        if not self._running or aiosqlite is None:
            return self._execute_sync_fallback(sql, params, is_script)

        future = asyncio.get_running_loop().create_future() if wait_for_commit else None
        op = WriteOperation(sql=sql, params=params, future=future, is_script=is_script)
        await self.queue.put(op)

        if future is not None:
            return await future
        return None

    def _execute_sync_fallback(self, sql: str, params: tuple[Any, ...], is_script: bool) -> Any:
        """Executes synchronously using sqlite3 if worker is unavailable."""
        with sqlite3.connect(str(self.db_path), timeout=15.0) as conn:
            conn.execute("PRAGMA foreign_keys = ON;")
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA busy_timeout = 5000;")
            cursor = conn.cursor()
            if is_script:
                cursor.executescript(sql)
            else:
                cursor.execute(sql, params)
            conn.commit()
            self.stats.items_written += 1
            return cursor.lastrowid

    async def flush(self) -> None:
        """Forces an immediate flush of all pending items in the queue."""
        if not self._running or self.queue.empty():
            return

        # Signal an immediate batch execution by enqueuing a no-op barrier operation
        barrier_future = asyncio.get_running_loop().create_future()
        barrier_op = WriteOperation(sql="SELECT 1;", params=(), future=barrier_future)
        await self.queue.put(barrier_op)
        try:
            await asyncio.wait_for(barrier_future, timeout=5.0)
        except TimeoutError:
            logger.warning("Flush barrier timed out.")

    async def _get_connection(self) -> Any:
        """Returns or opens a managed aiosqlite connection."""
        if self._connection is None:
            self._connection = await aiosqlite.connect(str(self.db_path), timeout=20.0)
            await self._connection.execute("PRAGMA foreign_keys = ON;")
            await self._connection.execute("PRAGMA journal_mode = WAL;")
            await self._connection.execute("PRAGMA synchronous = NORMAL;")
            await self._connection.execute("PRAGMA busy_timeout = 10000;")
            await self._connection.execute("PRAGMA mmap_size = 268435456;")
        return self._connection

    async def _worker(self) -> None:
        """Main background loop collecting batches and committing transactions."""
        batch: list[WriteOperation] = []

        while self._running or not self.queue.empty():
            try:
                # Wait for next item or interval timeout
                timeout = self.flush_interval if batch else None
                try:
                    item = await asyncio.wait_for(self.queue.get(), timeout=timeout)
                except TimeoutError:
                    item = None

                if item is None:
                    # Timeout reached or sentinel received
                    if batch:
                        await self._commit_batch(batch)
                        batch = []
                    continue

                batch.append(item)

                if len(batch) >= self.batch_size:
                    await self._commit_batch(batch)
                    batch = []

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.exception("Unexpected error in AsyncWriteBuffer worker")
                await asyncio.sleep(0.1)

        # Flush any remaining items before exiting
        if batch:
            try:
                await self._commit_batch(batch)
            except Exception as e:
                logger.error(f"Error committing final batch on stop: {e}")

    async def _commit_batch(self, batch: list[WriteOperation]) -> None:
        """Commits a list of WriteOperation in a single atomic transaction."""
        if not batch:
            return

        start_time = time.perf_counter()
        db = await self._get_connection()

        try:
            async with self._lock:
                await db.execute("BEGIN IMMEDIATE;")
                for op in batch:
                    if op.is_script:
                        await db.executescript(op.sql)
                    else:
                        await db.execute(op.sql, op.params)
                await db.commit()

            duration_ms = (time.perf_counter() - start_time) * 1000
            self.stats.items_written += len(batch)
            self.stats.batches_flushed += 1
            self.stats.last_flush_time = time.time()
            self.stats.avg_batch_duration_ms = (
                self.stats.avg_batch_duration_ms * 0.8 + duration_ms * 0.2
                if self.stats.avg_batch_duration_ms > 0
                else duration_ms
            )

            # Resolve any waiting futures
            for op in batch:
                if op.future and not op.future.done():
                    op.future.set_result(True)

        except Exception as batch_error:
            logger.warning(f"Batch write failed ({batch_error}). Retrying items individually...")
            try:
                await db.rollback()
            except Exception as rollback_error:
                logger.debug("Rollback do lote falhou: %s", rollback_error)

            # Isolate failures by executing each item in its own transaction
            await self._commit_individually(db, batch)

    async def _commit_individually(self, db: Any, batch: list[WriteOperation]) -> None:
        """Executes operations individually if a batch transaction encounters an error."""
        for op in batch:
            try:
                async with self._lock:
                    if op.is_script:
                        await db.executescript(op.sql)
                    else:
                        await db.execute(op.sql, op.params)
                    await db.commit()
                self.stats.items_written += 1
                if op.future and not op.future.done():
                    op.future.set_result(True)
            except Exception as single_err:
                self.stats.failed_writes += 1
                logger.error(f"Individual write failed for SQL '{op.sql[:60]}...': {single_err}")
                if op.future and not op.future.done():
                    op.future.set_exception(single_err)
