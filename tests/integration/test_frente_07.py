"""
Testes de Integração - FRENTE 07: DevSecOps & Cibersegurança Proativa
Valida:
1. Scanner Offline de Vulnerabilidades & CVEs em requirements.txt e package.json.
2. Red Team Sandbox Local contra SQLi, Command Injection, Path Traversal, XSS e Secrets.
3. Gerador de Políticas de Segurança (CSP, CORS restrito, Security Headers) para FastAPI, Express e Nginx.
"""

from pathlib import Path
import pytest

from services.security_core.cve_scanner import CVEScannerService
from services.security_core.red_team_sandbox import RedTeamSandboxService
from services.security_core.policy_generator import SecurityPolicyGenerator


@pytest.fixture
def vulnerable_project(tmp_path: Path):
    """Cria um projeto simulado contendo dependências e códigos vulneráveis."""
    proj_dir = tmp_path / "vuln_app"
    proj_dir.mkdir(parents=True, exist_ok=True)

    # 1. Dependências vulneráveis
    req_txt = proj_dir / "requirements.txt"
    req_txt.write_text("requests==2.18.0\nurllib3==1.24.1\nfastapi>=0.110.0\n", encoding="utf-8")

    pkg_json = proj_dir / "package.json"
    pkg_json.write_text('{"dependencies": {"lodash": "^4.17.10", "react": "^18.2.0"}}', encoding="utf-8")

    # 2. Código com vulnerabilidades
    py_code = proj_dir / "database_api.py"
    py_code.write_text(
        'import subprocess\n'
        'import sqlite3\n\n'
        'def get_user(user_id):\n'
        '    conn = sqlite3.connect("app.db")\n'
        '    cursor = conn.cursor()\n'
        '    # Injeção de SQL via f-string\n'
        '    cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")\n'
        '    return cursor.fetchone()\n\n'
        'def run_system_cmd(command):\n'
        '    # Injeção de comandos\n'
        '    subprocess.run(command, shell=True)\n\n'
        '# Segredo hardcoded exposto\n'
        'API_KEY = "AIzaSyD-TEST-FAKE-KEY-FOR-SECURITY-TESTS-00"\n',
        encoding="utf-8",
    )

    js_code = proj_dir / "component.jsx"
    js_code.write_text(
        'export function DangerComponent({ html }) {\n'
        '    return <div dangerouslySetInnerHTML={{ __html: html }} />;\n'
        '}\n',
        encoding="utf-8",
    )

    return proj_dir


@pytest.fixture
def safe_project(tmp_path: Path):
    """Cria um projeto com dependências atualizadas e sem vulnerabilidades estáticas."""
    proj_dir = tmp_path / "safe_app"
    proj_dir.mkdir(parents=True, exist_ok=True)

    req_txt = proj_dir / "requirements.txt"
    req_txt.write_text("requests==2.32.0\nurllib3==2.1.0\nfastapi==0.115.0\n", encoding="utf-8")

    py_code = proj_dir / "app.py"
    py_code.write_text(
        'import os\n\n'
        'api_key = os.getenv("API_KEY")\n'
        'def get_user(cursor, user_id):\n'
        '    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))\n'
        '    return cursor.fetchone()\n',
        encoding="utf-8",
    )
    return proj_dir


def test_cve_scanner_detects_vulnerabilities(vulnerable_project):
    """Valida detecção offline de CVEs conhecidas em requirements.txt e package.json."""
    scanner = CVEScannerService()
    report = scanner.scan_project_dependencies(vulnerable_project)

    assert report["status"] == "completed"
    assert report["is_safe"] is False
    assert report["vulnerabilities_found"] >= 2

    cves_found = [f["cve"] for f in report["findings"]]
    # requests==2.18.0 é vulnerável a CVE-2018-18074 e CVE-2023-32681
    assert any("CVE-2018-18074" in c or "CVE-2023-32681" in c for c in cves_found)
    # lodash 4.17.10 é vulnerável a CVE-2019-10744
    assert any("CVE-2019-10744" in c for c in cves_found)
    assert report["security_score"] < 70


def test_cve_scanner_safe_project(safe_project):
    """Valida que um projeto com versões modernas e seguras recebe score máximo."""
    scanner = CVEScannerService()
    report = scanner.scan_project_dependencies(safe_project)

    assert report["status"] == "completed"
    assert report["is_safe"] is True
    assert report["vulnerabilities_found"] == 0
    assert report["security_score"] == 100


def test_red_team_sandbox_audit(vulnerable_project):
    """Valida análise estática do Red Team detectando SQLi, Command Injection, XSS e Secrets."""
    sandbox = RedTeamSandboxService()
    audit = sandbox.run_security_audit(vulnerable_project)

    assert audit["status"] == "completed"
    assert audit["total_vulnerabilities"] >= 4
    assert audit["score"] < 50

    finding_types = [f["type"] for f in audit["findings"]]
    assert "SQL_INJECTION" in finding_types
    assert "COMMAND_INJECTION" in finding_types
    assert "HARDCODED_SECRET" in finding_types
    assert "CROSS_SITE_SCRIPTING" in finding_types

    # Valida que todos os achados possuem linha e remediação
    for f in audit["findings"]:
        assert f["line"] > 0
        assert len(f["remediation"]) > 10


def test_policy_generator_templates_and_export(tmp_path: Path):
    """Valida geração de templates de proteção (FastAPI, Express, Nginx) e aplicação física."""
    generator = SecurityPolicyGenerator()
    templates = generator.get_available_templates()

    assert len(templates) == 3
    tmpl_ids = [t["id"] for t in templates]
    assert "fastapi_headers" in tmpl_ids
    assert "express_helmet" in tmpl_ids
    assert "nginx_hardening" in tmpl_ids

    # Valida conteúdo do template FastAPI
    fastapi_tmpl = next(t for t in templates if t["id"] == "fastapi_headers")
    assert "Content-Security-Policy" in fastapi_tmpl["code"]
    assert "CORSMiddleware" in fastapi_tmpl["code"]
    assert "X-Frame-Options" in fastapi_tmpl["code"]

    # Simula gravação física no diretório
    dest_file = tmp_path / fastapi_tmpl["filename"]
    dest_file.write_text(fastapi_tmpl["code"], encoding="utf-8")
    assert dest_file.exists()
    assert dest_file.stat().st_size > 100
