from services.memory import DatabaseManager


def _save_task(db, task_id: str, session_id: str, owner: str, prompt: str):
    db.save_task(
        task_id=task_id,
        session_id=session_id,
        prompt=prompt,
        state_dict={"final_summary": prompt},
        owner_user_id=owner,
    )


def test_task_queries_search_and_delete_are_scoped_to_owner(tmp_path):
    db = DatabaseManager(db_path=str(tmp_path / "accounts.db"))
    _save_task(db, "task-a", "shared-session", "account-a", "private alpha")
    _save_task(db, "task-b", "shared-session", "account-b", "private beta")

    assert [row["id"] for row in db.list_tasks(owner_user_id="account-a")] == ["task-a"]
    assert db.get_task("task-b", owner_user_id="account-a") is None
    assert [row["id"] for row in db.search_chat_history(
        "private", owner_user_id="account-a"
    )] == ["task-a"]
    assert [row["session_id"] for row in db.list_chat_sessions(
        owner_user_id="account-b"
    )] == ["shared-session"]

    assert db.delete_task("task-b", owner_user_id="account-a") is False
    assert db.get_task("task-b", owner_user_id="account-b") is not None


def test_chat_messages_and_session_deletion_are_scoped_to_owner(tmp_path):
    db = DatabaseManager(db_path=str(tmp_path / "messages.db"))
    db.add_chat_message("same-session", "user", "A secret", owner_user_id="account-a")
    db.add_chat_message("same-session", "user", "B secret", owner_user_id="account-b")

    assert [row["content"] for row in db.list_chat_messages(
        "same-session", owner_user_id="account-a"
    )] == ["A secret"]
    assert [row["content"] for row in db.list_chat_messages(
        "same-session", owner_user_id="account-b"
    )] == ["B secret"]

    db.delete_session("same-session", owner_user_id="account-a")
    assert db.list_chat_messages("same-session", owner_user_id="account-a") == []
    assert [row["content"] for row in db.list_chat_messages(
        "same-session", owner_user_id="account-b"
    )] == ["B secret"]


def test_project_and_task_writes_reject_cross_account_ownership(tmp_path):
    db = DatabaseManager(db_path=str(tmp_path / "projects.db"))
    db.register_project(
        "project-a", "Project A", str(tmp_path), owner_user_id="account-a"
    )

    try:
        db.register_project(
            "project-a", "Hijack", str(tmp_path), owner_user_id="account-b"
        )
    except PermissionError:
        pass
    else:
        raise AssertionError("Another account must not take ownership of a project")

    try:
        db.save_task(
            task_id="task-b",
            session_id="session-b",
            prompt="Cross-account project",
            state_dict={},
            project_id="project-a",
            owner_user_id="account-b",
        )
    except PermissionError:
        pass
    else:
        raise AssertionError("Another account must not attach tasks to this project")


def test_approval_queries_and_consumption_are_scoped_to_owner(tmp_path):
    db = DatabaseManager(db_path=str(tmp_path / "approvals.db"))
    db.save_approval(
        id="approval-a",
        task_id="task-a",
        agent_role="jarvis_master",
        operation="file_write",
        impact_summary="Account A change",
        owner_user_id="account-a",
    )
    db.save_approval(
        id="approval-b",
        task_id="task-b",
        agent_role="jarvis_master",
        operation="file_write",
        impact_summary="Account B change",
        owner_user_id="account-b",
    )

    assert db.get_approval("approval-b", owner_user_id="account-a") is None
    assert [row["id"] for row in db.list_approvals(
        owner_user_id="account-a"
    )] == ["approval-a"]

    with db._get_connection() as conn:
        conn.execute(
            "UPDATE approvals SET status = 'approved' WHERE id IN (?, ?)",
            ("approval-a", "approval-b"),
        )

    assert db.consume_approved_approval(
        "approval-b", owner_user_id="account-a"
    ) is False
    assert db.consume_approved_approval(
        "approval-a", owner_user_id="account-a"
    ) is True


def test_knowledge_vault_is_private_per_account_even_for_same_filename(tmp_path):
    db = DatabaseManager(db_path=str(tmp_path / "knowledge.db"))
    db.insert_knowledge_chunks(
        doc_name="manual.pdf", file_type="PDF", category="private",
        chunks=["alpha private document"], owner_user_id="account-a",
    )
    db.insert_knowledge_chunks(
        doc_name="manual.pdf", file_type="PDF", category="private",
        chunks=["beta private document"], owner_user_id="account-b",
    )

    assert [row["content"] for row in db.search_knowledge_vault(
        "private", owner_user_id="account-a"
    )] == ["alpha private document"]
    assert [row["content"] for row in db.search_knowledge_vault(
        "private", owner_user_id="account-b"
    )] == ["beta private document"]
    assert [row["doc_name"] for row in db.list_knowledge_documents(
        owner_user_id="account-a"
    )] == ["manual.pdf"]

    assert db.delete_knowledge_document(
        "manual.pdf", owner_user_id="account-a"
    ) is True
    assert db.delete_knowledge_document(
        "manual.pdf", owner_user_id="account-a"
    ) is False
    assert db.search_knowledge_vault(
        "private", owner_user_id="account-b"
    )[0]["content"] == "beta private document"


def test_project_memory_and_project_listing_are_owner_scoped(tmp_path):
    db = DatabaseManager(db_path=str(tmp_path / "project-memory.db"))
    db.register_project(
        "project-a", "Project A", str(tmp_path / "a"),
        owner_user_id="account-a",
    )
    db.register_project(
        "project-b", "Project B", str(tmp_path / "b"),
        owner_user_id="account-b",
    )
    db.set_project_memory(
        "project-a", "decision", "database", "SQLite",
        owner_user_id="account-a",
    )

    assert db.get_project("project-a", owner_user_id="account-b") is None
    assert [p["id"] for p in db.list_projects(owner_user_id="account-a")] == ["project-a"]
    assert db.list_project_memory(
        "project-a", owner_user_id="account-b"
    ) == []
    assert db.list_project_memory(
        "project-a", owner_user_id="account-a"
    )[0]["content"] == "SQLite"
