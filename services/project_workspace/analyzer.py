import re
from pathlib import Path
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from .scanner import ProjectInventory


class SecurityHotspot(BaseModel):
    file_path: str
    line_number: int
    rule: str
    severity: str
    snippet: str


class ArchitectureReport(BaseModel):
    project_id: str
    project_name: str
    project_type: str
    entry_points: List[str] = Field(default_factory=list)
    key_dependencies: Dict[str, str] = Field(default_factory=dict)
    architecture_pattern: str = "Desconhecido"
    security_hotspots: List[SecurityHotspot] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)


class ProjectAnalyzer:
    """
    Analisador puramente de leitura (read-only) para projetos existentes.
    Gera relatórios de arquitetura, dependências e riscos sem modificar arquivos.
    """

    def analyze(self, inventory: ProjectInventory) -> ArchitectureReport:
        root_path = Path(inventory.root_path)
        project_type = "Genérico / Poliglota"
        project_name = root_path.name
        entry_points: List[str] = []
        dependencies: Dict[str, str] = {}
        architecture_pattern = "Modular"
        recommendations: List[str] = []
        hotspots: List[SecurityHotspot] = []

        # 1. Detecção de Flutter
        if any("pubspec.yaml" in m for m in inventory.manifests_found):
            project_type = "Flutter / Dart (Mobile & Multiplataforma)"
            pubspec_path = root_path / "pubspec.yaml"
            if pubspec_path.exists():
                content = pubspec_path.read_text(encoding="utf-8", errors="ignore")
                in_dependencies = False
                for line in content.splitlines():
                    trimmed = line.strip()
                    if line.startswith("name:"):
                        project_name = line.split(":", 1)[1].strip()
                    elif line.startswith("dependencies:"):
                        in_dependencies = True
                        continue
                    elif in_dependencies and not line.startswith(" ") and not line.startswith("\t"):
                        in_dependencies = False

                    if in_dependencies and ":" in trimmed and not trimmed.startswith("#"):
                        parts = trimmed.split(":", 1)
                        dep_name = parts[0].strip()
                        dep_ver = parts[1].strip() or "any"
                        dependencies[dep_name] = dep_ver

            if (root_path / "lib" / "main.dart").exists():
                entry_points.append("lib/main.dart")
            architecture_pattern = "Flutter Widget Tree com Gerenciamento de Estado"
            recommendations.append("Manter separação estrita entre UI e lógica de negócio via BLoC ou Provider.")

        # 2. Detecção de Python
        elif any(m in ("pyproject.toml", "requirements.txt") for m in inventory.manifests_found):
            project_type = "Python Application / API"
            if (root_path / "apps" / "api" / "main.py").exists():
                entry_points.append("apps/api/main.py")
            elif (root_path / "main.py").exists():
                entry_points.append("main.py")
            recommendations.append("Garantir validação estrita com Pydantic e execução em virtualenv.")

        # 3. Análise Estática de Riscos / Hotspots em Arquivos Fonte
        secret_regex = re.compile(r'(?i)(api[_-]?key|secret|password)\s*[:=]\s*["\']([^"\'\s]{8,})["\']')
        http_regex = re.compile(r'http://[a-zA-Z0-9.-]+')

        for f in inventory.files:
            if f.is_binary or f.extension not in (".dart", ".py", ".ts", ".js", ".json"):
                continue

            full_path = root_path / f.relative_path
            try:
                lines = full_path.read_text(encoding="utf-8", errors="ignore").splitlines()
            except OSError:
                continue

            for idx, line in enumerate(lines, start=1):
                # Detecção de potenciais chaves/segredos hardcoded
                match = secret_regex.search(line)
                if match:
                    hotspots.append(
                        SecurityHotspot(
                            file_path=f.relative_path,
                            line_number=idx,
                            rule="HARDCODED_CREDENTIAL",
                            severity="CRITICAL",
                            snippet=line.strip()[:80],
                        )
                    )

                # Detecção de URLs HTTP inseguras
                if http_regex.search(line) and "localhost" not in line and "127.0.0.1" not in line:
                    hotspots.append(
                        SecurityHotspot(
                            file_path=f.relative_path,
                            line_number=idx,
                            rule="UNENCRYPTED_HTTP",
                            severity="WARNING",
                            snippet=line.strip()[:80],
                        )
                    )

        if not hotspots:
            recommendations.append("Nenhum segredo em texto claro detetado na varredura inicial.")
        else:
            recommendations.append(f"Corrigir {len(hotspots)} potenciais vulnerabilidades/segredos identificados nos arquivos.")

        return ArchitectureReport(
            project_id=inventory.project_id,
            project_name=project_name,
            project_type=project_type,
            entry_points=entry_points,
            key_dependencies=dependencies,
            architecture_pattern=architecture_pattern,
            security_hotspots=hotspots,
            recommendations=recommendations,
        )
