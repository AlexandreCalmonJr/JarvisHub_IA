import json

from services.data_pipeline import (
    BIReportGenerator,
    DataPipelineRunner,
    QualityRule,
    ScheduledAutomationEngine,
)


def test_data_pipeline_csv_and_quality(tmp_path):
    # 1. Setup sample CSV with duplicates and nulls
    csv_file = tmp_path / "sales.csv"
    csv_file.write_text(
        "id,product,amount,quantity\n"
        "1,Widget A,100.5,2\n"
        "2,Widget B,,5\n"
        "1,Widget A,100.5,2\n"  # Duplicate
        "3,Widget C,250.0,1\n",
        encoding="utf-8",
    )

    runner = DataPipelineRunner()
    raw = runner.load_csv(csv_file)
    assert len(raw) == 4

    rules = [
        QualityRule(column="amount", expected_type="float", allow_null=False, min_value=1.0),
        QualityRule(column="quantity", expected_type="int", allow_null=False, min_value=1.0),
    ]

    cleaned, report = runner.process_and_clean(
        raw,
        rules=rules,
        drop_duplicates=True,
        fill_nulls={"amount": 50.0},
    )

    # Duplicates dropped
    assert len(cleaned) == 3
    # Null filled
    assert all(r["amount"] is not None for r in cleaned)
    assert report.is_valid is True
    assert "amount" in report.summary_stats
    assert report.summary_stats["amount"]["min"] == 50.0


def test_data_pipeline_json_and_bi_report(tmp_path):
    json_file = tmp_path / "metrics.json"
    data = [
        {"user": "alice", "score": 95, "token": "sk-secret123"},
        {"user": "bob", "score": 88, "token": "secret_pwd_456"},
    ]
    json_file.write_text(json.dumps(data), encoding="utf-8")

    runner = DataPipelineRunner()
    records = runner.load_json(json_file)
    cleaned, report = runner.process_and_clean(records)

    reporter = BIReportGenerator()
    md = reporter.generate_markdown_report(
        title="Performance Semanal",
        records=cleaned,
        quality_report=report,
        kpi_metrics={"Taxa de Sucesso": "98%", "apiKey": "sk-supersecret"},
    )

    # Validations:
    assert "# Relatório Analítico de BI: Performance Semanal" in md
    assert "**Total de Registos**: 2" in md
    # Security redaction check: secrets must NOT appear
    assert "sk-secret123" not in md
    assert "secret_pwd_456" not in md
    assert "sk-supersecret" not in md
    assert "[REDACTED_SECRET]" in md


def test_scheduled_automation_engine():
    engine = ScheduledAutomationEngine()
    counter = {"ticks": 0}

    def my_scheduled_job():
        counter["ticks"] += 1
        return counter["ticks"]

    auto = engine.register_task(
        task_id="job_001",
        name="Hourly Data Healthcheck",
        interval_seconds=3600,
        handler=my_scheduled_job,
        max_runs=2,
    )

    assert auto.runs_count == 0

    res1 = engine.trigger_task("job_001")
    assert res1["status"] == "success"
    assert res1["runs_count"] == 1
    assert counter["ticks"] == 1

    res2 = engine.trigger_task("job_001")
    assert res2["status"] == "success"
    assert res2["runs_count"] == 2
    assert counter["ticks"] == 2

    # Third run must be exhausted
    res3 = engine.trigger_task("job_001")
    assert res3["status"] == "exhausted"
    assert counter["ticks"] == 2
