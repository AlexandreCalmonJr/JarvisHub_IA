from services.memory.database import DatabaseManager


def test_agent_memory_crud(tmp_path):
    db_path = tmp_path / "test_memory.db"
    db = DatabaseManager(db_path=str(db_path))

    # 1. Salvar memória episódica
    mem_id = db.set_agent_memory(
        agent_role="qa_engineer",
        category="test_preference",
        key="fixture_pattern",
        content="Sempre utilizar fixtures isoladas com tmp_path e mocks controlados.",
        context="task_test_001",
        importance=5,
    )
    assert mem_id.startswith("amem-")

    # 2. Salvar segunda memória
    db.set_agent_memory(
        agent_role="qa_engineer",
        category="coverage",
        key="min_threshold",
        content="Cobertura mínima de 80% em módulos de domínio.",
        importance=3,
    )

    # 3. Listar memórias do agente
    memories = db.list_agent_memories(agent_role="qa_engineer")
    assert len(memories) == 2
    # Primeira memória deve ser a de maior importância (5 > 3)
    assert memories[0]["key"] == "fixture_pattern"
    assert memories[0]["importance"] == 5

    # 4. Atualizar memória existente (upsert por UNIQUE(agent_role, category, key))
    db.set_agent_memory(
        agent_role="qa_engineer",
        category="test_preference",
        key="fixture_pattern",
        content="Sempre utilizar fixtures isoladas com tmp_path, mocks controlados e asserções explícitas.",
        importance=5,
    )
    updated_memories = db.list_agent_memories(agent_role="qa_engineer", category="test_preference")
    assert len(updated_memories) == 1
    assert "asserções explícitas" in updated_memories[0]["content"]

    # 5. Deletar memória individual
    deleted = db.delete_agent_memory(mem_id)
    assert deleted is True

    remaining = db.list_agent_memories(agent_role="qa_engineer")
    assert len(remaining) == 1
    assert remaining[0]["key"] == "min_threshold"

    # 6. Limpar memórias do agente
    cleared_count = db.clear_agent_memories("qa_engineer")
    assert cleared_count == 1
    assert len(db.list_agent_memories(agent_role="qa_engineer")) == 0
