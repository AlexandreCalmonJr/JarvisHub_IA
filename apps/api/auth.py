"""
Camada central de autenticação e autorização HTTP do JARVIS AI HUB.

Princípios:
- Fail-closed: tudo em /api exige credencial, exceto uma allowlist mínima.
- A identidade vem sempre do servidor (sessão, dispositivo ou token admin).
- Nenhum papel de agente é autenticável; agentes não podem autoaprovar.
- Sem bypass por IP/localhost.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import sqlite3
import subprocess
import time
import threading
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from apps.api.deps import data_dir, security_core
from packages.contracts.security import AuditEventSeverity
from services.security_core.auth_store import AdminCredentialStore, UserCredentialStore

logger = logging.getLogger("jarvis.api.auth")

SESSION_COOKIE = "jarvis_session"
BOOTSTRAP_TTL_SECONDS = 60

# Rotas públicas mínimas e explícitas.
PUBLIC_ROUTES: set[tuple[str, str]] = {
    ("GET", "/api"),
    ("GET", "/api/v1/system/health"),
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/password-login"),
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
    "system:feedback",
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
        "mobile:pair",
        "models:read",
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
        "security:write",
        "audit:read",
        "system:read",
        "system:feedback",
        "hardware:read",
        "mcp:read",
        "voice:use",
        "mock:serve",
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
        "system:feedback",
        "hardware:read",
        "mcp:read",
        "profile:read",
    },
}

# (métodos, regex do caminho, permissão exigida)
# A ordem importa: regras específicas primeiro.
PERMISSION_RULES: list[tuple[set[str], re.Pattern[str], str]] = [
    # Segurança / operações críticas
    ({"GET"}, re.compile(r"^/api/v1/tools$"), "coding:read"),
    ({"POST"}, re.compile(r"^/api/v1/tools/execute$"), "coding:use"),
    ({"POST"}, re.compile(r"^/api/v1/system/kill-switch$"), "security:kill"),
    ({"POST"}, re.compile(r"^/api/v1/mobile/pair$"), "mobile:pair"),
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
    ({"GET"}, re.compile(r"^/api/v1/system/inference-telemetry$"), "system:read"),
    ({"POST"}, re.compile(r"^/api/v1/system/inference-feedback$"), "system:feedback"),
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
    # Mock Server: execução dos endpoints simulados apenas para utilizadores autenticados com escopo dedicado.
    ({"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"}, re.compile(r"^/api/v1/mock/.*$"), "mock:serve"),
    # SQL Playground: endpoints POST estritamente de leitura continuam acessíveis a auditores.
    ({"POST"}, re.compile(r"^/api/v1/backend-studio/sql/(?:inspect|query|audit)$"), "studios:read"),
    # Studios
    ({"GET"}, re.compile(r"^/api/v1/(?:mock-server|backend-studio|quality-studio|design-studio|intelligence|reports).*$"), "studios:read"),
    ({"POST", "DELETE"}, re.compile(r"^/api/v1/(?:mock-server|backend-studio|quality-studio|design-studio|intelligence|reports).*$"), "studios:use"),
    # Aprendizagem por conta
    ({"GET"}, re.compile(r"^/api/v1/learning/progress$"), "profile:read"),
    ({"PUT"}, re.compile(r"^/api/v1/learning/progress$"), "profile:write"),
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
            "permissions": sorted(self.scopes if self.kind == "device" else ROLE_PERMISSIONS.get(self.role, set())),
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
    """Grava um segredo e só o publica depois de restringir as permissões.

    Falhas ao proteger o arquivo são fatais: não deixa um segredo persistido
    com ACL/permissões desconhecidas. O valor nunca é enviado para stdout/logs.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f".{path.name}.{secrets.token_hex(8)}.tmp")
    try:
        tmp_path.write_text(content.rstrip("\n") + "\n", encoding="utf-8")
        if os.name == "nt":
            username = os.environ.get("USERNAME") or os.environ.get("USER")
            if not username:
                raise OSError("Não foi possível identificar o utilizador para proteger o segredo.")
            domain = os.environ.get("USERDOMAIN", "").strip()
            account = f"{domain}\\{username}" if domain else username
            result = subprocess.run(
                [
                    "icacls",
                    str(tmp_path),
                    "/inheritance:r",
                    "/grant:r",
                    f"{account}:F",
                ],
                check=False,
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode != 0:
                raise OSError("Não foi possível aplicar ACL restrita ao arquivo secreto.")
        else:
            os.chmod(tmp_path, 0o600)
        os.replace(tmp_path, path)
        return path
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


class AuthService:
    def __init__(self, security, auth_dir: Path):
        self.security = security
        self.auth_dir = Path(auth_dir)
        self.auth_dir.mkdir(parents=True, exist_ok=True)
        self.admin_store = AdminCredentialStore(self.auth_dir / "admin.json")
        self.user_store = UserCredentialStore(self.auth_dir / "users.sqlite3")
        self._ensure_initial_admin_user()
        self.admin_token_path = self.auth_dir / "admin_token.txt"
        self.bootstrap_token_path = self.auth_dir / "bootstrap_token.txt"
        self.bootstrap_state_path = self.auth_dir / "bootstrap_state.json"
        self._bootstrap_tokens: dict[str, float] = {}
        self._bootstrap_lock = threading.Lock()
        self._attempts: dict[str, list[float]] = {}
        self.rate_limit_path = self.auth_dir / "rate_limits.sqlite3"
        self._initialize_rate_limit_store()
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
    def _ensure_initial_admin_user(self) -> None:
        """Garante a conta admin de homologação sem redefinir a senha a cada arranque.

        Em desenvolvimento, a credencial inicial é admin / jarvishub.
        A redefinição de uma conta existente ocorre uma única vez, controlada
        por um marcador local. Em produção, uma senha conhecida nunca é aplicada.
        """
        environment = os.environ.get(
            "JARVIS_ENVIRONMENT", os.environ.get("JARVIS_ENV", "development")
        ).strip().lower()
        is_production = environment in {"prod", "production"}
        password = os.environ.get("JARVIS_BOOTSTRAP_ADMIN_PASSWORD")
        if not password and not is_production:
            password = "jarvishub"
        if not password and not is_production:
            raise RuntimeError("Defina JARVIS_BOOTSTRAP_ADMIN_PASSWORD para inicializar o admin.")
        if password and len(password) < 8:
            raise RuntimeError("A senha inicial do administrador deve ter pelo menos 8 caracteres.")

        users = self.user_store.list_users()
        admin_user = next(
            (user for user in users
             if user.get("username", "").casefold() == "admin"
             and user.get("role") == "admin"),
            None,
        )

        if admin_user is None:
            # Não altera outras contas existentes; cria a conta administrativa
            # solicitada com username próprio.
            if password:
                try:
                    self.user_store.create_user(
                        username="admin",
                        display_name="Administrador",
                        password=password,
                        role="admin",
                    )
                    if not is_production:
                        (self.auth_dir / ".admin-bootstrap-password-initialized").write_text(
                            "initialized\\n", encoding="utf-8"
                        )
                except ValueError as exc:
                    raise RuntimeError(
                        "A conta 'admin' já existe com outro perfil. "
                        "Ajuste-a pela administração antes de inicializar."
                    ) from exc
        elif not is_production:
            marker = self.auth_dir / ".admin-bootstrap-password-initialized"
            if not marker.exists():
                if not self.user_store.set_password("admin", password):
                    raise RuntimeError("Não foi possível definir a senha inicial da conta admin.")
                marker.write_text("initialized\\n", encoding="utf-8")

        # Uma conta admin desativada não pode autenticar. Reativa somente a
        # conta de homologação explicitamente definida acima.
        admin_user = self.user_store.get_user("admin")
        if admin_user and not admin_user.get("is_active"):
            self.user_store.set_active("admin", True)

        active_admins = [
            user for user in self.user_store.list_users()
            if user.get("role") == "admin" and user.get("is_active")
        ]
        if not active_admins:
            raise RuntimeError(
                "Ainda não existe administrador ativo. Defina JARVIS_BOOTSTRAP_ADMIN_PASSWORD "
                "para criar a conta na primeira inicialização."
            )
        logger.info("Conta administrativa inicial verificada/criada automaticamente.")

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
        ttl = ttl_seconds if ttl_seconds is not None else int(
            os.environ.get("JARVIS_BOOTSTRAP_TTL", "600")
        )
        if ttl < 1 or ttl > 3600:
            raise ValueError("A validade do bootstrap deve estar entre 1 e 3600 segundos.")
        token = f"jrv_boot_{secrets.token_urlsafe(32)}"
        expires_at = time.time() + ttl
        if persist:
            # O launcher recebe o token no arquivo restrito; o servidor valida
            # usando somente o hash e a expiração persistidos, inclusive quando
            # a emissão foi feita por uma CLI em outro processo.
            write_private_file(self.bootstrap_token_path, token)
            state = {
                "token_hash": hashlib.sha256(token.encode("utf-8")).hexdigest(),
                "expires_at": expires_at,
            }
            write_private_file(self.bootstrap_state_path, json.dumps(state))
            logger.info(
                "Bootstrap token de uso único emitido em arquivo restrito (validade: %ss).",
                ttl,
            )
        else:
            # Modo efêmero reservado a testes e chamadas internas do mesmo processo.
            self._bootstrap_tokens[token] = expires_at
        return token

    def exchange_bootstrap_token(self, token: str) -> bool:
        if not token:
            return False

        # Compatibilidade com tokens efêmeros explicitamente não persistidos.
        expires_at = self._bootstrap_tokens.pop(token, None)
        if expires_at is not None:
            return time.time() <= expires_at

        expected_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        with self._bootstrap_lock:
            try:
                state = json.loads(self.bootstrap_state_path.read_text(encoding="utf-8"))
            except (OSError, ValueError, TypeError):
                return False

            stored_hash = str(state.get("token_hash", ""))
            if not hmac.compare_digest(expected_hash, stored_hash):
                return False

            # Rename atómico: apenas um worker/processo consegue reivindicar
            # o estado de uso único. Um token inválido não consome o bootstrap.
            claim_path = self.bootstrap_state_path.with_name(
                f"{self.bootstrap_state_path.name}.{secrets.token_hex(8)}.claim"
            )
            try:
                os.replace(self.bootstrap_state_path, claim_path)
            except OSError:
                return False

            try:
                claimed = json.loads(claim_path.read_text(encoding="utf-8"))
                claimed_hash = str(claimed.get("token_hash", ""))
                valid_hash = hmac.compare_digest(expected_hash, claimed_hash)
                valid_time = time.time() <= float(claimed.get("expires_at", 0))
                return valid_hash and valid_time
            except (OSError, ValueError, TypeError):
                return False
            finally:
                claim_path.unlink(missing_ok=True)
                self.bootstrap_token_path.unlink(missing_ok=True)

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
            subject_id=device.owner_user_id or f"device:{device.device_id}",
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

    def login_with_password(self, username: str, password: str):
        user = self.user_store.authenticate(username.strip(), password)
        if not user:
            return None
        return self.create_session(user["username"], user["role"])

    def login_with_bootstrap(self, token: str):
        if not self.exchange_bootstrap_token(token):
            return None
        return self.create_session("admin", "admin", scopes=["*"])

    def logout(self, principal: Principal | None) -> bool:
        if not principal or not principal.session_id:
            return False
        return self.security.sessions.revoke_session(principal.session_id)

    # ------------------------------------------------------------------
    # Rate limiting persistente (proteção anti-brute-force)
    # ------------------------------------------------------------------
    def _initialize_rate_limit_store(self) -> None:
        """Cria armazenamento SQLite local para preservar limites após reinícios."""
        with sqlite3.connect(self.rate_limit_path, timeout=5) as conn:
            conn.execute("PRAGMA busy_timeout=5000")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS auth_attempts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    bucket_key TEXT NOT NULL,
                    attempted_at REAL NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_auth_attempts_key_time "
                "ON auth_attempts(bucket_key, attempted_at)"
            )

    def check_rate_limit(self, key: str, limit: int = 8, window_seconds: int = 60) -> bool:
        if limit < 1 or window_seconds < 1:
            raise ValueError("Rate limit e janela devem ser valores positivos.")
        now = time.time()
        cutoff = now - window_seconds
        try:
            with sqlite3.connect(self.rate_limit_path, timeout=5) as conn:
                conn.execute("PRAGMA busy_timeout=5000")
                conn.execute("BEGIN IMMEDIATE")
                conn.execute(
                    "DELETE FROM auth_attempts WHERE attempted_at < ?",
                    (now - max(window_seconds * 4, 3600),),
                )
                count = conn.execute(
                    "SELECT COUNT(*) FROM auth_attempts "
                    "WHERE bucket_key = ? AND attempted_at >= ?",
                    (key, cutoff),
                ).fetchone()[0]
                if count >= limit:
                    conn.commit()
                    return False
                conn.execute(
                    "INSERT INTO auth_attempts(bucket_key, attempted_at) VALUES (?, ?)",
                    (key, now),
                )
                conn.commit()
                return True
        except sqlite3.Error:
            # Falha fechada: não aceitar novas tentativas se o controle persistente falhar.
            logger.exception("Rate limiter persistente indisponível; tentativa bloqueada.")
            return False

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
