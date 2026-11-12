import asyncio
import json
import logging
import re
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse

from apps.api.auth import Principal, get_principal
from apps.api.deps import chat_runtime, db_manager, jarvis_master
from apps.api.schemas import ChatRequest
from services.coding_agent import ChatRunConfig, ProviderError
from services.orchestration.state import TaskState
from services.security_core.permission_engine import PermissionDeniedError

logger = logging.getLogger("jarvis.api.chat")
router = APIRouter(tags=["chat"])


def _error_code(exc: Exception) -> str:
    if isinstance(exc, PermissionDeniedError):
        return "policy_denied"
    if isinstance(exc, (TimeoutError, asyncio.TimeoutError)) or "timeout" in str(exc).casefold():
        return "timeout"
    if isinstance(exc, ProviderError):
        return "provider_unavailable"
    return "internal"


# Ações que exigem a governança do orquestrador/Coding Agent: escrita em disco,
# execução de comandos, aprovações, rollback, auditoria e mesa redonda.
ACTION_PATTERNS = [
    # Criação de projetos e artefatos persistidos.
    r"\bcri(?:a|e|ar)\s+(?:(?:um|uma|o|a|os|as)\s+)?(?:nov[oa]s?\s+)?(?:sites?|projetos?|apps?|aplicativos?|p[áa]ginas?|landings?|arquivos?|diret[óo]rios?|pastas?|m[óo]dulos?|componentes?|scripts?|testes?)\b",
    r"\bnovo\s+projeto\b",
    # Alteração de arquivos/código.
    r"\b(?:editar|edite|alterar|altere|adicionar|adicione|corrigir|corrija|implementar|implemente|modificar|modifique|mudar|mude|trocar|troque|atualizar|atualize|refatorar|refatore)\b",
    r"\b(?:fa[çc]a|realize|realizar|aplique|aplicar|preciso\s+de|quero)\s+(?:(?:a|o|uma|um)\s+)?(?:altera[çc][ãa]o|mudan[çc]a|implementa[çc][ãa]o|corre[çc][ãa]o|refatora[çc][ãa]o|modifica[çc][ãa]o)\b",
    r"\b(?:remover|remova|apagar|apague|deletar|delete)\s+(?:(?:o|a|um|uma|os|as)\s+)?(?:arquivos?|diret[óo]rios?|pastas?|projetos?|m[óo]dulos?|componentes?|c[óo]digos?)\b",
    # Execução de comandos.
    r"\b(?:executar|execute|rodar|rode|subir|suba|iniciar|inicie)\s+(?:(?:o|a|um|uma|os|as)\s+)?(?:aplica[çc][ãa]o|servidor|servi[çc]o|deploy|container|comandos?|scripts?|terminal|shell|testes?|build|pipeline|migra[çc][ãa]o)\b",
    r"\b(?:fa[çc]a|realize|executar|execute|rodar|rode|subir|suba)\s+(?:o\s+|um\s+)?deploy\b",
    r"\bexecu[çc][ãa]o\s+de\s+comandos?\b",
    r"\b(?:no|pelo|via|usando)\s+(?:o\s+)?terminal\b",
    r"\blinha\s+de\s+comando\b",
    r"\b(?:npm|pnpm|yarn|pip|pip3|poetry|git|docker|kubectl|bash|powershell|cmd)\s+(?:install|run|build|test|add|commit|push|pull|clone|compose|exec)\b",
    # Aprovações humanas e rollback.
    r"\b(?:aprovar|aprove|autorizar|autorize|rejeitar|rejeite)\b",
    r"\baprova[çc][ãa]o\b|\baprova[çc][õo]es\b",
    r"\brollback\b|\bdesfazer\b",
    # Mesa redonda multiagente e auditoria operacional.
    r"\bmesa\s+redonda\b|\bdebate\b|\bconsenso\b",
    r"\bauditar\b|\bauditoria\b",
    r"/rollback|/debate|/audit",
]

# Planejamento é diálogo: pedir um plano não deve disparar escrita em disco.
PLANNING_PATTERNS = [
    r"^\s*(?:planeje|planejar|planejamento|elabore|elaborar)\b",
    r"^\s*(?:fa[çc]a|crie|monte|prepare|desenvolva)\s+(?:um\s+|o\s+)?(?:plano|planejamento|roadmap|estrat[ée]gia)\b",
    r"^\s*(?:qual|quais|como)\b.*\b(?:plano|planejamento|roadmap|estrat[ée]gia)\b",
]

# Aberturas conversacionais: perguntas e explicações não são comandos de disco.
DIALOGUE_PREFIXES = (
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
    "explique",
    "explica",
    "me explique",
    "me explica",
    "o que é",
    "o que e",
    "o que são",
    "o que sao",
    "descreva",
    "descreve",
    "fale sobre",
    "conte sobre",
    "por que",
    "porque",
)

_reachability = {"checked_at": 0.0, "ok": False, "provider": ""}


def _private_owner(principal: Principal) -> str:
    # Dispositivos ainda não possuem vínculo explícito com uma conta humana.
    if principal.kind == "device" and principal.subject_id.startswith("device:"):
        raise HTTPException(
            status_code=403,
            detail="Dispositivo sem associação a uma conta. Emparelhe novamente com uma conta autorizada.",
        )
    return principal.subject_id


def _looks_actionable(prompt: str) -> bool:
    """Classifica ações protegidas e problemas complexos que exigem delegação."""
    lowered = prompt.lower().strip()

    # Problemas abertos devem chegar ao JarvisMaster para convocar especialistas,
    # mesmo quando a frase começa como pergunta conversacional.
    complex_markers = (
        "analise",
        "análise",
        "analisar",
        "investigue",
        "investigar",
        "resolver",
        "solucionar",
        "diagnosticar",
        "estratégia",
        "planejamento",
        "decisão",
        "compare",
        "avaliar",
        "problema",
        "problemas",
        "causa",
        "causas",
    )
    if len(lowered.split()) >= 6 and any(marker in lowered for marker in complex_markers):
        return True

    if lowered.endswith("?") or any(lowered.startswith(q) for q in DIALOGUE_PREFIXES):
        return False

    if any(re.search(pattern, lowered, re.IGNORECASE) for pattern in PLANNING_PATTERNS):
        return False

    return any(re.search(pattern, lowered, re.IGNORECASE) for pattern in ACTION_PATTERNS)


async def _provider_reachable() -> bool:
    """Verifica (com cache curto) se o provedor de chat pode responder agora.

    Reutiliza a fábrica real do runtime. Para o Ollama (primário ou fallback
    resiliente) sonda ``/api/tags``; para provedores online configurados a
    presença de credencial é o sinal disponível sem custo de inferência.
    """
    now = time.monotonic()
    if now - _reachability["checked_at"] < 15.0:
        return bool(_reachability["ok"])

    ok = False
    provider_name = ""
    try:
        provider = chat_runtime.provider_factory()
        provider_name = getattr(provider, "name", "unknown")
        import httpx

        # Testa o Ollama quando ele é o provedor ou o fallback do provedor resiliente.
        local_candidates = []
        if hasattr(provider, "fallback"):
            local_candidates.append(provider.fallback)
        local_candidates.append(provider)

        for candidate in local_candidates:
            base_url = getattr(candidate, "base_url", None)
            candidate_name = str(getattr(candidate, "name", "")).lower()
            if not base_url:
                continue
            is_local = any(
                host in base_url for host in ("127.0.0.1", "localhost", "0.0.0.0", "[::1]")
            )
            # Evita sondar endpoints online em um caminho que não existe.
            if "ollama" not in candidate_name and "11434" not in base_url and not is_local:
                continue
            try:
                async with httpx.AsyncClient(timeout=1.5) as client:
                    response = await client.get(f"{base_url}/api/tags")
                    if response.status_code == 200:
                        ok = True
                        break
            except Exception as exc:
                logger.debug("Sondagem de reachability falhou em %s: %s", base_url, exc)
                continue

        if not ok:
            primary = getattr(provider, "primary", provider)
            ok = bool(getattr(primary, "api_key", "") or getattr(provider, "api_key", ""))
    except Exception as exc:
        logger.info("Provedor de chat indisponível; usando orquestrador: %s", exc)
        ok = False

    _reachability.update(checked_at=now, ok=ok, provider=provider_name)
    return ok


async def _resolve_engine(request: ChatRequest) -> str:
    """Resolve o motor respeitando o contrato de ``ChatRequest``.

    - ``orchestrator``: sempre o JARVIS Maestro.
    - ``agent``: sempre o runtime conversacional (com fallback em caso de falha).
    - ``auto``: conversa/planejamento vão para o agente quando o provedor está
      disponível; ações críticas permanecem no orquestrador.
    """
    if request.engine in {"agent", "orchestrator"}:
        return request.engine

    if _looks_actionable(request.prompt):
        logger.info("Modo auto: ação crítica detectada; usando orquestrador.")
        return "orchestrator"

    if await _provider_reachable():
        return "agent"

    logger.info("Modo auto: provedor conversacional indisponível; usando orquestrador.")
    return "orchestrator"


def _persist_turn(
    session_id: str | None,
    project_id: str | None,
    prompt: str,
    summary: str | None,
    persist_user: bool = True,
    owner_user_id: str | None = None,
) -> None:
    """Persiste o turno no histórico compartilhado, inclusive no caminho clássico."""
    if not session_id:
        return
    try:
        if persist_user:
            db_manager.add_chat_message(
                session_id=session_id,
                role="user",
                content=prompt,
                project_id=project_id,
                owner_user_id=owner_user_id,
            )
        if summary:
            db_manager.add_chat_message(
                session_id=session_id,
                role="assistant",
                content=summary,
                project_id=project_id,
                owner_user_id=owner_user_id,
            )
    except Exception as exc:
        logger.warning("Falha ao persistir turno do chat: %s", exc)


@router.post("/api/v1/chat")
async def chat_endpoint(request: ChatRequest, principal: Principal = Depends(get_principal)):
    owner_user_id = _private_owner(principal)
    if request.project_id and not db_manager.get_project(
        request.project_id, owner_user_id=owner_user_id
    ):
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    engine = await _resolve_engine(request)
    # Reaproveita a mesma sessão no fallback do agente para o orquestrador,
    # evitando histórico duplicado ou sessões divergentes.
    session_id = request.session_id
    if engine == "agent" and not session_id:
        session_id = f"chat-{uuid.uuid4().hex[:10]}"
    agent_persisted = False
    if engine == "agent":
        try:
            return await chat_runtime.complete(
                ChatRunConfig(
                    prompt=request.prompt,
                    session_id=session_id or "",
                    project_id=request.project_id,
                    owner_user_id=owner_user_id,
                    model=request.model,
                )
            )
        except ProviderError as exc:
            agent_persisted = True
            logger.warning("Chat via agente falhou; usando orquestrador: %s", exc)

    try:
        result: TaskState = await jarvis_master.execute_task(
            user_prompt=request.prompt,
            session_id=session_id,
            project_id=request.project_id,
            owner_user_id=owner_user_id,
        )
        summary = (
            result.get("final_summary", "") if isinstance(result, dict) else result.final_summary
        )
        sid = (
            result.get("session_id")
            if isinstance(result, dict)
            else getattr(result, "session_id", None)
        )
        _persist_turn(
            sid,
            request.project_id,
            request.prompt,
            summary,
            persist_user=not agent_persisted,
            owner_user_id=owner_user_id,
        )
        try:
            tid = result["task_id"] if isinstance(result, dict) else result.task_id
            s_dict = result if isinstance(result, dict) else result.model_dump()
            db_manager.save_task(
                task_id=tid,
                session_id=sid,
                prompt=request.prompt,
                state_dict=s_dict,
                project_id=request.project_id,
                owner_user_id=owner_user_id,
            )
        except Exception as exc:
            logger.warning("Falha ao salvar tarefa no banco de dados: %s", exc)
        return result
    except ProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Tempo limite de inferência excedido.") from exc
    except PermissionDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/api/v1/chat/stream")
async def chat_stream_endpoint(request: ChatRequest, principal: Principal = Depends(get_principal)):
    """
    Endpoint SSE para streaming de tokens em tempo real.

    Com ``engine='auto'`` (padrão), conversas usam o runtime real com memória e
    streaming; ações de código continuam no orquestrador, com aprovação humana.
    """
    owner_user_id = _private_owner(principal)
    if request.project_id and not db_manager.get_project(
        request.project_id, owner_user_id=owner_user_id
    ):
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    engine = await _resolve_engine(request)

    async def agent_generator():
        config = ChatRunConfig(
            prompt=request.prompt,
            session_id=request.session_id or "",
            owner_user_id=owner_user_id,
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
                    # Provedor indisponível (chave inválida, offline) não deve
                    # quebrar o chat: seguimos pelo orquestrador e reaproveitamos
                    # a sessão já persistida pelo runtime, sem duplicar o turno.
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
            init_json = json.dumps(
                {
                    "type": "status",
                    "stage": "starting",
                    "message": "JARVIS Maestro analisando a solicitação e preparando a execução...",
                }
            )
            yield f"data: {init_json}\n\n"

            result: TaskState = await jarvis_master.execute_task(
                user_prompt=request.prompt,
                session_id=request.session_id or session_override,
                project_id=request.project_id,
                owner_user_id=owner_user_id,
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
                owner_user_id=owner_user_id,
            )

            try:
                tid = result["task_id"] if isinstance(result, dict) else result.task_id
                s_dict = result if isinstance(result, dict) else result.model_dump()
                db_manager.save_task(
                    task_id=tid,
                    session_id=sid,
                    prompt=request.prompt,
                    state_dict=s_dict,
                    project_id=request.project_id,
                    owner_user_id=owner_user_id,
                )
            except Exception as exc:
                logger.warning("Falha ao salvar tarefa em streaming: %s", exc)

            meta_json = json.dumps(
                {
                    "type": "meta",
                    "engine": "orchestrator",
                    "task_id": result.get("task_id"),
                    "session_id": sid,
                    "intent": intent,
                    "selected_agents": agents,
                    "plan_steps": steps,
                    "agent_outputs": result.get("agent_outputs", []),
                    "is_completed": result.get("is_completed", False),
                    "approval_required": result.get("approval_required", False),
                    "approval_id": result.get("approval_id"),
                    "error": result.get("error"),
                },
                ensure_ascii=False,
                default=str,
            )
            yield f"data: {meta_json}\n\n"

            words = summary.split(" ")
            for i, w in enumerate(words):
                token_json = json.dumps(
                    {
                        "type": "token",
                        "chunk": w + (" " if i < len(words) - 1 else ""),
                    }
                )
                yield f"data: {token_json}\n\n"
                await asyncio.sleep(0.015)

            done_json = json.dumps(
                {
                    "type": "done",
                    "engine": "orchestrator",
                    "is_completed": result.get("is_completed", True),
                    "approval_required": result.get("approval_required", False),
                    "approval_id": result.get("approval_id"),
                    "final_summary": summary,
                }
            )
            yield f"data: {done_json}\n\n"

        except Exception as exc:
            err_json = json.dumps({"type": "error", "code": _error_code(exc), "error": str(exc)})
            yield f"data: {err_json}\n\n"

    generator = agent_generator if engine == "agent" else orchestrator_generator
    return StreamingResponse(generator(), media_type="text/event-stream")


@router.get("/api/v1/tasks")
async def list_tasks_endpoint(limit: int = 50, principal: Principal = Depends(get_principal)):
    return db_manager.list_tasks(limit=limit, owner_user_id=_private_owner(principal))


@router.delete("/api/v1/tasks/{task_id}")
async def delete_task_endpoint(task_id: str, principal: Principal = Depends(get_principal)):
    success = db_manager.delete_task(task_id, owner_user_id=_private_owner(principal))
    return {"task_id": task_id, "deleted": success}


@router.post("/api/v1/tasks/purge")
async def purge_tasks_endpoint(
    days_retention: int = 30, principal: Principal = Depends(get_principal)
):
    purged_count = db_manager.purge_old_tasks(
        days_retention=days_retention, owner_user_id=_private_owner(principal)
    )
    return {"purged_count": purged_count, "retention_days": days_retention}


@router.get("/api/v1/chat/sessions")
async def list_chat_sessions_endpoint(
    limit: int = 50, principal: Principal = Depends(get_principal)
):
    return db_manager.list_chat_sessions(limit=limit, owner_user_id=_private_owner(principal))


@router.get("/api/v1/chat/sessions/{session_id}")
async def get_chat_session_endpoint(session_id: str, principal: Principal = Depends(get_principal)):
    owner = _private_owner(principal)
    tasks = db_manager.get_session_tasks(session_id, owner_user_id=owner)
    messages = db_manager.list_chat_messages(session_id, limit=400, owner_user_id=owner)
    if not tasks and not messages:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")
    return {"session_id": session_id, "tasks": tasks, "messages": messages}


@router.get("/api/v1/chat/sessions/{session_id}/messages")
async def list_session_messages_endpoint(
    session_id: str, limit: int = 200, principal: Principal = Depends(get_principal)
):
    owner = _private_owner(principal)
    messages = db_manager.list_chat_messages(session_id, limit=limit, owner_user_id=owner)
    if not messages:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")
    return {"session_id": session_id, "messages": messages}


@router.delete("/api/v1/chat/sessions/{session_id}")
async def delete_chat_session_endpoint(
    session_id: str, principal: Principal = Depends(get_principal)
):
    owner = _private_owner(principal)
    deleted_count = db_manager.delete_session(session_id, owner_user_id=owner)
    return {"session_id": session_id, "deleted_tasks": deleted_count}


@router.get("/api/v1/chat/search")
async def search_chat_endpoint(
    query: str, limit: int = 20, principal: Principal = Depends(get_principal)
):
    return db_manager.search_chat_history(
        query=query, limit=limit, owner_user_id=_private_owner(principal)
    )


@router.get("/api/v1/chat/sessions/{session_id}/export")
async def export_chat_session_endpoint(
    session_id: str, principal: Principal = Depends(get_principal)
):
    owner = _private_owner(principal)
    tasks = db_manager.get_session_tasks(session_id, owner_user_id=owner)
    if not tasks:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")
    md_content = db_manager.export_session_markdown(session_id, owner_user_id=owner)
    return Response(
        content=md_content,
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename=conversa-jarvis-{session_id[:8]}.md"
        },
    )
