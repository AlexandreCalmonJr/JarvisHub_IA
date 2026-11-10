import hashlib
import json
import os
import secrets
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel, Field

from packages.contracts.security import AuditEventSeverity

from .audit_trail import AuditTrail

# Scopes que um dispositivo móvel pode receber no emparelhamento.
ALLOWED_DEVICE_SCOPES: set[str] = {
    "chat:read",
    "chat:use",
    "tasks:read",
    "approvals:read",
    "approvals:decide",
    "system:read",
    "workspace:read",
    "coding:use",
    "security:kill",
}

DEFAULT_DEVICE_SCOPES: list[str] = [
    "chat:read",
    "chat:use",
    "tasks:read",
    "approvals:read",
    "approvals:decide",
    "system:read",
    "workspace:read",
    "security:kill",
]


def hash_token(token: str) -> str:
    """Hash determinístico usado para persistir credenciais sem texto simples."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class DeviceRegistration(BaseModel):
    device_id: str
    device_name: str
    device_token: str | None = None
    token_hash: str = ""
    scopes: list[str] = Field(default_factory=list)
    is_revoked: bool = False
    paired_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    last_seen_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    def public_dict(self) -> dict:
        """Representação segura: nunca expõe o token, apenas metadados."""
        return {
            "device_id": self.device_id,
            "device_name": self.device_name,
            "scopes": list(self.scopes),
            "is_revoked": self.is_revoked,
            "paired_at": self.paired_at.isoformat(),
            "last_seen_at": self.last_seen_at.isoformat(),
        }


class DeviceAuthManager:
    """
    Gestor de autenticação de dispositivos móveis para acesso seguro via Tailscale/VPN.
    Suporta emparelhamento por token criptográfico, validação de requisições e revogação imediata.

    Os registos podem ser persistidos em disco (hash do token, scopes e estado de
    revogação) para sobreviver a reinícios do servidor.
    """

    def __init__(self, audit_trail: AuditTrail | None = None, store_path: Path | None = None):
        self.audit_trail = audit_trail
        self.store_path = Path(store_path) if store_path else None
        self._devices: dict[str, DeviceRegistration] = {}
        self._hash_to_device: dict[str, str] = {}
        if self.store_path:
            self._load()

    # ------------------------------------------------------------------
    # Persistência
    # ------------------------------------------------------------------
    def _load(self) -> None:
        if not self.store_path or not self.store_path.exists():
            return
        try:
            raw = json.loads(self.store_path.read_text(encoding="utf-8"))
            for item in raw.get("devices", []):
                reg = DeviceRegistration(
                    device_id=item["device_id"],
                    device_name=item.get("device_name", "unknown"),
                    device_token=None,
                    token_hash=item.get("token_hash", ""),
                    scopes=list(item.get("scopes", [])),
                    is_revoked=bool(item.get("is_revoked", False)),
                    paired_at=datetime.fromisoformat(item["paired_at"])
                    if item.get("paired_at")
                    else datetime.now(UTC),
                    last_seen_at=datetime.fromisoformat(item["last_seen_at"])
                    if item.get("last_seen_at")
                    else datetime.now(UTC),
                )
                self._devices[reg.device_id] = reg
                if reg.token_hash:
                    self._hash_to_device[reg.token_hash] = reg.device_id
        except Exception:
            # Um ficheiro corrompido não deve impedir o arranque; fica vazio.
            self._devices = {}
            self._hash_to_device = {}

    def _save(self) -> None:
        if not self.store_path:
            return
        self.store_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "devices": [
                {
                    "device_id": reg.device_id,
                    "device_name": reg.device_name,
                    "token_hash": reg.token_hash,
                    "scopes": list(reg.scopes),
                    "is_revoked": reg.is_revoked,
                    "paired_at": reg.paired_at.isoformat(),
                    "last_seen_at": reg.last_seen_at.isoformat(),
                }
                for reg in self._devices.values()
            ]
        }
        tmp_path = self.store_path.with_suffix(self.store_path.suffix + ".tmp")
        tmp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        try:
            os.chmod(tmp_path, 0o600)
        except OSError:
            pass
        os.replace(tmp_path, self.store_path)

    # ------------------------------------------------------------------
    # Operações
    # ------------------------------------------------------------------
    def pair_device(
        self,
        device_name: str,
        scopes: list[str] | None = None,
        created_by: str = "system",
    ) -> DeviceRegistration:
        requested = list(DEFAULT_DEVICE_SCOPES if scopes is None else scopes)
        unknown = sorted(set(requested) - ALLOWED_DEVICE_SCOPES)
        if unknown:
            raise ValueError(f"Scopes de dispositivo inválidos: {', '.join(unknown)}")

        device_id = f"dev-{secrets.token_hex(6)}"
        device_token = f"jrv_m_{secrets.token_urlsafe(32)}"
        token_digest = hash_token(device_token)

        # No repositório interno (memória e disco), NUNCA armazenamos o device_token em texto simples!
        stored_reg = DeviceRegistration(
            device_id=device_id,
            device_name=device_name,
            device_token=None,
            token_hash=token_digest,
            scopes=requested,
        )
        self._devices[device_id] = stored_reg
        self._hash_to_device[token_digest] = device_id
        self._save()

        if self.audit_trail:
            self.audit_trail.record_event(
                operation="MOBILE_DEVICE_PAIRED",
                status="SUCCESS",
                user_id=created_by,
                parameters={
                    "device_id": device_id,
                    "device_name": device_name,
                    "scopes": requested,
                },
                severity=AuditEventSeverity.INFO,
                reason=f"Dispositivo móvel '{device_name}' emparelhado com sucesso.",
            )

        # Retorna o token em texto puro única e exclusivamente na resposta do emparelhamento
        return DeviceRegistration(
            device_id=device_id,
            device_name=device_name,
            device_token=device_token,
            token_hash=token_digest,
            scopes=requested,
            paired_at=stored_reg.paired_at,
            last_seen_at=stored_reg.last_seen_at,
        )

    def validate_token(self, token: str) -> DeviceRegistration:
        token_digest = hash_token(token)
        device_id = self._hash_to_device.get(token_digest)
        if not device_id or device_id not in self._devices:
            raise PermissionError("Token de dispositivo não reconhecido.")

        device = self._devices[device_id]
        if device.is_revoked:
            if self.audit_trail:
                self.audit_trail.record_event(
                    operation="REVOKED_DEVICE_ACCESS_BLOCKED",
                    status="DENIED",
                    parameters={"device_id": device_id, "device_name": device.device_name},
                    severity=AuditEventSeverity.WARNING,
                    reason="Tentativa de acesso por dispositivo revogado bloqueada.",
                )
            raise PermissionError("Dispositivo revogado. Acesso permanentemente bloqueado.")

        device.last_seen_at = datetime.now(UTC)
        return device

    def revoke_device(
        self, device_id: str, reason: str = "Revogação pelo utilizador", revoked_by: str = "system"
    ) -> DeviceRegistration:
        if device_id not in self._devices:
            raise ValueError(f"Dispositivo com id {device_id} não encontrado.")

        device = self._devices[device_id]
        device.is_revoked = True
        self._save()

        if self.audit_trail:
            self.audit_trail.record_event(
                operation="MOBILE_DEVICE_REVOKED",
                status="REVOKED",
                user_id=revoked_by,
                parameters={"device_id": device_id, "device_name": device.device_name},
                severity=AuditEventSeverity.WARNING,
                reason=reason,
            )
        return device

    def list_devices(self) -> list[DeviceRegistration]:
        # Garante que todos os registros retornados na listagem têm device_token=None e token_hash=""
        return [
            DeviceRegistration(
                device_id=d.device_id,
                device_name=d.device_name,
                device_token=None,
                token_hash="",
                scopes=list(d.scopes),
                is_revoked=d.is_revoked,
                paired_at=d.paired_at,
                last_seen_at=d.last_seen_at,
            )
            for d in self._devices.values()
        ]

    def get_device(self, device_id: str) -> DeviceRegistration | None:
        return self._devices.get(device_id)

    def purge_revoked(self) -> int:
        revoked = [d for d in self._devices.values() if d.is_revoked]
        for device in revoked:
            self._devices.pop(device.device_id, None)
            self._hash_to_device.pop(device.token_hash, None)
        if revoked:
            self._save()
        return len(revoked)
