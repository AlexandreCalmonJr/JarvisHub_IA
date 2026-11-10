import logging
from fastapi import APIRouter, HTTPException

from apps.api.schemas import (
    ApprovalDecisionRequest,
    KillSwitchRequest,
    DevicePairRequest,
    DeviceRevokeRequest,
    NetworkIsolationPayload,
    ApplySecurityPolicyPayload,
)
from apps.api.deps import (
    security_core,
    jarvis_master,
    workspace_service,
    cyber_shield,
    UnauthorizedApprovalError,
    coding_broker,
)

logger = logging.getLogger("jarvis.api.security")
router = APIRouter(tags=["security"])


@router.get("/api/v1/approvals")
async def list_approvals():
    return security_core.approval_engine.list_pending_requests()


@router.post("/api/v1/approvals/{request_id}/decide")
async def decide_approval(request_id: str, payload: ApprovalDecisionRequest):
    try:
        # Aprovações do Coding Agent bloqueiam um runtime assíncrono; precisam
        # ser resolvidas pelo broker para libertar o loop de ferramentas.
        if coding_broker.has_ticket(request_id):
            if payload.action not in {"approve", "reject"}:
                raise HTTPException(
                    status_code=400, detail="Ação inválida. Use 'approve' ou 'reject'."
                )
            decided = coding_broker.decide(
                request_id,
                approved=payload.action == "approve",
                decided_by=payload.decided_by,
                reason=payload.reason,
            )
            return {
                "status": "approved" if payload.action == "approve" else "rejected",
                "request": decided,
            }

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


@router.post("/api/v1/system/kill-switch")
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


@router.get("/api/v1/security/cyber-shield-status")
async def get_cyber_shield_status():
    """Retorna o status consolidado de blindagem cibernética do JARVIS."""
    return cyber_shield.get_security_status()


@router.post("/api/v1/security/network-isolation")
async def toggle_network_isolation_endpoint(payload: NetworkIsolationPayload):
    """Ativa ou desativa o corte total de conexões externas de rede."""
    return cyber_shield.toggle_network_isolation(payload.isolated, reason=payload.reason)


@router.post("/api/v1/mobile/pair")
async def pair_mobile_device(payload: DevicePairRequest):
    reg = security_core.device_auth.pair_device(payload.device_name)
    return {
        "status": "paired",
        "device_id": reg.device_id,
        "device_name": reg.device_name,
        "device_token": reg.device_token,
    }


@router.get("/api/v1/mobile/devices")
async def list_mobile_devices():
    return security_core.device_auth.list_devices()


@router.post("/api/v1/mobile/revoke")
async def revoke_mobile_device(payload: DeviceRevokeRequest):
    try:
        revoked = security_core.device_auth.revoke_device(payload.device_id, reason=payload.reason)
        return {"status": "revoked", "device_id": revoked.device_id}
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@router.get("/api/v1/audit/logs")
@router.get("/api/v1/security/audit-logs")
async def list_audit_logs_endpoint(limit: int = 50, offset: int = 0, severity: str | None = None):
    """Retorna eventos registrados na trilha de auditoria inviolável do sistema."""
    events = security_core.audit.list_events()
    if severity:
        sev_clean = severity.upper()
        events = [
            e for e in events
            if getattr(e, "severity", None) == sev_clean
            or getattr(getattr(e, "severity", None), "value", None) == sev_clean
        ]
    total = len(events)
    events_reversed = list(reversed(events))
    sliced = events_reversed[offset : offset + limit]
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "events": [
            {
                "id": getattr(e, "event_id", str(i)),
                "timestamp": getattr(e, "timestamp", ""),
                "operation": getattr(e, "operation", ""),
                "status": getattr(e, "status", ""),
                "severity": getattr(getattr(e, "severity", None), "value", str(getattr(e, "severity", "INFO"))),
                "parameters": getattr(e, "parameters", {}),
                "reason": getattr(e, "reason", None),
            }
            for i, e in enumerate(sliced)
        ],
    }


@router.post("/api/v1/security/scan-cves/{project_id}")
async def scan_project_cves_endpoint(project_id: str):
    """Varre dependências locais do projeto procurando por CVEs conhecidas sem acesso externo."""
    try:
        proj_dir = workspace_service.get_project_dir(project_id)
        return security_core.cve_scanner.scan_project_dependencies(proj_dir)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/v1/security/red-team/{project_id}")
async def red_team_audit_endpoint(project_id: str):
    """Executa varredura estática de Red Team no código procurando SQLi, XSS, Path Traversal e Secrets."""
    try:
        proj_dir = workspace_service.get_project_dir(project_id)
        return security_core.red_team.run_security_audit(proj_dir)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/api/v1/security/policy-templates")
async def list_security_policy_templates():
    """Retorna templates de cabeçalhos de segurança, CSP e CORS estrito prontos para implantação."""
    return security_core.policy_generator.get_available_templates()


@router.post("/api/v1/security/apply-policy")
async def apply_security_policy_endpoint(payload: ApplySecurityPolicyPayload):
    """Aplica o template de política de segurança diretamente no diretório do projeto."""
    try:
        proj_dir = workspace_service.get_project_dir(payload.project_id)
        templates = {t["id"]: t for t in security_core.policy_generator.get_available_templates()}
        tmpl = templates.get(payload.template_id)
        if not tmpl:
            raise HTTPException(status_code=404, detail="Template de política não encontrado.")

        target_file = proj_dir / tmpl["filename"]
        target_file.write_text(tmpl["code"], encoding="utf-8")
        security_core.audit.log(
            operation="APPLY_SECURITY_POLICY",
            user_id="local_developer",
            target_resource=str(target_file),
            status="SUCCESS",
            parameters={"project_id": payload.project_id, "template_id": payload.template_id},
        )
        return {
            "status": "applied",
            "file": tmpl["filename"],
            "path": str(target_file),
            "message": f"Política '{tmpl['title']}' aplicada com sucesso.",
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
