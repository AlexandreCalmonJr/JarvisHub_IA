import pytest
from httpx import AsyncClient, ASGITransport
from apps.api.main import app, workspace_service, db_manager
from services.orchestration.self_correction import SelfCorrectionEngine


def test_self_correction_python():
    """Valida se o compilador interno detecta e corrige erros de sintaxe em Python."""
    # 1. Falta de dois-pontos em def e if
    broken_code = "def calcular_soma(a, b)\n    if a > 0\n        return a + b\n    return b"
    healed, was_modified, msg = SelfCorrectionEngine.heal_python_code(broken_code)
    assert was_modified is True
    assert "def calcular_soma(a, b):" in healed
    assert "if a > 0:" in healed

    # 2. Parênteses não balanceados
    unbalanced_code = "resultado = (10 + 20 * (5 - 2)"
    healed_unbalanced, was_modified2, _ = SelfCorrectionEngine.heal_python_code(unbalanced_code)
    assert was_modified2 is True
    assert healed_unbalanced.endswith(")")

    # 3. Código já correto não é alterado
    valid_code = "def correto():\n    return 42\n"
    _, modified, _ = SelfCorrectionEngine.heal_python_code(valid_code)
    assert modified is False


def test_self_correction_json():
    """Valida se o analisador interno repara trailing commas em JSON."""
    broken_json = '{\n  "status": "ok",\n  "itens": [1, 2, 3,],\n}'
    healed, was_modified, msg = SelfCorrectionEngine.heal_json_code(broken_json)
    assert was_modified is True
    assert '"itens": [1, 2, 3]' in healed or '[1, 2, 3]' in healed


def test_self_correction_markdown():
    """Valida varredura de markdown e injeção do selo de auto-correção."""
    md = (
        "Aqui está sua função:\n\n"
        "```python\n"
        "def somar(x, y)\n"
        "    return x + y\n"
        "```\n\n"
        "Fim do arquivo."
    )
    healed_md, corrections = SelfCorrectionEngine.heal_markdown_text(md)
    assert len(corrections) > 0
    assert "def somar(x, y):" in healed_md
    assert "⚡ **Self-Correction Ativo**" in healed_md


@pytest.mark.asyncio
async def test_frente_02_git_version_control_and_rollback():
    """Valida controle de versão Git semântico local e rollback em 1 clique."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        proj_id = "test_frente2_git_proj"
        workspace_service.delete_project(proj_id)
        proj_dir = workspace_service.get_project_dir(proj_id)
        proj_dir.mkdir(parents=True, exist_ok=True)
        (proj_dir / "index.js").write_text("console.log('Versao 1');\n", encoding="utf-8")

        # 1. Garante inicialização do repo Git
        db_manager.register_project(
            proj_id, "Front 2 Git Test", str(proj_dir), owner_user_id="admin"
        )
        assert workspace_service.ensure_git_repo(proj_id) is True
        assert (proj_dir / ".git").exists()

        # 2. Modifica arquivo gerando commit 2
        mod_resp = await ac.post(
            f"/api/v1/workspace/projects/{proj_id}/files/write",
            json={
                "path": "index.js",
                "content": "console.log('Versao 2 - alterada');\n",
                "reason": "Segunda alteracao",
            },
        )
        assert mod_resp.status_code == 200
        mod_data = mod_resp.json()
        assert mod_data["status"] == "approval_required"
        assert "Versao 1" in (proj_dir / "index.js").read_text(encoding="utf-8")
        approved_write = await ac.post(
            f"/api/v1/approvals/{mod_data['approval_id']}/decide",
            json={"action": "approve", "reason": "Aprovado no teste Git"},
        )
        assert approved_write.status_code == 200
        applied_write = await ac.post(
            f"/api/v1/workspace/projects/{proj_id}/files/write",
            json={
                "path": "index.js",
                "content": "console.log('Versao 2 - alterada');\n",
                "reason": "Segunda alteracao",
                "approval_id": mod_data["approval_id"],
            },
        )
        assert applied_write.status_code == 200
        assert "Versao 2" in (proj_dir / "index.js").read_text(encoding="utf-8")
        # 3. Consulta histórico Git
        history_resp = await ac.get(f"/api/v1/workspace/projects/{proj_id}/git-history")
        assert history_resp.status_code == 200
        history = history_resp.json()
        assert len(history) >= 2

        # 4. Executa Rollback em 1 clique via API
        rollback_resp = await ac.post(f"/api/v1/workspace/projects/{proj_id}/rollback")
        assert rollback_resp.status_code == 200
        pending_rollback = rollback_resp.json()
        assert pending_rollback["status"] == "approval_required"
        approved_rollback = await ac.post(
            f"/api/v1/approvals/{pending_rollback['approval_id']}/decide",
            json={"action": "approve", "reason": "Rollback aprovado no teste"},
        )
        assert approved_rollback.status_code == 200
        rollback_applied = await ac.post(
            f"/api/v1/workspace/projects/{proj_id}/rollback?approval_id={pending_rollback['approval_id']}"
        )
        assert rollback_applied.status_code == 200
        rb_data = rollback_applied.json()
        assert rb_data["status"] == "rolled_back"
        assert "undone_commit" in rb_data

        # Verifica se o arquivo foi restaurado para a Versão 1
        restored_content = (proj_dir / "index.js").read_text(encoding="utf-8")
        assert "Versao 1" in restored_content

        # Limpeza
        workspace_service.delete_project(proj_id)


@pytest.mark.asyncio
async def test_frente_02_mesa_redonda_intent_and_consensus():
    """Valida intenção de Mesa Redonda e deliberação consensual no grafo."""
    from services.orchestration.graph import create_master_graph
    from services.security_core import SecurityCore
    from services.model_runtime import ModelManager
    from langgraph.checkpoint.memory import MemorySaver

    from unittest.mock import AsyncMock
    from services.model_runtime.types import InferenceResponse

    sec_core = SecurityCore()
    mod_mgr = ModelManager()
    mod_mgr.generate = AsyncMock(
        return_value=InferenceResponse(
            content="Parecer tecnico analitico para Mesa Redonda.",
            model_name="llama3.2:3b",
        )
    )
    graph = create_master_graph(
        security_core=sec_core,
        model_manager=mod_mgr,
        checkpointer=MemorySaver(),
        workspace_service=workspace_service,
    )

    state = {
        "task_id": "test-roundtable",
        "session_id": "test-session",
        "user_prompt": "/debate qual a melhor arquitetura para isolar conexões em microserviços?",
        "project_id": None,
        "classified_intent": None,
        "plan_steps": [],
        "selected_agents": [],
        "policy_verified": False,
        "policy_violations": [],
        "approval_required": False,
        "approval_id": None,
        "current_step": 0,
        "agent_outputs": [],
        "final_summary": None,
        "is_completed": False,
        "error": None,
    }

    config = {"configurable": {"thread_id": "test-roundtable"}}
    res = await graph.ainvoke(state, config=config)

    assert res["classified_intent"] == "multi_agent_consensus"
    assert len(res["selected_agents"]) == 3
    assert len(res["agent_outputs"]) >= 4  # Maestro + 3 Especialistas
    assert "Mesa Redonda Técnica" in res["final_summary"]
    assert res["is_completed"] is True
