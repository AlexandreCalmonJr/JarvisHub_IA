import pytest
from agents.registry import AgentRegistry
from packages.contracts.agent import AgentOutputContract, AgentRole, ResourceUsage


def test_agent_registry_lookup_and_tools():
    registry = AgentRegistry()
    cyber = registry.get_profile(AgentRole.CYBERSECURITY_ENGINEER)
    assert cyber is not None
    assert "scan_secrets" in cyber.allowed_tools
    assert cyber.is_read_only is False


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


def test_build_specialist_prompt_injects_ecc_skills_and_memory(tmp_path):
    from services.memory.database import DatabaseManager
    from services.orchestration.graph import build_specialist_prompt
    from services.skills_manager import SkillMetadata, SkillsCatalog
    from services.skills_manager.validator import SkillValidator

    registry = AgentRegistry()
    catalog = SkillsCatalog()
    inst = "Escreva testes que falham antes do código e cubra casos de borda."
    h = SkillValidator.compute_hash(instructions=inst, templates={})
    catalog.register_skill(
        SkillMetadata(
            id="ecc_tdd_workflows",
            name="ECC Test-Driven Development",
            version="1.0.0",
            origin="internal",
            license="MIT",
            description="Fluxos TDD com testes unitários e de integração prioritários.",
            domain="qa",
            assigned_agents=["qa_engineer"],
            content_hash=h,
            is_approved=True,
            instructions=inst,
        ),
        auto_approve=True,
    )
    db = DatabaseManager(db_path=str(tmp_path / "test.db"))
    db.set_project_memory(
        project_id="test-prj",
        category="coding_standard",
        key="naming_convention",
        content="Use sempre snake_case em Python e tipagem estrita Pydantic.",
    )

    prompt = build_specialist_prompt(
        agent_role="qa_engineer",
        agent_registry=registry,
        skills_catalog=catalog,
        db_manager=db,
        intent="qa_testing",
        user_prompt="Validar suíte de testes do checkout",
        project_id="test-prj",
        domain="qa",
        previous_outputs=[
            {
                "agent_role": "backend_developer",
                "summary": "Implementado endpoint de checkout com validação de payload.",
            }
        ],
    )

    # Verifica injeção do perfil
    assert "QA Engineer" in prompt or "qa_engineer" in prompt
    # Verifica injeção da memória do projeto
    assert "REGRAS E MEMÓRIAS DO PROJETO" in prompt
    assert "snake_case" in prompt
    # Verifica injeção da skill ECC
    assert "ECC Test-Driven Development" in prompt
    assert "Escreva testes que falham" in prompt
    # Verifica injeção da colaboração prévia
    assert "backend_developer" in prompt


@pytest.mark.asyncio
async def test_multi_agent_sequential_execution_in_jarvis_master():
    from services.model_runtime import MockAdapter, ModelManager
    from services.orchestration import JarvisMaster
    from services.project_workspace import ProjectWorkspaceService
    from services.security_core import SecurityCore

    security = SecurityCore()
    model_mgr = ModelManager(adapter=MockAdapter(), audit_trail=security.audit)
    workspace = ProjectWorkspaceService(security_core=security)

    master = JarvisMaster(
        security_core=security,
        model_manager=model_mgr,
        workspace_service=workspace,
    )

    # Executa criação de website (aciona FRONTEND_MOBILE_DEVELOPER + SOFTWARE_ARCHITECT)
    res = await master.execute_task(
        user_prompt="cria um site simples de cafeteria com index.html e style.css"
    )

    assert res["is_completed"] is False
    assert res["approval_required"] is True
    assert res["approval_id"]
    assert res["classified_intent"] == "project_creation"
    assert len(res["selected_agents"]) >= 2
    assert AgentRole.FRONTEND_MOBILE_DEVELOPER.value in res["selected_agents"]
    assert AgentRole.SOFTWARE_ARCHITECT.value in res["selected_agents"]

    # Os pareceres de Arquitetura, Desenvolvimento e QA são preparados sem escrita.
    outputs = res["agent_outputs"]
    assert len(outputs) >= 2
    roles = [o["agent_role"] for o in outputs]
    assert AgentRole.FRONTEND_MOBILE_DEVELOPER.value in roles
    assert AgentRole.SOFTWARE_ARCHITECT.value in roles

    # A criação física só acontece após decisão humana vinculada à tarefa.
    security.approval_engine.approve_request(
        res["approval_id"],
        decided_by="test_admin",
        decision_reason="Aprovado no teste de integração.",
    )
    completed = await master.resume_after_approval(
        task_id=res["task_id"],
        approved_by="test_admin",
    )
    assert completed["is_completed"] is True
    assert completed["pending_project"] is None
    assert "criado após aprovação humana" in completed["final_summary"]
