"""Buffer circular em memória para logs do servidor com suporte a SSE streaming."""

import asyncio
import logging
from collections import deque
from datetime import datetime
from typing import Any


class InMemoryLogHandler(logging.Handler):
    """Handler de logging que armazena as últimas N entradas em memória e notifica assinantes SSE."""

    def __init__(self, max_entries: int = 1000):
        super().__init__()
        self.max_entries = max_entries
        self.buffer: deque[dict[str, Any]] = deque(maxlen=max_entries)
        self._counter: int = 0
        self._subscribers: set[asyncio.Queue] = set()

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
            self._counter += 1
            entry = {
                "id": self._counter,
                "timestamp": datetime.fromtimestamp(record.created).isoformat(),
                "level": record.levelname,
                "logger": record.name,
                "message": msg,
            }
            self.buffer.append(entry)

            # Notifica assinantes ativos (para Server-Sent Events)
            dead_subs = set()
            for sub in list(self._subscribers):
                try:
                    sub.put_nowait(entry)
                except asyncio.QueueFull:
                    dead_subs.add(sub)
                except Exception:
                    dead_subs.add(sub)
            for ds in dead_subs:
                self._subscribers.discard(ds)
        except Exception:
            self.handleError(record)

    def get_logs(
        self,
        limit: int = 200,
        level: str | None = None,
        search: str | None = None,
    ) -> list[dict[str, Any]]:
        """Retorna logs filtrados mais recentes."""
        results = list(self.buffer)
        if level and level.upper() != "ALL":
            lvl = level.upper()
            results = [e for e in results if e["level"] == lvl]
        if search:
            q = search.lower()
            results = [
                e
                for e in results
                if q in e["message"].lower() or q in e["logger"].lower()
            ]
        return results[-limit:]

    def clear(self) -> None:
        """Limpa o buffer de logs."""
        self.buffer.clear()

    async def subscribe(self) -> asyncio.Queue:
        """Cria uma fila assíncrona para streaming SSE de novos logs."""
        q = asyncio.Queue(maxsize=100)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        """Remove a fila de assinantes SSE."""
        self._subscribers.discard(q)


# Instância singleton global do buffer de logs
log_buffer = InMemoryLogHandler(max_entries=1000)
log_buffer.setFormatter(
    logging.Formatter("[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s", "%H:%M:%S")
)


def attach_server_logging() -> InMemoryLogHandler:
    """Conecta o log_buffer aos loggers principais do Uvicorn e FastAPI."""
    root_logger = logging.getLogger()
    if log_buffer not in root_logger.handlers:
        root_logger.addHandler(log_buffer)

    for logger_name in [
        "uvicorn",
        "uvicorn.access",
        "uvicorn.error",
        "fastapi",
        "services",
        "apps",
    ]:
        l = logging.getLogger(logger_name)
        if log_buffer not in l.handlers:
            l.addHandler(log_buffer)

    return log_buffer
