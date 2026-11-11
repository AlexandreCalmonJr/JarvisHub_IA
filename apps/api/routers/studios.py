import asyncio
import json
import logging
from fastapi import APIRouter, HTTPException, Request, Response

from apps.api.schemas import (
    MockEndpointPayload,
    SQLQueryPayload,
    SQLInspectPayload,
    SQLAuditPayload,
    RunTestsPayload,
    GeneratePlaywrightPayload,
    ColorPalettePayload,
    WcagAuditPayload,
)
from apps.api.deps import (
    mock_server_service,
    sql_playground_service,
    quality_studio_service,
    design_studio_service,
    engineering_intelligence_service,
    workspace_service,
)

logger = logging.getLogger("jarvis.api.studios")
router = APIRouter(tags=["studios"])


# --- MOCK SERVER NATIVO ---

@router.get("/api/v1/mock-server/endpoints")
async def list_mock_endpoints():
    """Lista todos os endpoints simulados cadastrados no Mock Server."""
    return mock_server_service.list_endpoints()


@router.post("/api/v1/mock-server/endpoints")
async def create_or_update_mock_endpoint(payload: MockEndpointPayload):
    """Cria ou atualiza um mock endpoint com payload JSON customizado."""
    return mock_server_service.create_or_update_endpoint(payload.model_dump())


@router.delete("/api/v1/mock-server/endpoints/{endpoint_id}")
async def delete_mock_endpoint(endpoint_id: str):
    """Exclui um mock endpoint cadastrado."""
    deleted = mock_server_service.delete_endpoint(endpoint_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Mock endpoint não encontrado.")
    return {"status": "deleted", "id": endpoint_id}


@router.api_route(
    "/api/v1/mock/{mock_path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
)
async def serve_mock_route(mock_path: str, request: Request):
    """Roteador coringa do Mock Server nativo que atende requisições simuladas."""
    clean_path = f"/{mock_path}" if not mock_path.startswith("/") else mock_path
    mock_res = mock_server_service.match_and_serve(request.method, clean_path)
    if not mock_res and not clean_path.startswith("/api/"):
        mock_res = mock_server_service.match_and_serve(request.method, f"/api/{mock_path.lstrip('/')}")

    if not mock_res:
        raise HTTPException(
            status_code=404,
            detail=f"Mock endpoint '{request.method} {clean_path}' não configurado ou inativo no Backend Studio.",
        )

    latency = mock_res.get("latency_ms", 0)
    if latency > 0:
        await asyncio.sleep(min(latency, 10000) / 1000.0)

    body = mock_res.get("body", {})
    body_str = json.dumps(body, ensure_ascii=False) if not isinstance(body, str) else body
    headers = mock_res.get("headers", {})
    return Response(
        content=body_str,
        status_code=mock_res.get("status_code", 200),
        headers=headers,
        media_type="application/json",
    )


# --- SQL PLAYGROUND ---

@router.get("/api/v1/backend-studio/databases/{project_id}")
async def list_project_databases(project_id: str):
    """Descobre e lista bancos de dados SQLite no workspace do projeto."""
    return sql_playground_service.find_project_databases(project_id)


@router.post("/api/v1/backend-studio/sql/inspect")
async def inspect_sql_database(payload: SQLInspectPayload):
    """Inspeciona tabelas, colunas, chaves e contagens de um banco de dados SQLite."""
    try:
        return sql_playground_service.inspect_database(payload.db_path, payload.project_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/v1/backend-studio/sql/query")
async def execute_sql_query(payload: SQLQueryPayload):
    """Executa consulta SQL com medição precisa de tempo em milissegundos."""
    try:
        return sql_playground_service.execute_query(
            db_path=payload.db_path,
            query=payload.query,
            project_id=payload.project_id,
            limit=payload.limit,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/v1/backend-studio/sql/audit")
async def audit_sql_query(payload: SQLAuditPayload):
    """Audita o plano de execução da query (EXPLAIN QUERY PLAN) e sugere índices de otimização."""
    try:
        return sql_playground_service.audit_query_performance(
            db_path=payload.db_path,
            query=payload.query,
            project_id=payload.project_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# --- QUALITY STUDIO ---

@router.get("/api/v1/quality-studio/tests/{project_id}")
async def discover_project_tests_endpoint(project_id: str):
    """Descobre e lista suítes de testes existentes no projeto."""
    try:
        return quality_studio_service.discover_project_tests(project_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/v1/quality-studio/run")
async def run_project_tests_endpoint(payload: RunTestsPayload):
    """Executa a suíte de testes do projeto em sandbox local com timeout de segurança."""
    try:
        return quality_studio_service.run_tests(
            project_id=payload.project_id,
            test_file=payload.test_file,
            timeout_seconds=payload.timeout_seconds,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/v1/quality-studio/generate-playwright")
async def generate_playwright_test_endpoint(payload: GeneratePlaywrightPayload):
    """Gera script automatizado E2E em Playwright para validação visual e de fluxo."""
    code = quality_studio_service.generate_e2e_playwright_test(
        target_url=payload.target_url,
        scenario_name=payload.scenario_name,
        steps=payload.steps,
    )
    return {
        "status": "generated",
        "scenario": payload.scenario_name,
        "code": code,
        "filename": f"test_{payload.scenario_name}_e2e.py",
    }


@router.get("/api/v1/quality-studio/chaos-edge-cases")
async def get_chaos_edge_cases_endpoint():
    """Retorna conjunto de casos de borda e testes de estresse (Chaos Testing)."""
    return quality_studio_service.generate_chaos_edge_cases()


# --- DESIGN STUDIO ---

@router.post("/api/v1/design-studio/palette")
async def extract_color_palette_endpoint(payload: ColorPalettePayload):
    """Gera paleta de cores harmônica, contrastes e variáveis CSS/Tailwind a partir de cor primária."""
    return design_studio_service.extract_color_palette(
        hex_primary=payload.hex_primary,
        name=payload.name,
    )


@router.post("/api/v1/design-studio/audit-wcag")
async def audit_wcag_accessibility_endpoint(payload: WcagAuditPayload):
    """Audita código HTML ou JSX contra padrões de acessibilidade WCAG 2.1."""
    return design_studio_service.audit_wcag_accessibility(payload.markup)


@router.get("/api/v1/design-studio/components/{component_type}")
async def get_component_boilerplate_endpoint(component_type: str):
    """Retorna código de componente React acessível e estilizado em Tailwind CSS."""
    return design_studio_service.generate_component_boilerplate(component_type)


# --- ENGINEERING INTELLIGENCE ---

@router.get("/api/v1/intelligence/tech-debt/{project_id}")
async def analyze_project_tech_debt_endpoint(project_id: str):
    """Calcula dívida técnica, complexidade ciclomática e nota de saúde do código."""
    try:
        proj_dir = workspace_service.get_project_dir(project_id)
        return engineering_intelligence_service.analyze_technical_debt(proj_dir)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/api/v1/intelligence/productivity-roi")
async def get_productivity_roi_endpoint():
    """Calcula economia em dólares de inferência local e horas poupadas de engenharia."""
    return engineering_intelligence_service.calculate_productivity_and_roi()


@router.get("/api/v1/intelligence/executive-report", operation_id="get_intelligence_executive_report")
@router.get("/api/v1/reports/executive", operation_id="get_legacy_executive_report")
async def get_executive_report_endpoint(project_id: str | None = None):
    """Gera relatório executivo de governança e ROI estruturado em Markdown e HTML."""
    return engineering_intelligence_service.generate_executive_report(project_id=project_id)
