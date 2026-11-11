"""
JARVIS AI HUB - Backend Studio: SQLite Playground somente leitura.
O banco deve ser um arquivo relativo dentro do projeto pertencente à conta.
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
        """Resolve apenas caminhos relativos contidos na raiz do projeto."""
        if not project_id or not self.workspace_service:
            raise PermissionError("Um projeto autorizado é obrigatório.")
        requested = Path(db_path)
        if requested.is_absolute():
            raise PermissionError("Caminhos absolutos não são permitidos no SQL Playground.")
        project_dir = self.workspace_service.get_project_dir(project_id).resolve()
        target = (project_dir / requested).resolve()
        try:
            target.relative_to(project_dir)
        except ValueError as exc:
            raise PermissionError("O banco deve permanecer dentro da pasta do projeto.") from exc
        if target == project_dir or not target.exists() or not target.is_file():
            raise FileNotFoundError("Arquivo SQLite não encontrado no projeto.")
        if target.suffix.lower() not in {".db", ".sqlite", ".sqlite3"}:
            raise ValueError("Apenas arquivos SQLite (.db, .sqlite, .sqlite3) são permitidos.")
        return target

    @staticmethod
    def _connect_readonly(target: Path) -> sqlite3.Connection:
        conn = sqlite3.connect(f"{target.as_uri()}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        # Evita que uma consulta exploratória monopolize o processo da API.
        conn.set_progress_handler(lambda: 1, 250000)
        return conn

    def find_project_databases(self, project_id: str) -> list[dict[str, Any]]:
        if not self.workspace_service:
            return []
        project_dir = self.workspace_service.get_project_dir(project_id).resolve()
        if not project_dir.exists():
            return []
        databases = []
        for pattern in ("*.db", "*.sqlite", "*.sqlite3"):
            for file_path in project_dir.rglob(pattern):
                try:
                    resolved = file_path.resolve()
                    resolved.relative_to(project_dir)
                    if not resolved.is_file():
                        continue
                    databases.append({
                        "name": file_path.name,
                        "relative_path": file_path.relative_to(project_dir).as_posix(),
                        "size_kb": round(resolved.stat().st_size / 1024, 1),
                    })
                except (OSError, ValueError):
                    # Symlinks que escapem da pasta do projeto são ignorados.
                    continue
        return sorted(databases, key=lambda item: item["relative_path"].lower())

    def inspect_database(self, db_path: str, project_id: str | None = None) -> dict[str, Any]:
        target = self._resolve_db_path(db_path, project_id)
        tables = []
        conn = self._connect_readonly(target)
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT name, sql FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
            )
            for table in cur.fetchall():
                table_name = table["name"]
                quoted = '"' + table_name.replace('"', '""') + '"'
                cur.execute(f"PRAGMA table_info({quoted})")
                columns = [{
                    "cid": col["cid"], "name": col["name"],
                    "type": col["type"] or "TEXT",
                    "notnull": bool(col["notnull"]), "pk": bool(col["pk"]),
                } for col in cur.fetchall()]
                cur.execute(f"SELECT COUNT(*) FROM {quoted}")
                row_count = cur.fetchone()[0]
                cur.execute(f"PRAGMA index_list({quoted})")
                indexes = [index["name"] for index in cur.fetchall()]
                tables.append({
                    "name": table_name, "row_count": row_count,
                    "columns": columns, "indexes": indexes,
                    "schema_sql": table["sql"] or "",
                })
        finally:
            conn.close()
        return {"database": target.name, "path": db_path, "tables_count": len(tables), "tables": tables}

    def execute_query(
        self, db_path: str, query: str, project_id: str | None = None, limit: int = 200
    ) -> dict[str, Any]:
        target = self._resolve_db_path(db_path, project_id)
        clean_query = query.strip()
        if not clean_query:
            raise ValueError("Informe uma consulta SQL.")
        safe_limit = max(1, min(int(limit), 1000))
        started = time.perf_counter()
        conn = self._connect_readonly(target)
        try:
            cursor = conn.cursor()
            cursor.execute(clean_query)
            has_rows = cursor.description is not None
            rows_raw = cursor.fetchmany(safe_limit) if has_rows else []
            columns = [column[0] for column in cursor.description] if has_rows else []
            rows = [dict(row) for row in rows_raw]
            return {
                "success": True,
                "is_select": has_rows,
                "columns": columns,
                "rows": rows,
                "row_count": len(rows),
                "affected_rows": 0,
                "duration_ms": round((time.perf_counter() - started) * 1000.0, 2),
                "read_only": True,
            }
        except Exception as exc:
            return {
                "success": False, "error": str(exc),
                "duration_ms": round((time.perf_counter() - started) * 1000.0, 2),
                "read_only": True,
            }
        finally:
            conn.close()

    def audit_query_performance(
        self, db_path: str, query: str, project_id: str | None = None
    ) -> dict[str, Any]:
        target = self._resolve_db_path(db_path, project_id)
        clean_query = query.strip()
        if not clean_query.upper().startswith(("SELECT", "WITH")):
            return {
                "status": "skipped",
                "message": "Auditoria de performance suporta consultas de leitura SELECT.",
                "suggestions": [],
            }
        plan_steps = []
        suggestions = []
        is_table_scan = False
        conn = self._connect_readonly(target)
        try:
            cursor = conn.cursor()
            cursor.execute(f"EXPLAIN QUERY PLAN {clean_query}")
            for row in cursor.fetchall():
                detail = row[3] if len(row) > 3 else str(row)
                plan_steps.append(detail)
                match = re.search(r"\\bSCAN\\s+(?:TABLE\\s+)?([a-zA-Z0-9_]+)", detail)
                if match:
                    is_table_scan = True
                    table_name = match.group(1)
                    suggestions.append({
                        "type": "MISSING_INDEX", "table": table_name,
                        "severity": "WARNING",
                        "recommendation": (
                            f"A consulta faz varredura completa na tabela '{table_name}'. "
                            "Avalie índices nas colunas usadas em WHERE/JOIN."
                        ),
                        "example_sql": f"CREATE INDEX idx_{table_name}_perf ON {table_name}(coluna_aqui);",
                    })
        except Exception as exc:
            return {"status": "error", "error": str(exc), "plan": [], "suggestions": []}
        finally:
            conn.close()
        score = 60 if is_table_scan else 95
        return {
            "status": "audited", "score": score,
            "verdict": (
                "Atenção: consulta com varredura completa. Avalie índices."
                if is_table_scan else
                "A consulta não apresentou varredura completa de tabela."
            ),
            "is_table_scan": is_table_scan,
            "plan_steps": plan_steps, "suggestions": suggestions,
        }
