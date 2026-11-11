"""
JARVIS AI HUB - Backend Studio: Mock Server Nativo.

Mocks são privados por conta. Registros legados sem owner_user_id permanecem
preservados, mas não são publicados para nenhuma conta automaticamente.
"""
import json
import logging
import uuid
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
                """
            )
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(mock_endpoints)")}
            if "owner_user_id" not in columns:
                conn.execute("ALTER TABLE mock_endpoints ADD COLUMN owner_user_id TEXT")
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_mock_owner_method_path "
                "ON mock_endpoints(owner_user_id, method, path)"
            )

    @staticmethod
    def _serialize(row: Any) -> dict[str, Any]:
        data = dict(row)
        data.pop("owner_user_id", None)
        data["enabled"] = bool(data["enabled"])
        try:
            data["response_body"] = json.loads(data["response_body"])
        except (TypeError, ValueError):
            pass
        try:
            data["headers"] = json.loads(data.pop("headers_json", "{}"))
        except (TypeError, ValueError):
            data["headers"] = {}
        return data

    def list_endpoints(self, owner_user_id: str) -> list[dict[str, Any]]:
        if not self.db or not owner_user_id:
            return []
        with self.db._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM mock_endpoints WHERE owner_user_id = ? ORDER BY path ASC, method ASC",
                (owner_user_id,),
            ).fetchall()
            return [self._serialize(row) for row in rows]

    def get_endpoint(self, endpoint_id: str, owner_user_id: str) -> dict[str, Any] | None:
        if not self.db or not owner_user_id:
            return None
        with self.db._get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM mock_endpoints WHERE id = ? AND owner_user_id = ?",
                (endpoint_id, owner_user_id),
            ).fetchone()
            return self._serialize(row) if row else None

    def create_or_update_endpoint(
        self, endpoint_data: dict[str, Any], owner_user_id: str
    ) -> dict[str, Any]:
        if not self.db or not owner_user_id:
            raise ValueError("Conta proprietária obrigatória para criar mocks.")
        now = datetime.now(UTC).isoformat()
        ep_id = endpoint_data.get("id") or f"mock_{uuid.uuid4().hex}"
        with self.db._get_connection() as conn:
            collision = conn.execute(
                "SELECT owner_user_id FROM mock_endpoints WHERE id = ?", (ep_id,)
            ).fetchone()
            if collision and collision["owner_user_id"] != owner_user_id:
                raise PermissionError("O endpoint informado não pertence à conta autenticada.")

            name = endpoint_data.get("name") or "Endpoint Simulado"
            method = str(endpoint_data.get("method", "GET")).upper().strip()
            path = str(endpoint_data.get("path", "/api/items")).strip()
            if not path.startswith("/"):
                path = "/" + path
            status_code = int(endpoint_data.get("status_code", 200))
            if status_code < 100 or status_code > 599:
                raise ValueError("Código HTTP inválido.")
            response_body = endpoint_data.get("response_body", {})
            body_json = response_body if isinstance(response_body, str) else json.dumps(response_body, ensure_ascii=False)
            headers_json = json.dumps(endpoint_data.get("headers", {"Content-Type": "application/json"}))
            latency_ms = max(0, min(10000, int(endpoint_data.get("latency_ms", 0))))
            enabled = 1 if endpoint_data.get("enabled", True) else 0
            conn.execute(
                """
                INSERT INTO mock_endpoints (
                    id, owner_user_id, name, method, path, status_code, response_body,
                    headers_json, latency_ms, enabled, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                WHERE mock_endpoints.owner_user_id = excluded.owner_user_id
                """,
                (ep_id, owner_user_id, name, method, path, status_code, body_json,
                 headers_json, latency_ms, enabled, now, now),
            )
        return self.get_endpoint(ep_id, owner_user_id) or {}

    def delete_endpoint(self, endpoint_id: str, owner_user_id: str) -> bool:
        if not self.db or not owner_user_id:
            return False
        with self.db._get_connection() as conn:
            cursor = conn.execute(
                "DELETE FROM mock_endpoints WHERE id = ? AND owner_user_id = ?",
                (endpoint_id, owner_user_id),
            )
            return cursor.rowcount > 0

    def match_and_serve(
        self, method: str, path: str, owner_user_id: str
    ) -> dict[str, Any] | None:
        if not self.db or not owner_user_id:
            return None
        normalized_method = method.upper().strip()
        normalized_path = path.strip()
        if not normalized_path.startswith("/"):
            normalized_path = "/" + normalized_path
        with self.db._get_connection() as conn:
            row = conn.execute(
                """
                SELECT status_code, response_body, headers_json, latency_ms
                FROM mock_endpoints
                WHERE owner_user_id = ? AND method = ? AND path = ? AND enabled = 1
                """,
                (owner_user_id, normalized_method, normalized_path),
            ).fetchone()
            if not row:
                return None
            try:
                body = json.loads(row["response_body"])
            except (TypeError, ValueError):
                body = row["response_body"]
            try:
                headers = json.loads(row["headers_json"])
            except (TypeError, ValueError):
                headers = {}
            return {
                "status_code": row["status_code"],
                "body": body,
                "headers": headers,
                "latency_ms": row["latency_ms"],
            }
