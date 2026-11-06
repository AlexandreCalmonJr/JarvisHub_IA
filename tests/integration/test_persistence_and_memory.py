from services.memory import (
    DatabaseBackupManager,
    DatabaseManager,
    LayeredMemoryManager,
)


def test_task_persistence_across_restarts(tmp_path):
    db_file = tmp_path / "jarvis_test.db"
    db = DatabaseManager(db_path=str(db_file))
    db.register_project("proj-alpha", "Project Alpha", str(tmp_path))

    task_payload = {
        "task_id": "tsk-persist-01",
        "classified_intent": "architecture_analysis",
        "is_completed": True,
        "selected_agents": ["software_architect"],
    }

    db.save_task(
        task_id="tsk-persist-01",
        session_id="ses-100",
        prompt="Analisar arquitetura do sistema",
        state_dict=task_payload,
        project_id="proj-alpha",
    )

    # Simula reinício do sistema criando nova instância de conexão
    restarted_db = DatabaseManager(db_path=str(db_file))
    recovered = restarted_db.get_task("tsk-persist-01")

    assert recovered is not None
    assert recovered["id"] == "tsk-persist-01"
    assert recovered["prompt"] == "Analisar arquitetura do sistema"
    assert recovered["state"]["classified_intent"] == "architecture_analysis"
    assert recovered["is_completed"] == 1


def test_project_memory_isolation_and_secret_redaction(tmp_path):
    db_file = tmp_path / "memory_test.db"
    db = DatabaseManager(db_path=str(db_file))
    db.register_project("project_A", "Project A", str(tmp_path / "a"))
    db.register_project("project_B", "Project B", str(tmp_path / "b"))
    memory = LayeredMemoryManager(db_manager=db)

    # 1. Regista fato no Projeto A contendo segredo
    raw_content = "Decisão técnica: usar autenticação JWT com secret sk-1234567890abcdef12345678"
    memory.record_project_fact(
        project_id="project_A",
        category="architecture",
        key="auth_decision",
        content=raw_content,
        sources=["docs/adr/0001.md"],
    )

    # 2. Regista fato no Projeto B
    memory.record_project_fact(
        project_id="project_B",
        category="architecture",
        key="db_decision",
        content="Decisão técnica: usar SQLite com WAL mode",
        sources=["docs/adr/0002.md"],
    )

    # 3. Validação de Isolamento Estrito: Projeto A não vê fatos do Projeto B
    facts_a = memory.get_project_facts("project_A")
    assert len(facts_a) == 1
    assert facts_a[0]["key"] == "auth_decision"

    facts_b = memory.get_project_facts("project_B")
    assert len(facts_b) == 1
    assert facts_b[0]["key"] == "db_decision"

    # 4. Validação de Redaction: Segredo foi mascarado antes de persistir
    assert "sk-" not in facts_a[0]["content"]
    assert "[REDACTED_SECRET]" in facts_a[0]["content"]


def test_database_backup_and_disaster_recovery(tmp_path):
    orig_db_file = tmp_path / "primary.db"
    backup_dir = tmp_path / "backups"
    restore_target_file = tmp_path / "restored.db"

    # 1. Inicializa banco primário e grava dados
    db = DatabaseManager(db_path=str(orig_db_file))
    db.register_project("prod_project", "Production Project", str(tmp_path / "prod"))
    memory = LayeredMemoryManager(db_manager=db)
    memory.record_project_fact(
        project_id="prod_project",
        category="conventions",
        key="lint_rule",
        content="Usar ruff para linting",
        sources=["pyproject.toml"],
    )
    db.save_task(
        task_id="task-prod-99",
        session_id="ses-prod",
        prompt="Gerar release",
        state_dict={"status": "completed"},
        project_id="prod_project",
    )

    # 2. Executa backup atômico do SQLite
    snapshot_path = DatabaseBackupManager.backup_database(db, backup_dir)
    assert snapshot_path.exists()
    assert snapshot_path.stat().st_size > 0

    # 3. Simula perda do banco original (restauração em ambiente limpo)
    restored_db = DatabaseBackupManager.restore_database(snapshot_path, restore_target_file)
    restored_memory = LayeredMemoryManager(db_manager=restored_db)

    # 4. Comprova recuperação integral dos dados
    task = restored_db.get_task("task-prod-99")
    assert task is not None
    assert task["prompt"] == "Gerar release"

    facts = restored_memory.get_project_facts("prod_project")
    assert len(facts) == 1
    assert facts[0]["key"] == "lint_rule"
    assert facts[0]["content"] == "Usar ruff para linting"
