"""
JARVIS AI HUB - DevSecOps: Gerador de Políticas de Segurança e Hardening
Gera cabeçalhos de proteção HTTP (Security Headers), Content-Security-Policy (CSP) robusta,
CORS restrito e HSTS para frameworks populares:
- FastAPI / Starlette (Python)
- Express.js / Helmet (Node.js)
- Nginx (Reverse Proxy)
"""

import logging
from typing import Any

logger = logging.getLogger("jarvis.policy_generator")


class SecurityPolicyGenerator:
    def __init__(self, workspace_service: Any = None):
        self.workspace_service = workspace_service

    def generate_fastapi_policy(
        self,
        allowed_origins: list[str] | None = None,
        enable_hsts: bool = True,
    ) -> str:
        """Gera snippet de middleware FastAPI com CORS restrito e Security Headers."""
        origins = allowed_origins or ["http://127.0.0.1:3000", "http://localhost:3000"]
        origins_repr = ", ".join(f'"{o}"' for o in origins)
        hsts_header = (
            '\n    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"'
            if enable_hsts
            else ""
        )

        return f'''# JARVIS Hardened Security Middleware para FastAPI
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

def apply_security_hardening(app: FastAPI) -> None:
    # 1. CORS Estrito (Sem wildcard '*' em ambientes com autenticação)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[{origins_repr}],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["*"],
    )

    # 2. Security Headers & CSP
    class SecurityHeadersMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            response = await call_next(request)
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-XSS-Protection"] = "1; mode=block"
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-eval'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https:; "
                "connect-src 'self' http://127.0.0.1:* http://localhost:*"
            ){hsts_header}
            return response

    app.add_middleware(SecurityHeadersMiddleware)
'''

    def generate_express_policy(
        self,
        allowed_origins: list[str] | None = None,
    ) -> str:
        """Gera middleware de proteção para Node.js / Express com Helmet e CORS."""
        origins = allowed_origins or ["http://127.0.0.1:3000", "http://localhost:3000"]
        origins_repr = ", ".join(f"'{o}'" for o in origins)

        return f'''// JARVIS Hardened Security Middleware para Express.js
// Requer: npm install helmet cors
const helmet = require('helmet');
const cors = require('cors');

function applySecurityHardening(app) {{
  // 1. CORS Estrito
  const allowedOrigins = [{origins_repr}];
  app.use(cors({{
    origin: (origin, callback) => {{
      if (!origin || allowedOrigins.includes(origin)) {{
        callback(null, true);
      }} else {{
        callback(new Error('Bloqueado pela política CORS restrita JARVIS'));
      }}
    }},
    credentials: true,
  }}));

  // 2. Helmet Security Headers & CSP
  app.use(helmet({{
    contentSecurityPolicy: {{
      directives: {{
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "http://127.0.0.1:*", "http://localhost:*"],
      }},
    }},
    crossOriginEmbedderPolicy: false,
    frameguard: {{ action: 'deny' }},
    hsts: {{ maxAge: 31536000, includeSubDomains: true }},
  }}));
}}

module.exports = {{ applySecurityHardening }};
'''

    def generate_nginx_policy(
        self,
        allowed_origins: list[str] | None = None,
    ) -> str:
        """Gera bloco de configuração Nginx com headers seguros."""
        return '''# JARVIS Hardened Security Configuration para Nginx
# Adicione este bloco dentro do seu server { ... } ou location / { ... }

# Previne Clickjacking
add_header X-Frame-Options "DENY" always;

# Previne MIME-type sniffing
add_header X-Content-Type-Options "nosniff" always;

# Filtro XSS no navegador
add_header X-XSS-Protection "1; mode=block" always;

# Controle de Referrer
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

# HSTS (Apenas para conexões HTTPS ativas)
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# Content Security Policy (CSP)
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://127.0.0.1:*;" always;
'''

    def get_available_templates(self) -> list[dict[str, Any]]:
        """Retorna lista de templates prontos com instruções e código."""
        return [
            {
                "id": "fastapi_headers",
                "framework": "FastAPI (Python)",
                "title": "Middleware Starlette / FastAPI Blindado",
                "filename": "security_headers.py",
                "code": self.generate_fastapi_policy(),
                "description": "Adiciona CSP, proteção contra Clickjacking (DENY), HSTS e CORS com origens estritas.",
            },
            {
                "id": "express_helmet",
                "framework": "Express.js (Node.js)",
                "title": "Middleware Helmet & CORS Estrito",
                "filename": "security.js",
                "code": self.generate_express_policy(),
                "description": "Utiliza Helmet e CORS para blindar rotas Node.js contra XSS, Clickjacking e CSRF.",
            },
            {
                "id": "nginx_hardening",
                "framework": "Nginx",
                "title": "Configuração de Cabeçalhos Nginx",
                "filename": "security_headers.conf",
                "code": self.generate_nginx_policy(),
                "description": "Headers de resposta de nível de servidor web para Nginx reverse proxy.",
            },
        ]
