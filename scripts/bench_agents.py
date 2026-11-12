"""Benchmark de latência autenticado para especialistas via SSE."""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import httpx

PROMPTS = (
    ("explain", "Explique em até duas frases o que é uma API REST e quando usar paginação."),
    (
        "checks",
        "Liste três verificações práticas para avaliar a qualidade de uma resposta técnica.",
    ),
    (
        "structured",
        'Responda somente com JSON válido contendo "status":"ok" e "checks":3.',
    ),
)


def _read_sse(response: httpx.Response, started: float) -> dict:
    result: dict = {"success": False, "ttft_ms": None, "events": 0}
    data_lines: list[str] = []
    for line in response.iter_lines():
        if line:
            if line.startswith("data:"):
                data_lines.append(line[5:].strip())
            continue
        if not data_lines:
            continue
        try:
            event = json.loads("\n".join(data_lines))
        except json.JSONDecodeError:
            data_lines.clear()
            continue
        data_lines.clear()
        result["events"] += 1
        if event.get("type") == "assistant" and result["ttft_ms"] is None:
            result["ttft_ms"] = round((time.perf_counter() - started) * 1000, 2)
        if event.get("type") == "start":
            result["model"] = event.get("model")
        elif event.get("type") == "final":
            result.update(
                success=bool(event.get("is_completed")), duration_ms=event.get("duration_ms")
            )
            contract = event.get("contract") or {}
            usage = contract.get("resource_usage") or {}
            result.update(
                prompt_tokens=usage.get("tokens_prompt"),
                completion_tokens=usage.get("tokens_completion"),
            )
        elif event.get("type") == "error":
            result["error"] = str(event.get("error", "Erro do agente"))[:500]
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--role", help="Executa apenas um papel; sem role, exige --all.")
    parser.add_argument(
        "--all", action="store_true", help="Executa 3 prompts para cada agente (pode demorar)."
    )
    parser.add_argument("--base-url", default=os.getenv("JARVIS_API_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--token", default=os.getenv("JARVIS_ADMIN_TOKEN"))
    parser.add_argument("--output", default="data/bench_agents.json")
    args = parser.parse_args()
    if not args.token:
        parser.error("Defina JARVIS_ADMIN_TOKEN ou passe --token.")
    if not args.role and not args.all:
        parser.error("Informe --role <agent_role> ou --all.")

    client = httpx.Client(
        base_url=args.base_url.rstrip("/"),
        headers={"Authorization": f"Bearer {args.token}"},
        timeout=httpx.Timeout(310, connect=10),
    )
    try:
        response = client.get("/api/v1/agents")
        response.raise_for_status()
        payload = response.json()
        agents = payload if isinstance(payload, list) else payload.get("agents", [])
        roles = [
            str(item.get("role", item.get("id", ""))) for item in agents if isinstance(item, dict)
        ]
        selected = [args.role] if args.role else roles
        unknown = sorted(set(selected) - set(roles))
        if unknown:
            parser.error(f"Papel(is) desconhecido(s): {', '.join(unknown)}")

        results = []
        for role in selected:
            for prompt_name, prompt in PROMPTS:
                started = time.perf_counter()
                item = {
                    "role": role,
                    "prompt": prompt_name,
                    "started_at": datetime.now(UTC).isoformat(),
                }
                try:
                    with client.stream(
                        "POST",
                        f"/api/v1/agents/{role}/stream",
                        json={
                            "prompt": prompt,
                            "session_id": f"bench-{uuid4().hex[:12]}",
                            "mode": "plan",
                            "max_iterations": 1,
                            "max_tokens": 256,
                            "timeout_seconds": 300,
                            "include_history": False,
                        },
                    ) as response:
                        response.raise_for_status()
                        item.update(_read_sse(response, started))
                except Exception as exc:
                    item.update(success=False, error=str(exc)[:500])
                item["wall_ms"] = round((time.perf_counter() - started) * 1000, 2)
                completion = item.get("completion_tokens") or 0
                duration = (item.get("duration_ms") or 0) / 1000
                item["completion_tokens_per_second"] = (
                    round(completion / duration, 2) if duration > 0 else None
                )
                results.append(item)
                print(json.dumps(item, ensure_ascii=False))

        successful = [item for item in results if item.get("success")]
        latencies = [item["wall_ms"] for item in successful]
        output = {
            "timestamp": datetime.now(UTC).isoformat(),
            "base_url": args.base_url,
            "runs": len(results),
            "successes": len(successful),
            "median_wall_ms": round(statistics.median(latencies), 2) if latencies else None,
            "p95_wall_ms": (
                round(sorted(latencies)[min(len(latencies) - 1, int(len(latencies) * 0.95))], 2)
                if latencies
                else None
            ),
            "results": results,
        }
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
        return 0 if len(successful) == len(results) else 1
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())
