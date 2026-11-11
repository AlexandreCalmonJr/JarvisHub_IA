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
