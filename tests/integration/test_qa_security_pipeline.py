from pathlib import Path

import pytest

from services.security_core import (
    FindingSeverity,
    QASecurityPipeline,
    SecurityCore,
    StackType,
)


@pytest.fixture
def pipeline_env():
    security = SecurityCore()
    pipeline = QASecurityPipeline(audit_trail=security.audit)
    return pipeline, security


def test_detect_flutter_stack(pipeline_env, tmp_path):
    pipeline, _ = pipeline_env
    flutter_dir = tmp_path / "demo_flutter_app"
    flutter_dir.mkdir()
    (flutter_dir / "pubspec.yaml").write_text("name: demo_flutter_app\\n", encoding="utf-8")
    stack = pipeline.detect_stack(flutter_dir)
    assert stack == StackType.FLUTTER


def test_detect_python_stack(pipeline_env):
    pipeline, _ = pipeline_env
    root_dir = Path.cwd()
    stack = pipeline.detect_stack(root_dir)
    assert stack == StackType.PYTHON


@pytest.mark.asyncio
async def test_pipeline_gate_blocks_on_critical_secret(pipeline_env, tmp_path):
    pipeline, security = pipeline_env
    project_dir = tmp_path / "insecure_app"
    project_dir.mkdir()
    (project_dir / "pyproject.toml").write_text("[project]\nname = 'insecure-app'\n")

    # Injeta segredo em texto claro
    secret_file = project_dir / "config.py"
    secret_file.write_text('OPENAI_API_KEY = "sk-1234567890abcdef1234567890abcdef"\n')

    result = await pipeline.run_pipeline(
        project_root=project_dir,
        project_id="insecure-01",
        skip_tests=True,
    )

    # 1. Gate DEVE estar bloqueado
    assert result.passed is False
    assert result.critical_count >= 1

    # 2. Finding deve apontar a regra e o arquivo
    finding = next(f for f in result.findings if f.severity == FindingSeverity.CRITICAL)
    assert finding.rule_id in ("OPENAI_API_KEY", "HARDCODED_SECRET")
    assert finding.file_path == "config.py"

    # 3. Evento registrado em auditoria com alerta de segurança
    events = security.audit.list_events(project_id="insecure-01")
    assert any(
        e.operation == "QA_SECURITY_PIPELINE_RUN" and e.status == "GATE_BLOCKED" for e in events
    )


@pytest.mark.asyncio
async def test_pipeline_gate_passes_clean_project(pipeline_env, tmp_path):
    pipeline, security = pipeline_env
    clean_dir = tmp_path / "clean_app"
    clean_dir.mkdir()
    (clean_dir / "pyproject.toml").write_text("[project]\nname = 'clean-app'\n")
    (clean_dir / "main.py").write_text("def hello():\n    return 'Hello World'\n")

    result = await pipeline.run_pipeline(
        project_root=clean_dir,
        project_id="clean-01",
        skip_tests=True,
    )

    assert result.passed is True
    assert result.critical_count == 0
    assert "SAST: Nenhum segredo detetado" in result.evidence[1]
