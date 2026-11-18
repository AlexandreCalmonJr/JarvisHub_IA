"""
Unit tests for Async Write Buffer, Dual-Engine Persistence and InProcessEventBus.
"""

import asyncio
import sqlite3

import pytest

from services.events.event_bus import Event, InProcessEventBus
from services.persistence.dual_engine import PersistenceEngine
from services.persistence.write_buffer import AsyncWriteBuffer


@pytest.mark.asyncio
async def test_async_write_buffer_batching(tmp_path):
    db_file = tmp_path / "test_buffered.db"

    # Initialize schema
    with sqlite3.connect(str(db_file)) as conn:
        conn.execute(
            "CREATE TABLE metrics (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, val REAL);"
        )
        conn.commit()

    buffer = AsyncWriteBuffer(db_path=db_file, batch_size=5, flush_interval_seconds=0.1)
    await buffer.start()

    try:
        # Enqueue 12 writes
        for i in range(12):
            await buffer.enqueue(
                "INSERT INTO metrics (name, val) VALUES (?, ?);", (f"metric_{i}", float(i))
            )

        # Wait a short duration for batch commit
        await asyncio.sleep(0.3)

        # Check total committed
        with sqlite3.connect(str(db_file)) as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM metrics;")
            count = cur.fetchone()[0]

        assert count == 12
        assert buffer.stats.items_written == 12
        assert buffer.stats.batches_flushed >= 2

    finally:
        await buffer.stop()


@pytest.mark.asyncio
async def test_async_write_buffer_wait_for_commit(tmp_path):
    db_file = tmp_path / "test_wait.db"
    with sqlite3.connect(str(db_file)) as conn:
        conn.execute("CREATE TABLE logs (id INTEGER PRIMARY KEY AUTOINCREMENT, msg TEXT);")
        conn.commit()

    buffer = AsyncWriteBuffer(db_path=db_file, batch_size=20, flush_interval_seconds=0.5)
    await buffer.start()

    try:
        # Enqueue with wait_for_commit=True
        result = await buffer.enqueue(
            "INSERT INTO logs (msg) VALUES (?);", ("system_boot",), wait_for_commit=True
        )
        assert result is True

        with sqlite3.connect(str(db_file)) as conn:
            cur = conn.cursor()
            cur.execute("SELECT msg FROM logs;")
            row = cur.fetchone()
            assert row[0] == "system_boot"
    finally:
        await buffer.stop()


@pytest.mark.asyncio
async def test_dual_engine_sqlite_mode(tmp_path):
    db_file = tmp_path / "test_engine.db"
    engine = PersistenceEngine(db_path=db_file)
    await engine.start()

    try:
        # Create table via write
        await engine.write(
            "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT);",
            is_script=True,
            wait_for_commit=True,
        )

        # Insert user
        await engine.write(
            "INSERT INTO users (id, name) VALUES (?, ?);",
            ("u1", "Alexandre"),
            wait_for_commit=True,
        )

        # Read back
        user = await engine.read_one("SELECT * FROM users WHERE id = ?;", ("u1",))
        assert user is not None
        assert user["name"] == "Alexandre"

        status = engine.get_status()
        assert status["engine"] == "sqlite"
        assert status["running"] is True
    finally:
        await engine.stop()


@pytest.mark.asyncio
async def test_event_bus_pub_sub():
    bus = InProcessEventBus()
    received_events = []

    async def async_handler(event: Event):
        received_events.append(event)

    def sync_handler(event: Event):
        received_events.append(event)

    bus.subscribe("coding.*", async_handler)
    bus.subscribe("voice.*", sync_handler)

    # Publish events
    await bus.publish("coding.step", {"file": "app.py", "line": 42})
    await bus.publish("voice.speech_started", {"user": "alex"})
    await bus.publish("system.metric", {"cpu": 35})  # Should not be matched

    # Allow async tasks to run
    await asyncio.sleep(0.05)

    assert len(received_events) == 2
    names = [e.name for e in received_events]
    assert "coding.step" in names
    assert "voice.speech_started" in names
    assert "system.metric" not in names

    # History verification
    history = bus.get_history(limit=10)
    assert len(history) == 3
