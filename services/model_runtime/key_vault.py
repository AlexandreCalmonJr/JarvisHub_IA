"""
Cofre Central de Múltiplas Chaves de API e Provedores do JARVIS Hub (KeyVault).

Permite cadastrar, gerenciar e testar múltiplas chaves simultaneamente:
- Groq Primária, Groq Secundária, Groq Adicional
- Gemini API (Google)
- DeepSeek API
- OpenAI (ChatGPT)
- Anthropic Claude
- Endpoint Local / Personalizado

Cada um dos 26 agentes pode se vincular a uma chave/provedor específico deste cofre.
"""

from __future__ import annotations

import base64
import ctypes
import json
import logging
import os
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import httpx
from cryptography.fernet import Fernet, InvalidToken

from .provider_defaults import default_model_for_provider, normalize_model_for_provider

logger = logging.getLogger("jarvis.model_runtime.key_vault")

_VAULT_ENVELOPE_VERSION = 2
_DPAPI_UI_FORBIDDEN = 0x01


class _DataBlob(ctypes.Structure):
    _fields_ = [
        ("cbData", ctypes.c_ulong),
        ("pbData", ctypes.POINTER(ctypes.c_char)),
    ]


def _make_blob(data: bytes) -> tuple[_DataBlob, Any]:
    buffer = ctypes.create_string_buffer(data, len(data))
    return _DataBlob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_char))), buffer


def _dpapi_protect(data: bytes, unprotect: bool = False) -> bytes:
    """Cifra/decifra com DPAPI no contexto do utilizador Windows atual."""
    if os.name != "nt":
        raise OSError("DPAPI indisponível fora do Windows")
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    in_blob, _buffer = _make_blob(data)
    out_blob = _DataBlob()
    if unprotect:
        ok = crypt32.CryptUnprotectData(
            ctypes.byref(in_blob),
            None,
            None,
            None,
            None,
            _DPAPI_UI_FORBIDDEN,
            ctypes.byref(out_blob),
        )
    else:
        ok = crypt32.CryptProtectData(
            ctypes.byref(in_blob),
            None,
            None,
            None,
            None,
            _DPAPI_UI_FORBIDDEN,
            ctypes.byref(out_blob),
        )
    if not ok:
        raise OSError(f"Falha DPAPI (winerror={ctypes.get_last_error()})")
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel32.LocalFree(out_blob.pbData)


def _chmod_private(path: Path) -> None:
    """Restringe a chave Fernet em POSIX e Windows; falha se não conseguir."""
    if os.name == "nt":
        username = os.environ.get("USERNAME") or os.environ.get("USER")
        if not username:
            raise OSError("Não foi possível identificar o utilizador para proteger a chave do cofre.")
        result = subprocess.run(
            ["icacls", str(path), "/inheritance:r", "/grant:r", f"{username}:F"],
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            raise OSError("Não foi possível aplicar ACL restrita à chave Fernet do cofre.")
        return
    os.chmod(path, 0o600)


@dataclass
class KeyProfile:
    key_id: str
    label: str
    provider: str  # 'groq', 'openai', 'gemini', 'deepseek', 'anthropic', 'custom'
    api_key: str
    base_url: str
    default_model: str
    is_active: bool = True
    created_at: str = ""
    # None identifica credenciais globais/legadas geridas por administradores.
    owner_user_id: str | None = None
    # Chave usada automaticamente nas inferências da própria conta.
    is_default: bool = False


class KeyVaultService:
    def __init__(self, vault_path: Path | None = None):
        self.vault_path = vault_path or (Path("data") / "api_keys_vault.json")
        self.vault_path.parent.mkdir(parents=True, exist_ok=True)
        self._fernet_key_path = self.vault_path.with_name(self.vault_path.name + ".key")
        self._keys: dict[str, KeyProfile] = {}
        self._load_vault()

    # ------------------------------------------------------------------
    # Cifra em repouso (DPAPI no Windows; Fernet + keyfile 0600 nos restantes)
    # ------------------------------------------------------------------
    def _get_fernet(self, create: bool = True) -> Fernet | None:
        if self._fernet_key_path.exists():
            try:
                return Fernet(self._fernet_key_path.read_bytes().strip())
            except (OSError, ValueError) as exc:
                logger.error("Chave Fernet do cofre inválida: %s", exc)
                return None
        if not create:
            return None
        key = Fernet.generate_key()
        tmp = self._fernet_key_path.with_suffix(self._fernet_key_path.suffix + ".tmp")
        try:
            tmp.write_bytes(key)
            _chmod_private(tmp)
            os.replace(tmp, self._fernet_key_path)
        except Exception:
            tmp.unlink(missing_ok=True)
            raise
        logger.info("Chave de cifra do cofre criada em arquivo restrito: %s", self._fernet_key_path)
        return Fernet(key)

    def _encrypt(self, plaintext: bytes) -> dict[str, Any]:
        if os.name == "nt":
            try:
                return {
                    "version": _VAULT_ENVELOPE_VERSION,
                    "cipher": "dpapi",
                    "payload": base64.b64encode(_dpapi_protect(plaintext)).decode("ascii"),
                }
            except OSError as exc:
                logger.warning("DPAPI falhou; recorrendo a Fernet com keyfile: %s", exc)
        fernet = self._get_fernet(create=True)
        if not fernet:
            raise RuntimeError("Não foi possível obter a chave de cifra do cofre")
        return {
            "version": _VAULT_ENVELOPE_VERSION,
            "cipher": "fernet",
            "payload": fernet.encrypt(plaintext).decode("ascii"),
        }

    def _decrypt(self, envelope: dict[str, Any]) -> bytes:
        payload = base64.b64decode(envelope.get("payload") or "")
        cipher = envelope.get("cipher")
        if cipher == "dpapi":
            try:
                return _dpapi_protect(payload, unprotect=True)
            except OSError as exc:
                if os.name == "nt":
                    # Um cofre DPAPI de outro utilizador/máquina não é recuperável.
                    raise RuntimeError(
                        "Cofre cifrado com DPAPI não pôde ser aberto neste contexto"
                    ) from exc
        if cipher == "fernet":
            fernet = self._get_fernet(create=False)
            if not fernet:
                raise RuntimeError("Keyfile Fernet ausente para abrir o cofre")
            try:
                return fernet.decrypt(payload)
            except InvalidToken as exc:
                raise RuntimeError("Token Fernet inválido para o cofre") from exc
        raise RuntimeError(f"Cifra de cofre desconhecida: {cipher!r}")

    def _load_vault(self) -> None:
        if self.vault_path.exists():
            try:
                data = json.loads(self.vault_path.read_text(encoding="utf-8"))
                if data.get("version") == _VAULT_ENVELOPE_VERSION and "payload" in data:
                    data = json.loads(self._decrypt(data).decode("utf-8"))
                    migrated = False
                else:
                    # Migração automática de cofre legado em texto puro.
                    migrated = True
                for k, v in data.items():
                    profile = KeyProfile(**v)
                    normalized = normalize_model_for_provider(
                        profile.provider, profile.default_model
                    )
                    if normalized and normalized != profile.default_model:
                        profile.default_model = normalized
                        migrated = True
                    self._keys[k] = profile
                if migrated:
                    self._save_vault()
                    logger.warning(
                        "Cofre legado em texto puro migrado para cifra em repouso (%s).",
                        self.vault_path,
                    )
                logger.info("Carregadas %d chaves do cofre de APIs.", len(self._keys))
                return
            except Exception as exc:
                self._keys.clear()
                logger.error("Falha ao ler o cofre de APIs cifrado; inicialização bloqueada: %s", exc)
                raise RuntimeError(
                    "O KeyVault existente não pôde ser aberto com segurança. "
                    "Não será ignorado nem substituído automaticamente."
                ) from exc

        # Migração automática a partir do hybrid_gateway_config.json legado
        legacy_path = Path("data") / "hybrid_gateway_config.json"
        if legacy_path.exists():
            try:
                legacy = json.loads(legacy_path.read_text(encoding="utf-8"))
                if legacy.get("api_key"):
                    prov = legacy.get("provider_name", "groq").lower()
                    self._keys["groq_primary"] = KeyProfile(
                        key_id="groq_primary",
                        label="Groq LPU (Principal)",
                        provider=prov,
                        api_key=legacy["api_key"],
                        base_url=legacy.get("base_url") or "https://api.groq.com/openai/v1",
                        default_model=legacy.get("default_model")
                        or default_model_for_provider(prov),
                        is_active=bool(legacy.get("enabled", True)),
                    )
                    self._save_vault()
            except Exception as exc:
                logger.warning("Falha na importação legado do hybrid gateway: %s", exc)

    def _save_vault(self) -> None:
        try:
            dump_data = {k: asdict(v) for k, v in self._keys.items()}
            plaintext = json.dumps(dump_data, ensure_ascii=False).encode("utf-8")
            envelope = self._encrypt(plaintext)
            tmp_path = self.vault_path.with_suffix(self.vault_path.suffix + ".tmp")
            tmp_path.write_text(json.dumps(envelope, indent=2), encoding="utf-8")
            _chmod_private(tmp_path)
            os.replace(tmp_path, self.vault_path)
        except Exception as exc:
            logger.error("Falha ao persistir cofre de chaves cifrado: %s", exc)
            raise RuntimeError("Não foi possível persistir o KeyVault cifrado.") from exc

    @staticmethod
    def _storage_id(key_id: str, owner_user_id: str | None) -> str:
        return key_id if owner_user_id is None else f"{owner_user_id}::{key_id}"

    def list_keys(
        self,
        owner_user_id: str | None = None,
        include_global: bool = False,
    ) -> list[dict[str, Any]]:
        """Lista chaves visíveis para a conta, sem nunca expor a chave crua.

        - ``owner_user_id=None`` devolve apenas credenciais globais/legadas.
        - Com conta, devolve as chaves dessa conta e, se ``include_global``,
          também as globais (visão administrativa).
        """
        res = []
        for k in self._keys.values():
            if owner_user_id is None:
                if k.owner_user_id is not None:
                    continue
            elif k.owner_user_id != owner_user_id and not (
                include_global and k.owner_user_id is None
            ):
                continue
            d = asdict(k)
            # A chave crua jamais sai do cofre. Apenas a versão mascarada é exposta.
            raw = d.pop("api_key", "")
            if len(raw) > 10:
                d["masked_key"] = f"{raw[:6]}...{raw[-4:]}"
            else:
                d["masked_key"] = "***"
            d["has_api_key"] = bool(raw)
            # Compatibilidade com alias frontend
            d["provider_name"] = d.get("provider", "groq")
            d["preferred_model"] = d.get("default_model", "")
            res.append(d)
        return res

    def get_key(self, key_id: str, owner_user_id: str | None = None) -> KeyProfile | None:
        """Obtém uma chave no âmbito exato indicado (conta ou global)."""
        return self._keys.get(self._storage_id(key_id, owner_user_id))

    def get_key_for_request(
        self, key_id: str, owner_user_id: str | None = None
    ) -> KeyProfile | None:
        """Resolve a chave da conta e, se não existir, a credencial global/legada."""
        if owner_user_id:
            owned = self.get_key(key_id, owner_user_id)
            if owned is not None:
                return owned
        return self.get_key(key_id)

    def resolve_active_key(self, owner_user_id: str) -> KeyProfile | None:
        """Devolve a chave predefinida ativa da conta (ou a primeira ativa)."""
        owned = [
            p
            for p in self._keys.values()
            if p.owner_user_id == owner_user_id and p.is_active and p.api_key
        ]
        for profile in owned:
            if profile.is_default:
                return profile
        return owned[0] if owned else None

    def set_default_key(self, key_id: str, owner_user_id: str) -> bool:
        """Marca uma chave da conta como predefinida para as suas inferências."""
        target = self.get_key(key_id, owner_user_id)
        if target is None:
            return False
        for profile in self._keys.values():
            if profile.owner_user_id == owner_user_id:
                profile.is_default = profile is target
        self._save_vault()
        return True

    def save_key(
        self,
        key_id: str,
        label: str,
        provider: str,
        api_key: str,
        base_url: str | None = None,
        default_model: str | None = None,
        is_active: bool = True,
        owner_user_id: str | None = None,
        is_default: bool = False,
    ) -> KeyProfile:
        provider = provider.lower().strip()
        if not base_url:
            if provider == "groq":
                base_url = "https://api.groq.com/openai/v1"
            elif provider == "deepseek":
                base_url = "https://api.deepseek.com/v1"
            elif provider == "openai":
                base_url = "https://api.openai.com/v1"
            elif provider == "gemini":
                base_url = "https://generativelanguage.googleapis.com/v1beta/openai"
            else:
                base_url = "https://api.openai.com/v1"

        if not default_model:
            default_model = default_model_for_provider(provider)
        else:
            default_model = (
                normalize_model_for_provider(provider, default_model) or default_model
            )

        storage_id = self._storage_id(key_id, owner_user_id)
        existing = self._keys.get(storage_id)
        has_owner_default = any(
            p.owner_user_id == owner_user_id
            and p.is_default
            and p.is_active
            and p.key_id != key_id
            for p in self._keys.values()
        )
        make_default = bool(owner_user_id) and (
            is_default or not has_owner_default
        )
        if make_default:
            for other in self._keys.values():
                if other.owner_user_id == owner_user_id:
                    other.is_default = False

        profile = KeyProfile(
            key_id=key_id,
            label=label,
            provider=provider,
            api_key=api_key.strip(),
            base_url=base_url.rstrip("/"),
            default_model=default_model,
            is_active=is_active,
            created_at=existing.created_at if existing else "",
            owner_user_id=owner_user_id,
            is_default=make_default,
        )
        self._keys[storage_id] = profile
        self._save_vault()
        return profile

    def delete_key(self, key_id: str, owner_user_id: str | None = None) -> bool:
        storage_id = self._storage_id(key_id, owner_user_id)
        if storage_id in self._keys:
            del self._keys[storage_id]
            self._save_vault()
            return True
        return False

    async def test_key_connectivity(
        self, key_id: str, owner_user_id: str | None = None
    ) -> dict[str, Any]:
        profile = self.get_key_for_request(key_id, owner_user_id)
        if not profile:
            return {"success": False, "error": f"Chave '{key_id}' não encontrada."}

        headers = {"Authorization": f"Bearer {profile.api_key}"}
        url = f"{profile.base_url}/models"
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    models = [m.get("id") for m in data.get("data", [])]
                    return {
                        "success": True,
                        "status_code": 200,
                        "provider": profile.provider,
                        "models_available": models[:10],
                        "total_models": len(models),
                    }
                return {
                    "success": False,
                    "status_code": resp.status_code,
                    "error": resp.text[:200],
                }
        except Exception as exc:
            return {"success": False, "error": str(exc)}
