"""
JARVIS AI HUB - Backend Studio: Playground SQL Embutido & Auditor de Performance
Permite inspecionar tabelas SQLite dos projetos, executar queries com segurança,
analisar planos de execução (EXPLAIN QUERY PLAN) e sugerir índices de alta performance.
"""

import logging
import re
import sqlite3
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger("jarvis.sql_playground")


class SQLPlaygroundService:
    def __init__(self, workspace_service: Any = None):
        self.workspace_service = workspace_service

    def _resolve_db_path(self, db_path: str, project_id: str | None = None) -> Path:
        """Resolve e valida o caminho físico do banco de dados no computador."""
        p = Path(db_path)
        if not p.is_absolute() and project_id and self.workspace_service:
            proj_dir = self.workspace_service.get_project_dir(project_id)
            p = (proj_dir / db_path).resolve()
        else:
            p = p.resolve()

        if not p.exists() or not p.is_file():
            raise FileNotFoundError(f"Arquivo de banco de dados SQLite não encontrado: '{p}'")
        return p

    def find_project_databases(self, project_id: str) -> list[dict[str, Any]]:
        """Descobre todos os arquivos SQLite dentro da pasta do projeto."""
        if not self.workspace_service:
            return []
        proj_dir = self.workspace_service.get_project_dir(project_id)
        if not proj_dir.exists():
            return []

        databases = []
        for ext in ("*.db", "*.sqlite", "*.sqlite3"):
            for f in proj_dir.rglob(ext):
                rel = f.relative_to(proj_dir).as_posix()
                size_kb = round(f.stat().st_size / 1024, 1)
                databases.append({
                    "name": f.name,
                    "relative_path": rel,
                    "absolute_path": str(f.resolve()),
                    "size_kb": size_kb,
                })
        return databases

    def inspect_database(self, db_path: str, project_id: str | None = None) -> dict[str, Any]:
        """Inspeciona tabelas, colunas, chaves primárias e contagem de registros do SQLite."""
        target = self._resolve_db_path(db_path, project_id)

        tables = []
        conn = sqlite3.connect(f"file:{target}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
            )
            table_rows = cur.fetchall()

            for t_row in table_rows:
                t_name = t_row["name"]
                t_sql = t_row["sql"] or ""

                # Colunas
                cur.execute(f"PRAGMA table_info('{t_name}')")
                col_rows = cur.fetchall()
                cols = []
                for c in col_rows:
                    cols.append({
                        "cid": c["cid"],
                        "name": c["name"],
                        "type": c["type"] or "TEXT",
                        "notnull": bool(c["notnull"]),
                        "pk": bool(c["pk"]),
                    })

                # Contagem de linhas
                try:
                    cur.execute(f"SELECT COUNT(*) FROM '{t_name}'")
                    row_count = cur.fetchone()[0]
                except Exception:
                    row_count = 0

                # Índices existentes
                cur.execute(f"PRAGMA index_list('{t_name}')")
                idx_rows = cur.fetchall()
                indexes = [i["name"] for i in idx_rows]

                tables.append({
                    "name": t_name,
                    "row_count": row_count,
                    "columns": cols,
                    "indexes": indexes,
                    "schema_sql": t_sql,
                })
        finally:
            conn.close()

        return {
            "database": target.name,
            "path": str(target),
            "tables_count": len(tables),
            "tables": tables,
        }

    def execute_query(
        self,
        db_path: str,
        query: str,
        project_id: str | None = None,
        limit: int = 200,
    ) -> dict[str, Any]:
        """Executa uma instrução SQL com medição precisa de tempo e limitação de paginação."""
        target = self._resolve_db_path(db_path, project_id)
        clean_q = query.strip()
        is_select = clean_q.upper().startswith(("SELECT", "PRAGMA", "EXPLAIN"))

        start_time = time.perf_counter()
        conn = sqlite3.connect(str(target))
        conn.row_factory = sqlite3.Row
        try:
            cur = conn.cursor()
            cur.execute(clean_q)

            if is_select:
                rows_raw = cur.fetchmany(limit)
                columns = [col[0] for col in cur.description] if cur.description else []
                rows = [dict(r) for r in rows_raw]
                affected_rows = len(rows)
            else:
                conn.commit()
                columns = []
                rows = []
                affected_rows = cur.rowcount

            duration_ms = round((time.perf_counter() - start_time) * 1000.0, 2)
            return {
                "success": True,
                "is_select": is_select,
                "columns": columns,
                "rows": rows,
                "row_count": len(rows),
                "affected_rows": affected_rows,
                "duration_ms": duration_ms,
            }
        except Exception as exc:
            duration_ms = round((time.perf_counter() - start_time) * 1000.0, 2)
            return {
                "success": False,
                "error": str(exc),
                "duration_ms": duration_ms,
            }
        finally:
            conn.close()

    def audit_query_performance(
        self,
        db_path: str,
        query: str,
        project_id: str | None = None,
    ) -> dict[str, Any]:
        """Analisa o plano de execução da query (EXPLAIN QUERY PLAN) e sugere índices compostos."""
        target = self._resolve_db_path(db_path, project_id)
        clean_q = query.strip()

        if not clean_q.upper().startswith("SELECT"):
            return {
                "status": "skipped",
                "message": "Auditoria de performance suporta consultas SELECT.",
                "suggestions": [],
            }

        plan_steps = []
        suggestions = []
        is_table_scan = False

        conn = sqlite3.connect(f"file:{target}?mode=ro", uri=True)
        try:
            cur = conn.cursor()
            cur.execute(f"EXPLAIN QUERY PLAN {clean_q}")
            for row in cur.fetchall():
                # Formato: (id, parent, notused, detail)
                detail = row[3] if len(row) > 3 else str(row)
                plan_steps.append(detail)
                m_scan = re.search(r"\bSCAN\s+(?:TABLE\s+)?([a-zA-Z0-9_]+)", detail)
                if m_scan:
                    is_table_scan = True
                    table_name = m_scan.group(1)
                    suggestions.append({
                        "type": "MISSING_INDEX",
                        "table": table_name,
                        "severity": "WARNING",
                        "recommendation": f"A query está executando varredura completa ('SCAN') na tabela '{table_name}'. Recomenda-se criar um índice para as colunas do WHERE/JOIN.",
                        "example_sql": f"CREATE INDEX idx_{table_name}_perf ON {table_name}(coluna_aqui);",
                    })
        except Exception as exc:
            return {"status": "error", "error": str(exc), "plan": [], "suggestions": []}
        finally:
            conn.close()

        score = 60 if is_table_scan else 95
        verdict = (
            "Atenção: Consulta com varredura completa (Full Table Scan). Adicione índices para acelerar a leitura."
            if is_table_scan
            else "Excelente: A consulta utiliza índices eficientes e não realiza varredura total de tabela."
        )

        return {
            "status": "audited",
            "score": score,
            "verdict": verdict,
            "is_table_scan": is_table_scan,
            "plan_steps": plan_steps,
            "suggestions": suggestions,
        }
