import json

import pytest

from packages.contracts.agent import (
    MAX_AGENT_LIST_ITEMS,
    MAX_AGENT_SUMMARY_CHARS,
    AgentRole,
)
from services.orchestration.output_validation import (
    OutputContractError,
    validate_and_repair_contract,
    validate_summary_text,
)


def _payload(**overrides):
    data = {
        "agent_role": AgentRole.BACKEND_DEVELOPER.value,
        "objective": "Validar a saída do especialista",
        "summary": "Resumo válido e curto.",
        "next_recommendation": "Prosseguir com a revisão.",
    }
    data.update(overrides)
    return data


def test_contract_truncates_summary_and_limits_lists():
    repaired = validate_and_repair_contract(
        _payload(
            summary="Frase completa. " * 600,
            evidence=[f"evidência {index}" for index in range(MAX_AGENT_LIST_ITEMS + 5)],
        )
    )

    assert repaired.repaired is True
    assert len(repaired.contract.summary) <= MAX_AGENT_SUMMARY_CHARS
    assert len(repaired.contract.evidence) == MAX_AGENT_LIST_ITEMS
    assert any("summary" in issue for issue in repaired.issues)


def test_contract_fills_empty_required_fields():
    repaired = validate_and_repair_contract(_payload(summary="   ", objective=""))

    assert repaired.contract.summary
    assert repaired.contract.objective
    assert repaired.issues


def test_contract_raises_on_unknown_role():
    with pytest.raises(OutputContractError):
        validate_and_repair_contract(_payload(agent_role="papel_inexistente"))


def test_summary_repairs_invalid_json_once():
    text = (
        '```json\n{"analise": "ok", "acoes": ["a"], "riscos": [], '
        '"desconhecidos": [], "proximo_passo": "b",}\n```'
    )

    repaired, issues = validate_summary_text(text)

    assert any("JSON reparado" in issue for issue in issues)
    assert json.loads(repaired)["analise"] == "ok"


def test_summary_strips_json_markdown_fence():
    text = '```json\n{"status": "ok", "checks": 3}\n```'

    repaired, issues = validate_summary_text(text)

    assert repaired == '{"status": "ok", "checks": 3}'
    assert any("cerca markdown" in issue for issue in issues)


def test_summary_strips_plain_fence_only_for_valid_json():
    valid, valid_issues = validate_summary_text('```\n{"status": "ok"}\n```')
    assert valid == '{"status": "ok"}'
    assert any("cerca markdown" in issue for issue in valid_issues)

    code = "```python\nprint('ok')\n```"
    untouched, untouched_issues = validate_summary_text(code)
    assert untouched == code
    assert not any("cerca markdown" in issue for issue in untouched_issues)


def test_contract_strips_json_markdown_fence():
    repaired = validate_and_repair_contract(
        _payload(summary='```json\n{"status": "ok", "checks": 3}\n```')
    )

    assert repaired.contract.summary == '{"status": "ok", "checks": 3}'
    assert repaired.repaired is True


def test_summary_flags_truncation_and_empty():
    repaired, issues = validate_summary_text("corte", finish_reason="length")

    assert repaired == "corte"
    assert any("limite de tokens" in issue for issue in issues)

    repaired_empty, empty_issues = validate_summary_text("")
    assert repaired_empty
    assert any("vazio" in issue for issue in empty_issues)
