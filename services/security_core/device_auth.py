import secrets
from datetime import UTC, datetime

from pydantic import BaseModel, Field

from packages.contracts.security import AuditEventSeverity

from .audit_trail import AuditTrail


class DeviceRegistration(BaseModel):
    device_id: str
    device_name: str
    device_token: str
    is_revoked: bool = False
    paired_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    last_seen_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class DeviceAuthManager:
    """
    Gestor de autenticação de dispositivos móveis para acesso seguro via Tailscale/VPN.
    Suporta emparelhamento por token criptográfico, validação de requisições e revogação imediata.
    """

    def __init__(self, audit_trail: AuditTrail | None = None):
        self.audit_trail = audit_trail
        self._devices: dict[str, DeviceRegistration] = {}
        self._token_to_device: dict[str, str] = {}

    def pair_device(self, device_name: str) -> DeviceRegistration:
        device_id = f"dev-{secrets.token_hex(6)}"
        device_token = f"jrv_m_{secrets.token_urlsafe(32)}"

        reg = DeviceRegistration(
            device_id=device_id,
            device_name=device_name,
            device_token=device_token,
        )
        self._devices[device_id] = reg
        self._token_to_device[device_token] = device_id

        if self.audit_trail:
            self.audit_trail.record_event(
                operation="MOBILE_DEVICE_PAIRED",
                status="SUCCESS",
                parameters={"device_id": device_id, "device_name": device_name},
                severity=AuditEventSeverity.INFO,
                reason=f"Dispositivo móvel '{device_name}' emparelhado com sucesso.",
            )
        return reg

    def validate_token(self, token: str) -> DeviceRegistration:
        device_id = self._token_to_device.get(token)
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

    def revoke_device(self, device_id: str, reason: str = "Revogação pelo utilizador") -> DeviceRegistration:
        if device_id not in self._devices:
            raise ValueError(f"Dispositivo com id {device_id} não encontrado.")

        device = self._devices[device_id]
        device.is_revoked = True

        if self.audit_trail:
            self.audit_trail.record_event(
                operation="MOBILE_DEVICE_REVOKED",
                status="REVOKED",
                parameters={"device_id": device_id, "device_name": device.device_name},
                severity=AuditEventSeverity.WARNING,
                reason=reason,
            )
        return device

    def list_devices(self) -> list[DeviceRegistration]:
        return list(self._devices.values())
