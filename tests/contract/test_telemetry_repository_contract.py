"""Telemetry repository contract tests comparing SQLite and SQLAlchemy adapters."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from services.database.models.base import Base
from services.database.models.telemetry import (
    InferenceQualityFeedback,
    InferenceTelemetry,
    ModelSelectionDecision,
)
from services.database.repositories.telemetry import (
    SqlAlchemyTelemetryRepository,
    SqliteTelemetryRepository,
)


@pytest.fixture(params=["sqlite", "sqlalchemy"])
def telemetry_repository(request, tmp_path):
    if request.param == "sqlite":
        yield SqliteTelemetryRepository(tmp_path / "telemetry.sqlite")
        return

    engine = create_engine(f"sqlite:///{tmp_path / 'telemetry-sa.db'}")
    Base.metadata.create_all(
        engine,
        tables=[
            InferenceTelemetry.__table__,
            ModelSelectionDecision.__table__,
            InferenceQualityFeedback.__table__,
        ],
    )
    session_factory = sessionmaker(engine, expire_on_commit=False)
    repo = SqlAlchemyTelemetryRepository(session_factory)
    yield repo
    engine.dispose()


def test_telemetry_repository_round_trip_and_owner_isolation(telemetry_repository):
    id_a = telemetry_repository.record_inference(
        owner_user_id="user-a",
        task_id="task-1",
        agent_role="architect",
        model_name="qwen2.5:7b",
        provider="ollama",
        status="success",
        duration_ms=250.0,
        prompt_tokens=100,
        completion_tokens=50,
        cost_usd=0.001,
    )
    assert id_a

    id_b = telemetry_repository.record_inference(
        owner_user_id="user-b",
        task_id="task-2",
        agent_role="coder",
        model_name="qwen2.5-coder:7b",
        provider="ollama",
        status="failed",
        duration_ms=100.0,
        error_type="TimeoutError",
    )
    assert id_b

    list_a = telemetry_repository.list_for_owner("user-a")
    assert len(list_a) == 1
    assert list_a[0]["id"] == id_a
    assert list_a[0]["model_name"] == "qwen2.5:7b"
    assert list_a[0]["cost_usd"] == 0.001
    assert list_a[0]["feedback_rating"] is None

    list_b = telemetry_repository.list_for_owner("user-b")
    assert len(list_b) == 1
    assert list_b[0]["id"] == id_b
    assert list_b[0]["status"] == "failed"

    summary_a = telemetry_repository.summary_for_owner("user-a")
    assert summary_a["total_inferences"] == 1
    assert summary_a["successful"] == 1
    assert summary_a["failed"] == 0
    assert summary_a["total_tokens"] == 150

    perf_a = telemetry_repository.performance_by_model_for_owner("user-a", minimum_samples=1)
    assert len(perf_a) == 1
    assert perf_a[0]["model_name"] == "qwen2.5:7b"
    assert perf_a[0]["success_rate"] == 1.0

    # Model selection
    sel_id = telemetry_repository.record_model_selection(
        owner_user_id="user-a",
        task_id="task-1",
        agent_role="architect",
        task_capability="reasoning",
        selected_model="qwen2.5:7b",
        selected_provider="ollama",
        selection_reason="best quality",
        candidate_count=3,
        estimated_cost_usd=0.001,
    )
    assert sel_id
    selections = telemetry_repository.list_model_selections_for_owner("user-a")
    assert len(selections) == 1
    assert selections[0]["id"] == sel_id
    assert selections[0]["selected_model"] == "qwen2.5:7b"

    # Quality feedback
    assert (
        telemetry_repository.record_quality_feedback(
            owner_user_id="user-a", inference_id=id_a, rating=5
        )
        is True
    )
    # Can't rate other user's inference
    assert (
        telemetry_repository.record_quality_feedback(
            owner_user_id="user-a", inference_id=id_b, rating=4
        )
        is False
    )

    feedback_summary = telemetry_repository.quality_by_model_for_owner(
        "user-a", minimum_feedback=1
    )
    assert len(feedback_summary) == 1
    assert feedback_summary[0]["average_rating"] == 5.0

    # Ensure updated list_for_owner includes feedback rating
    updated_a = telemetry_repository.list_for_owner("user-a")
    assert updated_a[0]["feedback_rating"] == 5
