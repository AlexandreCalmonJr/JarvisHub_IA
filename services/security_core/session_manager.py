import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

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
    Controla expiração e revogação de acessos humanos com suporte a persistência relacional SQLite.
    Sessões revogadas ou expiradas nunca são restauradas automaticamente após reinício.
    """

    def __init__(self, default_expiry_hours: int = 24, db_manager: Any | None = None):
        self.default_expiry_hours = default_expiry_hours
        self.db_manager = db_manager
        self._sessions: dict[str, UserSession] = {}
        self._revoked_tokens: set[str] = set()
        if self.db_manager:
            self._load_from_db()

    def set_db_manager(self, db_manager: Any) -> None:
        """Vincula o gerenciador de banco de dados SQLite e sincroniza sessões."""
        self.db_manager = db_manager
        self._load_from_db()
        if self.db_manager:
            for session in self._sessions.values():
                self._save_session_to_db(session)

    def _load_from_db(self) -> None:
        if not self.db_manager:
            return
        try:
            now = datetime.now(UTC)
            rows = self.db_manager.list_sessions(include_revoked=True)
            for row in rows:
                sid = row["session_id"]
                is_rev = bool(row.get("is_revoked", False))
                exp_at = (
                    datetime.fromisoformat(row["expires_at"])
                    if isinstance(row.get("expires_at"), str)
                    else (row.get("expires_at") or now)
                )

                # Regra de Segurança: Sessões revogadas ou expiradas NUNCA são restauradas como ativas
                if is_rev:
                    self._revoked_tokens.add(sid)
                    continue

                if exp_at <= now:
                    self._revoked_tokens.add(sid)
                    try:
                        self.db_manager.revoke_session(sid)
                    except Exception:
                        pass
                    continue

                c_at = (
                    datetime.fromisoformat(row["created_at"])
                    if isinstance(row.get("created_at"), str)
                    else (row.get("created_at") or now)
                )
                ls_at = (
                    datetime.fromisoformat(row["last_seen_at"])
                    if isinstance(row.get("last_seen_at"), str)
                    else (row.get("last_seen_at") or c_at)
                )

                session = UserSession(
                    session_id=sid,
                    user_id=row.get("user_id", "unknown"),
                    role=row.get("role", UserRole.DEVELOPER),
                    scopes=list(row.get("scopes") or []),
                    created_at=c_at,
                    expires_at=exp_at,
                    last_seen_at=ls_at,
                    is_revoked=False,
                )
                self._sessions[sid] = session
        except Exception:
            pass

    def _save_session_to_db(self, session: UserSession) -> None:
        if not self.db_manager:
            return
        try:
            self.db_manager.save_session(
                session_id=session.session_id,
                user_id=session.user_id,
                role=session.role,
                scopes=list(session.scopes),
                created_at=session.created_at,
                expires_at=session.expires_at,
                last_seen_at=session.last_seen_at,
                is_revoked=session.is_revoked,
            )
        except Exception:
            pass

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
        self._save_session_to_db(session)
        return session

    def validate_session(self, session_id: str) -> UserSession | None:
        if session_id in self._revoked_tokens:
            return None
        session = self._sessions.get(session_id)
        if not session or session.is_revoked:
            return None
        now = datetime.now(UTC)
        if now > session.expires_at:
            session.is_revoked = True
            self._revoked_tokens.add(session_id)
            if self.db_manager:
                try:
                    self.db_manager.revoke_session(session_id)
                except Exception:
                    pass
            return None
        session.last_seen_at = now
        if self.db_manager:
            try:
                self.db_manager.update_session_last_seen(session_id, now)
            except Exception:
                pass
        return session

    def get_session(self, session_id: str) -> UserSession | None:
        return self._sessions.get(session_id)

    def revoke_session(self, session_id: str) -> bool:
        session = self._sessions.get(session_id)
        self._revoked_tokens.add(session_id)
        if self.db_manager:
            try:
                self.db_manager.revoke_session(session_id)
            except Exception:
                pass
        if session:
            session.is_revoked = True
            return True
        return False

    def revoke_all_for_user(self, user_id: str) -> int:
        revoked = 0
        for session in self._sessions.values():
            if session.user_id == user_id and not session.is_revoked:
                session.is_revoked = True
                self._revoked_tokens.add(session.session_id)
                revoked += 1
        if self.db_manager:
            try:
                self.db_manager.revoke_all_sessions_for_user(user_id)
            except Exception:
                pass
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
        if self.db_manager:
            try:
                self.db_manager.purge_expired_sessions()
            except Exception:
                pass
        return len(expired)
