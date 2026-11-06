from agents.registry import AgentRegistry
from packages.contracts.agent import AgentOutputContract, AgentRole, ResourceUsage


def test_agent_registry_lookup_and_tools():
    registry = AgentRegistry()
    cyber = registry.get_profile(AgentRole.CYBERSECURITY_ENGINEER)
    assert cyber is not None
    assert "scan_secrets" in cyber.allowed_tools
    assert cyber.is_read_only is True


def test_multi_agent_structured_deliberation():
    # 1. Parecer do Arquiteto de Software
    architect_output = AgentOutputContract(
        agent_role=AgentRole.SOFTWARE_ARCHITECT,
        objective="Avaliar arquitetura modular de microsserviços vs monólito",
        summary="Recomenda-se Monólito Modular devido ao hardware de notebook i5.",
        evidence=["i5-8265U tem 4 cores", "Evita overhead de IPC e latência de rede interna"],
        actions_taken=["Análise de carga", "Benchmarking preliminar"],
        affected_files=["docs/adr/0001-modular-monolith-and-local-first.md"],
        tests_executed=["Comparação estática de consumo de memória"],
        risks=["Acoplamento se módulos não respeitarem contratos Pydantic"],
        blockers=[],
        resource_usage=ResourceUsage(model_name="llama3.2:3b"),
        next_recommendation="Submeter à revisão de segurança do Cybersecurity Engineer.",
    )

    # 2. Parecer do Engenheiro de Cibersegurança
    security_output = AgentOutputContract(
        agent_role=AgentRole.CYBERSECURITY_ENGINEER,
        objective="Auditar superfície de ataque do Monólito Modular",
        summary="Aprovado sob condição de Permission Engine com allowlist e redaction ativo.",
        evidence=[
            "Bloqueio de path traversal confirmado",
            "Prevenção de autoaprovação por agentes ativa",
        ],
        actions_taken=["Threat modeling da API local", "Revisão de credenciais em memória"],
        affected_files=["services/security_core/permission_engine.py"],
        tests_executed=["pytest tests/security"],
        risks=["Execução não controlada de comandos shell"],
        blockers=[],
        resource_usage=ResourceUsage(model_name="qwen2.5:7b"),
        next_recommendation="Aprovar início da implementação do Tool Gateway.",
    )

    # 3. Consolidação pelo JARVIS Master
    assert architect_output.agent_role == AgentRole.SOFTWARE_ARCHITECT
    assert security_output.agent_role == AgentRole.CYBERSECURITY_ENGINEER
    assert len(architect_output.evidence) >= 1
    assert len(security_output.evidence) >= 1
    assert architect_output.resource_usage.model_name == "llama3.2:3b"
    assert security_output.resource_usage.model_name == "qwen2.5:7b"
