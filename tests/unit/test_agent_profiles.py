"""Regressões dos prompts e do modelo predefinido dos 26 especialistas (QUAL-03/04)."""

from __future__ import annotations

from agents.profiles.catalog import (
    AGENT_PROFILES,
    CODER_MODEL,
    MASTER_MODEL,
    REASONING_MODEL,
)
from packages.agent_sdk.base_agent import AutonomousAgent
from packages.contracts.agent import AgentRole, AutonomousAgentMode

AUTO_MODELS = {"auto", "auto_hybrid"}


def test_all_profiles_have_a_concrete_local_model():
    """QUAL-04: nenhum especialista depende de um marcador de rota cego."""
    assert len(AGENT_PROFILES) == 26
    for role, profile in AGENT_PROFILES.items():
        assert profile.preferred_model not in AUTO_MODELS, role
        assert profile.preferred_model in {MASTER_MODEL, REASONING_MODEL, CODER_MODEL}, role


def test_model_assignment_follows_the_specialist_role():
    assert AGENT_PROFILES[AgentRole.JARVIS_MASTER].preferred_model == MASTER_MODEL

    coder_roles = (
        AgentRole.FRONTEND_MOBILE_DEVELOPER,
        AgentRole.BACKEND_DEVELOPER,
        AgentRole.QA_ENGINEER,
        AgentRole.CODE_REVIEWER,
        AgentRole.DEVOPS_ENGINEER,
        AgentRole.AUTOMATION_ENGINEER,
        AgentRole.SECURE_CODE_AUDITOR,
        AgentRole.API_SECURITY_SPECIALIST,
    )
    for role in coder_roles:
        assert AGENT_PROFILES[role].preferred_model == CODER_MODEL, role

    reasoning_roles = (
        AgentRole.SOFTWARE_ARCHITECT,
        AgentRole.DATA_ENGINEER_PIPELINES,
        AgentRole.SOC_INCIDENT_RESPONSE,
        AgentRole.PRIVACY_DATA_PROTECTION,
    )
    for role in reasoning_roles:
        assert AGENT_PROFILES[role].preferred_model == REASONING_MODEL, role


def test_seeded_configs_match_the_catalog_defaults():
    """As seeds de arranque não podem reintroduzir um modelo divergente."""
    from apps.api.deps import db_manager

    configs = db_manager.get_agent_configs()
    for role in (AgentRole.JARVIS_MASTER, AgentRole.SOFTWARE_ARCHITECT, AgentRole.PROJECT_MANAGER):
        assert configs[role.value]["preferred_model"] == AGENT_PROFILES[role].preferred_model


def test_response_contract_is_applied_to_every_specialist():
    """QUAL-03: concisão, JSON sem renomeações e separação de factos/lacunas."""
    for role, profile in AGENT_PROFILES.items():
        prompt = AutonomousAgent(profile).build_system_prompt(mode=AutonomousAgentMode.PLAN)
        assert "CONTRATO DE RESPOSTA (OBRIGATÓRIO)" in prompt, role
        assert "no máximo 300 palavras" in prompt, role
        assert "não renomeies nem acrescentes chaves" in prompt, role
        assert "sem observação real" in prompt, role
        assert "dados não foram fornecidos" in prompt, role
        assert "192/SAMU" in prompt, role
