import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.deps import db_manager
from apps.api.main import app


@pytest.mark.asyncio
async def test_compact_endpoint_integration():
    session_id = "test-compact-session"
    # Adiciona algumas mensagens prévias
    for i in range(8):
        db_manager.add_chat_message(
            session_id=session_id,
            role="user" if i % 2 == 0 else "assistant",
            content=f"Mensagem de teste {i} sobre o backend",
            project_id=None,
            owner_user_id="admin",
        )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/coding/sessions/{session_id}/compact",
            json={"keep_recent": 2, "project_id": None},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["session_id"] == session_id
        assert data["original_turns"] == 8
        assert data["compacted_turns"] == 3  # 1 resumo + 2 recentes
        assert "summary" in data

    # Cleanup
    db_manager.clear_session_messages(session_id, owner_user_id="admin")
