"""PostgreSQL end-to-end authentication and account-isolation checks.

Runs the real FastAPI application in a subprocess configured with a disposable
PostgreSQL database. The password hashing, identity repository, session store and
learning-progress store therefore exercise the PostgreSQL runtime, not SQLite.
"""

from __future__ import annotations

import os
import subprocess
import sys

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

TEST_URL = os.environ.get("JARVIS_TEST_POSTGRES_URL", "")

pytestmark = pytest.mark.skipif(
    not TEST_URL,
    reason="Defina JARVIS_TEST_POSTGRES_URL para testar autenticação PostgreSQL.",
)


def _reset_and_upgrade(database_url: str) -> None:
    if not (database_url.rsplit("/", 1)[-1].split("?", 1)[0]).endswith("_test"):
        pytest.skip("A base de dados de teste PostgreSQL deve terminar em '_test'.")
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
            connection.execute(text("CREATE SCHEMA public"))
    finally:
        engine.dispose()
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "head")


def test_postgres_password_auth_sessions_and_account_isolation(tmp_path):
    _reset_and_upgrade(TEST_URL)
    pytest.importorskip("psycopg")

    script = r"""
import os
from fastapi.testclient import TestClient

from apps.api.deps import db_manager
from apps.api.main import app

assert db_manager.is_postgresql is True
admin_token = os.environ["JARVIS_ADMIN_TOKEN"]
admin = TestClient(app)
admin.headers.update({"Authorization": f"Bearer {admin_token}"})

password = "correct horse battery staple"
for username in ("alice_pg", "bob_pg"):
    response = admin.post(
        "/api/v1/auth/users",
        json={
            "username": username,
            "display_name": username.replace("_", " ").title(),
            "password": password,
            "role": "developer",
        },
    )
    assert response.status_code == 201, response.text

with db_manager._get_connection() as connection:
    row = connection.execute(
        "SELECT password_hash FROM human_users WHERE username = ?", ("alice_pg",)
    ).fetchone()
assert row is not None
assert row["password_hash"].startswith("pbkdf2_sha256$310000$"), row["password_hash"]

def login(username):
    client = TestClient(app)
    response = client.post(
        "/api/v1/auth/password-login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200, response.text
    assert response.json()["user_id"] == username
    return client

alice = login("alice_pg")
bob = login("bob_pg")

me = alice.get("/api/v1/auth/me")
assert me.status_code == 200, me.text
assert me.json()["user_id"] == "alice_pg"

alice_progress = alice.put(
    "/api/v1/learning/progress", json={"completed_ids": ["alice-only"]}
)
assert alice_progress.status_code == 200, alice_progress.text
assert "alice-only" in alice.get("/api/v1/learning/progress").json()["completed_ids"]

bob_progress = bob.get("/api/v1/learning/progress")
assert bob_progress.status_code == 200, bob_progress.text
assert "alice-only" not in bob_progress.json()["completed_ids"]

sessions = admin.get("/api/v1/auth/sessions")
assert sessions.status_code == 200, sessions.text
assert {"alice_pg", "bob_pg"} <= {s["user_id"] for s in sessions.json()["sessions"]}

bad = TestClient(app).post(
    "/api/v1/auth/password-login",
    json={"username": "alice_pg", "password": "wrong-password"},
)
assert bad.status_code == 401

logout = alice.post("/api/v1/auth/logout")
assert logout.status_code == 200, logout.text
assert alice.get("/api/v1/auth/me").status_code == 401

print("ALL_PG_AUTH_ISOLATION_CHECKS_PASSED")
"""

    env = os.environ.copy()
    env["JARVIS_DATABASE_BACKEND"] = "postgresql"
    env["JARVIS_DATABASE_URL"] = TEST_URL
    env["DATABASE_URL"] = TEST_URL
    env["JARVIS_ADMIN_TOKEN"] = "test_admin_token_pg_auth"
    env["JARVIS_DATA_DIR"] = str(tmp_path / "data")
    env["JARVIS_ISSUE_BOOTSTRAP"] = "0"
    env["JARVIS_OLLAMA_WARMUP"] = "0"
    env.pop("PYTEST_CURRENT_TEST", None)

    process = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        text=True,
        env=env,
        timeout=60,
    )
    assert process.returncode == 0, f"STDOUT: {process.stdout}\nSTDERR: {process.stderr}"
    assert "ALL_PG_AUTH_ISOLATION_CHECKS_PASSED" in process.stdout
