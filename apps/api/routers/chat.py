import asyncio
import json
import logging
import re
import time

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import StreamingResponse

from apps.api.schemas import ChatRequest
from apps.api.deps import chat_runtime, jarvis_master, db_manager
from services.coding_agent import ChatRunConfig, ProviderError
from services.orchestration.state import TaskState

logger = logging.getLogger("jarvis.api.chat")
router = APIRouter(tags=["chat"])

# Pedidos que continuam no orquestrador determinístico (escrita, aprovação,
# criação de projeto e mesa redonda). O chat conversacional usa o runtime real.
ACTION_PATTERNS = [
    r"\bcri(?:a|e|ar)\s+(?:um\s+)?(?:site|projeto|app|aplicativo|p[áa]gina|landing)\b",
    r"\bnovo\s+projeto\b",
    r"\b(?:editar|edite|alterar|altere|adicionar|adicione|corrigir|corrija|implementar|implemente|modificar|modifique|mudar|mude|trocar|troque|atualizar|atualize|refatorar|refatore)\b",
    r"\brollback\b|\bdesfazer\b",
    r"\bmesa\s+redonda\b|\bdebate\b|\bconsenso\b",
    r"\bauditar\b|\bauditoria\b",
    r"/rollback|/debate|/audit",
]

_reachability = {"checked_at": 0.0, "ok": False, "provider": ""}


def _looks_actionable(prompt: str) -> bool:
    lowered = prompt.lower().strip()

    # Perguntas exploratórias ou propostas com interrogação são tratadas como diálogo
    # e planejamento conversacional no runtime inteligente, e NÃO como comandos cegos de disco.
    if lowered.endswith("?") or any(
        lowered.startswith(q)
        for q in (
            "podemos",
            "como",
            "é possível",
            "e possivel",
            "seria possível",
            "seria possivel",
            "o que acha de",
            "qual a melhor forma",
            "você acha",
            "voce acha",
            "dá para",
            "da para",
            "você pode explicar",
            "voce pode explicar",
        )
    ):
        return False

    return any(re.search(pattern, lowered, re.IGNORECASE) for pattern in ACTION_PATTERNS)


async def _provider_reachable() -> bool:
    """Verifica (com cache curto) se o provedor de chat pode responder agora."""
    now = time.monotonic()
    if now - _reachability["checked_at"] < 15.0:
        return bool(_reachability["ok"])

    ok = False
    provider_name = ""
    try:
        provider = chat_runtime.provider_factory()
        provider_name = getattr(provider, "name", "unknown")
        import httpx

        # Se há Ollama presente como primário ou fallback resiliente, testa reachability local
        base_url = getattr(provider, "base_url", None)
        if not base_url and hasattr(provider, "fallback"):
            base_url = getattr(provider.fallback, "base_url", None)
        if not base_url:
            base_url = "http://127.0.0.1:11434"

        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                response = await client.get(f"{base_url}/api/tags")
                if response.status_code == 200:
                    ok = True
        except Exception:
            ok = bool(getattr(provider, "api_key", ""))
    except Exception as exc:
        logger.info("Provedor de chat indisponível; usando orquestrador: %s", exc)
        ok = False

    _reachability.update(checked_at=now, ok=ok, provider=provider_name)
    return ok


async def _resolve_engine(request: ChatRequest) -> str:
    if request.engine in {"agent", "orchestrator"}:
        return request.engine
    # Por padrão, todas as requisições do chat passam pelo JARVIS Maestro Multi-Agente (26 Especialistas)
    return "orchestrator"


def _persist_turn(
    session_id: str | None,
    project_id: str | None,
    prompt: str,
    summary: str | None,
    persist_user: bool = True,
) -> None:
    """Persiste o turno no histórico compartilhado, inclusive no caminho clássico."""
    if not session_id:
        return
    try:
        if persist_user:
            db_manager.add_chat_message(
                session_id=session_id, role="user", content=prompt, project_id=project_id
            )
        if summary:
            db_manager.add_chat_message(
                session_id=session_id,
                role="assistant",
                content=summary,
                project_id=project_id,
            )
    except Exception as exc:
        logger.warning("Falha ao persistir turno do chat: %s", exc)


@router.post("/api/v1/chat")
async def chat_endpoint(request: ChatRequest):
    engine = await _resolve_engine(request)
    agent_persisted = False
    if engine == "agent":
        try:
            return await chat_runtime.complete(
                ChatRunConfig(
                    prompt=request.prompt,
                    session_id=request.session_id or "",
                    project_id=request.project_id,
                    model=request.model,
                )
            )
        except ProviderError as exc:
            agent_persisted = True
            logger.warning("Chat via agente falhou; usando orquestrador: %s", exc)

    try:
        result: TaskState = await jarvis_master.execute_task(
            user_prompt=request.prompt,
            session_id=request.session_id,
            project_id=request.project_id,
        )
        summary = result.get("final_summary", "") if isinstance(result, dict) else result.final_summary
        sid = result.get("session_id") if isinstance(result, dict) else getattr(result, "session_id", None)
        _persist_turn(
            sid,
            request.project_id,
            request.prompt,
            summary,
            persist_user=not (agent_persisted and request.session_id),
        )
        try:
            if request.project_id:
                db_manager.register_project(
                    project_id=request.project_id,
                    name=request.project_id,
                    root_path=f"workspace/{request.project_id}",
                )
            tid = result["task_id"] if isinstance(result, dict) else result.task_id
            s_dict = result if isinstance(result, dict) else result.model_dump()
            db_manager.save_task(
                task_id=tid,
                session_id=sid,
                prompt=request.prompt,
                state_dict=s_dict,
                project_id=request.project_id,
            )
        except Exception as exc:
            logger.warning("Falha ao salvar tarefa no banco de dados: %s", exc)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/api/v1/chat/stream")
async def chat_stream_endpoint(request: ChatRequest):
    """
    Endpoint SSE para streaming de tokens em tempo real.

    Com ``engine='auto'`` (padrão), conversas usam o runtime real com memória e
    streaming; ações de código continuam no orquestrador, com aprovação humana.
    """
    engine = await _resolve_engine(request)

    async def agent_generator():
        config = ChatRunConfig(
            prompt=request.prompt,
            session_id=request.session_id or "",
            project_id=request.project_id,
            model=request.model,
        )
        emitted_token = False
        runtime_session_id: str | None = None
        try:
            async for event in chat_runtime.run(config):
                if event.get("type") == "start":
                    runtime_session_id = event.get("session_id") or runtime_session_id
                if event.get("type") == "error" and not emitted_token:
                    # Em modo auto, provedor indisponível (chave inválida, offline) não
                    # deve quebrar o chat: seguimos pelo orquestrador e reaproveitamos
                    # a sessão já persistida pelo runtime.
                    if request.engine != "auto":
                        yield f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"
                        return
                    logger.info(
                        "Chat conversacional indisponível (%s); usando orquestrador.",
                        event.get("error"),
                    )
                    _reachability.update(
                        checked_at=time.monotonic(),
                        ok=False,
                        provider=str(event.get("provider") or ""),
                    )
                    async for chunk in orchestrator_generator(
                        persist_user=False, session_override=runtime_session_id
                    ):
                        yield chunk
                    return
                if event.get("type") == "token":
                    emitted_token = True
                yield f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"
        except asyncio.CancelledError:
            logger.info("Cliente desconectou do chat conversacional.")
            raise

    async def orchestrator_generator(
        persist_user: bool = True,
        session_override: str | None = None,
    ):
        try:
            init_json = json.dumps({
                "type": "status",
                "stage": "starting",
                "message": "JARVIS Maestro iniciando processamento local e coordenando especialistas...",
            })
            yield f"data: {init_json}\n\n"

            result: TaskState = await jarvis_master.execute_task(
                user_prompt=request.prompt,
                session_id=request.session_id or session_override,
                project_id=request.project_id,
            )

            summary = result.get("final_summary", "")
            intent = result.get("classified_intent", "")
            agents = result.get("selected_agents", [])
            steps = result.get("plan_steps", [])
            sid = result.get("session_id")

            _persist_turn(
                sid,
                request.project_id,
                request.prompt,
                summary,
                persist_user=persist_user,
            )

            try:
                if request.project_id:
                    db_manager.register_project(
                        project_id=request.project_id,
                        name=request.project_id,
                        root_path=f"workspace/{request.project_id}",
                    )
                tid = result["task_id"] if isinstance(result, dict) else result.task_id
                s_dict = result if isinstance(result, dict) else result.model_dump()
                db_manager.save_task(
                    task_id=tid,
                    session_id=sid,
                    prompt=request.prompt,
                    state_dict=s_dict,
                    project_id=request.project_id,
                )
            except Exception as exc:
                logger.warning("Falha ao salvar tarefa em streaming: %s", exc)

            meta_json = json.dumps({
                "type": "meta",
                "engine": "orchestrator",
                "task_id": result.get("task_id"),
                "session_id": sid,
                "intent": intent,
                "selected_agents": agents,
                "plan_steps": steps,
            })
            yield f"data: {meta_json}\n\n"

            words = summary.split(" ")
            for i, w in enumerate(words):
                token_json = json.dumps({
                    "type": "token",
                    "chunk": w + (" " if i < len(words) - 1 else ""),
                })
                yield f"data: {token_json}\n\n"
                await asyncio.sleep(0.015)

            done_json = json.dumps({
                "type": "done",
                "engine": "orchestrator",
                "is_completed": result.get("is_completed", True),
                "approval_required": result.get("approval_required", False),
                "approval_id": result.get("approval_id"),
                "final_summary": summary,
            })
            yield f"data: {done_json}\n\n"

        except Exception as exc:
            err_json = json.dumps({"type": "error", "error": str(exc)})
            yield f"data: {err_json}\n\n"

    generator = agent_generator if engine == "agent" else orchestrator_generator
    return StreamingResponse(generator(), media_type="text/event-stream")


@router.get("/api/v1/tasks")
async def list_tasks_endpoint(limit: int = 50):
    return db_manager.list_tasks(limit=limit)


@router.delete("/api/v1/tasks/{task_id}")
async def delete_task_endpoint(task_id: str):
    """Exclui permanentemente um registro de tarefa do banco SQLite."""
    success = db_manager.delete_task(task_id)
    return {"task_id": task_id, "deleted": success}


@router.post("/api/v1/tasks/purge")
async def purge_tasks_endpoint(days_retention: int = 30):
    """Expurga tarefas mais antigas que o período de retenção especificado."""
    purged_count = db_manager.purge_old_tasks(days_retention=days_retention)
    return {"purged_count": purged_count, "retention_days": days_retention}


@router.get("/api/v1/chat/sessions")
async def list_chat_sessions_endpoint(limit: int = 50):
    """Lista sessões de conversa e histórico de interações."""
    return db_manager.list_chat_sessions(limit=limit)


@router.get("/api/v1/chat/sessions/{session_id}")
async def get_chat_session_endpoint(session_id: str):
    """Recupera tarefas e mensagens de uma sessão específica de conversa."""
    tasks = db_manager.get_session_tasks(session_id)
    return {
        "session_id": session_id,
        "tasks": tasks,
        "messages": db_manager.list_chat_messages(session_id, limit=400),
    }


@router.get("/api/v1/chat/sessions/{session_id}/messages")
async def list_session_messages_endpoint(session_id: str, limit: int = 200):
    """Histórico por mensagem (compartilhado pelos motores clássico e agente)."""
    return {
        "session_id": session_id,
        "messages": db_manager.list_chat_messages(session_id, limit=limit),
    }


@router.delete("/api/v1/chat/sessions/{session_id}")
async def delete_chat_session_endpoint(session_id: str):
    """Exclui uma sessão de conversa, suas tarefas e mensagens associadas."""
    deleted_count = db_manager.delete_session(session_id)
    return {"session_id": session_id, "deleted_tasks": deleted_count}


@router.get("/api/v1/chat/search")
async def search_chat_endpoint(query: str, limit: int = 20):
    """Busca em todo o histórico de conversas e mensagens anteriores."""
    return db_manager.search_chat_history(query=query, limit=limit)


@router.get("/api/v1/chat/sessions/{session_id}/export")
async def export_chat_session_endpoint(session_id: str):
    """Exporta a sessão de chat em formato Markdown (.md) estruturado."""
    md_content = db_manager.export_session_markdown(session_id)
    return Response(
        content=md_content,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=conversa-jarvis-{session_id[:8]}.md"},
    )
