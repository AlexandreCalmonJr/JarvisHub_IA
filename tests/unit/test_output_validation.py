import json

import pytest

from packages.contracts.agent import (
    MAX_AGENT_LIST_ITEMS,
    MAX_AGENT_SUMMARY_CHARS,
    MAX_AGENT_SUMMARY_WORDS,
    AgentRole,
)
from services.orchestration.output_validation import (
    OutputContractError,
    count_words,
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


def test_summary_flags_long_narrative_without_rewriting():
    text = " ".join(f"palavra{index}" for index in range(MAX_AGENT_SUMMARY_WORDS + 20))

    result, issues = validate_summary_text(text, max_words=MAX_AGENT_SUMMARY_WORDS)

    assert result == text
    assert any(f"excede {MAX_AGENT_SUMMARY_WORDS} palavras" in issue for issue in issues)


def test_summary_compacts_long_narrative_when_enforced():
    text = "Frase completa para teste. " * 120

    result, issues = validate_summary_text(
        text,
        max_words=MAX_AGENT_SUMMARY_WORDS,
        enforce_max_words=True,
    )

    assert count_words(result) <= MAX_AGENT_SUMMARY_WORDS
    assert result.endswith(("…", "."))
    assert any("compactado" in issue for issue in issues)


def test_summary_word_limit_does_not_touch_json_or_code():
    payload = json.dumps({"analise": "palavra " * 400})
    result, issues = validate_summary_text(
        payload,
        max_words=MAX_AGENT_SUMMARY_WORDS,
        enforce_max_words=True,
    )
    assert result == payload
    assert not any("compactado" in issue for issue in issues)

    code = "```python\n" + "print('linha')\n" * 400 + "```"
    result_code, code_issues = validate_summary_text(
        code,
        max_words=MAX_AGENT_SUMMARY_WORDS,
        enforce_max_words=True,
    )
    assert result_code == code
    assert not any("compactado" in issue for issue in code_issues)
