"""Resolução da rota de inferência por especialista e por conta.

A rota combina uma chave do cofre da conta com o modelo que essa chave deve
usar. O perfil global do agente (``preferred_model``/``assigned_key_id``)
continua a servir de fallback para contas que ainda não configuraram a rota.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger("jarvis.model_runtime.agent_routing")


@dataclass(frozen=True)
class AgentRoute:
    """Destino efetivo de uma inferência de especialista."""

    agent_role: str
    key_id: str | None
    model: str | None
    source: str
    key_label: str | None = None
    provider: str | None = None


def _resolve_key_profile(
    key_vault: Any | None, key_id: str | None, owner_user_id: str | None
) -> Any | None:
    """Resolve uma chave no âmbito exato: conta quando indicada, global se ``None``."""
    if key_vault is None or not key_id:
        return None
    getter = getattr(key_vault, "get_key", None)
    if getter is None:
        return None
    return getter(key_id, owner_user_id)


def resolve_account_agent_route(
    db_manager: Any | None,
    key_vault: Any | None,
    owner_user_id: str | None,
    agent_role: str,
    fallback_key_id: str | None = None,
    fallback_model: str | None = None,
) -> AgentRoute:
    """Devolve a rota da conta ou, na ausência desta, o perfil global.

    Uma atribuição só é aplicada quando a chave existe no cofre **da própria
    conta**, está ativa e tem segredo. A chave global do perfil é procurada no
    âmbito global, sem permitir que uma chave de conta com o mesmo ID a
    substitua. Caso a chave não esteja disponível, ignora-se a atribuição para
    não deixar o especialista preso a uma credencial removida ou desativada.
    """
    clean_role = agent_role.value if hasattr(agent_role, "value") else str(agent_role)

    assignment: dict[str, Any] | None = None
    if db_manager is not None and owner_user_id:
        getter = getattr(db_manager, "get_agent_route", None)
        if getter is not None:
            try:
                assignment = getter(clean_role, owner_user_id)
            except Exception:
                logger.exception(
                    "Não foi possível ler a rota da conta para o especialista %s.",
                    clean_role,
                )

    if assignment:
        account_key_id = assignment.get("key_id")
        profile = _resolve_key_profile(key_vault, account_key_id, owner_user_id)
        if profile is not None and profile.is_active and profile.api_key:
            return AgentRoute(
                agent_role=clean_role,
                key_id=account_key_id,
                model=assignment.get("model")
                or profile.default_model
                or fallback_model,
                source="account",
                key_label=profile.label,
                provider=profile.provider,
            )
        logger.warning(
            "Rota da conta para %s aponta para a chave '%s', que não está disponível; "
            "a usar o perfil global.",
            clean_role,
            account_key_id,
        )

    global_profile = _resolve_key_profile(key_vault, fallback_key_id, None)
    if (
        fallback_key_id
        and global_profile is not None
        and global_profile.is_active
        and global_profile.api_key
    ):
        return AgentRoute(
            agent_role=clean_role,
            key_id=fallback_key_id,
            model=fallback_model or global_profile.default_model,
            source="global",
            key_label=global_profile.label,
            provider=global_profile.provider,
        )

    # A chave global não existe ou está inativa: não a propagar, para que a
    # inferência use a chave predefinida da conta ou o gateway global.
    return AgentRoute(
        agent_role=clean_role,
        key_id=None,
        model=fallback_model,
        source="global",
    )
