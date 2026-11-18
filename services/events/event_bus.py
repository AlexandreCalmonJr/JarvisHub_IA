"""
Asynchronous In-Process Event Bus for JARVIS AI HUB.
Enables resilient pub/sub event distribution across system modules without direct coupling.
"""

from __future__ import annotations

import asyncio
import fnmatch
import inspect
import logging
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("jarvis.events.bus")

_GLOBAL_EVENT_BUS: InProcessEventBus | None = None


@dataclass
class Event:
    name: str
    payload: dict[str, Any] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)
    source: str = "core"


class InProcessEventBus:
    """
    Lightweight, asynchronous event bus with pattern-based routing and error isolation.
    """

    def __init__(self, history_size: int = 200):
        self._subscribers: dict[str, set[Callable]] = {}
        self._history: deque[Event] = deque(maxlen=history_size)
        self._lock = asyncio.Lock()
        self._running = True

    def subscribe(self, pattern: str, handler: Callable) -> None:
        """
        Subscribes a callback to an event pattern (e.g. 'coding.*', 'voice.speech_started', '*').
        Handler can be an async coroutine function or a standard synchronous callable.
        """
        if pattern not in self._subscribers:
            self._subscribers[pattern] = set()
        self._subscribers[pattern].add(handler)
        logger.debug(
            f"Subscribed handler '{getattr(handler, '__name__', str(handler))}' to pattern '{pattern}'"
        )

    def unsubscribe(self, pattern: str, handler: Callable) -> None:
        """Removes a subscriber handler from a pattern."""
        if pattern in self._subscribers and handler in self._subscribers[pattern]:
            self._subscribers[pattern].remove(handler)
            if not self._subscribers[pattern]:
                del self._subscribers[pattern]

    async def publish(
        self, name: str, payload: dict[str, Any] | None = None, source: str = "core"
    ) -> Event:
        """
        Publishes an event to all matching subscribers.
        Dispatches handlers concurrently in tasks without blocking the publisher.
        """
        event = Event(name=name, payload=payload or {}, timestamp=time.time(), source=source)
        self._history.append(event)

        # Match subscribers by pattern
        matching_handlers: list[Callable] = []
        for pattern, handlers in self._subscribers.items():
            if fnmatch.fnmatch(name, pattern):
                matching_handlers.extend(handlers)

        if not matching_handlers:
            return event

        for handler in matching_handlers:
            self._dispatch_handler(handler, event)

        return event

    def _dispatch_handler(self, handler: Callable, event: Event) -> None:
        """Dispatches an individual handler safely."""
        try:
            if inspect.iscoroutinefunction(handler):
                asyncio.create_task(self._safe_async_call(handler, event))
            else:
                # Run sync handler safely
                try:
                    handler(event)
                except Exception as sync_err:
                    logger.exception("Error in sync event handler '%s'", handler.__name__)
        except Exception as err:
            logger.exception("Failed to dispatch event '%s' to handler", event.name)

    async def _safe_async_call(self, handler: Callable, event: Event) -> None:
        """Wrapper to catch and isolate exceptions from async subscribers."""
        try:
            await handler(event)
        except Exception as async_err:
            logger.exception("Error in async event handler '%s'", handler.__name__)

    def get_history(self, limit: int = 50, pattern: str | None = None) -> list[Event]:
        """Returns the most recent events, optionally filtered by pattern."""
        events = list(self._history)
        if pattern:
            events = [e for e in events if fnmatch.fnmatch(e.name, pattern)]
        return events[-limit:]

    def clear(self) -> None:
        """Clears all subscribers and history (useful for test isolation)."""
        self._subscribers.clear()
        self._history.clear()


def get_event_bus() -> InProcessEventBus:
    """Returns the singleton InProcessEventBus."""
    global _GLOBAL_EVENT_BUS
    if _GLOBAL_EVENT_BUS is None:
        _GLOBAL_EVENT_BUS = InProcessEventBus()
    return _GLOBAL_EVENT_BUS
