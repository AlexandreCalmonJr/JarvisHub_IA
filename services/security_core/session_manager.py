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
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    expires_at: datetime
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

    def create_session(self, user_id: str, role: str = UserRole.DEVELOPER) -> UserSession:
        session_id = f"sess_{uuid.uuid4().hex}"
        now = datetime.now(UTC)
        session = UserSession(
            session_id=session_id,
            user_id=user_id,
            role=role,
            created_at=now,
            expires_at=now + timedelta(hours=self.default_expiry_hours),
            is_revoked=False,
        )
        self._sessions[session_id] = session
        return session

    def validate_session(self, session_id: str) -> UserSession | None:
        session = self._sessions.get(session_id)
        if not session or session.is_revoked:
            return None
        if datetime.now(UTC) > session.expires_at:
            session.is_revoked = True
            return None
        return session

    def revoke_session(self, session_id: str) -> bool:
        session = self._sessions.get(session_id)
        if session:
            session.is_revoked = True
            self._revoked_tokens.add(session_id)
            return True
        return False
