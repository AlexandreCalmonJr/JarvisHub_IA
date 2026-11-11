from services.memory import DatabaseManager


PRIVATE_TABLES = (
    "projects",
    "tasks",
    "chat_messages",
    "approvals",
    "project_memory",
    "agent_memories",
    "user_skills",
    "knowledge_vault",
)


def test_account_ownership_migration_adds_nullable_owner_columns(tmp_path):
    db = DatabaseManager(db_path=str(tmp_path / "ownership.db"))

    with db._get_connection() as conn:
        for table in PRIVATE_TABLES:
            columns = {
                row["name"]
                for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
            }
            assert "owner_user_id" in columns

            indexes = {
                row["name"]
                for row in conn.execute(f"PRAGMA index_list({table})").fetchall()
            }
            assert f"idx_{table}_owner_user" in indexes

        migration = conn.execute(
            "SELECT version, name FROM schema_migrations WHERE version = 1"
        ).fetchone()
        assert migration is not None
        assert migration["name"] == "account_ownership_columns"


def test_existing_records_are_not_assigned_to_an_arbitrary_account(tmp_path):
    db = DatabaseManager(db_path=str(tmp_path / "legacy.db"))
    db.register_project("legacy-project", "Legacy project", str(tmp_path))
    db.save_task(
        task_id="legacy-task",
        session_id="legacy-session",
        prompt="Legacy task",
        state_dict={"status": "completed"},
        project_id="legacy-project",
    )

    with db._get_connection() as conn:
        project = conn.execute(
            "SELECT owner_user_id FROM projects WHERE id = ?",
            ("legacy-project",),
        ).fetchone()
        task = conn.execute(
            "SELECT owner_user_id FROM tasks WHERE id = ?",
            ("legacy-task",),
        ).fetchone()

    assert project["owner_user_id"] is None
    assert task["owner_user_id"] is None


def test_account_ownership_migration_is_idempotent_after_restart(tmp_path):
    db_path = str(tmp_path / "restart.db")
    DatabaseManager(db_path=db_path)
    restarted = DatabaseManager(db_path=db_path)

    with restarted._get_connection() as conn:
        versions = conn.execute(
            "SELECT version FROM schema_migrations ORDER BY version"
        ).fetchall()

    assert [row["version"] for row in versions] == [1, 2]


def test_agent_memory_keys_are_independent_between_accounts(tmp_path):
    db = DatabaseManager(db_path=str(tmp_path / "agent-memory.db"))
    db.set_agent_memory(
        "jarvis_master", "preference", "tone", "Account A tone",
        owner_user_id="account-a",
    )
    db.set_agent_memory(
        "jarvis_master", "preference", "tone", "Account B tone",
        owner_user_id="account-b",
    )

    a_memories = db.list_agent_memories(
        agent_role="jarvis_master", owner_user_id="account-a"
    )
    b_memories = db.list_agent_memories(
        agent_role="jarvis_master", owner_user_id="account-b"
    )
    assert [item["content"] for item in a_memories] == ["Account A tone"]
    assert [item["content"] for item in b_memories] == ["Account B tone"]

    memory_a_id = a_memories[0]["id"]
    assert db.delete_agent_memory(memory_a_id, owner_user_id="account-b") is False
    assert db.delete_agent_memory(memory_a_id, owner_user_id="account-a") is True
    assert db.list_agent_memories(owner_user_id="account-a") == []
    assert len(db.list_agent_memories(owner_user_id="account-b")) == 1
