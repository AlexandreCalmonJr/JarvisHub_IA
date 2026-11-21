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
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from apps.api.deps import data_dir, security_core
from packages.contracts.security import AuditEventSeverity
from services.database.repositories.auth_rate_limit import SqliteAuthRateLimitRepository
from services.security_core.auth_store import AdminCredentialStore, UserCredentialStore

logger = logging.getLogger("jarvis.api.auth")

SESSION_COOKIE = "jarvis_session"
BOOTSTRAP_TTL_SECONDS = 60

# Rotas públicas mínimas e explícitas.
PUBLIC_ROUTES: set[tuple[str, str]] = {
    ("GET", "/api"),
    ("GET", "/api/v1/system/health"),
    ("GET", "/api/v1/system/discovery"),
    ("GET", "/api/v1/discovery"),
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/password-login"),
    ("POST", "/api/v1/auth/bootstrap/exchange"),
    ("POST", "/api/v1/omnichannel/telegram-webhook"),
    ("POST", "/api/v1/omnichannel/discord-webhook"),
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
    "voice:use",
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
        "models:vault",
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
    # Rotas privadas de modelo por especialista (escopo da conta)
    ({ "GET" }, re.compile(r"^/api/v1/agent-routes$"), "agents:read"),
    ({ "PUT", "DELETE" }, re.compile(r"^/api/v1/agent-routes/[^/]+$"), "agents:write"),
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
    # Canal omnicanal autenticado (os webhooks públicos têm verificação própria)
    ({"POST"}, re.compile(r"^/api/v1/omnichannel/inbound$"), "chat:use"),
    # Mock Server: execução dos endpoints simulados apenas para utilizadores autenticados com escopo dedicado.
    (
        {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"},
        re.compile(r"^/api/v1/mock/.*$"),
        "mock:serve",
    ),
    # SQL Playground: endpoints POST estritamente de leitura continuam acessíveis a auditores.
    ({"POST"}, re.compile(r"^/api/v1/backend-studio/sql/(?:inspect|query|audit)$"), "studios:read"),
    # Studios
    (
        {"GET"},
        re.compile(
            r"^/api/v1/(?:mock-server|backend-studio|quality-studio|design-studio|intelligence|reports).*$"
        ),
        "studios:read",
    ),
    (
        {"POST", "DELETE"},
        re.compile(
            r"^/api/v1/(?:mock-server|backend-studio|quality-studio|design-studio|intelligence|reports).*$"
        ),
        "studios:use",
    ),
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
            "permissions": sorted(
                self.scopes if self.kind == "device" else ROLE_PERMISSIONS.get(self.role, set())
            ),
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