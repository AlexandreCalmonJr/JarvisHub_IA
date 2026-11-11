"""Serviço de busca, curadoria e instalação de modelos Hugging Face para o JARVIS AI Hub."""

import json
import logging
from typing import Any

import httpx

logger = logging.getLogger("jarvis.huggingface")

# Catálogo Curado de Modelos GGUF Homologados para CPU Intel (i5 + 32GB RAM)
CURATED_HUGGINGFACE_MODELS = [
    {
        "id": "llama3.2:3b",
        "name": "Llama 3.2 (3B Instruct)",
        "hf_repo": "bartowski/Llama-3.2-3B-Instruct-GGUF",
        "author": "Meta / bartowski",
        "size_formatted": "2.0 GB",
        "ram_required": "~2.8 GB",
        "speed_cpu": "~14 a 16 tokens/s",
        "recommended_for": "Maestro, Triagem, Chat Diário, Frontend",
        "tags": ["GGUF", "Meta", "Leve", "CPU Rápida"],
        "badge": "⚡ Recomendado pelo JARVIS",
        "badge_color": "badge-success",
        "score": 98,
        "is_default": True,
    },
    {
        "id": "qwen2.5-coder:7b",
        "name": "Qwen 2.5 Coder (7B Instruct)",
        "hf_repo": "bartowski/Qwen2.5-Coder-7B-Instruct-GGUF",
        "author": "Qwen / bartowski",
        "size_formatted": "4.7 GB",
        "ram_required": "~5.5 GB",
        "speed_cpu": "~4 a 5 tokens/s",
        "recommended_for": "Arquiteto, Engenheiro Python, Java, Go, Backend",
        "tags": ["GGUF", "Código", "Top 1 Leaderboard"],
        "badge": "⚙️ Especialista em Código",
        "badge_color": "badge-purple",
        "score": 95,
        "is_default": True,
    },
    {
        "id": "deepseek-r1:1.5b",
        "name": "DeepSeek R1 Distill (1.5B)",
        "hf_repo": "bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF",
        "author": "DeepSeek / bartowski",
        "size_formatted": "1.1 GB",
        "ram_required": "~1.8 GB",
        "speed_cpu": "~22 tokens/s (Ultra-Rápido)",
        "recommended_for": "Raciocínio Rápido, Matemática, Lógica",
        "tags": ["GGUF", "DeepSeek", "Ultra-Leve"],
        "badge": "🚀 Ultra Rápido",
        "badge_color": "badge-info",
        "score": 92,
        "is_default": False,
    },
    {
        "id": "starcoder2:3b",
        "name": "StarCoder 2 (3B)",
        "hf_repo": "bartowski/starcoder2-3b-GGUF",
        "author": "BigCode / bartowski",
        "size_formatted": "2.1 GB",
        "ram_required": "~2.9 GB",
        "speed_cpu": "~13 tokens/s",
        "recommended_for": "Garantia de Qualidade (QA), Testes Unitários",
        "tags": ["GGUF", "Testes", "BigCode"],
        "badge": "🧪 Especialista em Testes",
        "badge_color": "badge-warning",
        "score": 88,
        "is_default": False,
    },
    {
        "id": "phi3.5:3.8b",
        "name": "Phi 3.5 Mini (3.8B Instruct)",
        "hf_repo": "bartowski/Phi-3.5-mini-instruct-GGUF",
        "author": "Microsoft / bartowski",
        "size_formatted": "2.4 GB",
        "ram_required": "~3.2 GB",
        "speed_cpu": "~11 tokens/s",
        "recommended_for": "Análise de Arquitetura, Resumos Técnicos",
        "tags": ["GGUF", "Microsoft", "Raciocínio"],
        "badge": "📐 Arquitetura",
        "badge_color": "badge-info",
        "score": 90,
        "is_default": False,
    },
]

# Mapeamento do modelo ótimo para cada um dos 26 Especialistas do JARVIS
AGENT_MODEL_RECOMMENDATIONS = {
    "maestro": {"model": "llama3.2:3b", "reason": "Velocidade instantânea de triagem e coordenação (~14 t/s)."},
    "general_assistant": {"model": "llama3.2:3b", "reason": "Chat cotidiano fluido sem aquecimento da CPU."},
    "code_explanation": {"model": "llama3.2:3b", "reason": "Consultoria e explicações didáticas rápidas."},
    "software_architect": {"model": "qwen2.5-coder:7b", "reason": "Profundidade em padrões arquiteturais, DDD e microserviços."},
    "requirements_analyst": {"model": "llama3.2:3b", "reason": "Elaboração de escopo e histórias de usuário."},
    "python_developer": {"model": "qwen2.5-coder:7b", "reason": "Melhor modelo para FastAPI, Pydantic, SQLAlchemy e scripts."},
    "java_developer": {"model": "qwen2.5-coder:7b", "reason": "Precisão em Java 21, Spring Boot e Maven."},
    "csharp_developer": {"model": "qwen2.5-coder:7b", "reason": "Excelente suporte a C# 12 e .NET 8."},
    "go_developer": {"model": "qwen2.5-coder:7b", "reason": "Geração idiomática de Go 1.22 com concorrência."},
    "kotlin_developer": {"model": "qwen2.5-coder:7b", "reason": "Suporte a Kotlin e Gradle DSL."},
    "flutter_developer": {"model": "llama3.2:3b", "reason": "Scaffolds rápidos em Dart e widgets mobile."},
    "frontend_developer": {"model": "llama3.2:3b", "reason": "Geração ágil de HTML5, CSS3 moderno e JS interativo."},
    "database_administrator": {"model": "qwen2.5-coder:7b", "reason": "Modelagem relacional, índices e queries complexas."},
    "security_auditor": {"model": "llama3.2:3b", "reason": "Auditoria OWASP e sanitização ágil sem atrasos."},
    "qa_engineer": {"model": "starcoder2:3b", "reason": "Especialista em testes unitários e cobertura."},
    "devops_engineer": {"model": "llama3.2:3b", "reason": "Configurações Dockerfile, CI/CD e shell scripts."},
    "tech_lead": {"model": "llama3.2:3b", "reason": "Code reviews e alinhamento de entregáveis."},
    "project_manager": {"model": "llama3.2:3b", "reason": "Cronogramas, marcos e priorização de backlog."},
    "cloud_architect": {"model": "qwen2.5-coder:7b", "reason": "Topologia de nuvem, serverless e infraestrutura."},
    "observability_engineer": {"model": "llama3.2:3b", "reason": "Métricas Prometheus, OpenTelemetry e logs."},
    "api_designer": {"model": "llama3.2:3b", "reason": "Especificações OpenAPI/Swagger e contratos REST."},
    "mobile_architect": {"model": "llama3.2:3b", "reason": "Padrões arquiteturais mobile (Clean, BLoC)."},
    "performance_engineer": {"model": "qwen2.5-coder:7b", "reason": "Profiling de CPU, memória e benchmarking."},
    "data_engineer": {"model": "qwen2.5-coder:7b", "reason": "Pipelines de dados, ETL e transformações."},
    "ai_engineer": {"model": "qwen2.5-coder:7b", "reason": "Engenharia de prompts, embeddings e RAG."},
    "compliance_officer": {"model": "llama3.2:3b", "reason": "Auditoria de conformidade, LGPD e governança."},
}


async def search_huggingface_hub(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """Pesquisa modelos GGUF no Hugging Face via API oficial pública ou catálogo curado."""
    if not query:
        return CURATED_HUGGINGFACE_MODELS

    q_lower = query.lower().strip()
    # 1. Filtra primeiro no catálogo curado local
    local_matches = [
        m for m in CURATED_HUGGINGFACE_MODELS
        if q_lower in m["name"].lower() or q_lower in m["id"].lower() or any(q_lower in t.lower() for t in m["tags"])
    ]

    # 2. Tenta buscar no Hugging Face Hub se houver conexão com internet
    try:
        url = f"https://huggingface.co/api/models?search={query}&filter=gguf&limit={limit}&full=false"
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                results = list(local_matches)
                seen_ids = {m["id"] for m in results}

                for item in data:
                    model_id = item.get("id", "")
                    if model_id in seen_ids or not model_id:
                        continue
                    seen_ids.add(model_id)

                    # Formata nome amigável
                    parts = model_id.split("/")
                    author = parts[0] if len(parts) > 1 else "Hugging Face"
                    clean_name = parts[-1].replace("-GGUF", "").replace("_", " ")

                    results.append({
                        "id": f"hf.co/{model_id}",
                        "name": clean_name,
                        "hf_repo": model_id,
                        "author": author,
                        "size_formatted": "Ver no Download",
                        "ram_required": "~4 a 8 GB",
                        "speed_cpu": "Calculada pelo Ollama",
                        "recommended_for": "Uso geral via Hugging Face",
                        "tags": ["GGUF", "Hugging Face"],
                        "badge": "Hugging Face",
                        "badge_color": "badge-info",
                        "score": 80,
                        "is_default": False,
                    })
                return results[:limit]
    except Exception as e:
        logger.debug("Busca online no Hugging Face indisponível (usando catálogo local): %s", e)

    return local_matches if local_matches else CURATED_HUGGINGFACE_MODELS


async def stream_ollama_pull(model_tag: str):
    """Dispara o pull de um modelo no Ollama e gera eventos SSE com o progresso de download."""
    url = "http://127.0.0.1:11434/api/pull"
    payload = {"name": model_tag, "stream": True}

    logger.info("Iniciando download de modelo Ollama / Hugging Face: %s", model_tag)

    async with httpx.AsyncClient(timeout=1800.0) as client:
        try:
            async with client.stream("POST", url, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                        status = chunk.get("status", "baixando...")
                        completed = chunk.get("completed", 0)
                        total = chunk.get("total", 0)

                        percent = round((completed / total) * 100, 1) if total > 0 else 0

                        yield {
                            "status": status,
                            "completed_bytes": completed,
                            "total_bytes": total,
                            "percent": percent,
                            "done": status == "success",
                        }
                        if status == "success":
                            break
                    except Exception:
                        logger.debug("Falha ao consultar o progresso do download; a continuar.", exc_info=True)
        except Exception as exc:
            yield {
                "status": f"Falha no download: {exc}",
                "percent": 0,
                "done": True,
                "error": str(exc),
            }
