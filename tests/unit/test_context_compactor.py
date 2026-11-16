"""Testes unitários para o motor de compactação de contexto (services/coding_agent/compactor.py)."""

from services.coding_agent import ContextCompactor
from services.coding_agent.types import ChatTurn, ToolCall


def test_compactor_preserves_short_history():
    compactor = ContextCompactor(keep_recent=4)
    turns = [
        ChatTurn(role="user", content="Como criar uma API?"),
        ChatTurn(role="assistant", content="Use FastAPI."),
    ]
    compacted, stats = compactor.compact_turns(turns)
    assert len(compacted) == 2
    assert stats.compacted_turns == 2
    assert stats.estimated_tokens_saved == 0


def test_compactor_reduces_long_history():
    compactor = ContextCompactor(keep_recent=3)
    turns = [
        ChatTurn(role="user", content="Analise o arquivo services/api.py e veja se há bugs."),
        ChatTurn(
            role="assistant",
            content="Vou ler o arquivo.",
            tool_calls=[ToolCall(id="c1", name="read_file", arguments={"path": "services/api.py"})],
        ),
        ChatTurn(
            role="tool",
            tool_name="read_file",
            content="def run(): pass\n" * 100,  # Conteúdo longo
        ),
        ChatTurn(role="user", content="Agora corrija o bug adicionando logs."),
        ChatTurn(
            role="assistant",
            content="Modificando o arquivo.",
            tool_calls=[ToolCall(id="c2", name="edit_file", arguments={"path": "services/api.py"})],
        ),
        ChatTurn(
            role="tool",
            tool_name="edit_file",
            content="Edição em 'edit_file' aplicada com sucesso.",
        ),
        # 3 turnos recentes que devem permanecer intactos:
        ChatTurn(role="user", content="Rode os testes agora."),
        ChatTurn(role="assistant", content="Vou rodar pytest."),
        ChatTurn(role="tool", tool_name="run_command", content="1 passed in 0.05s"),
    ]

    compacted, stats = compactor.compact_turns(turns)

    # 1 turno de resumo + 3 turnos recentes = 4 turnos
    assert len(compacted) == 4
    assert stats.compacted_turns == 4
    assert stats.original_turns == 9
    assert stats.estimated_tokens_saved > 0
    assert "SESSÃO COMPACTADA AUTOMATICAMENTE" in compacted[0].content
    assert "services/api.py" in compacted[0].content

    # Os 3 turnos finais devem ser idênticos aos originais
    assert compacted[-3].content == "Rode os testes agora."
    assert compacted[-2].content == "Vou rodar pytest."
    assert compacted[-1].content == "1 passed in 0.05s"


def test_compactor_db_integration():
    class DummyDB:
        def __init__(self):
            self.messages = [
                {"role": "user", "content": f"Mensagem de teste {i}", "tool_name": None}
                for i in range(10)
            ]

        def list_chat_messages(self, session_id, limit=200, ascending=True, owner_user_id=None):
            return list(self.messages)

        def clear_session_messages(self, session_id, owner_user_id=None):
            self.messages = []
            return 10

        def add_chat_message(self, session_id, role, content="", project_id=None, **kwargs):
            self.messages.append({"role": role, "content": content, **kwargs})

    db = DummyDB()
    compactor = ContextCompactor(keep_recent=3)
    stats = compactor.compact_session_db(db, session_id="test-session")

    assert stats.original_turns == 10
    assert stats.compacted_turns == 4
    assert len(db.messages) == 4
    assert "[SESSÃO COMPACTADA" in db.messages[0]["content"]
