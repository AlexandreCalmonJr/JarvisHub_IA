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
                    self._keys[k] = KeyProfile(**v)
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
                        default_model=legacy.get("default_model") or "qwen/qwen3.8-27b",
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

    def list_keys(self) -> list[dict[str, Any]]:
        """Retorna todas as chaves cadastradas, sem nunca expor a chave crua."""
        res = []
        for k in self._keys.values():
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

    def get_key(self, key_id: str) -> KeyProfile | None:
        return self._keys.get(key_id)

    def save_key(
        self,
        key_id: str,
        label: str,
        provider: str,
        api_key: str,
        base_url: str | None = None,
        default_model: str | None = None,
        is_active: bool = True,
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
            if provider == "groq":
                default_model = "qwen/qwen3.8-27b"
            elif provider == "deepseek":
                default_model = "deepseek-chat"
            elif provider == "openai":
                default_model = "gpt-4o-mini"
            elif provider == "gemini":
                default_model = "gemini-1.5-flash"
            else:
                default_model = "default"

        profile = KeyProfile(
            key_id=key_id,
            label=label,
            provider=provider,
            api_key=api_key.strip(),
            base_url=base_url.rstrip("/"),
            default_model=default_model,
            is_active=is_active,
        )
        self._keys[key_id] = profile
        self._save_vault()
        return profile

    def delete_key(self, key_id: str) -> bool:
        if key_id in self._keys:
            del self._keys[key_id]
            self._save_vault()
            return True
        return False

    async def test_key_connectivity(self, key_id: str) -> dict[str, Any]:
        profile = self.get_key(key_id)
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
