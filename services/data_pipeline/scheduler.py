from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from .types import ScheduledAutomation


class ScheduledAutomationEngine:
    """
    Motor de automações agendadas e rotinas operacionais periódicas.
    Permite registar rotinas, controlar limites de ciclos e monitorizar execuções.
    """

    def __init__(self):
        self._automations: dict[str, ScheduledAutomation] = {}
        self._handlers: dict[str, Callable[[], Any]] = {}

    def register_task(
        self,
        task_id: str,
        name: str,
        interval_seconds: int,
        handler: Callable[[], Any],
        max_runs: int | None = None,
    ) -> ScheduledAutomation:
        auto = ScheduledAutomation(
            id=task_id,
            name=name,
            interval_seconds=interval_seconds,
            task_func_name=handler.__name__,
            max_runs=max_runs,
            enabled=True,
        )
        self._automations[task_id] = auto
        self._handlers[task_id] = handler
        return auto

    def trigger_task(self, task_id: str) -> dict[str, Any]:
        if task_id not in self._automations:
            raise KeyError(f"Automação {task_id} não registada.")

        auto = self._automations[task_id]
        if not auto.enabled:
            return {"status": "skipped", "reason": "disabled"}

        if auto.max_runs is not None and auto.runs_count >= auto.max_runs:
            auto.enabled = False
            return {"status": "exhausted", "reason": "max_runs_reached"}

        handler = self._handlers[task_id]
        result = handler()

        auto.runs_count += 1
        auto.last_run_at = datetime.now(UTC)

        return {
            "status": "success",
            "task_id": task_id,
            "runs_count": auto.runs_count,
            "result": result,
        }

    def list_tasks(self) -> list[ScheduledAutomation]:
        return list(self._automations.values())
