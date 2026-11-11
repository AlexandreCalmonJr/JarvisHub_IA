"""Implementação de ferramentas operacionais especializadas do ToolGateway:
DuckDB analítico, scanners de segurança (secrets e SAST), dependências, SBOM,
SQL explain e memória vetorial com LanceDB.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger("jarvis.tools.specialized")

def _resolve_project_target(project_root: Path, target_path: str) -> Path:
    """Resolve um caminho relativo sem permitir escapes ou symlinks externos."""
    root = Path(project_root).resolve()
    requested = Path(target_path or ".")
    if requested.is_absolute():
        raise PermissionError("Caminhos absolutos não são permitidos nesta ferramenta.")
    resolved = (root / requested).resolve()
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise PermissionError("O caminho solicitado está fora do projeto autorizado.") from exc
    return resolved


EXCLUDED_SCAN_DIRS = {
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    "dist",
    "build",
    ".idea",
    ".vscode",
}

# -------------------------------------------------------------------------
# 1. DuckDB Analítico (Cientista de Dados & Business Intelligence)
# -------------------------------------------------------------------------

def execute_duckdb_query(
    sql: str,
    project_root: Path,
    max_rows: int = 50,
) -> tuple[bool, str, str]:
    """
    Executa consulta analítica SQL em alta performance com o motor DuckDB embutido.
    Suporta consultas diretas em arquivos CSV, Parquet e JSON do projeto.
    """
    try:
        import duckdb
    except ImportError:
        return False, "", "Módulo 'duckdb' não está instalado no ambiente."

    try:
        # Cria conexão em memória confinada
        con = duckdb.connect(database=":memory:")
        # Define diretório corrente do projeto para queries relativas (ex: read_csv('dados.csv'))
        con.execute(f"SET file_search_path = '{project_root.as_posix()}';")

        res = con.execute(sql)
        columns = [desc[0] for desc in res.description] if res.description else []
        rows = res.fetchmany(max_rows)
        total_fetched = len(rows)

        # Formata tabela markdown
        lines = []
        if columns:
            lines.append("| " + " | ".join(columns) + " |")
            lines.append("| " + " | ".join(["---"] * len(columns)) + " |")
            for r in rows:
                formatted_row = [str(val).replace("\n", " ") for val in r]
                lines.append("| " + " | ".join(formatted_row) + " |")

        table_str = "\n".join(lines)
        summary = f"DuckDB: Consulta executada com sucesso ({total_fetched} linhas retornadas).\n\n{table_str}"
        return True, summary, ""
    except Exception as exc:
        return False, "", f"Erro ao executar DuckDB query: {exc}"


# -------------------------------------------------------------------------
# 2. Scanner de Segredos & Credenciais Expostas (Cibersegurança & Auditoria)
# -------------------------------------------------------------------------

SECRET_PATTERNS: list[tuple[str, re.Pattern, str]] = [
    (
        "AWS Access Key",
        re.compile(r"\b(AKIA[0-9A-Z]{16})\b"),
        "Crítica",
    ),
    (
        "GitHub Token",
        re.compile(r"\b(gh[pousr]_[A-Za-z0-9_]{36,255})\b"),
        "Crítica",
    ),
    (
        "Slack Token",
        re.compile(r"\b(xox[baprs]-[0-9A-Za-z]{10,48})\b"),
        "Alta",
    ),
    (
        "Private Key",
        re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
        "Crítica",
    ),
    (
        "Chave/Segredo Genérico Atribuído",
        re.compile(
            r"""(?:api[_-]?key|secret|password|auth[_-]?token|access[_-]?token)\s*[:=]\s*['"]([a-zA-Z0-9_\-]{16,})['"]""",
            re.IGNORECASE,
        ),
        "Média",
    ),
]


def execute_scan_secrets(
    project_root: Path,
    target_path: str = ".",
) -> tuple[bool, str, str]:
    """Varre arquivos do projeto em busca de credenciais e segredos em texto claro."""
    project_root = Path(project_root).resolve()
    target_dir = _resolve_project_target(project_root, target_path)
    if not target_dir.exists() or not target_dir.is_dir():
        return False, "", f"Caminho '{target_path}' não existe no projeto."

    findings: list[dict[str, Any]] = []

    for root, dirs, files in os.walk(target_dir):
        dirs[:] = [
            d for d in dirs
            if d not in EXCLUDED_SCAN_DIRS and not (Path(root) / d).is_symlink()
        ]
        for f in files:
            file_p = Path(root) / f
            if file_p.is_symlink():
                continue
            try:
                file_p.resolve().relative_to(project_root)
            except (OSError, ValueError):
                continue
            if file_p.suffix.lower() in {".pyc", ".png", ".jpg", ".zip", ".exe", ".bin", ".db"}:
                continue

            try:
                content = file_p.read_text(encoding="utf-8", errors="ignore")
            except Exception as exc:
                logger.debug("Ignorando arquivo ilegível para secrets %s: %s", file_p, exc)
                continue

            lines = content.splitlines()
            for line_idx, line in enumerate(lines, 1):
                for pattern_name, regex, severity in SECRET_PATTERNS:
                    match = regex.search(line)
                    if match:
                        matched_val = match.group(0)
                        # Mascara valor
                        masked = (
                            matched_val[:4] + "..." + matched_val[-4:]
                            if len(matched_val) > 8
                            else "***"
                        )
                        rel_file = str(file_p.relative_to(project_root))
                        findings.append({
                            "file": rel_file,
                            "line": line_idx,
                            "type": pattern_name,
                            "severity": severity,
                            "sample": line.strip()[:120].replace(matched_val, masked),
                        })

    if not findings:
        return True, "✅ Scan de Segredos Concluído: Nenhum segredo ou credencial exposta foi detectada.", ""

    md_lines = [
        f"⚠️ **Scan de Segredos**: Detectadas {len(findings)} ocorrências potencialmente vulneráveis:\n",
        "| Arquivo | Linha | Tipo | Severidade | Amostra Mascarada |",
        "| :--- | :---: | :--- | :---: | :--- |",
    ]
    for find in findings[:50]:
        md_lines.append(
            f"| `{find['file']}` | {find['line']} | {find['type']} | **{find['severity']}** | `{find['sample']}` |"
        )

    return True, "\n".join(md_lines), ""


# -------------------------------------------------------------------------
# 3. Scanner SAST OWASP Top 10 (Auditor de Código Seguro)
# -------------------------------------------------------------------------

SAST_PATTERNS: list[tuple[str, re.Pattern, str, str]] = [
    (
        "SQL Injection Potencial",
        re.compile(r"""(?:execute|raw)\s*\(\s*f["'].*SELECT.*\{.*\}""", re.IGNORECASE),
        "CWE-89: Concatenação não sanitizada em query SQL.",
        "Alta",
    ),
    (
        "Injeção de Comando de Sistema",
        re.compile(r"""\bos\.system\s*\(|\bsubprocess\.(?:Popen|call|run)\s*\(.*shell\s*=\s*True""", re.IGNORECASE),
        "CWE-78: Execução de comando shell com interpolação de strings.",
        "Crítica",
    ),
    (
        "Deserialização Insegura",
        re.compile(r"""\bpickle\.loads\s*\(|\byaml\.load\s*\([^,)]+\)""", re.IGNORECASE),
        "CWE-502: Deserialização de objetos arbitrários sem validação.",
        "Alta",
    ),
    (
        "Uso de Eval / Exec",
        re.compile(r"""\b(?:eval|exec)\s*\(""", re.IGNORECASE),
        "CWE-95: Interpretação dinâmica de código arbitrário.",
        "Alta",
    ),
    (
        "Desativação de Verificação SSL",
        re.compile(r"""verify\s*=\s*False|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0['"]?""", re.IGNORECASE),
        "CWE-295: Validação de certificado TLS desabilitada.",
        "Média",
    ),
]


def execute_scan_sast_patterns(
    project_root: Path,
    target_path: str = ".",
) -> tuple[bool, str, str]:
    """Varre arquivos do projeto em busca de padrões de vulnerabilidade de código SAST."""
    target_dir = (project_root / target_path).resolve()
    if not target_dir.exists():
        return False, "", f"Caminho '{target_path}' não existe no projeto."

    findings: list[dict[str, Any]] = []

    for root, dirs, files in os.walk(target_dir):
        dirs[:] = [d for d in dirs if d not in EXCLUDED_SCAN_DIRS]
        for f in files:
            file_p = Path(root) / f
            if file_p.is_symlink():
                continue
            try:
                file_p.resolve().relative_to(project_root)
            except (OSError, ValueError):
                continue
            if file_p.suffix.lower() not in {".py", ".js", ".ts", ".dart", ".go", ".java", ".php"}:
                continue

            try:
                content = file_p.read_text(encoding="utf-8", errors="ignore")
            except Exception as exc:
                logger.debug("Ignorando arquivo ilegível para secrets %s: %s", file_p, exc)
                continue

            lines = content.splitlines()
            for line_idx, line in enumerate(lines, 1):
                for name, regex, desc, severity in SAST_PATTERNS:
                    if regex.search(line):
                        rel_file = str(file_p.relative_to(project_root))
                        findings.append({
                            "file": rel_file,
                            "line": line_idx,
                            "name": name,
                            "desc": desc,
                            "severity": severity,
                            "snippet": line.strip()[:100],
                        })

    if not findings:
        return True, "✅ Auditoria SAST Concluída: Nenhum padrão de vulnerabilidade OWASP Top 10 identificado.", ""

    md_lines = [
        f"🛡️ **Auditoria SAST**: Identificados {len(findings)} pontos de atenção no código:\n",
        "| Arquivo | Linha | Vulnerabilidade | Severidade | Detalhes |",
        "| :--- | :---: | :--- | :---: | :--- |",
    ]
    for find in findings[:50]:
        md_lines.append(
            f"| `{find['file']}` | {find['line']} | {find['name']} | **{find['severity']}** | {find['desc']} |"
        )

    return True, "\n".join(md_lines), ""


# -------------------------------------------------------------------------
# 4. Inspeção de Dependências & Geração de SBOM (Supply Chain)
# -------------------------------------------------------------------------

def execute_inspect_dependencies(project_root: Path) -> tuple[bool, str, str]:
    """Inspeciona todos os manifestos de dependência do projeto."""
    manifests: dict[str, list[dict[str, str]]] = {}

    # 1. requirements.txt
    req_file = project_root / "requirements.txt"
    if req_file.exists():
        deps = []
        for line in req_file.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                parts = re.split(r"[><=~]", line, 1)
                name = parts[0].strip()
                version = line[len(name):].strip()
                deps.append({"package": name, "version": version or "any", "ecosystem": "pypi"})
        manifests["requirements.txt"] = deps

    # 2. pyproject.toml
    pyproj = project_root / "pyproject.toml"
    if pyproj.exists():
        deps = []
        in_deps = False
        for line in pyproj.read_text(encoding="utf-8", errors="ignore").splitlines():
            if "dependencies = [" in line:
                in_deps = True
                continue
            if in_deps:
                if "]" in line:
                    in_deps = False
                    continue
                clean = line.strip().strip('",\'')
                if clean:
                    parts = re.split(r"[><=~]", clean, 1)
                    deps.append({"package": parts[0].strip(), "version": clean[len(parts[0].strip()):], "ecosystem": "pypi"})
        if deps:
            manifests["pyproject.toml"] = deps

    # 3. package.json
    pkg_json = project_root / "package.json"
    if pkg_json.exists():
        try:
            data = json.loads(pkg_json.read_text(encoding="utf-8", errors="ignore"))
            deps = []
            for k in ("dependencies", "devDependencies"):
                if k in data and isinstance(data[k], dict):
                    for name, ver in data[k].items():
                        deps.append({"package": name, "version": str(ver), "ecosystem": "npm"})
            if deps:
                manifests["package.json"] = deps
        except Exception as exc:
            logger.debug("Falha ao analisar package.json: %s", exc)

    if not manifests:
        return True, "Nenhum manifesto de dependências detectado na raiz do projeto (requirements.txt, package.json, pyproject.toml).", ""

    lines = ["📦 **Inventário de Dependências do Projeto**:\n"]
    for m_name, deps in manifests.items():
        lines.append(f"### Manifesto: `{m_name}` ({len(deps)} pacotes)")
        lines.append("| Pacote | Versão Requerida | Ecossistema |")
        lines.append("| :--- | :--- | :--- |")
        for d in deps[:60]:
            lines.append(f"| `{d['package']}` | `{d['version']}` | {d['ecosystem']} |")
        lines.append("")

    return True, "\n".join(lines), ""


def execute_generate_sbom(project_root: Path) -> tuple[bool, str, str]:
    """Gera um SBOM (Software Bill of Materials) no formato CycloneDX simplificado."""
    success, dep_text, err = execute_inspect_dependencies(project_root)
    if not success:
        return False, "", err

    sbom_doc = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "metadata": {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "component": {
                "name": project_root.name,
                "type": "application",
            },
            "tools": [{"vendor": "JARVIS AI Hub", "name": "Software Supply Chain Specialist", "version": "2.0.0"}],
        },
        "components": [],
    }

    # Parser rápido das dependências para montar o JSON
    req_file = project_root / "requirements.txt"
    if req_file.exists():
        for line in req_file.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                parts = re.split(r"[><=~]", line, 1)
                pkg = parts[0].strip()
                ver = line[len(pkg):].strip()
                sbom_doc["components"].append({
                    "type": "library",
                    "name": pkg,
                    "version": ver or "latest",
                    "purl": f"pkg:pypi/{pkg}",
                })

    output_json = json.dumps(sbom_doc, indent=2, ensure_ascii=False)
    summary = f"📋 **SBOM Gerado com Sucesso** ({len(sbom_doc['components'])} componentes catalogados):\n\n```json\n{output_json}\n```"
    return True, summary, ""


# -------------------------------------------------------------------------
# 5. Auditoria de Queries SQL (EXPLAIN QUERY PLAN)
# -------------------------------------------------------------------------

def execute_sql_query_explain(
    sql: str,
    project_root: Path,
    db_filename: str = "jarvis.db",
) -> tuple[bool, str, str]:
    """Executa EXPLAIN QUERY PLAN em SQLite read-only dentro do projeto."""
    import sqlite3

    root = Path(project_root).resolve()
    try:
        db_path = _resolve_project_target(root, db_filename)
    except PermissionError as exc:
        return False, "", str(exc)
    if db_path.suffix.lower() not in {".db", ".sqlite", ".sqlite3"}:
        return False, "", "Apenas bancos SQLite dentro do projeto são permitidos."
    if not db_path.exists() or not db_path.is_file():
        return False, "", f"Banco de dados '{db_filename}' não encontrado no projeto."

    conn = None
    try:
        conn = sqlite3.connect(f"{db_path.as_uri()}?mode=ro", uri=True)
        cur = conn.cursor()
        cur.execute(f"EXPLAIN QUERY PLAN {sql.strip()}")
        rows = cur.fetchall()

        lines = [
            "🔍 **Auditoria de Performance SQL**: `EXPLAIN QUERY PLAN`\n",
            "```sql\n" + sql.strip() + "\n```\n",
            "| ID | Pai | Detalhes do Plano de Execução |",
            "| :-: | :-: | :--- |",
        ]
        has_table_scan = False
        for row in rows:
            detail = row[3] if len(row) > 3 else str(row)
            if "SCAN TABLE" in detail.upper():
                has_table_scan = True
                detail = f"⚠️ **{detail}**"
            lines.append(f"| {row[0]} | {row[1]} | {detail} |")

        if has_table_scan:
            lines.append("\n> **Full Table Scan Detectado**: avalie índices nas colunas usadas no filtro `WHERE`.")
        else:
            lines.append("\n> **Plano otimizado**: não foi detectada varredura completa de tabela.")
        return True, "\n".join(lines), ""
    except Exception as exc:
        return False, "", f"Erro ao auditar SQL: {exc}"
    finally:
        if conn is not None:
            conn.close()


# -------------------------------------------------------------------------
# 6. Memória Semântica Vetorial (LanceDB)
# -------------------------------------------------------------------------

class VectorMemoryManager:
    """Gerencia índices vetoriais embutidos locais via LanceDB para os agentes."""

    def __init__(self, db_dir: Path | str = "data/vectors"):
        self.db_dir = Path(db_dir)
        self.db_dir.mkdir(parents=True, exist_ok=True)
        self._db = None

    def _get_db(self):
        if self._db is None:
            import lancedb
            self._db = lancedb.connect(str(self.db_dir))
        return self._db

    def _list_tables(self, db) -> list[str]:
        if hasattr(db, "list_tables"):
            return [str(t) for t in db.list_tables()]
        return [str(t) for t in db.table_names()]

    def store_memory(
        self,
        table_name: str,
        text: str,
        vector: list[float],
        metadata: dict[str, Any] | None = None,
    ) -> bool:
        """Armazena um vetor com texto e metadados no LanceDB."""
        try:
            db = self._get_db()
            record = {
                "id": f"vec-{int(time.time() * 1000)}",
                "text": text,
                "vector": vector,
                "metadata_json": json.dumps(metadata or {}),
                "created_at": time.time(),
            }
            existing_tables = self._list_tables(db)
            if table_name in existing_tables:
                tbl = db.open_table(table_name)
                tbl.add([record])
            else:
                db.create_table(table_name, data=[record])
            return True
        except Exception as exc:
            logger.warning("Falha ao salvar no LanceDB: %s", exc)
            return False

    def search_similar(
        self,
        table_name: str,
        query_vector: list[float],
        top_k: int = 5,
    ) -> list[dict[str, Any]]:
        """Busca os top_k registros mais próximos semanticamente no LanceDB."""
        try:
            db = self._get_db()
            existing_tables = self._list_tables(db)
            if table_name not in existing_tables:
                return []
            tbl = db.open_table(table_name)
            results = tbl.search(query_vector).limit(top_k).to_list()
            return [
                {
                    "text": r.get("text", ""),
                    "score": r.get("_distance", 0.0),
                    "metadata": json.loads(r.get("metadata_json", "{}")),
                }
                for r in results
            ]
        except Exception as exc:
            logger.warning("Falha na busca vetorial do LanceDB: %s", exc)
            return []


# Instância singleton de memória vetorial
vector_memory_manager = VectorMemoryManager()
