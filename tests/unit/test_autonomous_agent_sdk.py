from unittest.mock import AsyncMock

import pytest

from packages.agent_sdk import AgentProfile, AutonomousAgent
from packages.contracts import (
    AgentOutputContract,
    AgentRole,
    AgentTaskRequest,
    AutonomousAgentMode,
    AutonomousAgentRunConfig,
)
from services.model_runtime import InferenceResponse, ModelManager


def test_autonomous_agent_creation_and_tool_allowance():
    profile = AgentProfile(
        role=AgentRole.CYBERSECURITY_ENGINEER,
        name="Engenheiro de Cibersegurança",
        mission="Liderar postura defensiva e segurança Zero Trust.",
        allowed_tools=["read_file", "scan_secrets", "inspect_dependencies"],
        system_prompt="Audite todas as portas e segredos.",
        preferred_model="qwen2.5:7b",
        is_read_only=False,
    )
    agent = AutonomousAgent(profile=profile, skills=["owasp_audit", "secrets_scanner"])

    assert agent.profile.role == AgentRole.CYBERSECURITY_ENGINEER
    assert agent.is_tool_allowed("scan_secrets") is True
    assert agent.is_tool_allowed("delete_database") is False
    assert len(agent.skills) == 2


def test_autonomous_agent_system_prompt_builder():
    profile = AgentProfile(
        role=AgentRole.BACKEND_DEVELOPER,
        name="Desenvolvedor Backend",
        mission="Construir APIs robustas e escaláveis.",
        allowed_tools=["read_file", "write_file", "edit_file", "run_tests"],
        system_prompt="Siga Clean Code e FastAPI estrito.",
        preferred_model="qwen2.5-coder:7b",
        is_read_only=False,
    )
    agent = AutonomousAgent(profile=profile)

    # Teste no Modo Plan
    plan_prompt = agent.build_system_prompt(
        mode=AutonomousAgentMode.PLAN,
        project_context="App FastAPI em python 3.12",
        memories=["Evitar dependências externas de banco"],
    )
    assert "MODO PLANEJAMENTO" in plan_prompt
    assert "Desenvolvedor Backend" in plan_prompt
    assert "Evitar dependências externas de banco" in plan_prompt
    assert "App FastAPI em python 3.12" in plan_prompt

    # Teste no Modo Ask
    ask_prompt = agent.build_system_prompt(
        mode=AutonomousAgentMode.ASK,
        skills_instructions="Skill: validação de schemas Pydantic",
    )
    assert "MODO ASSISTIDO" in ask_prompt
    assert "validação de schemas Pydantic" in ask_prompt

    # Teste no Modo Auto
    auto_prompt = agent.build_system_prompt(mode=AutonomousAgentMode.AUTO)
    assert "MODO AUTÔNOMO" in auto_prompt


def test_autonomous_agent_output_contract_creation():
    profile = AgentProfile(
        role=AgentRole.QA_ENGINEER,
        name="Engenheiro de QA",
        mission="Garantir 100% de estabilidade com testes automatizados.",
        allowed_tools=["read_file", "run_tests"],
        system_prompt="Testes em pytest.",
        is_read_only=True,
    )
    agent = AutonomousAgent(profile=profile)

    contract = agent.create_output_contract(
        objective="Executar testes unitários do backend",
        summary="Todos os 47 testes passaram com sucesso.",
        evidence=["pytest tests/unit", "Cobertura de 95%"],
        actions_taken=["Execução de pytest na sandbox"],
        tests_executed=["tests/unit/test_api.py"],
        model_name="qwen2.5-coder:7b",
        duration_ms=45.2,
    )

    assert isinstance(contract, AgentOutputContract)
    assert contract.agent_role == AgentRole.QA_ENGINEER
    assert contract.objective == "Executar testes unitários do backend"
    assert "47 testes passaram" in contract.summary
    assert len(contract.evidence) == 2
    assert contract.resource_usage.model_name == "qwen2.5-coder:7b"


@pytest.mark.asyncio
async def test_autonomous_agent_run_execution():
    profile = AgentProfile(
        role=AgentRole.SOFTWARE_ARCHITECT,
        name="Arquiteto de Software",
        mission="Definir arquitetura Clean Architecture e SOLID.",
        allowed_tools=["read_file", "list_directory"],
        system_prompt="Pense em termos de camadas desacopladas.",
        preferred_model="qwen2.5:7b",
        is_read_only=True,
    )
    agent = AutonomousAgent(profile=profile)

    mock_mod_mgr = ModelManager()
    mock_mod_mgr.generate = AsyncMock(
        return_value=InferenceResponse(
            content="Recomendamos Monólito Modular com SQLite WAL em modo embutido.",
            model_name="qwen2.5:7b",
            tokens_prompt=40,
            tokens_completion=60,
            duration_ms=18.5,
        )
    )

    task_req = AgentTaskRequest(
        task_id="tsk-001",
        session_id="ses-001",
        agent_role=AgentRole.SOFTWARE_ARCHITECT,
        user_prompt="Qual o melhor padrão arquitetural para o projeto?",
        context_data={"project_context": "Monólito Modular Python"},
    )

    result = await agent.run(task_req, model_manager=mock_mod_mgr)

    assert isinstance(result, AgentOutputContract)
    assert result.agent_role == AgentRole.SOFTWARE_ARCHITECT
    assert "Monólito Modular" in result.summary
    assert result.resource_usage.model_name == "qwen2.5:7b"


def test_autonomous_agent_create_run_config():
    profile = AgentProfile(
        role=AgentRole.DEVOPS_ENGINEER,
        name="Engenheiro DevOps",
        mission="Gerenciar CI/CD e Dockerfiles.",
        allowed_tools=["read_file", "run_command"],
        system_prompt="Práticas DevOps.",
    )
    agent = AutonomousAgent(profile=profile)
    cfg = agent.create_run_config(
        prompt="Gerar Dockerfile para app Python",
        mode=AutonomousAgentMode.AUTO,
        project_id="demo-proj",
    )
    assert isinstance(cfg, AutonomousAgentRunConfig)
    assert cfg.agent_role == AgentRole.DEVOPS_ENGINEER
    assert cfg.mode == AutonomousAgentMode.AUTO
    assert cfg.project_id == "demo-proj"
    assert "Dockerfile" in cfg.prompt
