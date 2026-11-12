import asyncio
import json
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from apps.api.auth import Principal, get_principal, require_admin, require_permission
from apps.api.deps import (
    AGENT_PROFILES,
    InferenceRequest,
    ToolExecutionRequest,
    agent_registry,
    autonomous_agent_runtime,
    build_specialist_prompt,
    db_manager,
    key_vault,
    model_manager,
    security_core,
    skills_catalog,
    tool_gateway,
)
from apps.api.schemas import (
    AgentConfigUpdateRequest,
    AgentMemoryCreateRequest,
    AgentPlaygroundRequest,
    AgentRouteUpdateRequest,
    AutonomousAgentRunRequest,
)
from packages.contracts.agent import (
    AgentRole,
    AutonomousAgentMode,
    AutonomousAgentRunConfig,
)
from packages.contracts.security import ProjectWorkMode
from services.model_runtime.agent_routing import resolve_account_agent_route
from services.model_runtime.provider_defaults import normalize_model_for_provider

logger = logging.getLogger("jarvis.api.agents")
router = APIRouter(tags=["agents"])

_agent_session_locks: dict[str, asyncio.Lock] = {}


def _private_owner(principal: Principal) -> str:
    if principal.kind == "device" and principal.subject_id.startswith("device:"):
        raise HTTPException(
            status_code=403,
            detail="Dispositivo sem associação a uma conta. Emparelhe novamente com uma conta autorizada.",
        )
    return principal.subject_id


def _account_owner(principal: Principal) -> str:
    """Exige uma conta humana para configurações privadas do cofre."""
    if principal.kind != "human":
        raise HTTPException(
            status_code=403,
            detail="A configuração de rota por agente exige uma conta humana autenticada.",
        )
    return _private_owner(principal)


@router.get("/api/v1/agents")
async def list_agents_endpoint(
    principal: Principal = Depends(get_principal),
):
    return [
        {
            "role": profile.role.value if hasattr(profile.role, "value") else str(profile.role),
            "name": profile.name,
            "mission": profile.mission,
            "preferred_model": profile.preferred_model,
            "is_read_only": profile.is_read_only,
            "allowed_tools": profile.allowed_tools,
            **(
                {
                    "system_prompt": profile.system_prompt,
                    "assigned_key_id": profile.assigned_key_id,
                }
                if principal.kind == "human" and principal.role in {"admin", "developer"}
                else {}
            ),
        }
        for profile in AGENT_PROFILES.values()
    ]


@router.get("/api/v1/agents/{role}")
async def get_agent_endpoint(
    role: str, principal: Principal = Depends(get_principal),
):
    clean_role = role.lower().strip()
    profile = None
    for p in AGENT_PROFILES.values():
        p_role = p.role.value if hasattr(p.role, "value") else str(p.role)
        if p_role == clean_role:
            profile = p
            break
    if not profile:
        raise HTTPException(status_code=404, detail=f"Agente '{role}' não encontrado.")
    return {
        "role": profile.role.value if hasattr(profile.role, "value") else str(profile.role),
        "name": profile.name,
        "mission": profile.mission,
        "preferred_model": profile.preferred_model,
        "is_read_only": profile.is_read_only,
        "allowed_tools": profile.allowed_tools,
        **(
            {
                "system_prompt": profile.system_prompt,
                "assigned_key_id": profile.assigned_key_id,
            }
            if principal.kind == "human" and principal.role in {"admin", "developer"}
            else {}
        ),
    }


@router.put("/api/v1/agents/{role}/config")
async def update_agent_config_endpoint(
    role: str, payload: AgentConfigUpdateRequest,
    principal: Principal = Depends(require_admin),
):
    clean_role = role.lower().strip()
    target_profile = None
    for p in AGENT_PROFILES.values():
        p_role = p.role.value if hasattr(p.role, "value") else str(p.role)
        if p_role == clean_role:
            target_profile = p
            break
    if not target_profile:
        raise HTTPException(status_code=404, detail=f"Agente '{role}' não encontrado.")

    if payload.system_prompt is not None:
        target_profile.system_prompt = payload.system_prompt.strip()
    if payload.preferred_model is not None and payload.preferred_model.strip():
        target_profile.preferred_model = payload.preferred_model.strip()
    if payload.allowed_tools is not None:
        target_profile.allowed_tools = payload.allowed_tools
    if payload.is_read_only is not None:
        target_profile.is_read_only = payload.is_read_only
    if payload.assigned_key_id is not None:
        target_profile.assigned_key_id = payload.assigned_key_id.strip() if payload.assigned_key_id.strip() else None

    # Persiste customização no SQLite para sobreviver a reinicializações
    try:
        db_manager.set_agent_config(
            role=clean_role,
            system_prompt=payload.system_prompt,
            preferred_model=payload.preferred_model,
            allowed_tools=payload.allowed_tools,
            is_read_only=payload.is_read_only,
            assigned_key_id=payload.assigned_key_id,
        )
    except Exception as exc:
        logger.warning("Falha ao persistir configuração de agente no SQLite: %s", exc)

    return {
        "status": "updated",
        "agent": {
            "role": target_profile.role.value if hasattr(target_profile.role, "value") else str(target_profile.role),
            "name": target_profile.name,
            "mission": target_profile.mission,
            "preferred_model": target_profile.preferred_model,
            "is_read_only": target_profile.is_read_only,
            "allowed_tools": target_profile.allowed_tools,
            "system_prompt": target_profile.system_prompt,
        },
    }


@router.get("/api/v1/agents/{role}/memories")
async def list_agent_memories_endpoint(
    role: str, category: str | None = None, limit: int = 50,
    principal: Principal = Depends(get_principal),
):
    return db_manager.list_agent_memories(
        agent_role=role, category=category, limit=limit,
        owner_user_id=_private_owner(principal),
    )


@router.post("/api/v1/agents/{role}/memories")
async def create_agent_memory_endpoint(
    role: str, payload: AgentMemoryCreateRequest,
    principal: Principal = Depends(get_principal),
):
    mem_id = db_manager.set_agent_memory(
        agent_role=role,
        category=payload.category,
        key=payload.key,
        content=payload.content,
        context=payload.context,
        importance=payload.importance,
        owner_user_id=_private_owner(principal),
    )
    return {"status": "created", "id": mem_id, "agent_role": role, "key": payload.key}


@router.delete("/api/v1/agents/{role}/memories/{memory_id}")
async def delete_agent_memory_endpoint(
    role: str, memory_id: str, principal: Principal = Depends(get_principal)
):
    success = db_manager.delete_agent_memory(
        memory_id, owner_user_id=_private_owner(principal)
    )
    if not success:
        raise HTTPException(status_code=404, detail="Memória não encontrada.")
    return {"status": "deleted", "id": memory_id}


@router.post("/api/v1/agents/{role}/playground")
async def agent_playground_endpoint(
    role: str, payload: AgentPlaygroundRequest,
    principal: Principal = Depends(get_principal),
):
    """Execução isolada de um especialista no playground interativo."""
    clean_role = role.lower().strip()
    profile = None
    for p in AGENT_PROFILES.values():
        p_role = p.role.value if hasattr(p.role, "value") else str(p.role)
        if p_role == clean_role:
            profile = p
            break
    if not profile:
        raise HTTPException(status_code=404, detail=f"Agente '{role}' não encontrado.")

    owner_user_id = _private_owner(principal)
    if payload.project_id and not db_manager.get_project(
        payload.project_id, owner_user_id=owner_user_id
    ):
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    prompt = build_specialist_prompt(
        agent_role=clean_role,
        agent_registry=agent_registry,
        skills_catalog=skills_catalog,
        db_manager=db_manager,
        owner_user_id=owner_user_id,
        intent="general_planning",
        user_prompt=payload.prompt,
        project_id=payload.project_id,
    )

    route = resolve_account_agent_route(
        db_manager=db_manager,
        key_vault=key_vault,
        owner_user_id=owner_user_id,
        agent_role=clean_role,
        fallback_key_id=getattr(profile, "assigned_key_id", None),
        fallback_model=profile.preferred_model,
    )

    req = InferenceRequest(
        prompt=payload.prompt,
        system_prompt=prompt,
        model_name=route.model or profile.preferred_model,
        max_tokens=2048,
        temperature=0.3,
        timeout_seconds=300.0,
        owner_user_id=owner_user_id,
        agent_role=clean_role,
        key_id=route.key_id,
    )
    try:
        resp = await model_manager.generate(req)
        content = resp.content
        m_used = resp.model_name
        t_prompt = resp.tokens_prompt
        t_comp = resp.tokens_completion
    except Exception as exc:
        logger.exception("Falha no playground do especialista %s", clean_role)
        raise HTTPException(
            status_code=503,
            detail="O provedor de IA está indisponível. O especialista não foi executado.",
        ) from exc

    return {
        "agent_role": clean_role,
        "agent_name": profile.name,
        "response": content,
        "model_used": m_used,
        "tokens_prompt": t_prompt,
        "tokens_completion": t_comp,
    }


@router.get("/api/v1/tools")
async def list_tools_endpoint(
    principal: Principal = Depends(require_permission("coding:read")),
):
    """Lista o catálogo compartilhado de ferramentas para utilizadores autenticados."""
    return [
        {
            "name": t.name,
            "category": t.category.value if hasattr(t.category, "value") else str(t.category),
            "description": t.description,
            "requires_approval": t.requires_approval,
            "allowed_roles": t.allowed_roles,
        }
        for t in tool_gateway.tool_registry.list_tools()
    ]


@router.post("/api/v1/tools/execute")
async def execute_tool_endpoint(
    request: ToolExecutionRequest,
    principal: Principal = Depends(require_permission("coding:use")),
):
    """Executa ferramentas apenas em projetos pertencentes à conta autenticada."""
    owner_user_id = _private_owner(principal)
    project = db_manager.get_project(request.project_id, owner_user_id=owner_user_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    project_root = Path(project["root_path"]).resolve()
    if not project_root.exists() or not project_root.is_dir():
        raise HTTPException(status_code=404, detail="Diretório do projeto não encontrado.")

    try:
        try:
            project_mode = ProjectWorkMode(project.get("mode", "read_only"))
        except ValueError:
            project_mode = ProjectWorkMode.READ_ONLY
        security_core.permission_engine.register_project(
            request.project_id, str(project_root), mode=project_mode
        )
        result = await tool_gateway.execute_tool(
            request, owner_user_id=owner_user_id, actor_role=principal.role
        )
        return result.model_dump()
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Falha na execução de ferramenta para o projeto %s", request.project_id)
        raise HTTPException(status_code=403, detail=str(exc)) from exc

# ---------------------------------------------------------------------------
# Especialistas Autônomos (Etapa 5: Streaming SSE, Tarefas Estruturadas & Histórico)
# ---------------------------------------------------------------------------

def _resolve_agent_role(role_str: str) -> AgentRole:
    clean = role_str.lower().strip()
    try:
        return AgentRole(clean)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Papel de especialista '{role_str}' não existe.")


@router.get("/api/v1/agent-routes")
async def list_agent_routes_endpoint(
    principal: Principal = Depends(get_principal),
):
    """Lista as rotas de chave + modelo configuradas pela conta."""
    owner_user_id = _account_owner(principal)
    routes = db_manager.list_agent_routes(owner_user_id)
    for route in routes:
        profile = key_vault.get_key(route["key_id"], owner_user_id)
        route["key_label"] = profile.label if profile else None
        route["provider"] = profile.provider if profile else None
        route["key_available"] = bool(
            profile and profile.is_active and profile.api_key
        )
    return {"routes": routes}


@router.put("/api/v1/agent-routes/{role}")
async def set_agent_route_endpoint(
    role: str,
    payload: AgentRouteUpdateRequest,
    principal: Principal = Depends(get_principal),
):
    """Define a chave e o modelo que esta conta usa para o especialista."""
    agent_role = _resolve_agent_role(role)
    owner_user_id = _account_owner(principal)

    profile = key_vault.get_key(payload.key_id.strip(), owner_user_id)
    if profile is None:
        raise HTTPException(
            status_code=404,
            detail="Chave não encontrada no cofre da conta.",
        )
    if not profile.is_active or not profile.api_key:
        raise HTTPException(
            status_code=400,
            detail="A chave selecionada está inativa ou sem segredo configurado.",
        )

    model = (payload.model or "").strip() or profile.default_model
    if not model:
        raise HTTPException(
            status_code=400,
            detail="Indique o modelo a usar com a chave selecionada.",
        )
    model = normalize_model_for_provider(profile.provider, model) or model

    db_manager.set_agent_route(
        agent_role=agent_role.value,
        key_id=profile.key_id,
        model=model,
        owner_user_id=owner_user_id,
    )
    return {
        "status": "saved",
        "agent_role": agent_role.value,
        "key_id": profile.key_id,
        "key_label": profile.label,
        "provider": profile.provider,
        "model": model,
    }


@router.delete("/api/v1/agent-routes/{role}")
async def delete_agent_route_endpoint(
    role: str,
    principal: Principal = Depends(get_principal),
):
    """Remove a rota da conta; o especialista volta ao perfil global."""
    agent_role = _resolve_agent_role(role)
    owner_user_id = _account_owner(principal)
    if not db_manager.delete_agent_route(agent_role.value, owner_user_id):
        raise HTTPException(
            status_code=404,
            detail="Não existe rota configurada para este especialista.",
        )
    return {"status": "deleted", "agent_role": agent_role.value}


@router.post("/api/v1/agents/{role}/stream")
async def stream_agent_execution_endpoint(
    role: str, payload: AutonomousAgentRunRequest,
    principal: Principal = Depends(get_principal),
):
    """Executa o especialista selecionado em modo ReAct com streaming de eventos SSE em tempo real."""
    agent_role = _resolve_agent_role(role)
    owner_user_id = _private_owner(principal)
    if payload.project_id and not db_manager.get_project(
        payload.project_id, owner_user_id=owner_user_id
    ):
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    try:
        mode = AutonomousAgentMode(payload.mode.lower().strip())
    except ValueError:
        raise HTTPException(status_code=400, detail="Modo inválido. Use 'plan', 'ask' ou 'auto'.")

    session_id = payload.session_id or f"ses-{agent_role.value}-{uuid.uuid4().hex[:8]}"
    lock_key = f"{owner_user_id}:{session_id}"
    lock = _agent_session_locks.setdefault(lock_key, asyncio.Lock())
    if lock.locked():
        raise HTTPException(status_code=409, detail="Já existe uma execução ativa nesta sessão do especialista.")

    config = AutonomousAgentRunConfig(
        agent_role=agent_role,
        prompt=payload.prompt.strip(),
        session_id=session_id,
        project_id=payload.project_id,
        owner_user_id=owner_user_id,
        mode=mode,
        max_iterations=payload.max_iterations,
        temperature=payload.temperature,
        max_tokens=payload.max_tokens,
        timeout_seconds=payload.timeout_seconds,
        include_history=payload.include_history,
    )

    async def event_generator():
        await lock.acquire()
        try:
            async for event in autonomous_agent_runtime.run_stream(config):
                yield f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"
        except asyncio.CancelledError:
            logger.info("Cliente desconectou da execução do especialista %s (%s).", agent_role.value, session_id)
            raise
        except Exception as exc:
            logger.exception("Falha na execução do especialista %s", agent_role.value)
            yield f"data: {json.dumps({'type': 'error', 'error': f'Falha interna do especialista: {exc}'})}\n\n"
        finally:
            if lock.locked():
                lock.release()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/api/v1/agents/{role}/history")
async def get_agent_history_endpoint(
    role: str, session_id: str | None = None, limit: int = 100,
    principal: Principal = Depends(get_principal),
):
    """Lista histórico conversacional e eventos de ferramentas persistidos para a sessão do especialista."""
    agent_role = _resolve_agent_role(role)
    effective_session = session_id or f"ses-{agent_role.value}"
    messages = db_manager.list_chat_messages(
        effective_session, limit=limit, owner_user_id=_private_owner(principal)
    )
    return {
        "agent_role": agent_role.value,
        "session_id": effective_session,
        "messages": messages,
    }


@router.post("/api/v1/agents/{role}/task")
async def execute_agent_task_endpoint(
    role: str, payload: AutonomousAgentRunRequest,
    principal: Principal = Depends(get_principal),
):
    """Executa uma tarefa estruturada com o especialista, retornando o AgentOutputContract formal."""
    agent_role = _resolve_agent_role(role)
    owner_user_id = _private_owner(principal)
    if payload.project_id and not db_manager.get_project(
        payload.project_id, owner_user_id=owner_user_id
    ):
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    try:
        mode = AutonomousAgentMode(payload.mode.lower().strip())
    except ValueError:
        raise HTTPException(status_code=400, detail="Modo inválido. Use 'plan', 'ask' ou 'auto'.")

    session_id = payload.session_id or f"task-{agent_role.value}-{uuid.uuid4().hex[:8]}"
    config = AutonomousAgentRunConfig(
        agent_role=agent_role,
        prompt=payload.prompt.strip(),
        session_id=session_id,
        project_id=payload.project_id,
        owner_user_id=owner_user_id,
        mode=mode,
        max_iterations=payload.max_iterations,
        temperature=payload.temperature,
        max_tokens=payload.max_tokens,
        timeout_seconds=payload.timeout_seconds,
        include_history=payload.include_history,
    )

    contract = await autonomous_agent_runtime.run_task(config)
    return contract.model_dump()

