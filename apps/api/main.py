from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from services.model_runtime import ModelManager, OllamaAdapter
from services.orchestration import JarvisMaster, TaskState
from services.security_core import SecurityCore, UnauthorizedApprovalError

# Inicialização dos serviços centrais do monólito modular
security_core = SecurityCore()
model_manager = ModelManager(
    adapter=OllamaAdapter(),
    kill_switch=security_core.kill_switch,
    audit_trail=security_core.audit,
)
jarvis_master = JarvisMaster(
    security_core=security_core,
    model_manager=model_manager,
)

app = FastAPI(
    title="JARVIS AI HUB API",
    version="0.1.0",
    description="Backend central REST e WebSocket para orquestração de agentes especializados local-first",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Schemas para API
class ChatRequest(BaseModel):
    prompt: str = Field(..., description="Instrução ou pedido do utilizador")
    session_id: str | None = None
    project_id: str | None = None


class ApprovalDecisionRequest(BaseModel):
    action: str = Field(..., description="'approve' ou 'reject'")
    decided_by: str = Field(..., description="Identificador do utilizador humano autorizador")
    reason: str | None = None


class KillSwitchRequest(BaseModel):
    target: str = Field(..., description="'global' ou 'task'")
    task_id: str | None = None
    reason: str = "Ação acionada pelo utilizador"


class DevicePairRequest(BaseModel):
    device_name: str = Field(..., description="Nome de identificação do dispositivo móvel")


class DeviceRevokeRequest(BaseModel):
    device_id: str = Field(..., description="Identificador do dispositivo a revogar")
    reason: str = "Revogação pelo utilizador"


@app.get("/")
async def root():
    return {
        "name": "JARVIS AI HUB API",
        "version": "0.1.0",
        "mode": "local-first",
        "status": "operational",
    }


@app.get("/api/v1/system/health")
async def health_check():
    ollama_ok = await model_manager.check_health()
    return {
        "status": "healthy" if ollama_ok else "degraded",
        "components": {
            "security_core": "operational",
            "approval_engine": "operational",
            "model_runtime": "operational" if ollama_ok else "offline",
            "inference_queue": {
                "active": model_manager.queue.active_count,
                "waiting": model_manager.queue.waiting_count,
            },
            "kill_switch": {"global_killed": security_core.kill_switch.is_global_killed()},
        },
    }


@app.post("/api/v1/chat")
async def chat_endpoint(request: ChatRequest):
    try:
        result: TaskState = await jarvis_master.execute_task(
            user_prompt=request.prompt,
            session_id=request.session_id,
            project_id=request.project_id,
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/v1/approvals")
async def list_approvals():
    return security_core.approval_engine.list_pending_requests()


@app.post("/api/v1/approvals/{request_id}/decide")
async def decide_approval(request_id: str, payload: ApprovalDecisionRequest):
    try:
        if payload.action == "approve":
            decided = security_core.approval_engine.approve_request(
                request_id=request_id,
                decided_by=payload.decided_by,
                decision_reason=payload.reason,
            )
            # Retoma tarefa associada
            await jarvis_master.resume_after_approval(
                task_id=decided.task_id,
                approved_by=payload.decided_by,
            )
            return {"status": "approved", "request": decided}
        elif payload.action == "reject":
            decided = security_core.approval_engine.reject_request(
                request_id=request_id,
                decided_by=payload.decided_by,
                reason=payload.reason or "Rejeitado pelo utilizador",
            )
            return {"status": "rejected", "request": decided}
        else:
            raise HTTPException(status_code=400, detail="Ação inválida. Use 'approve' ou 'reject'.")
    except UnauthorizedApprovalError as uae:
        raise HTTPException(status_code=403, detail=str(uae))
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@app.post("/api/v1/system/kill-switch")
async def trigger_kill_switch(payload: KillSwitchRequest):
    if payload.target == "global":
        security_core.kill_switch.trigger_global_kill(reason=payload.reason)
        return {"status": "global_kill_activated"}
    elif payload.target == "task":
        if not payload.task_id:
            raise HTTPException(
                status_code=400, detail="task_id é obrigatório para cancelar tarefa."
            )
        security_core.kill_switch.cancel_task(payload.task_id, reason=payload.reason)
        return {"status": "task_cancelled", "task_id": payload.task_id}
    else:
        raise HTTPException(status_code=400, detail="Alvo inválido.")


@app.post("/api/v1/mobile/pair")
async def pair_mobile_device(payload: DevicePairRequest):
    reg = security_core.device_auth.pair_device(payload.device_name)
    return {
        "status": "paired",
        "device_id": reg.device_id,
        "device_name": reg.device_name,
        "device_token": reg.device_token,
    }


@app.get("/api/v1/mobile/devices")
async def list_mobile_devices():
    return security_core.device_auth.list_devices()


@app.post("/api/v1/mobile/revoke")
async def revoke_mobile_device(payload: DeviceRevokeRequest):
    try:
        revoked = security_core.device_auth.revoke_device(payload.device_id, reason=payload.reason)
        return {"status": "revoked", "device_id": revoked.device_id}
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


# Monta dashboard web estático se compilado
dist_path = Path("apps/dashboard/dist")
if dist_path.exists():
    app.mount("/", StaticFiles(directory=str(dist_path), html=True), name="dashboard")
