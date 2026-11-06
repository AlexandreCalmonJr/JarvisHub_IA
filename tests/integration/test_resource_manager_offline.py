from pathlib import Path

from packages.contracts.security import ProjectWorkMode
from services.project_workspace import ProjectWorkspaceService
from services.resource_manager import (
    ResourceBudget,
    ResourceManager,
)
from services.security_core import SecurityCore


def test_collect_real_system_metrics():
    rm = ResourceManager()
    metrics = rm.collect_metrics(queue_active=1, queue_waiting=0)

    # 1. Verifica métricas reais coletadas do notebook
    assert metrics.ram_total_mb > 10_000  # Máquina tem 32GB
    assert metrics.disk_free_gb > 10.0  # Máquina tem ~300GB livres
    assert metrics.offline_mode_active is True
    assert metrics.inference_queue_active == 1


def test_budget_headroom_validation_and_throttling():
    # Orçamento normal
    normal_rm = ResourceManager(budget=ResourceBudget(max_ram_percent=99.0, min_disk_free_gb=1.0))
    is_ok, warnings = normal_rm.validate_budget_headroom()
    assert is_ok is True
    assert len(warnings) == 0

    # Orçamento restritivo simulado para acionar throttling
    strict_rm = ResourceManager(budget=ResourceBudget(max_ram_percent=5.0, min_disk_free_gb=500.0))
    is_throttled, warnings = strict_rm.validate_budget_headroom()
    assert is_throttled is False
    assert len(warnings) >= 1


def test_offline_task_execution_within_resource_budget():
    demo_path = Path("workspace/demo_flutter_app").resolve()
    assert demo_path.exists()

    security = SecurityCore()
    rm = ResourceManager(audit_trail=security.audit)
    workspace = ProjectWorkspaceService(security_core=security)

    # 1. Verifica métricas antes
    metrics_before = rm.collect_metrics()
    assert metrics_before.is_throttled is False

    # 2. Executa análise offline do projeto Flutter
    report = workspace.register_and_scan(
        project_id="demo-offline",
        folder_path=str(demo_path),
        mode=ProjectWorkMode.READ_ONLY,
    )
    assert report.project_name == "demo_flutter_app"

    # 3. Verifica métricas após a execução: recursos permaneceram dentro do orçamento
    metrics_after = rm.collect_metrics()
    assert metrics_after.is_throttled is False
    assert metrics_after.offline_mode_active is True
