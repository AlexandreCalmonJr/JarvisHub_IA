import asyncio
from collections.abc import Awaitable, Callable
from typing import Any


class InferenceQueueError(Exception):
    pass


class InferenceQueue:
    """
    Fila de concorrência rigorosa para inferência local.
    No hardware de referência (Intel Core i5 notebook), limita a concorrência
    a exatamente 1 inferência pesada por vez, evitando saturação de CPU/RAM.
    """

    def __init__(self, max_concurrent: int = 1):
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._max_concurrent = max_concurrent
        self._waiting_count: int = 0
        self._active_count: int = 0

    @property
    def active_count(self) -> int:
        return self._active_count

    @property
    def waiting_count(self) -> int:
        return self._waiting_count

    async def execute(
        self,
        coro_func: Callable[[], Awaitable[Any]],
        task_id: str | None = None,
        timeout_seconds: float = 240.0,
    ) -> Any:
        self._waiting_count += 1
        try:
            # Aguarda vaga na fila de concorrência com timeout
            async with asyncio.timeout(timeout_seconds):
                async with self._semaphore:
                    self._waiting_count -= 1
                    self._active_count += 1
                    try:
                        return await coro_func()
                    finally:
                        self._active_count -= 1
        except TimeoutError:
            self._waiting_count = max(0, self._waiting_count - 1)
            raise InferenceQueueError(
                f"A inferência excedeu o tempo limite na fila ({timeout_seconds}s)."
            )
