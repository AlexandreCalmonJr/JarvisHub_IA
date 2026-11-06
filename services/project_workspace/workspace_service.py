from pathlib import Path
from typing import Optional, Dict
from packages.contracts.security import ProjectWorkMode
from services.security_core import SecurityCore
from .scanner import ProjectScanner, ProjectInventory
from .analyzer import ProjectAnalyzer, ArchitectureReport


class ProjectWorkspaceService:
    """
    Serviço central de Project Workspace.
    Controla o registo seguro de pastas locais, inventário e análise em modo estritamente read-only.
    """

    def __init__(self, security_core: SecurityCore):
        self.security_core = security_core
        self.scanner = ProjectScanner()
        self.analyzer = ProjectAnalyzer()
        self._inventories: Dict[str, ProjectInventory] = {}
        self._reports: Dict[str, ArchitectureReport] = {}

    def register_and_scan(
        self,
        project_id: str,
        folder_path: str,
        mode: ProjectWorkMode = ProjectWorkMode.READ_ONLY,
    ) -> ArchitectureReport:
        # 1. Regista no Permission Engine para garantir que apenas essa pasta seja lida
        self.security_core.permission_engine.register_project(
            project_id=project_id,
            root_path=folder_path,
            mode=mode,
        )

        resolved_path = self.security_core.permission_engine.validate_path_access(project_id, ".")

        # 2. Executa inventário de leitura
        inventory = self.scanner.scan(project_id=project_id, root_path=resolved_path)
        self._inventories[project_id] = inventory

        # 3. Executa análise de arquitetura e segurança (read-only)
        report = self.analyzer.analyze(inventory)
        self._reports[project_id] = report

        return report

    def get_inventory(self, project_id: str) -> Optional[ProjectInventory]:
        return self._inventories.get(project_id)

    def get_report(self, project_id: str) -> Optional[ArchitectureReport]:
        return self._reports.get(project_id)
