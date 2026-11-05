import asyncio
import time
from services.model_runtime import ModelManager, OllamaAdapter, InferenceRequest


async def run_benchmark():
    adapter = OllamaAdapter()
    healthy = await adapter.health_check()
    if not healthy:
        print("[ERRO] Ollama não está a responder em http://127.0.0.1:11434")
        return

    manager = ModelManager(adapter=adapter)
    models = await manager.list_available_models()
    print(f"Modelos encontrados ({len(models)}): {[m.name for m in models]}")

    test_model = "llama3.2:3b"
    print(f"\n--- Iniciando Benchmark com {test_model} ---")

    prompts = [
        {
            "name": "Português Geral",
            "prompt": "Explica em três frases concisas o que é uma arquitetura monólito modular e a sua principal vantagem em notebooks.",
            "json": False,
        },
        {
            "name": "Código Python",
            "prompt": "Escreve uma função Python que valida se uma string é um hash SHA-256 válido em formato hexadecimal.",
            "json": False,
        },
        {
            "name": "JSON Estruturado",
            "prompt": "Gera um objeto JSON contendo: 'status': 'ok', 'component': 'security_core', 'checks_passed': 10.",
            "json": True,
        },
    ]

    for p in prompts:
        print(f"\n[Teste] {p['name']}...")
        req = InferenceRequest(
            prompt=p["prompt"],
            model_name=test_model,
            format_json=p["json"],
            temperature=0.1,
            max_tokens=256,
        )
        t0 = time.perf_counter()
        res = await manager.generate(req)
        total_time = time.perf_counter() - t0
        print(f"-> Latência: {res.duration_ms} ms | Tokens/s: {res.tokens_per_second} | Prompt tokens: {res.prompt_tokens} | Completion tokens: {res.completion_tokens}")
        print(f"-> Amostra da resposta:\n{res.content[:200]}...")


if __name__ == "__main__":
    asyncio.run(run_benchmark())
