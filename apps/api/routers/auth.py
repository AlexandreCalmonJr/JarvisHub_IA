import logging
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from apps.api.auth import (
    SESSION_COOKIE,
    AuthService,
    Principal,
    auth_service,
    get_principal,
    require_admin,
)
from packages.contracts.security import AuditEventSeverity

logger = logging.getLogger("jarvis.api.auth.routes")
router = APIRouter(tags=["auth"], prefix="/api/v1/auth")


class AuthLoginRequest(BaseModel):
    token: str = Field(..., min_length=1, description="Token de administrador ou sessão")



class PasswordLoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=48, pattern=r"^[a-zA-Z0-9._-]+$")
    password: str = Field(..., min_length=1, max_length=256)


class CreateUserRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=48, pattern=r"^[a-zA-Z0-9._-]+$")
    display_name: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., min_length=12, max_length=256)
    role: Literal["admin", "developer", "auditor"] = "developer"


class ResetUserPasswordRequest(BaseModel):
    password: str = Field(..., min_length=12, max_length=256)


class ChangeOwnPasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=256)
    new_password: str = Field(..., min_length=12, max_length=256)


class SetUserStatusRequest(BaseModel):
    is_active: bool


class BootstrapExchangeRequest(BaseModel):
    token: str = Field(..., min_length=1, description="Token de bootstrap de uso único")


class CreateSessionRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    role: str = Field("developer", description="admin, developer ou auditor")
    scopes: list[str] | None = None
    expiry_hours: float | None = Field(None, ge=0.01, le=720)


def _is_https(request: Request) -> bool:
    forwarded = request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
    return request.url.scheme == "https" or forwarded == "https"


def _set_session_cookie(response: Response, request: Request, session) -> None:
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    max_age = max(1, int((expires_at - datetime.now(UTC)).total_seconds()))
    response.set_cookie(
        key=SESSION_COOKIE,
        value=session.session_id,
        max_age=max_age,
        httponly=True,
        samesite="strict",
        secure=_is_https(request),
        path="/",
    )


def _session_payload(session, *, include_token: bool = False) -> dict:
    payload = {
        "user_id": session.user_id,
        "role": session.role,
        "scopes": list(session.scopes),
        "created_at": session.created_at,
        "expires_at": session.expires_at,
    }
    # Token só é devolvido no provisionamento administrativo, nunca no login do browser.
    if include_token:
        payload["session_token"] = session.session_id
    return payload


@router.post("/login")
async def login(payload: AuthLoginRequest, request: Request, response: Response):
    client = AuthService.client_key(request)
    if not auth_service.check_rate_limit(f"login:{client}"):
        raise HTTPException(status_code=429, detail="Demasiadas tentativas. Tente mais tarde.")

    session = auth_service.login(payload.token)
    if session is None:
        auth_service.security.audit.record_event(
            operation="AUTH_LOGIN_FAILED",
            status="DENIED",
            user_id="anonymous",
            parameters={"client": client},
            severity=AuditEventSeverity.WARNING,
            reason="Token de login inválido.",
        )
        raise HTTPException(status_code=401, detail="Credenciais inválidas.")

    _set_session_cookie(response, request, session)
    auth_service.security.audit.record_event(
        operation="AUTH_LOGIN_SUCCESS",
        status="SUCCESS",
        user_id=session.user_id,
        parameters={"role": session.role, "session_id": session.session_id},
        severity=AuditEventSeverity.INFO,
    )
    return {"status": "authenticated", **_session_payload(session)}



def _revoke_user_sessions(username: str) -> None:
    for session in auth_service.security.sessions.list_sessions(include_revoked=False):
        if session.user_id.casefold() == username.casefold():
            auth_service.security.sessions.revoke_session(session.session_id)


@router.post("/password-login")
async def password_login(payload: PasswordLoginRequest, request: Request, response: Response):
    client = AuthService.client_key(request)
    if not auth_service.check_rate_limit(f"password-login:{client}", limit=8):
        raise HTTPException(status_code=429, detail="Demasiadas tentativas. Tente mais tarde.")
    session = auth_service.login_with_password(payload.username, payload.password)
    if session is None:
        auth_service.security.audit.record_event(
            operation="AUTH_PASSWORD_LOGIN_FAILED",
            status="DENIED",
            user_id="anonymous",
            parameters={"client": client, "username": payload.username},
            severity=AuditEventSeverity.WARNING,
            reason="Credenciais de conta inválidas ou conta desativada.",
        )
        raise HTTPException(status_code=401, detail="Utilizador ou palavra-passe inválidos.")
    _set_session_cookie(response, request, session)
    auth_service.security.audit.record_event(
        operation="AUTH_PASSWORD_LOGIN_SUCCESS",
        status="SUCCESS",
        user_id=session.user_id,
        parameters={"role": session.role, "session_id": session.session_id},
        severity=AuditEventSeverity.INFO,
    )
    return {"status": "authenticated", **_session_payload(session)}


@router.get("/users")
async def list_users(principal: Principal = Depends(require_admin)):
    return {"users": auth_service.user_store.list_users()}


@router.post("/users", status_code=201)
async def create_user(payload: CreateUserRequest, principal: Principal = Depends(require_admin)):
    try:
        user = auth_service.user_store.create_user(
            username=payload.username.strip(),
            display_name=payload.display_name.strip(),
            password=payload.password,
            role=payload.role,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    auth_service.security.audit.record_event(
        operation="AUTH_USER_CREATED",
        status="SUCCESS",
        user_id=principal.display_id,
        parameters={"target_user": user["username"], "role": user["role"]},
        severity=AuditEventSeverity.INFO,
    )
    return {"status": "created", "user": user}


@router.put("/users/{username}/password")
async def reset_user_password(
    username: str,
    payload: ResetUserPasswordRequest,
    principal: Principal = Depends(require_admin),
):
    if not auth_service.user_store.set_password(username, payload.password):
        raise HTTPException(status_code=404, detail="Utilizador não encontrado.")
    _revoke_user_sessions(username)
    auth_service.security.audit.record_event(
        operation="AUTH_USER_PASSWORD_RESET",
        status="SUCCESS",
        user_id=principal.display_id,
        parameters={"target_user": username},
        severity=AuditEventSeverity.WARNING,
    )
    return {"status": "password_updated", "username": username}


@router.patch("/users/{username}/status")
async def set_user_status(
    username: str,
    payload: SetUserStatusRequest,
    principal: Principal = Depends(require_admin),
):
    try:
        updated = auth_service.user_store.set_active(username, payload.is_active)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not updated:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado.")
    if not payload.is_active:
        _revoke_user_sessions(username)
    auth_service.security.audit.record_event(
        operation="AUTH_USER_STATUS_CHANGED",
        status="SUCCESS",
        user_id=principal.display_id,
        parameters={"target_user": username, "is_active": payload.is_active},
        severity=AuditEventSeverity.WARNING,
    )
    return {"status": "updated", "username": username, "is_active": payload.is_active}


@router.post("/bootstrap/exchange")
async def exchange_bootstrap(
    payload: BootstrapExchangeRequest, request: Request, response: Response
):
    client = AuthService.client_key(request)
    if not auth_service.check_rate_limit(f"bootstrap:{client}", limit=5):
        raise HTTPException(status_code=429, detail="Demasiadas tentativas. Tente mais tarde.")

    session = auth_service.login_with_bootstrap(payload.token)
    if session is None:
        auth_service.security.audit.record_event(
            operation="AUTH_BOOTSTRAP_FAILED",
            status="DENIED",
            user_id="anonymous",
            parameters={"client": client},
            severity=AuditEventSeverity.WARNING,
            reason="Token de bootstrap inválido ou expirado.",
        )
        raise HTTPException(status_code=401, detail="Token de bootstrap inválido ou expirado.")

    _set_session_cookie(response, request, session)
    auth_service.security.audit.record_event(
        operation="AUTH_BOOTSTRAP_SUCCESS",
        status="SUCCESS",
        user_id=session.user_id,
        parameters={"session_id": session.session_id},
        severity=AuditEventSeverity.INFO,
    )
    return {"status": "authenticated", **_session_payload(session)}


@router.get("/me")
async def me(principal: Principal = Depends(get_principal)):
    payload = principal.to_dict()
    payload["user_id"] = principal.subject_id
    environment = __import__("os").environ.get(
        "JARVIS_ENVIRONMENT", __import__("os").environ.get("JARVIS_ENV", "development")
    ).strip().lower()
    payload["must_change_password"] = bool(
        principal.kind == "human"
        and principal.subject_id.casefold() == "admin"
        and not principal.via_admin_token
        and environment not in {"prod", "production"}
        and auth_service.user_store.authenticate(principal.subject_id, "jarvishub")
    )
    if principal.session_id:
        session = auth_service.security.sessions.get_session(principal.session_id)
        payload["expires_at"] = session.expires_at if session else None
    else:
        payload["expires_at"] = None
    return payload


@router.post("/password/change")
async def change_own_password(
    payload: ChangeOwnPasswordRequest,
    principal: Principal = Depends(get_principal),
):
    """Permite ao utilizador autenticado trocar a própria palavra-passe."""
    if principal.kind != "human" or not principal.session_id or principal.via_admin_token:
        raise HTTPException(status_code=403, detail="Inicie sessão com a sua conta para alterar a palavra-passe.")
    if not auth_service.check_rate_limit(f"password-change:{principal.subject_id}", limit=5, window_seconds=300):
        raise HTTPException(status_code=429, detail="Muitas tentativas de alteração. Tente novamente mais tarde.")
    user = auth_service.user_store.authenticate(principal.subject_id, payload.current_password)
    if user is None:
        raise HTTPException(status_code=400, detail="A palavra-passe atual não confere.")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="A nova palavra-passe deve ser diferente da atual.")
    if not auth_service.user_store.set_password(principal.subject_id, payload.new_password):
        raise HTTPException(status_code=404, detail="Conta não encontrada.")
    for session in auth_service.security.sessions.list_sessions(include_revoked=False):
        if session.user_id.casefold() == principal.subject_id.casefold() and session.session_id != principal.session_id:
            auth_service.security.sessions.revoke_session(session.session_id)
    auth_service.security.audit.record_event(
        operation="AUTH_OWN_PASSWORD_CHANGED",
        status="SUCCESS",
        user_id=principal.display_id,
        parameters={"session_id": principal.session_id},
        severity=AuditEventSeverity.WARNING,
    )
    return {"status": "password_updated", "must_change_password": False}


@router.post("/logout")
async def logout(response: Response, principal: Principal = Depends(get_principal)):
    revoked = auth_service.logout(principal)
    response.delete_cookie(SESSION_COOKIE, path="/")
    if revoked:
        auth_service.security.audit.record_event(
            operation="AUTH_LOGOUT",
            status="SUCCESS",
            user_id=principal.display_id,
            parameters={"session_id": principal.session_id},
            severity=AuditEventSeverity.INFO,
        )
    return {"status": "logged_out", "session_revoked": revoked}


@router.post("/sessions")
async def create_human_session(
    payload: CreateSessionRequest,
    principal: Principal = Depends(require_admin),
):
    try:
        session = auth_service.create_session(
            user_id=payload.user_id,
            role=payload.role,
            scopes=payload.scopes,
            expiry_hours=payload.expiry_hours,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    auth_service.security.audit.record_event(
        operation="AUTH_SESSION_CREATED",
        status="SUCCESS",
        user_id=principal.display_id,
        parameters={
            "target_user": payload.user_id,
            "role": payload.role,
            "expiry_hours": payload.expiry_hours,
        },
        severity=AuditEventSeverity.INFO,
    )
    return {"status": "created", **_session_payload(session, include_token=True)}


@router.get("/sessions")
async def list_human_sessions(principal: Principal = Depends(require_admin)):
    return {
        "sessions": [
            {
                "session_id": s.session_id,
                "user_id": s.user_id,
                "role": s.role,
                "scopes": list(s.scopes),
                "created_at": s.created_at,
                "expires_at": s.expires_at,
                "last_seen_at": s.last_seen_at,
                "is_revoked": s.is_revoked,
            }
            for s in auth_service.security.sessions.list_sessions(include_revoked=True)
        ]
    }


@router.delete("/sessions/{session_id}")
async def revoke_human_session(
    session_id: str, principal: Principal = Depends(require_admin)
):
    revoked = auth_service.security.sessions.revoke_session(session_id)
    if not revoked:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")
    auth_service.security.audit.record_event(
        operation="AUTH_SESSION_REVOKED",
        status="REVOKED",
        user_id=principal.display_id,
        parameters={"session_id": session_id},
        severity=AuditEventSeverity.WARNING,
    )
    return {"status": "revoked", "session_id": session_id}
