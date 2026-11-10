import uuid
from datetime import UTC, datetime, timedelta

from pydantic import BaseModel, Field


class UserRole(str):
    ADMIN = "admin"
    DEVELOPER = "developer"
    AUDITOR = "auditor"


class UserSession(BaseModel):
    session_id: str
    user_id: str
    role: str
    scopes: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    expires_at: datetime
    last_seen_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    is_revoked: bool = False


class SessionManager:
    """
    Gestor de autenticação local, sessões, RBAC e revogação.
    Controla expiração e revogação de acessos humanos.
    """

    def __init__(self, default_expiry_hours: int = 24):
        self.default_expiry_hours = default_expiry_hours
        self._sessions: dict[str, UserSession] = {}
        self._revoked_tokens: set[str] = set()

    def create_session(
        self,
        user_id: str,
        role: str = UserRole.DEVELOPER,
        scopes: list[str] | None = None,
        expiry_hours: int | float | None = None,
    ) -> UserSession:
        session_id = f"sess_{uuid.uuid4().hex}"
        now = datetime.now(UTC)
        hours = self.default_expiry_hours if expiry_hours is None else expiry_hours
        session = UserSession(
            session_id=session_id,
            user_id=user_id,
            role=role,
            scopes=list(scopes or []),
            created_at=now,
            expires_at=now + timedelta(hours=hours),
            last_seen_at=now,
            is_revoked=False,
        )
        self._sessions[session_id] = session
        return session

    def validate_session(self, session_id: str) -> UserSession | None:
        session = self._sessions.get(session_id)
        if not session or session.is_revoked:
            return None
        now = datetime.now(UTC)
        if now > session.expires_at:
            session.is_revoked = True
            return None
        session.last_seen_at = now
        return session

    def get_session(self, session_id: str) -> UserSession | None:
        return self._sessions.get(session_id)

    def revoke_session(self, session_id: str) -> bool:
        session = self._sessions.get(session_id)
        if session:
            session.is_revoked = True
            self._revoked_tokens.add(session_id)
            return True
        return False

    def revoke_all_for_user(self, user_id: str) -> int:
        revoked = 0
        for session in self._sessions.values():
            if session.user_id == user_id and not session.is_revoked:
                session.is_revoked = True
                self._revoked_tokens.add(session.session_id)
                revoked += 1
        return revoked

    def list_sessions(self, include_revoked: bool = False) -> list[UserSession]:
        sessions = list(self._sessions.values())
        if include_revoked:
            return sessions
        return [s for s in sessions if not s.is_revoked]

    def purge_expired(self) -> int:
        now = datetime.now(UTC)
        expired = [
            sid
            for sid, session in self._sessions.items()
            if session.expires_at <= now or session.is_revoked
        ]
        for sid in expired:
            self._sessions.pop(sid, None)
        return len(expired)
