from services.observability.telemetry_store import SqliteTelemetryStore


def test_telemetry_is_isolated_by_owner(tmp_path):
    store = SqliteTelemetryStore(tmp_path / "telemetry.db")
    store.record_inference(
        owner_user_id="user-a",
        task_id="task-a",
        agent_role="developer",
        model_name="model-a",
        provider="ollama_local",
        status="success",
        duration_ms=125.5,
        prompt_tokens=10,
        completion_tokens=20,
    )
    store.record_inference(
        owner_user_id="user-b",
        task_id="task-b",
        agent_role="auditor",
        model_name="model-b",
        provider="cloud",
        status="failed",
        duration_ms=50,
        error_type="TimeoutError",
    )

    assert len(store.list_for_owner("user-a")) == 1
    assert store.list_for_owner("user-a")[0]["task_id"] == "task-a"
    assert store.list_for_owner("user-b")[0]["task_id"] == "task-b"
    assert store.summary_for_owner("user-a") == {
        "total_inferences": 1,
        "successful": 1,
        "failed": 0,
        "total_tokens": 30,
        "total_cost_usd": 0.0,
        "average_latency_ms": 125.5,
    }


def test_telemetry_requires_owner_for_queries(tmp_path):
    store = SqliteTelemetryStore(tmp_path / "telemetry.db")

    try:
        store.list_for_owner("")
    except ValueError as exc:
        assert "owner_user_id" in str(exc)
    else:
        raise AssertionError("An owner must be required for telemetry queries")


def test_telemetry_does_not_store_prompt_or_response_fields(tmp_path):
    store = SqliteTelemetryStore(tmp_path / "telemetry.db")
    store.record_inference(
        owner_user_id="user-a",
        task_id="task-a",
        agent_role="developer",
        model_name="model-a",
        provider="ollama_local",
        status="success",
        duration_ms=10,
    )

    import sqlite3

    with sqlite3.connect(store.db_path) as conn:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(inference_telemetry)")}
    assert "prompt" not in columns
    assert "response" not in columns
    assert "api_key" not in columns


def test_model_performance_aggregates_per_owner_and_marks_minimum_samples(tmp_path):
    store = SqliteTelemetryStore(tmp_path / "telemetry.db")
    for _ in range(5):
        store.record_inference(
            owner_user_id="user-a",
            task_id="task-a",
            agent_role="developer",
            model_name="coder-model",
            provider="ollama_local",
            status="success",
            duration_ms=100,
            prompt_tokens=20,
            completion_tokens=30,
        )
    store.record_inference(
        owner_user_id="user-a",
        task_id="task-a",
        agent_role="developer",
        model_name="coder-model",
        provider="ollama_local",
        status="failed",
        duration_ms=50,
    )
    store.record_inference(
        owner_user_id="user-b",
        task_id="task-b",
        agent_role="developer",
        model_name="private-model",
        provider="cloud",
        status="success",
        duration_ms=1,
    )

    rows = store.performance_by_model_for_owner("user-a")
    assert len(rows) == 1
    assert rows[0]["model_name"] == "coder-model"
    assert rows[0]["total_inferences"] == 6
    assert rows[0]["successful"] == 5
    assert rows[0]["failed"] == 1
    assert rows[0]["success_rate"] == round(5 / 6, 4)
    assert rows[0]["sample_sufficient"] is True
    assert rows[0]["routing_eligible"] is False


def test_model_performance_requires_minimum_samples_and_owner(tmp_path):
    store = SqliteTelemetryStore(tmp_path / "telemetry.db")
    store.record_inference(
        owner_user_id="user-a",
        task_id="task-a",
        agent_role="auditor",
        model_name="new-model",
        provider="local",
        status="success",
        duration_ms=20,
    )

    row = store.performance_by_model_for_owner("user-a")[0]
    assert row["sample_sufficient"] is False
    assert row["routing_eligible"] is False

    try:
        store.performance_by_model_for_owner("")
    except ValueError as exc:
        assert "owner_user_id" in str(exc)
    else:
        raise AssertionError("An owner must be required for performance queries")


def test_model_selection_history_is_private_to_owner(tmp_path):
    store = SqliteTelemetryStore(tmp_path / "telemetry.db")
    store.record_model_selection(
        owner_user_id="user-a",
        task_id="task-a",
        agent_role="developer",
        task_capability="code",
        selected_model="coder-a",
        selected_provider="ollama_local",
        selection_reason="local-first",
        candidate_count=2,
    )
    store.record_model_selection(
        owner_user_id="user-b",
        task_id="task-b",
        agent_role="auditor",
        task_capability="reasoning",
        selected_model="cloud-b",
        selected_provider="online_gateway (openai)",
        selection_reason="approved",
        candidate_count=3,
    )

    rows = store.list_model_selections_for_owner("user-a")
    assert len(rows) == 1
    assert rows[0]["selected_model"] == "coder-a"
    assert rows[0]["task_capability"] == "code"
    assert store.list_model_selections_for_owner("user-b")[0]["selected_model"] == "cloud-b"

    try:
        store.list_model_selections_for_owner("")
    except ValueError as exc:
        assert "owner_user_id" in str(exc)
    else:
        raise AssertionError("An owner must be required for selection history")


def test_telemetry_persists_and_aggregates_actual_cost_per_owner(tmp_path):
    store = SqliteTelemetryStore(tmp_path / "telemetry.db")
    store.record_inference(
        owner_user_id="user-cost",
        task_id="task-cost",
        agent_role="research_analyst",
        model_name="cloud-model",
        provider="online_gateway (openai)",
        status="success",
        duration_ms=250,
        prompt_tokens=1000,
        completion_tokens=500,
        cost_usd=0.0012,
    )
    assert store.list_for_owner("user-cost")[0]["cost_usd"] == 0.0012
    assert store.summary_for_owner("user-cost")["total_cost_usd"] == 0.0012
    performance = store.performance_by_model_for_owner("user-cost")[0]
    assert performance["total_cost_usd"] == 0.0012
