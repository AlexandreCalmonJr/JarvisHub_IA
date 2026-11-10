import logging
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from services.observability import attach_server_logging

# Importa singletons e serviços centrais de apps.api.deps
from apps.api.deps import (
    db_manager,
    model_manager,
    security_core,
    skills_catalog,
    workspace_service,
    knowledge_vault_service,
    webhook_service,
    resolve_frontend_dist,
    logger,
)

# Importa schemas comuns para re-exportação
from apps.api.schemas import ChatRequest

# Importa roteadores modulares (Clean Architecture)
from apps.api.routers import (
    chat,
    workspace,
    models,
    hardware,
    agents,
    skills,
    knowledge,
    security,
    studios,
    system,
    coding,
    mcp,
    voice,
)

# Inicialização central do FastAPI
app = FastAPI(
    title="JARVIS AI HUB 3.0",
    version="3.0.0",
    description="Backend central REST e WebSocket para orquestração de 26 agentes especializados local-first",
)

# Configuração de CORS permissivo para desenvolvimento e produção local
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Conecta buffer circular de observabilidade e logs em tempo real
attach_server_logging()

# Inclusão dos roteadores de domínio desacoplados
app.include_router(system.router)
app.include_router(chat.router)
app.include_router(workspace.router)
app.include_router(models.router)
app.include_router(hardware.router)
app.include_router(agents.router)
app.include_router(skills.router)
app.include_router(knowledge.router)
app.include_router(security.router)
app.include_router(studios.router)
app.include_router(coding.router)
app.include_router(mcp.router)
app.include_router(voice.router)

# Monta aplicativo mobile Flutter (PWA) se compilado
mobile_dist = Path("apps/mobile/build/web")
if mobile_dist.exists():
    @app.get("/mobile")
    async def redirect_mobile():
        return RedirectResponse(url="/mobile/")

    app.mount("/mobile", StaticFiles(directory=str(mobile_dist), html=True), name="mobile_app")

# Monta dashboard web React estático com suporte total a rotas SPA (Single Page Application)
react_dist = resolve_frontend_dist()
if react_dist and (react_dist / "index.html").exists():
    index_file = react_dist / "index.html"

    # Rotas declarativas do painel para navegação direta e bookmarks sem erro 404
    spa_routes = [
        "/studio",
        "/chat",
        "/office",
        "/workspace",
        "/tasks",
        "/agents",
        "/skills",
        "/models",
        "/advisor",
        "/server_logs",
        "/approvals",
        "/security",
        "/overview",
        "/backend_studio",
        "/quality",
        "/design",
        "/intelligence",
        "/coding",
    ]

    no_cache_headers = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
    }

    for route_path in spa_routes:
        @app.get(route_path, include_in_schema=False)
        async def serve_spa_route():
            return FileResponse(index_file, headers=no_cache_headers)

    class SPAStaticFiles(StaticFiles):
        async def get_response(self, path: str, scope):
            response = await super().get_response(path, scope)
            if response.status_code == 404 and not path.startswith("api/") and not path.startswith("mobile/"):
                fallback_resp = await super().get_response("index.html", scope)
                for k, v in no_cache_headers.items():
                    fallback_resp.headers[k] = v
                return fallback_resp
            if path in ("", "index.html"):
                for k, v in no_cache_headers.items():
                    response.headers[k] = v
            return response

    logger.info("Painel React/Vite montado com SPA fallback na rota raiz / a partir de %s", react_dist)
    app.mount("/", SPAStaticFiles(directory=str(react_dist), html=True), name="dashboard")
elif react_dist:
    logger.info("Painel React/Vite montado na rota raiz / a partir de %s", react_dist)
    app.mount("/", StaticFiles(directory=str(react_dist), html=True), name="dashboard")
else:
    logger.warning("Bundle do React não localizado. Verifique se o comando 'npm run build' foi executado.")

    @app.get("/", response_class=HTMLResponse)
    async def fallback_home():
        return HTMLResponse(
            """<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>JARVIS AI Hub — Conectado</title>
            <style>
            body { background: #070a12; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 16px; box-sizing: border-box; }
            .card { background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255, 255, 255, 0.1); padding: 40px; border-radius: 16px; text-align: center; max-width: 520px; box-shadow: 0 10px 40px rgba(0,0,0,0.6); }
            .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 0.78rem; font-weight: 600; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; margin-bottom: 16px; }
            h1 { color: #818cf8; font-size: 1.6rem; margin: 0 0 12px 0; font-weight: 700; letter-spacing: -0.02em; }
            p { color: #94a3b8; line-height: 1.6; font-size: 0.92rem; margin: 0 0 24px 0; }
            .btn { background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); color: #fff; border: none; padding: 12px 28px; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 0.9rem; transition: opacity 0.2s; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4); }
            .btn:hover { opacity: 0.9; }
            </style></head><body>
            <div class="card">
            <div class="badge">● Backend Operacional</div>
            <h1>JARVIS AI HUB — Conectado</h1>
            <p>O monólito modular está 100% ativo e sincronizado. Clique abaixo para recarregar o estúdio interativo.</p>
            <button class="btn" onclick="window.location.reload()">Carregar Painel do Usuário</button>
            </div></body></html>"""
        )

# Re-exportações para retrocompatibilidade com scripts de automação e testes
__all__ = [
    "app",
    "db_manager",
    "model_manager",
    "security_core",
    "skills_catalog",
    "workspace_service",
    "knowledge_vault_service",
    "webhook_service",
    "ChatRequest",
]
