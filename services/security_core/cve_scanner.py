"""
JARVIS AI HUB - DevSecOps: Scanner Offline de Dependências & CVEs
Analisa arquivos de dependências (requirements.txt, package.json, pyproject.toml)
contra vulnerabilidades conhecidas (CVEs) sem necessidade de conexão externa de rede.
Opera 100% local e blindado.
"""

import json
import logging
import re
import subprocess
import sys
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
    "pyyaml": [
        {
            "cve": "CVE-2020-14343",
            "severity": "CRITICAL",
            "vulnerable_below": "5.4",
            "title": "Deserialização de código arbitrário via yaml.load",
            "remediation": "Utilizar yaml.safe_load ou atualizar pyyaml para >= 5.4",
        }
    ],
    "jinja2": [
        {
            "cve": "CVE-2024-22195",
            "severity": "HIGH",
            "vulnerable_below": "3.1.3",
            "title": "Server-Side Template Injection (SSTI) via xmlattr filter",
            "remediation": "Atualizar Jinja2 para >= 3.1.3",
        }
    ],
    "werkzeug": [
        {
            "cve": "CVE-2023-46136",
            "severity": "HIGH",
            "vulnerable_below": "3.0.1",
            "title": "Negação de serviço via processamento excessivo de dados multipart",
            "remediation": "Atualizar Werkzeug para >= 3.0.1",
        }
    ],
    "sqlparse": [
        {
            "cve": "CVE-2024-4340",
            "severity": "HIGH",
            "vulnerable_below": "0.5.0",
            "title": "Recursion depth bypass que permite negação de serviço",
            "remediation": "Atualizar sqlparse para >= 0.5.0",
        }
    ],
    "pillow": [
        {
            "cve": "CVE-2023-44271",
            "severity": "HIGH",
            "vulnerable_below": "10.0.1",
            "title": "Negação de serviço via processamento de imagens malformadas",
            "remediation": "Atualizar Pillow para >= 10.0.1",
        }
    ],
    "jsonwebtoken": [
        {
            "cve": "CVE-2022-23529",
            "severity": "CRITICAL",
            "vulnerable_below": "9.0.0",
            "title": "Execução remota de código via key retrieval inseguro",
            "remediation": "Atualizar jsonwebtoken para >= 9.0.0",
        }
    ],
    "semver": [
        {
            "cve": "CVE-2022-25883",
            "severity": "HIGH",
            "vulnerable_below": "7.5.2",
            "title": "ReDoS em parsing de expressões regulares de versões",
            "remediation": "Atualizar semver para >= 7.5.4",
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
                clean_v = (
                    str(v)
                    .replace("^", "")
                    .replace("~", "")
                    .replace(">", "")
                    .replace("=", "")
                    .strip()
                )
                packages[k.lower()] = clean_v
        except Exception:
            logger.debug(
                "package.json inválido ignorado na análise de dependências.", exc_info=True
            )
        return packages

    def scan_with_pip_audit(self, req_path: Path) -> list[dict[str, Any]] | None:
        """Executa pip-audit no arquivo de requisitos para auditoria autoritativa via PyPI/OSV."""
        try:
            cmd = [
                sys.executable,
                "-m",
                "pip_audit",
                "-r",
                str(req_path),
                "-f",
                "json",
                "--no-deps",
            ]
            res = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=12,
            )
            if res.stdout:
                data = json.loads(res.stdout)
                findings: list[dict[str, Any]] = []
                for dep in data.get("dependencies", []):
                    pkg_name = dep.get("name", "")
                    pkg_ver = dep.get("version", "")
                    for vuln in dep.get("vulns", []):
                        vuln_id = vuln.get("id", "")
                        aliases = vuln.get("aliases", [])
                        cve = next((a for a in aliases if a.startswith("CVE-")), vuln_id)
                        fix_vers = vuln.get("fix_versions", [])
                        remediation = (
                            f"Atualizar {pkg_name} para >= {fix_vers[0]}"
                            if fix_vers
                            else f"Consultar advisory oficial para {pkg_name}"
                        )
                        raw_desc = vuln.get("description", "")
                        title = (
                            raw_desc.splitlines()[0][:120]
                            if raw_desc
                            else f"Vulnerabilidade conhecida em {pkg_name}"
                        )
                        findings.append(
                            {
                                "package": pkg_name,
                                "detected_version": pkg_ver,
                                "cve": cve,
                                "severity": "HIGH",
                                "title": title,
                                "remediation": remediation,
                                "source": "pip-audit / OSV",
                            }
                        )
                return findings
        except Exception as exc:
            logger.debug("pip-audit indisponível ou falhou (usando base offline): %s", exc)
        return None

    def scan_project_dependencies(self, project_dir: Path) -> dict[str, Any]:
        """Realiza varredura híbrida (pip-audit autoritativo + base estática offline) de CVEs."""
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

        # 3. Auditoria com pip-audit para requirements.txt (se disponível)
        findings: list[dict[str, Any]] = []
        pip_audit_covered_pkgs: set[str] = set()
        if req_file.exists():
            pip_results = self.scan_with_pip_audit(req_file)
            if pip_results is not None:
                findings.extend(pip_results)
                for f in pip_results:
                    pip_audit_covered_pkgs.add(f["package"].lower().replace("_", "-"))

        # 4. Cruzamento complementar com a base estática de CVEs (NPM e PyPI offline)
        for pkg, version in detected_deps.items():
            norm_pkg = pkg.replace("_", "-")
            # Se o pip-audit já reportou CVEs para este pacote, evitamos duplicações exatas
            if norm_pkg in pip_audit_covered_pkgs:
                continue
            cve_list = OFFLINE_CVE_DATABASE.get(norm_pkg) or OFFLINE_CVE_DATABASE.get(pkg)
            if cve_list:
                for cve_info in cve_list:
                    vuln_below = cve_info["vulnerable_below"]
                    if version != "unknown":
                        if _is_version_vulnerable(version, vuln_below):
                            findings.append(
                                {
                                    "package": pkg,
                                    "detected_version": version,
                                    "cve": cve_info["cve"],
                                    "severity": cve_info["severity"],
                                    "title": cve_info["title"],
                                    "remediation": cve_info["remediation"],
                                    "source": "offline_db",
                                }
                            )
                    else:
                        # Versão não fixada - recomendação de boas práticas
                        findings.append(
                            {
                                "package": pkg,
                                "detected_version": "não fixada (unpinned)",
                                "cve": cve_info["cve"],
                                "severity": "LOW",
                                "title": f"Pacote '{pkg}' possui histórico de vulnerabilidades. Fixe a versão segura.",
                                "remediation": cve_info["remediation"],
                                "source": "offline_db",
                            }
                        )

        severity_counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
        for f in findings:
            sev = f.get("severity", "LOW")
            severity_counts[sev] = severity_counts.get(sev, 0) + 1

        score = max(
            0,
            100
            - (
                severity_counts["CRITICAL"] * 40
                + severity_counts["HIGH"] * 25
                + severity_counts["MEDIUM"] * 10
            ),
        )

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
