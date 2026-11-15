"""Generate a Markdown review sheet for the 1–5 human rubric of the agent eval."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

RUBRIC = (
    "relevance",
    "role_adherence",
    "format",
    "tool_discipline",
    "hallucination_control",
)

RUBRIC_LABELS = {
    "relevance": "Relevância",
    "role_adherence": "Aderência ao papel",
    "format": "Formato",
    "tool_discipline": "Disciplina de ferramentas",
    "hallucination_control": "Controlo de alucinação",
}


def _clip(text: str, limit: int) -> str:
    text = " ".join(str(text or "").split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def build_sheet(data: dict) -> str:
    results = data.get("results") or []
    lines = [
        "# Rubrica humana — eval dos 26 especialistas",
        "",
        f"- Fonte: `{data.get('base_url', '')}`",
        f"- Execução: {data.get('timestamp', '')}",
        f"- Casos: {len(results)} · sucessos: {data.get('successes', 0)}",
        "",
        "Escala: **1** insuficiente, **3** adequado, **5** excelente.",
        "Preencha `rubric_1_to_5` e `review_notes` no JSON do eval (campos `null`).",
        "Critérios: " + ", ".join(f"`{item}` ({RUBRIC_LABELS[item]})" for item in RUBRIC) + ".",
        "",
    ]

    current_role: str | None = None
    for index, row in enumerate(results, start=1):
        role = str(row.get("role", ""))
        if role != current_role:
            current_role = role
            lines.extend([f"## {role}", ""])
        lines.extend([f"### {index}. {row.get('case_id', '')}", ""])
        status = "OK" if row.get("success") else "FALHA"
        lines.append(f"- Estado: **{status}** · {row.get('wall_ms', 0) / 1000:.1f} s")
        if row.get("error"):
            lines.append(f"- Erro: {_clip(row['error'], 300)}")
        lines.append(f"- Prompt: {_clip(row.get('prompt', ''), 500)}")
        lines.append(f"- Esperado: {_clip(row.get('expected', ''), 300)}")
        summary = _clip(row.get("summary", ""), 900) or "(vazio)"
        lines.append(f"- Resposta: {summary}")
        tool_calls = row.get("tool_calls") or []
        lines.append(f"- Ferramentas: {len(tool_calls)}")
        scores = row.get("rubric_1_to_5") or {}
        filled = " | ".join(f"{key}={scores.get(key) or '—'}" for key in RUBRIC)
        lines.append(f"- Notas: {filled}")
        if row.get("review_notes"):
            lines.append(f"- Observações: {_clip(row['review_notes'], 300)}")
        lines.append("")

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default="data/eval_agents_groq_qual.json")
    parser.add_argument("--output", default="data/rubrica_revisao.md")
    args = parser.parse_args()

    data = json.loads(Path(args.input).read_text(encoding="utf-8"))
    sheet = build_sheet(data)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(sheet, encoding="utf-8")
    print(f"Folha de revisão: {output} ({len(data.get('results') or [])} casos)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
