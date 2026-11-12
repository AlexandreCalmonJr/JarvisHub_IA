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
        acquired = False
        timeout_scope = asyncio.timeout(timeout_seconds)
        try:
            # Distingue timeout da fila de TimeoutError lançado pelo próprio provider.
            async with timeout_scope, self._semaphore:
                acquired = True
                self._waiting_count -= 1
                self._active_count += 1
                try:
                    return await coro_func()
                finally:
                    self._active_count -= 1
        except TimeoutError:
            if not timeout_scope.expired():
                if acquired:
                    raise
                self._waiting_count = max(0, self._waiting_count - 1)
                raise
            if not acquired:
                self._waiting_count = max(0, self._waiting_count - 1)
                raise InferenceQueueError(
                    f"A inferência excedeu o tempo limite de espera na fila "
                    f"({timeout_seconds}s) antes de iniciar a execução."
                )
            raise InferenceQueueError(
                f"A inferência excedeu o tempo limite de execução ({timeout_seconds}s)."
            )
