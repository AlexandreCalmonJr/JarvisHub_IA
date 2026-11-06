import pytest

from agents.registry import AgentRegistry
from packages.contracts.agent import AgentRole
from services.orchestration import (
    CycleLimitExceededError,
    EventRouter,
)
from services.security_core import SecurityCore


def test_all_26_agents_registered_with_distinct_missions():
    registry = AgentRegistry()
    agents = registry.list_agents()

    # Deve conter exatamente os 26 agentes
    assert len(agents) == 26

    # Todos os papéis do Enum devem estar mapeados
    registered_roles = {a.role for a in agents}
    for expected_role in AgentRole:
        assert expected_role in registered_roles

    # Cada agente deve ter missão e nome únicos
    missions = {a.mission for a in agents}
    assert len(missions) == 26


def test_event_routing_to_relevant_specialists():
    security = SecurityCore()
    router = EventRouter(audit_trail=security.audit, max_cycles=3)

    # 1. Evento CODE_CHANGED deve acionar QA_ENGINEER e CODE_REVIEWER
    msgs = router.dispatch_event(
        event_type="CODE_CHANGED",
        task_id="task-code-01",
        sender=AgentRole.BACKEND_DEVELOPER,
        context_summary="Arquivo auth_controller.py modificado",
    )
    assert len(msgs) == 2
    recipients = {m.recipient for m in msgs}
    assert recipients == {AgentRole.QA_ENGINEER, AgentRole.CODE_REVIEWER}

    # 2. Evento DEPENDENCY_ADDED deve acionar SUPPLY_CHAIN e CYBERSECURITY
    msgs_dep = router.dispatch_event(
        event_type="DEPENDENCY_ADDED",
        task_id="task-dep-01",
        sender=AgentRole.BACKEND_DEVELOPER,
        context_summary="Novo pacote jwt-auth adicionado ao manifest",
    )
    assert len(msgs_dep) == 2
    recipients_dep = {m.recipient for m in msgs_dep}
    assert recipients_dep == {
        AgentRole.SOFTWARE_SUPPLY_CHAIN_SECURITY,
        AgentRole.CYBERSECURITY_ENGINEER,
    }

    # 3. Verifica registo em auditoria
    events = security.audit.list_events()
    assert any(e.operation == "INTER_AGENT_MESSAGE_DISPATCHED" for e in events)


def test_cycle_limit_prevents_infinite_ping_pong():
    security = SecurityCore()
    router = EventRouter(audit_trail=security.audit, max_cycles=2)

    # Ciclo 1: OK
    router.dispatch_event(
        "CODE_CHANGED", "task-loop", AgentRole.BACKEND_DEVELOPER, "Ciclo 1", cycle=1
    )
    # Ciclo 2: OK
    router.dispatch_event("CODE_CHANGED", "task-loop", AgentRole.QA_ENGINEER, "Ciclo 2", cycle=2)

    # Ciclo 3: DEVE lançar CycleLimitExceededError para evitar loops infinitos!
    with pytest.raises(CycleLimitExceededError, match="Limite máximo de ciclos"):
        router.dispatch_event(
            "CODE_CHANGED", "task-loop", AgentRole.CODE_REVIEWER, "Ciclo 3", cycle=3
        )
