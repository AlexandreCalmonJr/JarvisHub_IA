from unittest.mock import MagicMock

import pytest

from packages.contracts.agent import AgentRole
from services.coding_agent import ChatAgentRuntime, ChatRunConfig, ProviderReply
from services.coding_agent.providers import ChatProvider
from services.memory import DatabaseManager
from services.model_runtime import ModelManager
from services.model_runtime.adapter import OllamaAdapter
from services.orchestration.graph import create_master_graph
from services.project_workspace import ProjectWorkspaceService
from services.security_core import SecurityCore
from services.security_core.cve_scanner import CVEScannerService
from services.tool_gateway.specialized_tools import execute_audit_dependencies

# ----------------------------------------------------------------------
# 1. Testes do CVEScannerService (Modo Authoritative vs Offline + Warnings)
# ----------------------------------------------------------------------

def test_cve_scanner_authoritative_mode(tmp_path, monkeypatch):
    """Quando o pip-audit executa com sucesso, o modo é authoritative."""
    req = tmp_path / "requirements.txt"
    req.write_text("requests==2.20.0\n", encoding="utf-8")

    fake_findings = [
        {
            "package": "requests",
            "detected_version": "2.20.0",
            "cve": "CVE-2023-32681",
            "severity": "MEDIUM",
            "title": "Vazamento em redirects",
            "remediation": "Atualizar para >= 2.31.0",
            "source": "pip-audit / OSV",
        }
    ]
    monkeypatch.setattr(CVEScannerService, "scan_with_pip_audit", lambda self, _p: fake_findings)
    scanner = CVEScannerService()
    report = scanner.scan_project_dependencies(tmp_path)

    assert report["status"] == "completed"
    assert report["scan_mode"] == "authoritative"
    assert "warning" not in report
    assert report["is_safe"] is False
    assert report["vulnerabilities_found"] >= 1


def test_cve_scanner_offline_mode_with_warning_on_pip_audit_failure(tmp_path, monkeypatch):
    """Quando o pip-audit falha/timeout, o modo é offline e expõe aviso claro."""
    req = tmp_path / "requirements.txt"
    req.write_text("fastapi==0.115.0\n", encoding="utf-8")

    monkeypatch.setattr(CVEScannerService, "scan_with_pip_audit", lambda self, _p: None)
    scanner = CVEScannerService()
    report = scanner.scan_project_dependencies(tmp_path)

    assert report["status"] == "completed"
    assert report["scan_mode"] == "offline"
    assert "warning" in report
    assert "Auditoria autoritativa online" in report["warning"]
    assert report["is_safe"] is True

    # Verifica se specialized_tools expõe o aviso
    ok, out, _ = execute_audit_dependencies(tmp_path)
    assert ok is True
    assert "offline" in out
    assert "Auditoria autoritativa online" in out


# ----------------------------------------------------------------------
# 2. Testes de Reidratação de Projetos Importados no WorkspaceService
# ----------------------------------------------------------------------

def test_workspace_rehydration_from_sqlite(tmp_path):
    """Valida persistência e reidratação de projetos externos a partir do SQLite."""
    auth_dir = tmp_path / "auth"
    auth_dir.mkdir()
    sec = SecurityCore(auth_dir=auth_dir)
    ws_base = tmp_path / "workspace"
    ws_base.mkdir()

    db_path = str(tmp_path / "jarvis.db")
    db = DatabaseManager(db_path=db_path)

    # Cria diretório de projeto externo fora do workspace base
    ext_proj = tmp_path / "external_repo"
    ext_proj.mkdir()
    (ext_proj / "main.py").write_text("print('hello')", encoding="utf-8")

    # Registra no SQLite
    db.register_project(
        project_id="external-repo",
        name="External Repo",
        root_path=str(ext_proj),
        mode="edit_approved",
        owner_user_id="user1",
    )

    # Inicializa workspace_service passando o db_manager
    ws = ProjectWorkspaceService(security_core=sec, base_dir=ws_base, db_manager=db)

    # O inventário deve ter sido reidratado automaticamente
    assert "external-repo" in ws._inventories
    assert ws.get_project_dir("external-repo") == ext_proj.resolve()
    assert "external-repo" in sec.permission_engine._project_allowlists

    # list_available_projects deve incluir o projeto reidratado
    available = ws.list_available_projects()
    avail_ids = [p["id"] for p in available]
    assert "external-repo" in avail_ids

    # Exclusão deve remover tanto do disco/memória quanto do SQLite
    deleted = ws.delete_project("external-repo")
    assert deleted is True
    assert "external-repo" not in ws._inventories
    assert db.get_project("external-repo") is None


# ----------------------------------------------------------------------
# 3. Testes de Variáveis de Ambiente (.env.example alignment)
# ----------------------------------------------------------------------

def test_ollama_adapter_reads_env_urls(monkeypatch):
    """Valida leitura de JARVIS_OLLAMA_BASE_URL e OLLAMA_BASE_URL."""
    monkeypatch.setenv("JARVIS_OLLAMA_BASE_URL", "http://ollama-primary:11434")
    adapter1 = OllamaAdapter()
    assert adapter1.base_url == "http://ollama-primary:11434"

    monkeypatch.delenv("JARVIS_OLLAMA_BASE_URL", raising=False)
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://ollama-legacy:11434")
    adapter2 = OllamaAdapter()
    assert adapter2.base_url == "http://ollama-legacy:11434"


def test_validate_import_root_with_allowlist_alias(tmp_path, monkeypatch):
    """Valida reconhecimento de ALLOWLIST_WORKSPACE_ROOT como alias."""
    auth_dir = tmp_path / "auth"
    auth_dir.mkdir()
    sec = SecurityCore(auth_dir=auth_dir)
    ws = ProjectWorkspaceService(security_core=sec, base_dir=tmp_path / "ws")

    import_root = tmp_path / "allowed_folder"
    import_root.mkdir()
    target_sub = import_root / "my_project"
    target_sub.mkdir()

    monkeypatch.delenv("JARVIS_WORKSPACE_IMPORT_ROOTS", raising=False)
    monkeypatch.setenv("ALLOWLIST_WORKSPACE_ROOT", str(import_root))

    validated = ws.validate_import_root(str(target_sub))
    assert validated == target_sub.resolve()


# ----------------------------------------------------------------------
# 4. Testes de Gestão de Contexto e Compacting (H3)
# ----------------------------------------------------------------------

class DummyChatProvider(ChatProvider):
    name = "dummy"
    default_model = "fake-model"

    def __init__(self):
        self.last_turns = []

    async def complete(self, *, turns, tools, model, temperature, max_tokens, timeout_seconds):
        self.last_turns = list(turns)
        return ProviderReply(content="resposta de teste", model=self.default_model)


@pytest.mark.asyncio
async def test_chat_runtime_compacts_context_exceeding_budget(tmp_path, monkeypatch):
    """Valida que ChatAgentRuntime apara turnos antigos ao exceder o orçamento."""
    monkeypatch.setenv("JARVIS_OLLAMA_NUM_CTX", "2048")
    db = DatabaseManager(db_path=str(tmp_path / "chat_h3.db"))
    provider = DummyChatProvider()
    runtime = ChatAgentRuntime(provider_factory=lambda: provider, db_manager=db)

    # Injeta 30 mensagens grandes no banco para forçar estouro da janela de 2048 tokens
    for i in range(30):
        role = "user" if i % 2 == 0 else "assistant"
        db.add_chat_message(
            session_id="ses-overflow",
            role=role,
            content=f"Mensagem {i} com bastante conteudo para ocupar tokens. " * 20,
        )

    res = await runtime.complete(
        ChatRunConfig(
            prompt="Prompt final curto",
            session_id="ses-overflow",
            project_id=None,
            max_tokens=512,
        )
    )

    assert res["is_completed"] is True
    # O provider deve ter recebido muito menos que as 31 mensagens totais devido a trim_turns
    assert len(provider.last_turns) < 30
    assert provider.last_turns[0].role == "system"
    assert provider.last_turns[-1].content == "Prompt final curto"


@pytest.mark.asyncio
async def test_orchestrator_multi_agent_consensus_bounds_peer_outputs(tmp_path, monkeypatch):
    """Valida que o master_prompt em multi_agent_consensus limita os pareceres dos peers."""
    auth_dir = tmp_path / "auth"
    auth_dir.mkdir()
    sec = SecurityCore(auth_dir=auth_dir)

    mock_model_manager = MagicMock(spec=ModelManager)
    mock_model_manager.hybrid_router = None

    captured_requests = []

    async def fake_generate(req):
        captured_requests.append(req)
        resp = MagicMock()
        resp.content = "Parecer técnico muito detalhado sobre o tópico em questão."
        resp.prompt_tokens = 50
        resp.completion_tokens = 40
        resp.duration_ms = 10.0
        return resp

    mock_model_manager.generate = fake_generate

    from langgraph.checkpoint.memory import MemorySaver

    graph = create_master_graph(
        security_core=sec,
        model_manager=mock_model_manager,
        checkpointer=MemorySaver(),
    )

    state_input = {
        "task_id": "tsk-test-h3",
        "owner_user_id": "test_user",
        "session_id": "ses-h3",
        "user_prompt": "/debate como otimizar o banco de dados",
        "project_id": None,
        "classified_intent": "multi_agent_consensus",
        "plan_steps": [],
        "selected_agents": [
            AgentRole.SOFTWARE_ARCHITECT.value,
            AgentRole.BACKEND_DEVELOPER.value,
            AgentRole.CYBERSECURITY_ENGINEER.value,
        ],
        "policy_verified": True,
        "policy_violations": [],
        "approval_required": False,
        "approval_id": None,
        "pending_project": None,
        "current_step": 0,
        "agent_outputs": [],
        "final_summary": None,
        "is_completed": False,
        "error": None,
    }

    result = await graph.ainvoke(state_input, config={"configurable": {"thread_id": "tsk-test-h3"}})
    assert result["is_completed"] is True
    # O último request gerado é a síntese do JARVIS Maestro
    master_req = captured_requests[-1]
    assert "Delibere como JARVIS Maestro" in master_req.prompt
    # Deve conter os pareceres com cabeçalhos organizados
    assert "Parecer de" in master_req.prompt
