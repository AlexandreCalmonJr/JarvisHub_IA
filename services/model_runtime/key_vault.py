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

import json
import logging
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any
import httpx

logger = logging.getLogger("jarvis.model_runtime.key_vault")


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
        self._keys: dict[str, KeyProfile] = {}
        self._load_vault()

    def _load_vault(self) -> None:
        if self.vault_path.exists():
            try:
                data = json.loads(self.vault_path.read_text(encoding="utf-8"))
                for k, v in data.items():
                    self._keys[k] = KeyProfile(**v)
                logger.info("Carregadas %d chaves do cofre de APIs.", len(self._keys))
                return
            except Exception as exc:
                logger.warning("Falha ao ler api_keys_vault.json: %s", exc)

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
            self.vault_path.write_text(json.dumps(dump_data, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception as exc:
            logger.error("Falha ao persistir cofre de chaves: %s", exc)

    def list_keys(self) -> list[dict[str, Any]]:
        """Retorna todas as chaves cadastradas (ocultando a chave crua por segurança)."""
        res = []
        for k in self._keys.values():
            d = asdict(k)
            # Mascara a chave para exibição segura no frontend
            raw = d.get("api_key", "")
            if len(raw) > 10:
                d["masked_key"] = f"{raw[:6]}...{raw[-4:]}"
            else:
                d["masked_key"] = "***"
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
