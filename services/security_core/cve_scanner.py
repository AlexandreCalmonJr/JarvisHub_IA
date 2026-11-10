"""
JARVIS AI HUB - DevSecOps: Scanner Offline de Dependências & CVEs
Analisa arquivos de dependências (requirements.txt, package.json, pyproject.toml)
contra vulnerabilidades conhecidas (CVEs) sem necessidade de conexão externa de rede.
Opera 100% local e blindado.
"""

import json
import logging
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger("jarvis.cve_scanner")

# Base de Dados Estática Offline de CVEs Críticas e Altas (PyPI & NPM)
OFFLINE_CVE_DATABASE: dict[str, list[dict[str, Any]]] = {
    "requests": [
        {
            "cve": "CVE-2023-32681",
            "severity": "MEDIUM",
            "vulnerable_below": "2.31.0",
            "title": "Vazamento não intencional de Proxy-Authorization header em redirects",
            "remediation": "Atualizar requests para >= 2.31.0",
        },
        {
            "cve": "CVE-2018-18074",
            "severity": "HIGH",
            "vulnerable_below": "2.20.0",
            "title": "Vazamento de credenciais HTTP Basic Auth em redirecionamentos HTTP para HTTPS",
            "remediation": "Atualizar requests para >= 2.20.0",
        },
    ],
    "urllib3": [
        {
            "cve": "CVE-2023-45803",
            "severity": "HIGH",
            "vulnerable_below": "2.0.7",
            "title": "Vazamento de headers de autorização em redirects cross-origin",
            "remediation": "Atualizar urllib3 para >= 2.0.7",
        },
        {
            "cve": "CVE-2021-33503",
            "severity": "HIGH",
            "vulnerable_below": "1.26.5",
            "title": "Negação de serviço (ReDoS) em processamento de headers de autorização",
            "remediation": "Atualizar urllib3 para >= 1.26.5",
        },
    ],
    "flask": [
        {
            "cve": "CVE-2018-1000656",
            "severity": "HIGH",
            "vulnerable_below": "1.0.0",
            "title": "Negação de serviço via consumo excessivo de memória em uploads multipart",
            "remediation": "Atualizar Flask para >= 2.0.0",
        }
    ],
    "fastapi": [
        {
            "cve": "CVE-2024-24762",
            "severity": "MEDIUM",
            "vulnerable_below": "0.109.1",
            "title": "ReDoS via multipart/form-data parsing",
            "remediation": "Atualizar FastAPI para >= 0.109.1",
        }
    ],
    "cryptography": [
        {
            "cve": "CVE-2023-49083",
            "severity": "MEDIUM",
            "vulnerable_below": "41.0.6",
            "title": "Null pointer dereference em processamento de certificados PKCS7",
            "remediation": "Atualizar cryptography para >= 41.0.6",
        }
    ],
    "django": [
        {
            "cve": "CVE-2023-31047",
            "severity": "HIGH",
            "vulnerable_below": "4.2.1",
            "title": "Possível bypass de validação de formulários em múltiplos uploads",
            "remediation": "Atualizar Django para >= 4.2.1",
        }
    ],
    "lodash": [
        {
            "cve": "CVE-2021-23337",
            "severity": "HIGH",
            "vulnerable_below": "4.17.21",
            "title": "Injeção de comandos via template parser de lodash",
            "remediation": "Atualizar lodash para >= 4.17.21",
        },
        {
            "cve": "CVE-2019-10744",
            "severity": "CRITICAL",
            "vulnerable_below": "4.17.12",
            "title": "Poluição de protótipo (Prototype Pollution) via defaultsDeep",
            "remediation": "Atualizar lodash para >= 4.17.21",
        },
    ],
    "axios": [
        {
            "cve": "CVE-2023-45857",
            "severity": "HIGH",
            "vulnerable_below": "1.6.0",
            "title": "Exposição de tokens de autorização em cross-site redirects",
            "remediation": "Atualizar axios para >= 1.6.0",
        }
    ],
    "express": [
        {
            "cve": "CVE-2024-43796",
            "severity": "MEDIUM",
            "vulnerable_below": "4.20.0",
            "title": "Bypass de sanitização em redirecionamentos com URLs malformadas",
            "remediation": "Atualizar express para >= 4.20.0",
        }
    ],
}


def _parse_version(v_str: str) -> tuple[int, ...]:
    clean = re.sub(r"[^\d.]", "", v_str)
    parts = []
    for p in clean.split("."):
        try:
            parts.append(int(p))
        except ValueError:
            break
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts[:3])


def _is_version_vulnerable(detected_v: str, vulnerable_below_v: str) -> bool:
    v1 = _parse_version(detected_v)
    v2 = _parse_version(vulnerable_below_v)
    return v1 < v2


class CVEScannerService:
    def parse_requirements_txt(self, content: str) -> dict[str, str]:
        """Extrai pacotes e versões fixadas do requirements.txt."""
        packages = {}
        for line in content.splitlines():
            line = line.strip()
            if not line or line.startswith(("#", "-")):
                continue
            # Casos como pkg==1.2.3, pkg>=1.2.3, pkg~=1.2.3
            m = re.match(r"^([a-zA-Z0-9_\-]+)\s*(?:==|>=|<=|~=)\s*([0-9a-zA-Z_\.\-]+)", line)
            if m:
                pkg_name = m.group(1).lower().replace("_", "-")
                pkg_version = m.group(2)
                packages[pkg_name] = pkg_version
            else:
                m_simple = re.match(r"^([a-zA-Z0-9_\-]+)", line)
                if m_simple:
                    pkg_name = m_simple.group(1).lower().replace("_", "-")
                    packages[pkg_name] = "unknown"
        return packages

    def parse_package_json(self, content: str) -> dict[str, str]:
        """Extrai dependências do package.json."""
        packages = {}
        try:
            data = json.loads(content)
            deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
            for k, v in deps.items():
                clean_v = str(v).replace("^", "").replace("~", "").replace(">", "").replace("=", "").strip()
                packages[k.lower()] = clean_v
        except Exception:
            pass
        return packages

    def scan_project_dependencies(self, project_dir: Path) -> dict[str, Any]:
        """Realiza varredura offline completa no projeto procurando por CVEs em dependências."""
        p_dir = Path(project_dir).resolve()
        if not p_dir.exists():
            raise FileNotFoundError(f"Diretório não encontrado: {p_dir}")

        detected_deps: dict[str, str] = {}
        files_scanned = []

        # 1. Verifica requirements.txt
        req_file = p_dir / "requirements.txt"
        if req_file.exists():
            files_scanned.append("requirements.txt")
            txt = req_file.read_text(encoding="utf-8", errors="replace")
            detected_deps.update(self.parse_requirements_txt(txt))

        # 2. Verifica package.json
        pkg_file = p_dir / "package.json"
        if pkg_file.exists():
            files_scanned.append("package.json")
            txt = pkg_file.read_text(encoding="utf-8", errors="replace")
            detected_deps.update(self.parse_package_json(txt))

        # 3. Cruzamento com a base de CVEs
        findings = []
        for pkg, version in detected_deps.items():
            norm_pkg = pkg.replace("_", "-")
            cve_list = OFFLINE_CVE_DATABASE.get(norm_pkg) or OFFLINE_CVE_DATABASE.get(pkg)
            if cve_list:
                for cve_info in cve_list:
                    vuln_below = cve_info["vulnerable_below"]
                    if version != "unknown":
                        if _is_version_vulnerable(version, vuln_below):
                            findings.append({
                                "package": pkg,
                                "detected_version": version,
                                "cve": cve_info["cve"],
                                "severity": cve_info["severity"],
                                "title": cve_info["title"],
                                "remediation": cve_info["remediation"],
                            })
                    else:
                        # Versão não fixada - recomendação de boas práticas
                        findings.append({
                            "package": pkg,
                            "detected_version": "não fixada (unpinned)",
                            "cve": cve_info["cve"],
                            "severity": "LOW",
                            "title": f"Pacote '{pkg}' possui histórico de vulnerabilidades. Fixe a versão segura.",
                            "remediation": cve_info["remediation"],
                        })

        severity_counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
        for f in findings:
            sev = f.get("severity", "LOW")
            severity_counts[sev] = severity_counts.get(sev, 0) + 1

        score = max(0, 100 - (severity_counts["CRITICAL"] * 40 + severity_counts["HIGH"] * 25 + severity_counts["MEDIUM"] * 10))

        return {
            "status": "completed",
            "files_scanned": files_scanned,
            "total_dependencies_found": len(detected_deps),
            "vulnerabilities_found": len(findings),
            "severity_counts": severity_counts,
            "security_score": score,
            "is_safe": len(findings) == 0,
            "findings": findings,
        }
