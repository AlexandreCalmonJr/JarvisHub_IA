"""
Camada central de autenticação e autorização HTTP do JARVIS AI HUB.

Princípios:
- Fail-closed: tudo em /api exige credencial, exceto uma allowlist mínima.
- A identidade vem sempre do servidor (sessão, dispositivo ou token admin).
- Nenhum papel de agente é autenticável; agentes não podem autoaprovar.
- Sem bypass por IP/localhost.
"""

from __future__ import annotations

import logging
import os
import re
import secrets
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from apps.api.deps import data_dir, security_core
from packages.contracts.security import AuditEventSeverity
from services.security_core.auth_store import AdminCredentialStore

logger = logging.getLogger("jarvis.api.auth")

SESSION_COOKIE = "jarvis_session"
BOOTSTRAP_TTL_SECONDS = 60

# Rotas públicas mínimas e explícitas.
PUBLIC_ROUTES: set[tuple[str, str]] = {
    ("GET", "/api"),
    ("GET", "/api/v1/system/health"),
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/bootstrap/exchange"),
}

ALLOWED_HUMAN_ROLES = {"admin", "developer", "auditor"}
ALLOWED_DEVICE_SCOPES = {
    "chat:read",
    "chat:use",
    "tasks:read",
    "approvals:read",
    "approvals:decide",
    "system:read",
    "coding:use",
    "security:kill",
}

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "admin": {"*"},
    "developer": {
        "chat:read",
        "chat:use",
        "tasks:read",
        "tasks:write",
        "coding:read",
        "coding:use",
        "coding:write",
        "workspace:read",
        "workspace:write",
        "agents:read",
        "agents:write",
        "agents:use",
        "models:read",
        "models:write",
        "skills:read",
        "skills:write",
        "knowledge:read",
        "knowledge:write",
        "studios:read",
        "studios:use",
        "approvals:read",
        "approvals:decide",
        "security:read",
        "security:scan",
        "audit:read",
        "system:read",
        "system:logs",
        "hardware:read",
        "hardware:write",
        "mcp:read",
        "mcp:reload",
        "voice:use",
        "profile:read",
        "profile:write",
    },
    "auditor": {
        "chat:read",
        "tasks:read",
        "coding:read",
        "workspace:read",
        "agents:read",
        "models:read",
        "skills:read",
        "knowledge:read",
        "studios:read",
        "approvals:read",
        "security:read",
        "audit:read",
        "system:read",
        "system:logs",
        "hardware:read",
        "mcp:read",
        "profile:read",
    },
}

# (métodos, regex do caminho, permissão exigida)
# A ordem importa: regras específicas primeiro.
PERMISSION_RULES: list[tuple[set[str], re.Pattern[str], str]] = [
    # Segurança / operações críticas
    ({"POST"}, re.compile(r"^/api/v1/system/kill-switch$"), "security:kill"),
    ({"GET", "POST", "DELETE"}, re.compile(r"^/api/v1/mobile/.*$"), "mobile:manage"),
    ({"GET"}, re.compile(r"^/api/v1/approvals$"), "approvals:read"),
    ({"POST"}, re.compile(r"^/api/v1/approvals/[^/]+/decide$"), "approvals:decide"),
    ({"GET"}, re.compile(r"^/api/v1/coding/approvals$"), "approvals:read"),
    ({"POST"}, re.compile(r"^/api/v1/coding/approvals/[^/]+/decide$"), "approvals:decide"),
    ({"GET"}, re.compile(r"^/api/v1/audit/.*$"), "audit:read"),
    ({"GET"}, re.compile(r"^/api/v1/security/audit-logs$"), "audit:read"),
    ({"GET"}, re.compile(r"^/api/v1/security/cyber-shield-status$"), "security:read"),
    ({"POST"}, re.compile(r"^/api/v1/security/network-isolation$"), "security:write"),
    ({"GET"}, re.compile(r"^/api/v1/security/policy-templates$"), "security:read"),
    ({"POST"}, re.compile(r"^/api/v1/security/apply-policy$"), "security:write"),
    ({"POST"}, re.compile(r"^/api/v1/security/scan-cves/.*$"), "security:scan"),
    ({"POST"}, re.compile(r"^/api/v1/security/red-team/.*$"), "security:scan"),
    # Sistema
    ({"GET"}, re.compile(r"^/api/v1/system/health/details$"), "system:read"),
    ({"GET"}, re.compile(r"^/api/v1/system/server-logs(?:/stream)?$"), "system:logs"),
    ({"POST"}, re.compile(r"^/api/v1/system/server-logs/clear$"), "system:write"),
    ({"GET"}, re.compile(r"^/api/v1/system/resources$"), "system:read"),
    ({"POST"}, re.compile(r"^/api/v1/system/backup$"), "system:write"),
    ({"GET"}, re.compile(r"^/api/v1/system/webhooks$"), "system:read"),
    ({"POST"}, re.compile(r"^/api/v1/system/webhooks(?:/test)?$"), "system:write"),
    ({"GET"}, re.compile(r"^/api/v1/system/model-metrics$"), "models:read"),
    ({"GET"}, re.compile(r"^/api/v1/system/hardware-profile$"), "hardware:read"),
    (
        {"POST"},
        re.compile(r"^/api/v1/system/apply-hardware-optimizations$"),
        "hardware:write",
    ),
    # Hardware
    ({"GET"}, re.compile(r"^/api/v1/hardware/.*$"), "hardware:read"),
    ({"POST"}, re.compile(r"^/api/v1/hardware/.*$"), "hardware:write"),
    # Modelos
    ({"GET", "POST", "DELETE"}, re.compile(r"^/api/v1/models/vault(?:/.*)?$"), "models:vault"),
    ({"POST"}, re.compile(r"^/api/v1/models/huggingface/install$"), "models:write"),
    ({"POST"}, re.compile(r"^/api/v1/models/hybrid-config(?:/.*)?$"), "models:write"),
    ({"GET"}, re.compile(r"^/api/v1/models.*$"), "models:read"),
    # Skills
    ({"GET"}, re.compile(r"^/api/v1/skills.*$"), "skills:read"),
    ({"POST", "DELETE"}, re.compile(r"^/api/v1/skills.*$"), "skills:write"),
    # Agentes e ferramentas
    (
        {"POST"},
        re.compile(r"^/api/v1/agents/[^/]+/(?:playground|stream|task)$"),
        "agents:use",
    ),
    ({"POST", "PUT", "DELETE"}, re.compile(r"^/api/v1/agents/.*$"), "agents:write"),
    ({"GET"}, re.compile(r"^/api/v1/agents.*$"), "agents:read"),
    ({"GET"}, re.compile(r"^/api/v1/tools$"), "agents:read"),
    ({"POST"}, re.compile(r"^/api/v1/tools/execute$"), "agents:use"),
    # Workspace
    ({"GET"}, re.compile(r"^/api/v1/workspace.*$"), "workspace:read"),
    ({"POST", "DELETE"}, re.compile(r"^/api/v1/workspace.*$"), "workspace:write"),
    # Chat e tarefas
    ({"GET"}, re.compile(r"^/api/v1/chat.*$"), "chat:read"),
    ({"POST"}, re.compile(r"^/api/v1/chat.*$"), "chat:use"),
    ({"GET"}, re.compile(r"^/api/v1/tasks$"), "tasks:read"),
    ({"POST", "DELETE"}, re.compile(r"^/api/v1/tasks.*$"), "tasks:write"),
    # Coding
    ({"GET"}, re.compile(r"^/api/v1/coding.*$"), "coding:read"),
    ({"POST"}, re.compile(r"^/api/v1/coding/run/stream$"), "coding:use"),
    ({"POST"}, re.compile(r"^/api/v1/coding.*$"), "coding:write"),
    ({"DELETE"}, re.compile(r"^/api/v1/coding.*$"), "coding:write"),
    # Conhecimento
    ({"GET"}, re.compile(r"^/api/v1/knowledge.*$"), "knowledge:read"),
    ({"POST"}, re.compile(r"^/api/v1/knowledge/search$"), "knowledge:read"),
    ({"POST", "DELETE"}, re.compile(r"^/api/v1/knowledge.*$"), "knowledge:write"),
    # MCP
    ({"GET"}, re.compile(r"^/api/v1/mcp/status$"), "mcp:read"),
    ({"POST"}, re.compile(r"^/api/v1/mcp/reload$"), "mcp:reload"),
    # Voz
    ({"POST"}, re.compile(r"^/api/v1/voice/.*$"), "voice:use"),
    # Studios
    ({"GET"}, re.compile(r"^/api/v1/(?:mock-server|backend-studio|quality-studio|design-studio|intelligence|reports).*$"), "studios:read"),
    ({"POST", "DELETE"}, re.compile(r"^/api/v1/(?:mock-server|backend-studio|quality-studio|design-studio|intelligence|reports).*$"), "studios:use"),
    # Perfil
    ({"GET"}, re.compile(r"^/api/v1/user/profile$"), "profile:read"),
    ({"POST"}, re.compile(r"^/api/v1/user/profile$"), "profile:write"),
]


@dataclass(frozen=True)
class Principal:
    subject_id: str
    kind: str  # "human" | "device"
    role: str
    scopes: frozenset[str] = field(default_factory=frozenset)
    session_id: str | None = None
    device_id: str | None = None
    device_name: str | None = None
    via_admin_token: bool = False

    @property
    def is_device(self) -> bool:
        return self.kind == "device"

    @property
    def display_id(self) -> str:
        if self.kind == "device":
            return f"device:{self.device_id}"
        return self.subject_id

    def has(self, permission: str) -> bool:
        if self.role == "admin" or "*" in self.scopes:
            return True
        if self.kind == "device":
            return permission in self.scopes
        return permission in ROLE_PERMISSIONS.get(self.role, set())

    def to_dict(self) -> dict:
        return {
            "subject_id": self.subject_id,
            "kind": self.kind,
            "role": self.role,
            "scopes": sorted(self.scopes),
            "session_id": self.session_id,
            "device_id": self.device_id,
            "device_name": self.device_name,
        }


def required_permission(method: str, path: str) -> str | None:
    method = method.upper()
    for methods, pattern, permission in PERMISSION_RULES:
        if method in methods and pattern.match(path):
            return permission
    return None


def write_private_file(path: Path, content: str) -> Path:
    """Grava um segredo num arquivo com permissões restritas (best-effort por SO).

    O valor nunca é enviado para stdout/logs. No Windows, remove a herança de ACL
    e concede acesso apenas ao utilizador atual. Em POSIX, aplica modo 0600.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(content.rstrip("\n") + "\n", encoding="utf-8")
    try:
        os.chmod(tmp_path, 0o600)
    except OSError:
        pass
    os.replace(tmp_path, path)
    if os.name == "nt":
        username = os.environ.get("USERNAME") or os.environ.get("USER")
        if username:
            try:
                subprocess.run(
                    [
                        "icacls",
                        str(path),
                        "/inheritance:r",
                        "/grant:r",
                        f"{username}:F",
                    ],
                    check=False,
                    capture_output=True,
                    timeout=10,
                )
            except (OSError, subprocess.SubprocessError):
                pass
    return path


class AuthService:
    def __init__(self, security, auth_dir: Path):
        self.security = security
        self.auth_dir = Path(auth_dir)
        self.auth_dir.mkdir(parents=True, exist_ok=True)
        self.admin_store = AdminCredentialStore(self.auth_dir / "admin.json")
        self.admin_token_path = self.auth_dir / "admin_token.txt"
        self.bootstrap_token_path = self.auth_dir / "bootstrap_token.txt"
        self._bootstrap_tokens: dict[str, float] = {}
        self._attempts: dict[str, list[float]] = {}
        self._ensure_admin_credential()
        # Emite um bootstrap token de uso único no arranque, entregue apenas por
        # arquivo restrito. O launcher lê o arquivo e troca-o por uma sessão.
        if os.environ.get("JARVIS_ISSUE_BOOTSTRAP", "1").strip().lower() not in {
            "0",
            "false",
            "no",
        }:
            self.issue_bootstrap_token()

    # ------------------------------------------------------------------
    # Bootstrap / admin
    # ------------------------------------------------------------------
    def _ensure_admin_credential(self) -> None:
        env_token = os.environ.get("JARVIS_ADMIN_TOKEN", "").strip()
        if env_token:
            if not self.admin_store.verify(env_token):
                self.admin_store.set_token(env_token)
            return
        if not self.admin_store.has_credential:
            token = self.admin_store.generate_token()
            path = write_private_file(self.admin_token_path, token)
            logger.warning(
                "Credencial de administrador criada. O token foi gravado em arquivo "
                "restrito (%s) e nunca é impresso. Rode "
                "'python -m apps.api.auth_cli rotate-admin' para o rotacionar.",
                path,
            )

    def verify_admin_token(self, token: str) -> bool:
        return self.admin_store.verify(token)

    def rotate_admin_token(self) -> Path:
        """Gera um novo token admin, substitui o hash e entrega-o por arquivo restrito."""
        token = self.admin_store.generate_token()
        return write_private_file(self.admin_token_path, token)

    def issue_bootstrap_token(
        self,
        ttl_seconds: int | None = None,
        persist: bool = True,
    ) -> str:
        ttl = ttl_seconds or int(os.environ.get("JARVIS_BOOTSTRAP_TTL", "600"))
        token = f"jrv_boot_{secrets.token_urlsafe(32)}"
        self._bootstrap_tokens[token] = time.time() + ttl
        if persist:
            path = write_private_file(self.bootstrap_token_path, token)
            logger.info(
                "Bootstrap token de uso único emitido em %s (validade: %ss).", path, ttl
            )
        return token

    def exchange_bootstrap_token(self, token: str) -> bool:
        expires_at = self._bootstrap_tokens.pop(token, None)
        if not expires_at:
            return False
        return time.time() <= expires_at

    # ------------------------------------------------------------------
    # Autenticação
    # ------------------------------------------------------------------
    def authenticate(self, request: Request) -> Principal | None:
        device_token = request.headers.get("x-device-token", "").strip()
        if device_token:
            return self._principal_from_device_token(device_token)

        authorization = request.headers.get("authorization", "")
        if authorization.lower().startswith("bearer "):
            token = authorization[7:].strip()
            if not token:
                return None
            if token.startswith("jrv_m_"):
                return self._principal_from_device_token(token)
            if token.startswith("sess_"):
                return self._principal_from_session(token)
            if self.verify_admin_token(token):
                return Principal(
                    subject_id="admin",
                    kind="human",
                    role="admin",
                    scopes=frozenset({"*"}),
                    via_admin_token=True,
                )
            return None

        cookie_token = request.cookies.get(SESSION_COOKIE)
        if cookie_token:
            return self._principal_from_session(cookie_token)
        return None

    def _principal_from_session(self, token: str) -> Principal | None:
        session = self.security.sessions.validate_session(token)
        if not session:
            return None
        return Principal(
            subject_id=session.user_id,
            kind="human",
            role=session.role,
            scopes=frozenset(session.scopes),
            session_id=session.session_id,
        )

    def _principal_from_device_token(self, token: str) -> Principal | None:
        try:
            device = self.security.device_auth.validate_token(token)
        except PermissionError:
            return None
        return Principal(
            subject_id=f"device:{device.device_id}",
            kind="device",
            role="device",
            scopes=frozenset(device.scopes),
            device_id=device.device_id,
            device_name=device.device_name,
        )

    # ------------------------------------------------------------------
    # Autorização
    # ------------------------------------------------------------------
    def authorize(self, principal: Principal, method: str, path: str) -> tuple[bool, str | None]:
        # As rotas de auth têm as suas próprias dependências de role.
        if path.startswith("/api/v1/auth/"):
            return True, None

        permission = required_permission(method, path)
        if permission is None:
            # Fail-closed: apenas admin passa em rotas não mapeadas.
            if principal.role == "admin":
                return True, None
            return False, "admin"
        if principal.has(permission):
            return True, None
        return False, permission

    # ------------------------------------------------------------------
    # Sessões
    # ------------------------------------------------------------------
    def create_session(
        self,
        user_id: str,
        role: str,
        scopes: list[str] | None = None,
        expiry_hours: int | float | None = None,
    ):
        if role not in ALLOWED_HUMAN_ROLES:
            raise ValueError(f"Role humano inválido: {role}")
        return self.security.sessions.create_session(
            user_id=user_id,
            role=role,
            scopes=list(scopes or []),
            expiry_hours=expiry_hours,
        )

    def login(self, token: str):
        """Troca um token admin ou uma sessão existente por uma sessão de cookie."""
        token = token.strip()
        if not token:
            return None
        if self.verify_admin_token(token):
            return self.create_session("admin", "admin", scopes=["*"])
        if token.startswith("sess_"):
            return self.security.sessions.validate_session(token)
        return None

    def login_with_bootstrap(self, token: str):
        if not self.exchange_bootstrap_token(token):
            return None
        return self.create_session("admin", "admin", scopes=["*"])

    def logout(self, principal: Principal | None) -> bool:
        if not principal or not principal.session_id:
            return False
        return self.security.sessions.revoke_session(principal.session_id)

    # ------------------------------------------------------------------
    # Rate limiting simples (não é autenticação; apenas proteção anti-brute-force)
    # ------------------------------------------------------------------
    def check_rate_limit(self, key: str, limit: int = 8, window_seconds: int = 60) -> bool:
        now = time.time()
        bucket = [t for t in self._attempts.get(key, []) if now - t < window_seconds]
        if len(bucket) >= limit:
            self._attempts[key] = bucket
            return False
        bucket.append(now)
        self._attempts[key] = bucket
        return True

    @staticmethod
    def client_key(request: Request) -> str:
        if request.client and request.client.host:
            return request.client.host
        return "unknown"

    def is_public(self, method: str, path: str) -> bool:
        return (method.upper(), path) in PUBLIC_ROUTES


# ----------------------------------------------------------------------
# Dependências FastAPI
# ----------------------------------------------------------------------
def get_principal(request: Request) -> Principal:
    principal = getattr(request.state, "principal", None)
    if principal is None:
        # Fallback para chamadas diretas em testes que não passam pelo middleware.
        principal = auth_service.authenticate(request)
    if principal is None:
        raise HTTPException(
            status_code=401,
            detail="Autenticação necessária.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return principal


def require_permission(permission: str):
    async def dependency(principal: Principal = Depends(get_principal)) -> Principal:
        if not principal.has(permission):
            security_core.audit.record_event(
                operation="PERMISSION_DENIED",
                status="DENIED",
                user_id=principal.display_id,
                parameters={"permission": permission},
                severity=AuditEventSeverity.SECURITY_ALERT,
                reason="Permissão insuficiente para a operação.",
            )
            raise HTTPException(
                status_code=403,
                detail=f"Permissão insuficiente: {permission}.",
            )
        return principal

    return dependency


def require_admin(principal: Principal = Depends(get_principal)) -> Principal:
    if principal.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores.")
    return principal


class AuthMiddleware:
    """Middleware ASGI fail-closed para todas as rotas /api."""

    def __init__(self, app, service: AuthService):
        self.app = app
        self.service = service

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET").upper()
        path = scope.get("path", "")

        # CORS preflight e estáticos/SPA não passam por auth.
        if method == "OPTIONS" or not path.startswith("/api"):
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        principal = self.service.authenticate(request)

        if self.service.is_public(method, path):
            if principal is not None:
                scope.setdefault("state", {})["principal"] = principal
            await self.app(scope, receive, send)
            return

        if principal is None:
            response = JSONResponse(
                {"detail": "Autenticação necessária."},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
            await response(scope, receive, send)
            return

        allowed, required = self.service.authorize(principal, method, path)
        if not allowed:
            self.service.security.audit.record_event(
                operation="PERMISSION_DENIED",
                status="DENIED",
                user_id=principal.display_id,
                parameters={"method": method, "path": path, "required": required},
                severity=AuditEventSeverity.SECURITY_ALERT,
                reason="Acesso HTTP negado pela política RBAC.",
            )
            response = JSONResponse(
                {"detail": "Permissão insuficiente.", "required": required},
                status_code=403,
            )
            await response(scope, receive, send)
            return

        scope.setdefault("state", {})["principal"] = principal
        await self.app(scope, receive, send)


auth_service = AuthService(security_core, data_dir / "auth")
