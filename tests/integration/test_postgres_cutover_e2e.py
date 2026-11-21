"""End-to-end integration and cutover verification for PostgreSQL runtime."""

from __future__ import annotations

import os
import subprocess
import sys

import pytest

from services.database.config import DatabaseSettings
from services.database.engine import DatabaseUnavailableError
from services.database.session import DatabaseRuntime

TEST_PG_URL = os.environ.get("JARVIS_TEST_POSTGRES_URL", "")

pytestmark = pytest.mark.skipif(
    not TEST_PG_URL,
    reason="Defina JARVIS_TEST_POSTGRES_URL para o teste de cutover PostgreSQL.",
)


def test_postgres_runtime_wiring_and_endpoints_in_subprocess(tmp_path):
    """Verify in a clean process that when PostgreSQL is configured, API and services wire to PostgreSQL."""
    script = """
import os
from fastapi.testclient import TestClient

from apps.api.deps import db_manager, telemetry_store
from apps.api.auth import auth_service
from apps.api.main import app

assert db_manager.is_postgresql is True, "db_manager must be PostgreSQL"
assert telemetry_store.__class__.__name__ == "SqlAlchemyTelemetryRepository"
assert auth_service.rate_limit_repository.__class__.__name__ == "SqlAlchemyAuthRateLimitRepository"
assert auth_service.user_store._repository.__class__.__name__ == "SqlAlchemyIdentityRepository"

token = os.environ.get("JARVIS_ADMIN_TOKEN", "test_admin_token_e2e_cutover")
client = TestClient(app)
headers = {"Authorization": f"Bearer {token}"}

res = client.get("/api")
assert res.status_code == 200
assert res.json()["status"] == "operational"

res_health = client.get("/api/v1/system/health")
assert res_health.status_code == 200
assert res_health.json()["status"] == "healthy"

res_telem = client.get("/api/v1/system/inference-telemetry", headers=headers)
assert res_telem.status_code == 200, f"telemetry status: {res_telem.status_code} {res_telem.text}"
data = res_telem.json()
assert "summary" in data
assert data["summary"]["total_inferences"] >= 0

res_put = client.put(
    "/api/v1/learning/progress",
    json={"completed_ids": ["pg_cutover_e2e"]},
    headers=headers,
)
assert res_put.status_code == 200, f"put learning status: {res_put.status_code} {res_put.text}"

res_get = client.get("/api/v1/learning/progress", headers=headers)
assert res_get.status_code == 200
assert "pg_cutover_e2e" in res_get.json()["completed_ids"]
print("ALL_PG_E2E_CHECKS_PASSED")
"""
    env = os.environ.copy()
    env["JARVIS_DATABASE_BACKEND"] = "postgresql"
    env["DATABASE_URL"] = TEST_PG_URL
    env["JARVIS_DATABASE_URL"] = TEST_PG_URL
    env["JARVIS_TEST_POSTGRES_URL"] = TEST_PG_URL
    env["JARVIS_ADMIN_TOKEN"] = "test_admin_token_e2e_cutover"
    env["JARVIS_DATA_DIR"] = str(tmp_path / "data")
    env["JARVIS_ISSUE_BOOTSTRAP"] = "0"
    env.pop("PYTEST_CURRENT_TEST", None)

    proc = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        text=True,
        env=env,
        timeout=30,
    )
    assert proc.returncode == 0, f"STDOUT: {proc.stdout}\nSTDERR: {proc.stderr}"
    assert "ALL_PG_E2E_CHECKS_PASSED" in proc.stdout


def test_postgres_fail_closed_on_invalid_url():
    """Verify fail-closed behavior: invalid PostgreSQL configuration refuses startup."""
    settings = DatabaseSettings.from_env(
        {
            "JARVIS_DATABASE_BACKEND": "postgresql",
            "DATABASE_URL": "postgresql+psycopg://baduser:badpass@127.0.0.1:5432/nonexistent",
        }
    )
    assert settings.is_postgresql is True

    with pytest.raises((DatabaseUnavailableError, Exception)):
        DatabaseRuntime.create(settings, verify=True)
