from services.autonomous_agent.teammate_manager import TeammateManager


def test_teammate_manager_lifecycle():
    manager = TeammateManager()

    # 1. Spawn
    t1 = manager.spawn_teammate(name="Code Reviewer Bot", role="code_reviewer", project_id="proj-1")
    assert t1.id.startswith("teammate-")
    assert t1.name == "Code Reviewer Bot"
    assert t1.status == "idle"
    assert len(t1.log_entries) >= 1

    # 2. List
    teammates = manager.list_teammates()
    assert len(teammates) == 1
    assert teammates[0].id == t1.id

    # Filter by project
    assert len(manager.list_teammates(project_id="proj-1")) == 1
    assert len(manager.list_teammates(project_id="other-proj")) == 0

    # 3. Dispatch task
    dispatch = manager.dispatch_task(t1.id, "Revisar PR #42 de autenticação")
    assert dispatch["status"] == "completed"
    assert "Revisar PR #42" in dispatch["task"]
    assert t1.status == "completed"

    # 4. Terminate
    terminated = manager.terminate_teammate(t1.id)
    assert terminated is True
    assert manager.get_teammate(t1.id) is None
    assert len(manager.list_teammates()) == 0
