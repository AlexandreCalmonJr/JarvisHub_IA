"""Smoke tests for specialist agents over the authenticated local API."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import UTC, datetime

import httpx


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("list", "run", "run-all", "run-rest"))
    parser.add_argument("role", nargs="?")
    parser.add_argument("--base-url", default=os.getenv("JARVIS_API_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--token", default=os.getenv("JARVIS_ADMIN_TOKEN"))
    parser.add_argument("--prompt", default="Responda apenas: OK")
    parser.add_argument("--output", default="data/baseline_agents.json")
    args = parser.parse_args()
    if not args.token:
        parser.error("Defina JARVIS_ADMIN_TOKEN ou passe --token.")

    client = httpx.Client(
        base_url=args.base_url.rstrip("/"),
        headers={"Authorization": f"Bearer {args.token}"},
        timeout=310,
    )
    response = client.get("/api/v1/agents")
    response.raise_for_status()
    payload = response.json()
    agents = payload if isinstance(payload, list) else payload.get("agents", [])
    roles = [str(item.get("role", item.get("id", ""))) for item in agents if isinstance(item, dict)]
    if args.command == "list":
        print("\n".join(roles))
        return 0
    selected = [args.role] if args.command == "run" else roles
    if args.command == "run" and not args.role:
        parser.error("run exige o argumento role.")
    previous_results: list[dict] = []
    if args.command == "run-rest":
        try:
            with open(args.output, encoding="utf-8") as stream:
                previous = json.load(stream)
            previous_results = previous.get("results", [])
            done = {item["role"] for item in previous_results if item.get("success")}
            selected = [role for role in roles if role not in done]
        except (OSError, ValueError, KeyError):
            selected = roles
    results = []
    for role in selected:
        started = time.perf_counter()
        item = {"role": role, "started_at": datetime.now(UTC).isoformat()}
        try:
            reply = client.post(f"/api/v1/agents/{role}/playground", json={"prompt": args.prompt})
            item.update(
                success=reply.is_success,
                status_code=reply.status_code,
                latency_seconds=round(time.perf_counter() - started, 3),
            )
            if reply.is_success:
                data = reply.json()
                item.update(
                    model=data.get("model_used"),
                    prompt_tokens=data.get("prompt_tokens", data.get("tokens_prompt")),
                    completion_tokens=data.get("completion_tokens", data.get("tokens_completion")),
                )
            else:
                item["error"] = reply.text[:500]
        except Exception as exc:
            item.update(
                success=False,
                error=str(exc),
                latency_seconds=round(time.perf_counter() - started, 3),
            )
        results.append(item)
        print(json.dumps(item, ensure_ascii=False))
    all_results = {item["role"]: item for item in previous_results}
    all_results.update({item["role"]: item for item in results})
    output = {
        "timestamp": datetime.now(UTC).isoformat(),
        "base_url": args.base_url,
        "results": list(all_results.values()),
    }
    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as stream:
        json.dump(output, stream, ensure_ascii=False, indent=2)
    return 0 if all(item.get("success") for item in results) else 1


if __name__ == "__main__":
    sys.exit(main())
