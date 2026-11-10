"""
JARVIS AI HUB - DevSecOps: Red Team Sandbox Local
Realiza análise estática avançada de código procurando vulnerabilidades de segurança:
- Injeção de SQL (SQLi)
- Cross-Site Scripting (XSS)
- Path Traversal
- Injeção de Comandos (Command Injection)
- Credenciais e Chaves Hardcoded (Secrets Exposure)

Opera 100% offline, em ambiente local protegido.
"""

import logging
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger("jarvis.red_team_sandbox")


class RedTeamSandboxService:
    def __init__(self, workspace_service: Any = None):
        self.workspace_service = workspace_service

    def scan_file_content(self, relative_path: str, content: str) -> list[dict[str, Any]]:
        """Analisa o conteúdo de um arquivo individual em busca de vulnerabilidades."""
        findings = []
        lines = content.splitlines()

        # Padrões de Verificação Estática
        # 1. SQL Injection
        sqli_patterns = [
            (
                r"""(?:execute|cursor\.execute|raw_query|query)\s*\(\s*f["'].*?(?:SELECT|INSERT|UPDATE|DELETE|WHERE).*?\{.+?\}""",
                "SQL_INJECTION",
                "HIGH",
                "Possível Injeção de SQL (SQLi) via f-string em consulta no banco de dados.",
                "Utilize consultas parametrizadas com placeholders ('?' ou ':param') em vez de interpolação direta de strings.",
            ),
            (
                r"""(?:execute|cursor\.execute)\s*\(\s*["'].*?(?:SELECT|INSERT|UPDATE|DELETE|WHERE).*?%\s*\(?""",
                "SQL_INJECTION",
                "HIGH",
                "Possível Injeção de SQL (SQLi) via formatação de string estilo '%' em consulta SQL.",
                "Substitua formatação '%' por passagem de parâmetros de consulta como tupla ou dicionário.",
            ),
        ]

        # 2. Command Injection / Execução perigosa
        cmd_patterns = [
            (
                r"""(?:subprocess\.call|subprocess\.run|subprocess\.Popen)\s*\([^)]*shell\s*=\s*True""",
                "COMMAND_INJECTION",
                "CRITICAL",
                "Uso arriscado de shell=True no subprocess, permitindo injeção de comandos do sistema operacional.",
                "Passe os argumentos como uma lista de tokens ('[\"cmd\", \"arg1\"]') e remova shell=True.",
            ),
            (
                r"""(?:os\.system|os\.popen)\s*\(""",
                "COMMAND_INJECTION",
                "HIGH",
                "Chamada a os.system ou os.popen é insegura para entradas dinâmicas.",
                "Utilize a biblioteca subprocess com argumentos sanitizados e isolados.",
            ),
            (
                r"""(?<!\w)eval\s*\(""",
                "CODE_INJECTION",
                "CRITICAL",
                "Uso de eval() permite execução arbitrária de código Python em tempo de execução.",
                "Evite eval(). Utilize ast.literal_eval() para dados literais seguros ou json.loads() para JSON.",
            ),
        ]

        # 3. Path Traversal
        traversal_patterns = [
            (
                r"""open\s*\(\s*f["'][^"']*\{[^}]*\}""",
                "PATH_TRAVERSAL",
                "MEDIUM",
                "Abertura de arquivo via interpolação f-string sem validação explícita de caminho.",
                "Valide com pathlib.Path(caminho).resolve() e garanta que o caminho resida dentro do diretório base permitido.",
            )
        ]

        # 4. XSS (Cross-Site Scripting) em JS/TS/HTML
        xss_patterns = [
            (
                r"""dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:""",
                "CROSS_SITE_SCRIPTING",
                "HIGH",
                "Uso de dangerouslySetInnerHTML pode expor a aplicação a ataques XSS se o HTML não for sanitizado.",
                "Higienize o HTML usando DOMPurify antes de renderizar ou use elementos React padrão.",
            ),
            (
                r"""\.innerHTML\s*=""",
                "CROSS_SITE_SCRIPTING",
                "MEDIUM",
                "Atribuição direta a innerHTML sem sanitização pode causar execução de scripts maliciosos.",
                "Utilize textContent para textos simples ou higienize o markup antes da injeção.",
            ),
        ]

        # 5. Hardcoded Secrets (Tokens, chaves, senhas)
        secrets_patterns = [
            (
                r"""(?:sk-[a-zA-Z0-9_-]{24,})|(?:ghp_[a-zA-Z0-9]{36,})|(?:AIza[0-9A-Za-z-_]{35})""",
                "HARDCODED_SECRET",
                "CRITICAL",
                "Chave de API ou Token de Acesso sensível encontrado codificado diretamente no código.",
                "Mova chaves de API para variáveis de ambiente (.env) e nunca realize commit delas.",
            ),
            (
                r"""(?:password|senha|secret_key|api_key)\s*=\s*["'][^"']{6,}["']""",
                "HARDCODED_CREDENTIAL",
                "HIGH",
                "Possível senha ou chave secreta atribuída de forma estática no código.",
                "Carregue senhas e segredos através de variáveis de ambiente usando os.environ ou os.getenv().",
            ),
        ]

        all_rules = sqli_patterns + cmd_patterns + traversal_patterns + xss_patterns + secrets_patterns

        for idx, line in enumerate(lines, start=1):
            stripped = line.strip()
            # Ignora linhas de comentários puros
            if stripped.startswith(("#", "//", "/*", "*")):
                continue

            for pattern, vtype, severity, description, remediation in all_rules:
                if re.search(pattern, line, re.IGNORECASE):
                    findings.append({
                        "file": relative_path,
                        "line": idx,
                        "snippet": stripped[:120],
                        "type": vtype,
                        "severity": severity,
                        "description": description,
                        "remediation": remediation,
                    })

        return findings

    def run_security_audit(self, project_dir: Path) -> dict[str, Any]:
        """Varre recursivamente os arquivos do projeto aplicando regras estáticas de segurança."""
        p_dir = Path(project_dir).resolve()
        if not p_dir.exists():
            raise FileNotFoundError(f"Diretório não encontrado: {p_dir}")

        supported_extensions = {".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".env", ".json"}
        ignored_dirs = {"node_modules", ".git", ".venv", "venv", "__pycache__", "dist", "build"}

        total_files = 0
        all_findings = []

        for f in p_dir.rglob("*"):
            if not f.is_file():
                continue
            if any(part in ignored_dirs for part in f.parts):
                continue
            if f.suffix.lower() not in supported_extensions:
                continue

            total_files += 1
            rel = f.relative_to(p_dir).as_posix()
            try:
                content = f.read_text(encoding="utf-8", errors="replace")
                file_findings = self.scan_file_content(rel, content)
                all_findings.extend(file_findings)
            except Exception as e:
                logger.warning(f"Erro ao ler arquivo {rel} para auditoria: {e}")

        severity_counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
        for item in all_findings:
            sev = item["severity"]
            severity_counts[sev] = severity_counts.get(sev, 0) + 1

        # Cálculo do Score de Segurança (100 - penalidades)
        penalties = (
            severity_counts["CRITICAL"] * 30
            + severity_counts["HIGH"] * 15
            + severity_counts["MEDIUM"] * 5
        )
        score = max(0, 100 - penalties)

        status_text = (
            "Blindado e Seguro"
            if score >= 90
            else "Atenção Requerida"
            if score >= 70
            else "Vulnerabilidades Críticas Detectadas"
        )

        return {
            "status": "completed",
            "score": score,
            "verdict": status_text,
            "total_files_audited": total_files,
            "total_vulnerabilities": len(all_findings),
            "severity_counts": severity_counts,
            "findings": all_findings,
        }
