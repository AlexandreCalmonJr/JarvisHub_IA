import difflib
import logging
from fastapi import APIRouter, Depends, HTTPException

from apps.api.auth import Principal, get_principal, require_admin, require_permission
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
    tool_gateway,
    db_manager,
)
from packages.contracts.agent import AgentRole
from packages.contracts.approval import ApprovalStatus
from packages.contracts.security import AuditEventSeverity
from services.security_core import PermissionDeniedError
from services.tool_gateway import ToolExecutionRequest

logger = logging.getLogger("jarvis.api.security")
router = APIRouter(tags=["security"])


def _approval_owner(principal: Principal) -> str:
    if principal.kind == "device" and principal.subject_id.startswith("device:"):
        raise HTTPException(
            status_code=403,
            detail="Dispositivo sem associação a uma conta. Emparelhe novamente com uma conta autorizada.",
        )
    return principal.subject_id


@router.get("/api/v1/approvals")
async def list_approvals(principal: Principal = Depends(get_principal)):
    owner = _approval_owner(principal)
    return security_core.approval_engine.list_pending_requests(owner_user_id=owner)


@router.post("/api/v1/approvals/{request_id}/decide")
async def decide_approval(
    request_id: str,
    payload: ApprovalDecisionRequest,
    principal: Principal = Depends(get_principal),
):
    try:
        owner = _approval_owner(principal)
        owned_request = security_core.approval_engine.get_request(
            request_id, owner_user_id=owner
        )
        if owned_request is None:
            raise HTTPException(status_code=404, detail="Aprovação não encontrada.")

        # Rejeita imediatamente qualquer tentativa de autoaprovação por agentes
        known_agents = {r.value for r in AgentRole}
        candidate = (payload.decided_by or "").lower().strip()
        if candidate and (candidate in known_agents or candidate.startswith("agent_") or candidate.startswith("agent")):
            raise UnauthorizedApprovalError(
                "Agentes de IA não possuem permissão para autoaprovar pedidos!"
            )
        if principal.subject_id in known_agents or principal.subject_id.lower().startswith("agent"):
            raise UnauthorizedApprovalError(
                "Agentes de IA não possuem permissão para autoaprovar pedidos!"
            )

        # A identidade válida vem sempre da autenticação do servidor
        actor = principal.display_id

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
                decided_by=actor,
                reason=payload.reason,
                owner_user_id=owner,
            )
            return {
                "status": "approved" if payload.action == "approve" else "rejected",
                "request": decided,
            }

        if payload.action == "approve":
            decided = security_core.approval_engine.approve_request(
                request_id=request_id,
                decided_by=actor,
                decision_reason=payload.reason,
                owner_user_id=owner,
            )
            # Pedidos de workspace API são retomados pelo próprio cliente após a decisão.
            # Tarefas do Jarvis Master retomam o checkpoint e executam o payload aprovado.
            if not decided.task_id.startswith("workspace:"):
                try:
                    await jarvis_master.resume_after_approval(
                        task_id=decided.task_id,
                        approved_by=actor,
                        owner_user_id=owner,
                    )
                except ValueError as ve:
                    logger.debug("JarvisMaster não encontrou checkpoint para '%s': %s", decided.task_id, ve)
                except PermissionDeniedError as exc:
                    logger.warning("Execução bloqueada após aprovação %s: %s", request_id, exc)
                    raise HTTPException(
                        status_code=409,
                        detail=f"A aprovação foi registada, mas a execução foi bloqueada: {exc}",
                    ) from exc
                except Exception as exc:
                    logger.exception("Falha ao executar tarefa aprovada %s", request_id)
                    raise HTTPException(
                        status_code=500,
                        detail="A aprovação foi registada, mas a execução da tarefa falhou.",
                    ) from exc

            return {"status": "approved", "request": decided}
        elif payload.action == "reject":
            decided = security_core.approval_engine.reject_request(
                request_id=request_id,
                decided_by=actor,
                reason=payload.reason or "Rejeitado pelo utilizador",
                owner_user_id=owner,
            )
            return {"status": "rejected", "request": decided}
        else:
            raise HTTPException(status_code=400, detail="Ação inválida. Use 'approve' ou 'reject'.")
    except UnauthorizedApprovalError as uae:
        raise HTTPException(status_code=403, detail=str(uae))
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@router.post("/api/v1/system/kill-switch")
async def trigger_kill_switch(
    payload: KillSwitchRequest,
    principal: Principal = Depends(require_permission("security:kill")),
):
    if payload.target == "global":
        security_core.kill_switch.trigger_global_kill(reason=payload.reason)
        if security_core.audit:
            security_core.audit.record_event(
                operation="KILL_SWITCH_TRIGGERED",
                status="TRIGGERED",
                user_id=principal.display_id,
                severity=AuditEventSeverity.CRITICAL,
                reason=payload.reason,
                parameters={"target": payload.target, "actor": principal.display_id},
            )
        return {"status": "global_kill_activated"}
    elif payload.target == "task":
        if not payload.task_id:
            raise HTTPException(
                status_code=400, detail="task_id é obrigatório para cancelar tarefa."
            )
        security_core.kill_switch.cancel_task(payload.task_id, reason=payload.reason)
        if security_core.audit:
            security_core.audit.record_event(
                operation="KILL_SWITCH_TASK_CANCELLED",
                status="CANCELLED",
                user_id=principal.display_id,
                severity=AuditEventSeverity.WARNING,
                reason=payload.reason,
                parameters={"task_id": payload.task_id, "actor": principal.display_id},
            )
        return {"status": "task_cancelled", "task_id": payload.task_id}
    else:
        raise HTTPException(status_code=400, detail="Alvo inválido.")


@router.get("/api/v1/security/cyber-shield-status")
async def get_cyber_shield_status(
    principal: Principal = Depends(require_permission("security:read")),
):
    """Retorna o status consolidado de blindagem cibernética do JARVIS."""
    return cyber_shield.get_security_status()


@router.post("/api/v1/security/network-isolation")
async def toggle_network_isolation_endpoint(
    payload: NetworkIsolationPayload,
    principal: Principal = Depends(require_admin),
):
    """Ativa ou desativa o corte total de conexões externas de rede."""
    return cyber_shield.toggle_network_isolation(payload.isolated, reason=payload.reason)


@router.post("/api/v1/mobile/pair")
async def pair_mobile_device(
    payload: DevicePairRequest,
    principal: Principal = Depends(require_permission("mobile:pair")),
):
    if principal.kind != "human":
        raise HTTPException(status_code=403, detail="Apenas uma conta humana pode emparelhar dispositivos.")
    try:
        reg = security_core.device_auth.pair_device(
            device_name=payload.device_name,
            scopes=payload.scopes,
            created_by=principal.display_id,
            owner_user_id=principal.subject_id,
        )
        return {
            "status": "paired",
            "device_id": reg.device_id,
            "device_name": reg.device_name,
            "device_token": reg.device_token,
            "scopes": reg.scopes,
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@router.get("/api/v1/mobile/devices")
async def list_mobile_devices(
    principal: Principal = Depends(require_admin),
):
    return [d.public_dict() for d in security_core.device_auth.list_devices()]


@router.post("/api/v1/mobile/revoke")
async def revoke_mobile_device(
    payload: DeviceRevokeRequest,
    principal: Principal = Depends(require_admin),
):
    try:
        revoked = security_core.device_auth.revoke_device(
            payload.device_id,
            reason=payload.reason or "Revogação pelo utilizador",
            revoked_by=principal.display_id,
        )
        return {"status": "revoked", "device_id": revoked.device_id}
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@router.get("/api/v1/audit/logs")
@router.get("/api/v1/security/audit-logs")
async def list_audit_logs_endpoint(
    limit: int = 50,
    offset: int = 0,
    severity: str | None = None,
    principal: Principal = Depends(require_permission("audit:read")),
):
    """Retorna eventos registrados na trilha de auditoria inviolável do sistema."""
    # A trilha é partilhada pelo runtime, mas cada conta só recebe eventos
    # cuja identidade de origem corresponde ao principal autenticado.
    allowed_actors = {principal.subject_id, principal.display_id}
    events = [
        event for event in security_core.audit.list_events()
        if getattr(event, "user_id", None) in allowed_actors
    ]
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
async def scan_project_cves_endpoint(
    project_id: str, principal: Principal = Depends(get_principal)
):
    """Varre dependências apenas de projetos pertencentes à conta."""
    owner = _approval_owner(principal)
    if not db_manager.get_project(project_id, owner_user_id=owner):
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    try:
        proj_dir = workspace_service.get_project_dir(project_id)
        return security_core.cve_scanner.scan_project_dependencies(proj_dir)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/v1/security/red-team/{project_id}")
async def red_team_audit_endpoint(
    project_id: str, principal: Principal = Depends(get_principal)
):
    """Executa auditoria apenas em projetos pertencentes à conta."""
    owner = _approval_owner(principal)
    if not db_manager.get_project(project_id, owner_user_id=owner):
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    try:
        proj_dir = workspace_service.get_project_dir(project_id)
        return security_core.red_team.run_security_audit(proj_dir)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/api/v1/security/policy-templates")
async def list_security_policy_templates(
    principal: Principal = Depends(require_permission("security:read")),
):
    """Retorna templates de cabeçalhos de segurança, CSP e CORS estrito prontos para implantação."""
    return security_core.policy_generator.get_available_templates()


@router.post("/api/v1/security/apply-policy")
async def apply_security_policy_endpoint(
    payload: ApplySecurityPolicyPayload,
    principal: Principal = Depends(get_principal),
):
    """Aplica o template de política de segurança diretamente no diretório do projeto com governança de aprovação."""
    try:
        owner = _approval_owner(principal)
        if not db_manager.get_project(payload.project_id, owner_user_id=owner):
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")
        proj_dir = workspace_service.get_project_dir(payload.project_id)
        if not proj_dir.exists() or not proj_dir.is_dir():
            raise HTTPException(status_code=404, detail=f"Projeto '{payload.project_id}' não encontrado.")

        # Garante registro no PermissionEngine para validação estrita de caminho
        if payload.project_id not in security_core.permission_engine._project_allowlists:
            security_core.permission_engine.register_project(
                project_id=payload.project_id,
                root_path=str(proj_dir),
            )

        templates = {t["id"]: t for t in security_core.policy_generator.get_available_templates()}
        tmpl = templates.get(payload.template_id)
        if not tmpl:
            raise HTTPException(status_code=404, detail="Template de política não encontrado.")

        target_file = security_core.permission_engine.validate_path_access(
            payload.project_id, tmpl["filename"]
        )
        old_content = target_file.read_text(encoding="utf-8", errors="replace") if target_file.is_file() else ""
        diff = "".join(difflib.unified_diff(
            old_content.splitlines(keepends=True),
            tmpl["code"].splitlines(keepends=True),
            fromfile=f"a/{tmpl['filename']}",
            tofile=f"b/{tmpl['filename']}",
        ))
        task_id = f"security-policy:{payload.project_id}:{payload.template_id}"
        owner = _approval_owner(principal)
        if not payload.approval_id:
            approval = security_core.approval_engine.create_request(
                task_id=task_id,
                agent_role=AgentRole.API_SECURITY_SPECIALIST.value,
                operation="file_write",
                impact_summary=f"Aplicar o template '{tmpl['title']}' no arquivo '{tmpl['filename']}'.",
                affected_resources=[str(target_file)],
                proposed_diff=diff,
                reversible=True,
                owner_user_id=owner,
            )
            return {
                "status": "approval_required",
                "approval_id": approval.id,
                "file": tmpl["filename"],
                "path": str(target_file),
                "impact_summary": approval.impact_summary,
                "diff": diff,
            }
        approval = security_core.approval_engine.get_request(
            payload.approval_id, owner_user_id=owner
        )
        if (
            not approval
            or approval.status != ApprovalStatus.APPROVED
            or approval.operation != "file_write"
            or approval.task_id != task_id
            or str(target_file) not in approval.affected_resources
        ):
            raise PermissionDeniedError("Aprovação não correspondente ou não aprovada.")
        await tool_gateway.execute_tool(ToolExecutionRequest(
            tool_name="write_file",
            arguments={"path": tmpl["filename"], "content": tmpl["code"]},
            agent_role=AgentRole.API_SECURITY_SPECIALIST.value,
            project_id=payload.project_id,
            task_id=task_id,
            approval_id=payload.approval_id,
        ))
        security_core.audit.record_event(
            operation="APPLY_SECURITY_POLICY",
            user_id=principal.display_id,
            project_id=payload.project_id,
            tool_name="write_file",
            status="SUCCESS",
            parameters={"project_id": payload.project_id, "template_id": payload.template_id, "target_file": str(target_file)},
        )
        return {
            "status": "applied",
            "file": tmpl["filename"],
            "path": str(target_file),
            "message": f"Política '{tmpl['title']}' aplicada com sucesso.",
        }
    except HTTPException:
        raise
    except PermissionDeniedError as pde:
        raise HTTPException(status_code=403, detail=str(pde))
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=404, detail=str(fnf))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
