from pathlib import Path

from agents.registry import AgentRegistry
from packages.contracts.agent import AgentRole
from packages.contracts.security import ProjectWorkMode
from services.project_workspace import (
    ProjectAnalyzer,
    ProjectScanner,
    ProjectWorkspaceService,
)
from services.security_core import SecurityCore


def test_agent_registry_initial_agents():
    registry = AgentRegistry()
    agents = registry.list_agents()
    assert len(agents) >= 9

    # Verifica os agentes prioritários
    roles = {a.role for a in agents}
    assert AgentRole.JARVIS_MASTER in roles
    assert AgentRole.SOFTWARE_ARCHITECT in roles
    assert AgentRole.FRONTEND_MOBILE_DEVELOPER in roles
    assert AgentRole.BACKEND_DEVELOPER in roles
    assert AgentRole.CYBERSECURITY_ENGINEER in roles

    # Verifica permissões do arquiteto (somente-leitura)
    arch = registry.get_profile(AgentRole.SOFTWARE_ARCHITECT)
    assert arch.is_read_only is True
    assert "read_file" in arch.allowed_tools


def test_project_workspace_scan_and_analysis_on_flutter_project():
    demo_path = Path("workspace/demo_flutter_app").resolve()
    assert demo_path.exists()

    # Hash dos arquivos antes da análise para comprovar integridade read-only
    pubspec_before = (demo_path / "pubspec.yaml").read_bytes()
    main_dart_before = (demo_path / "lib" / "main.dart").read_bytes()

    security_core = SecurityCore()
    workspace_service = ProjectWorkspaceService(security_core=security_core)

    report = workspace_service.register_and_scan(
        project_id="demo-flutter",
        folder_path=str(demo_path),
        mode=ProjectWorkMode.READ_ONLY,
    )

    # 1. Validação do Relatório de Arquitetura
    assert report.project_id == "demo-flutter"
    assert report.project_name == "demo_flutter_app"
    assert "Flutter" in report.project_type
    assert "lib/main.dart" in report.entry_points
    assert "flutter" in report.key_dependencies
    assert "cupertino_icons" in report.key_dependencies

    # 2. Validação do Inventário
    inventory = workspace_service.get_inventory("demo-flutter")
    assert inventory is not None
    assert inventory.total_files >= 3
    assert any("pubspec.yaml" in m for m in inventory.manifests_found)
    assert ".dart" in inventory.languages

    # 3. Comprovação Absoluta de Read-Only (Arquivos Não Modificados)
    pubspec_after = (demo_path / "pubspec.yaml").read_bytes()
    main_dart_after = (demo_path / "lib" / "main.dart").read_bytes()
    assert pubspec_before == pubspec_after
    assert main_dart_before == main_dart_after


def test_project_analyzer_detects_security_hotspot(tmp_path):
    project_dir = tmp_path / "vuln_app"
    project_dir.mkdir()
    source_file = project_dir / "service.py"
    source_file.write_text(
        'API_KEY = "sk-1234567890abcdef12345678"\nurl = "http://api.insecure.com/data"\n'
    )

    scanner = ProjectScanner()
    inventory = scanner.scan("vuln-proj", project_dir)

    analyzer = ProjectAnalyzer()
    report = analyzer.analyze(inventory)

    assert len(report.security_hotspots) == 2
    rules = {h.rule for h in report.security_hotspots}
    assert "HARDCODED_CREDENTIAL" in rules
    assert "UNENCRYPTED_HTTP" in rules


def test_project_workspace_scaffold_and_file_modification(tmp_path):
    security_core = SecurityCore()
    workspace_service = ProjectWorkspaceService(security_core=security_core)

    # 1. Criação física de projeto web
    res = workspace_service.scaffold_project(
        project_id="test-site-cafe",
        name="Cafeteria Teste",
        description="Site de teste",
        project_type="web",
    )
    assert res["project_id"] == "test-site-cafe"
    assert "index.html" in res["files_created"]
    assert "style.css" in res["files_created"]

    # 2. Leitura física do arquivo no disco
    content = workspace_service.read_project_file("test-site-cafe", "index.html")
    assert "<title>Cafeteria Teste</title>" in content

    # 3. Modificação física no disco com geração de diff e backup
    mod_res = workspace_service.modify_project_file(
        project_id="test-site-cafe",
        rel_path="index.html",
        new_content=content.replace("Cafeteria Teste", "Cafeteria Imperial"),
        reason="Teste de modificação",
    )
    assert mod_res["status"] == "modified"
    assert "-    <title>Cafeteria Teste</title>" in mod_res["diff"]
    assert "+    <title>Cafeteria Imperial</title>" in mod_res["diff"]

    # Verifica backup gerado
    backup_path = Path("workspace/test-site-cafe/index.html.bak")
    assert backup_path.exists()
    assert "Cafeteria Teste" in backup_path.read_text(encoding="utf-8")
