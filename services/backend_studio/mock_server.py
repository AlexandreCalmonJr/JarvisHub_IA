"""
JARVIS AI HUB - Backend Studio: Mock Server Nativo
Permite criar endpoints simulados (GET, POST, PUT, DELETE, PATCH) com payloads JSON realistas
para testar interfaces frontend antes da conclusão do backend.
Opera 100% local e blindado em 127.0.0.1.
"""

import json
import logging
import time
from typing import Any
from datetime import datetime, UTC

logger = logging.getLogger("jarvis.mock_server")


class MockServerService:
    def __init__(self, db_manager: Any):
        self.db = db_manager
        self._ensure_storage()

    def _ensure_storage(self) -> None:
        if not self.db:
            return
        with self.db._get_connection() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS mock_endpoints (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    method TEXT NOT NULL DEFAULT 'GET',
                    path TEXT NOT NULL,
                    status_code INTEGER NOT NULL DEFAULT 200,
                    response_body TEXT NOT NULL,
                    headers_json TEXT NOT NULL DEFAULT '{}',
                    latency_ms INTEGER NOT NULL DEFAULT 0,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TIMESTAMP NOT NULL,
                    updated_at TIMESTAMP NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_mock_method_path ON mock_endpoints(method, path);
                """
            )

    def list_endpoints(self) -> list[dict[str, Any]]:
        """Lista todos os endpoints simulados cadastrados."""
        if not self.db:
            return []
        with self.db._get_connection() as conn:
            cur = conn.execute("SELECT * FROM mock_endpoints ORDER BY path ASC, method ASC")
            rows = []
            for r in cur.fetchall():
                d = dict(r)
                d["enabled"] = bool(d["enabled"])
                try:
                    d["response_body"] = json.loads(d["response_body"])
                except Exception:
                    pass
                try:
                    d["headers"] = json.loads(d["headers_json"])
                except Exception:
                    d["headers"] = {}
                rows.append(d)
            return rows

    def get_endpoint(self, endpoint_id: str) -> dict[str, Any] | None:
        if not self.db:
            return None
        with self.db._get_connection() as conn:
            cur = conn.execute("SELECT * FROM mock_endpoints WHERE id = ?", (endpoint_id,))
            r = cur.fetchone()
            if not r:
                return None
            d = dict(r)
            d["enabled"] = bool(d["enabled"])
            try:
                d["response_body"] = json.loads(d["response_body"])
            except Exception:
                pass
            return d

    def create_or_update_endpoint(self, endpoint_data: dict[str, Any]) -> dict[str, Any]:
        """Cria ou atualiza um mock endpoint."""
        now = datetime.now(UTC).isoformat()
        ep_id = endpoint_data.get("id") or f"mock_{int(time.time() * 1000)}"
        name = endpoint_data.get("name") or "Endpoint Simulado"
        method = endpoint_data.get("method", "GET").upper().strip()
        path = endpoint_data.get("path", "/api/items").strip()
        if not path.startswith("/"):
            path = "/" + path

        status_code = int(endpoint_data.get("status_code", 200))
        resp_body = endpoint_data.get("response_body", {})
        if not isinstance(resp_body, str):
            resp_body_str = json.dumps(resp_body, ensure_ascii=False)
        else:
            resp_body_str = resp_body

        headers = endpoint_data.get("headers", {"Content-Type": "application/json"})
        headers_str = json.dumps(headers)
        latency_ms = max(0, min(10000, int(endpoint_data.get("latency_ms", 0))))
        enabled = 1 if endpoint_data.get("enabled", True) else 0

        with self.db._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO mock_endpoints (
                    id, name, method, path, status_code, response_body, headers_json, latency_ms, enabled, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    method = excluded.method,
                    path = excluded.path,
                    status_code = excluded.status_code,
                    response_body = excluded.response_body,
                    headers_json = excluded.headers_json,
                    latency_ms = excluded.latency_ms,
                    enabled = excluded.enabled,
                    updated_at = excluded.updated_at
                """,
                (ep_id, name, method, path, status_code, resp_body_str, headers_str, latency_ms, enabled, now, now),
            )

        return self.get_endpoint(ep_id) or {}

    def delete_endpoint(self, endpoint_id: str) -> bool:
        if not self.db:
            return False
        with self.db._get_connection() as conn:
            cur = conn.execute("DELETE FROM mock_endpoints WHERE id = ?", (endpoint_id,))
            return cur.rowcount > 0

    def match_and_serve(self, method: str, path: str) -> dict[str, Any] | None:
        """Encontra e retorna o payload do endpoint simulado."""
        if not self.db:
            return None
        norm_method = method.upper().strip()
        norm_path = path.strip()
        if not norm_path.startswith("/"):
            norm_path = "/" + norm_path

        with self.db._get_connection() as conn:
            cur = conn.execute(
                "SELECT * FROM mock_endpoints WHERE method = ? AND path = ? AND enabled = 1",
                (norm_method, norm_path),
            )
            r = cur.fetchone()
            if not r:
                return None
            d = dict(r)
            try:
                body = json.loads(d["response_body"])
            except Exception:
                body = d["response_body"]
            try:
                headers = json.loads(d["headers_json"])
            except Exception:
                headers = {}
            return {
                "status_code": d["status_code"],
                "body": body,
                "headers": headers,
                "latency_ms": d["latency_ms"],
            }
