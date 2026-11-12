import asyncio
import json
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from apps.api.auth import Principal, get_principal
from apps.api.deps import (
    db_manager,
    design_studio_service,
    engineering_intelligence_service,
    mock_server_service,
    quality_studio_service,
    sql_playground_service,
    workspace_service,
)
from apps.api.schemas import (
    ColorPalettePayload,
    GeneratePlaywrightPayload,
    MockEndpointPayload,
    RunTestsPayload,
    SQLAuditPayload,
    SQLInspectPayload,
    SQLQueryPayload,
    WcagAuditPayload,
)

logger = logging.getLogger("jarvis.api.studios")
router = APIRouter(tags=["studios"])


def _require_human(principal: Principal) -> str:
    if principal.kind != "human":
        raise HTTPException(status_code=403, detail="Esta operação exige uma conta humana.")
    return principal.subject_id


def _require_owned_project(project_id: str, principal: Principal) -> dict:
    owner_id = _require_human(principal)
    project = db_manager.get_project(project_id, owner_user_id=owner_id)
    if project is None:
        # Não revela se o projeto existe para outra conta.
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    return project


# --- MOCK SERVER NATIVO: endpoints e execuções privados por conta ---


@router.get("/api/v1/mock-server/endpoints")
async def list_mock_endpoints(principal: Principal = Depends(get_principal)):
    owner_id = _require_human(principal)
    return mock_server_service.list_endpoints(owner_id)


@router.post("/api/v1/mock-server/endpoints")
async def create_or_update_mock_endpoint(
    payload: MockEndpointPayload,
    principal: Principal = Depends(get_principal),
):
    owner_id = _require_human(principal)
    try:
        return mock_server_service.create_or_update_endpoint(payload.model_dump(), owner_id)
    except PermissionError as exc:
        raise HTTPException(status_code=404, detail="Mock endpoint não encontrado.") from exc
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/api/v1/mock-server/endpoints/{endpoint_id}")
async def delete_mock_endpoint(endpoint_id: str, principal: Principal = Depends(get_principal)):
    owner_id = _require_human(principal)
    deleted = mock_server_service.delete_endpoint(endpoint_id, owner_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Mock endpoint não encontrado.")
    return {"status": "deleted", "id": endpoint_id}


@router.api_route(
    "/api/v1/mock/{mock_path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"],
)
async def serve_mock_route(mock_path: str, request: Request):
    """Atende apenas o endpoint simulado pertencente à conta autenticada."""
    principal = getattr(request.state, "principal", None)
    if principal is None or principal.kind != "human":
        raise HTTPException(status_code=403, detail="Conta humana necessária para executar mocks.")
    clean_path = f"/{mock_path}" if not mock_path.startswith("/") else mock_path
    mock_res = mock_server_service.match_and_serve(request.method, clean_path, principal.subject_id)
    if not mock_res and not clean_path.startswith("/api/"):
        mock_res = mock_server_service.match_and_serve(
            request.method, f"/api/{mock_path.lstrip('/')}", principal.subject_id
        )
    if not mock_res:
        raise HTTPException(
            status_code=404,
            detail=f"Mock endpoint '{request.method} {clean_path}' não configurado ou inativo.",
        )
    latency = mock_res.get("latency_ms", 0)
    if latency > 0:
        await asyncio.sleep(min(latency, 10000) / 1000.0)
    body = mock_res.get("body", {})
    body_str = json.dumps(body, ensure_ascii=False) if not isinstance(body, str) else body
    headers = mock_res.get("headers", {})
    # Impede que uma configuração de mock injete cabeçalhos hop-by-hop ou de controle.
    safe_headers = {
        key: value
        for key, value in headers.items()
        if key.lower() not in {"connection", "transfer-encoding", "content-length", "set-cookie"}
    }
    return Response(
        content=body_str,
        status_code=mock_res.get("status_code", 200),
        headers=safe_headers,
        media_type="application/json",
    )


# --- SQL PLAYGROUND: acesso apenas a projetos da conta autenticada ---


@router.get("/api/v1/backend-studio/databases/{project_id}")
async def list_project_databases(project_id: str, principal: Principal = Depends(get_principal)):
    _require_owned_project(project_id, principal)
    return sql_playground_service.find_project_databases(project_id)


@router.post("/api/v1/backend-studio/sql/inspect")
async def inspect_sql_database(
    payload: SQLInspectPayload, principal: Principal = Depends(get_principal)
):
    if not payload.project_id:
        raise HTTPException(status_code=422, detail="project_id é obrigatório.")
    _require_owned_project(payload.project_id, principal)
    try:
        return sql_playground_service.inspect_database(payload.db_path, payload.project_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/v1/backend-studio/sql/query")
async def execute_sql_query(
    payload: SQLQueryPayload, principal: Principal = Depends(get_principal)
):
    if not payload.project_id:
        raise HTTPException(status_code=422, detail="project_id é obrigatório.")
    _require_owned_project(payload.project_id, principal)
    try:
        return sql_playground_service.execute_query(
            db_path=payload.db_path,
            query=payload.query,
            project_id=payload.project_id,
            limit=payload.limit,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/v1/backend-studio/sql/audit")
async def audit_sql_query(payload: SQLAuditPayload, principal: Principal = Depends(get_principal)):
    if not payload.project_id:
        raise HTTPException(status_code=422, detail="project_id é obrigatório.")
    _require_owned_project(payload.project_id, principal)
    try:
        return sql_playground_service.audit_query_performance(
            db_path=payload.db_path,
            query=payload.query,
            project_id=payload.project_id,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# --- QUALITY STUDIO ---


@router.get("/api/v1/quality-studio/tests/{project_id}")
async def discover_project_tests_endpoint(
    project_id: str, principal: Principal = Depends(get_principal)
):
    _require_owned_project(project_id, principal)
    try:
        return quality_studio_service.discover_project_tests(project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/v1/quality-studio/run")
async def run_project_tests_endpoint(
    payload: RunTestsPayload, principal: Principal = Depends(get_principal)
):
    if principal.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Execução de código requer administrador até existir isolamento de processo por conta.",
        )
    _require_owned_project(payload.project_id, principal)
    try:
        return await quality_studio_service.run_tests(
            project_id=payload.project_id,
            test_file=payload.test_file,
            timeout_seconds=payload.timeout_seconds,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/v1/quality-studio/generate-playwright")
async def generate_playwright_test_endpoint(
    payload: GeneratePlaywrightPayload, principal: Principal = Depends(get_principal)
):
    _require_human(principal)
    code = quality_studio_service.generate_e2e_playwright_test(
        target_url=payload.target_url,
        scenario_name=payload.scenario_name,
        steps=payload.steps,
    )
    safe_scenario = re.sub(r"[^A-Za-z0-9_]", "_", payload.scenario_name) or "cenario"
    return {
        "status": "generated",
        "scenario": safe_scenario,
        "code": code,
        "filename": f"test_{safe_scenario}_e2e.py",
    }


@router.get("/api/v1/quality-studio/chaos-edge-cases")
async def get_chaos_edge_cases_endpoint(principal: Principal = Depends(get_principal)):
    _require_human(principal)
    return quality_studio_service.generate_chaos_edge_cases()


# --- DESIGN STUDIO: operações determinísticas sem dados de projeto ---


@router.post("/api/v1/design-studio/palette")
async def extract_color_palette_endpoint(
    payload: ColorPalettePayload, principal: Principal = Depends(get_principal)
):
    _require_human(principal)
    try:
        return design_studio_service.extract_color_palette(
            hex_primary=payload.hex_primary, name=payload.name
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/api/v1/design-studio/audit-wcag")
async def audit_wcag_accessibility_endpoint(
    payload: WcagAuditPayload, principal: Principal = Depends(get_principal)
):
    _require_human(principal)
    return design_studio_service.audit_wcag_accessibility(payload.markup)


@router.get("/api/v1/design-studio/components/{component_type}")
async def get_component_boilerplate_endpoint(
    component_type: str, principal: Principal = Depends(get_principal)
):
    _require_human(principal)
    try:
        return design_studio_service.generate_component_boilerplate(component_type)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# --- ENGINEERING INTELLIGENCE ---


@router.get("/api/v1/intelligence/tech-debt/{project_id}")
async def analyze_project_tech_debt_endpoint(
    project_id: str, principal: Principal = Depends(get_principal)
):
    _require_owned_project(project_id, principal)
    try:
        proj_dir = workspace_service.get_project_dir(project_id)
        return engineering_intelligence_service.analyze_technical_debt(proj_dir)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/api/v1/intelligence/productivity-roi")
async def get_productivity_roi_endpoint(principal: Principal = Depends(get_principal)):
    if principal.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Métricas globais de produtividade estão disponíveis apenas para administradores.",
        )
    return engineering_intelligence_service.calculate_productivity_and_roi()


@router.get(
    "/api/v1/intelligence/executive-report", operation_id="get_intelligence_executive_report"
)
@router.get("/api/v1/reports/executive", operation_id="get_legacy_executive_report")
async def get_executive_report_endpoint(
    project_id: str | None = None, principal: Principal = Depends(get_principal)
):
    if project_id:
        _require_owned_project(project_id, principal)
    elif principal.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Relatórios globais estão disponíveis apenas para administradores. Selecione um projeto próprio.",
        )
    return engineering_intelligence_service.generate_executive_report(
        project_id=project_id,
        owner_user_id=principal.subject_id if project_id else None,
    )
