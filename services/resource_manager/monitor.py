import psutil

from packages.contracts.security import AuditEventSeverity
from services.security_core import AuditTrail

from .types import ResourceBudget, SystemResourceUsage


class ResourceExceededError(Exception):
    pass


class ResourceManager:
    """
    Gestor de Recursos de Hardware e Garantia do Modo Offline.
    Monitoriza ativamente CPU, RAM e Disco no Windows 10 para proteger o notebook.
    Impõe fila unitária e previne saturação do ambiente do utilizador.
    """

    def __init__(
        self,
        budget: ResourceBudget | None = None,
        audit_trail: AuditTrail | None = None,
        enforce_offline: bool = True,
    ):
        self.budget = budget or ResourceBudget()
        self.audit_trail = audit_trail
        self.offline_mode_active = enforce_offline

    def collect_metrics(self, queue_active: int = 0, queue_waiting: int = 0) -> SystemResourceUsage:
        cpu = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("C:\\")

        ram_used_mb = round(mem.used / (1024 * 1024), 2)
        ram_total_mb = round(mem.total / (1024 * 1024), 2)
        disk_free_gb = round(disk.free / (1024 * 1024 * 1024), 2)
        disk_total_gb = round(disk.total / (1024 * 1024 * 1024), 2)

        is_throttled = (
            mem.percent > self.budget.max_ram_percent
            or disk_free_gb < self.budget.min_disk_free_gb
            or cpu > self.budget.max_cpu_percent
        )

        return SystemResourceUsage(
            cpu_percent=cpu,
            ram_used_mb=ram_used_mb,
            ram_total_mb=ram_total_mb,
            ram_percent=mem.percent,
            disk_free_gb=disk_free_gb,
            disk_total_gb=disk_total_gb,
            disk_percent=disk.percent,
            inference_queue_active=queue_active,
            inference_queue_waiting=queue_waiting,
            is_throttled=is_throttled,
            offline_mode_active=self.offline_mode_active,
        )

    def validate_budget_headroom(self) -> tuple[bool, list[str]]:
        """Verifica se há folga de recursos antes de aceitar inferências pesadas."""
        metrics = self.collect_metrics()
        warnings = []

        if metrics.ram_percent > self.budget.max_ram_percent:
            warnings.append(
                f"Uso de RAM ({metrics.ram_percent}%) excedeu o orçamento ({self.budget.max_ram_percent}%)."
            )

        if metrics.disk_free_gb < self.budget.min_disk_free_gb:
            warnings.append(
                f"Espaço livre em disco ({metrics.disk_free_gb} GB) abaixo do mínimo ({self.budget.min_disk_free_gb} GB)."
            )

        if warnings and self.audit_trail:
            self.audit_trail.record_event(
                operation="RESOURCE_BUDGET_WARNING",
                status="THROTTLED",
                parameters={
                    "ram_percent": metrics.ram_percent,
                    "disk_free_gb": metrics.disk_free_gb,
                },
                severity=AuditEventSeverity.WARNING,
                reason="; ".join(warnings),
            )

        return len(warnings) == 0, warnings
