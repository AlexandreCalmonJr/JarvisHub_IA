import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.main import app


@pytest.mark.asyncio
async def test_agent_config_and_memories_api():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Obter agente individual
        resp = await ac.get("/api/v1/agents/qa_engineer")
        assert resp.status_code == 200
        agent = resp.json()
        assert agent["role"] == "qa_engineer"
        assert "preferred_model" in agent
        assert "system_prompt" in agent

        # 2. Atualizar configuração do agente
        orig_model = agent["preferred_model"]
        update_payload = {
            "preferred_model": "llama3.2:3b",
            "allowed_tools": ["read_file", "run_tests", "list_directory"],
        }
        put_resp = await ac.put("/api/v1/agents/qa_engineer/config", json=update_payload)
        assert put_resp.status_code == 200
        updated = put_resp.json()
        assert updated["status"] == "updated"
        assert updated["agent"]["preferred_model"] == "llama3.2:3b"
        assert "run_tests" in updated["agent"]["allowed_tools"]

        # 3. Criar memória episódica para o agente via API
        mem_payload = {
            "category": "qa_guideline",
            "key": "mock_policy",
            "content": "Nunca fazer chamadas reais de rede em testes unitários.",
            "importance": 4,
        }
        mem_resp = await ac.post("/api/v1/agents/qa_engineer/memories", json=mem_payload)
        assert mem_resp.status_code == 200
        mem_data = mem_resp.json()
        assert mem_data["status"] == "created"
        mem_id = mem_data["id"]

        # 4. Listar memórias do agente
        list_mems = await ac.get("/api/v1/agents/qa_engineer/memories")
        assert list_mems.status_code == 200
        mems = list_mems.json()
        assert len(mems) >= 1
        assert any(m["key"] == "mock_policy" for m in mems)

        # 5. Deletar memória via API
        del_resp = await ac.delete(f"/api/v1/agents/qa_engineer/memories/{mem_id}")
        assert del_resp.status_code == 200
        assert del_resp.json()["status"] == "deleted"

        # 6. Testar playground de agente
        play_payload = {
            "prompt": "Explique o padrão Arrange-Act-Assert em uma frase.",
        }
        play_resp = await ac.post("/api/v1/agents/qa_engineer/playground", json=play_payload)
        # Sem provedor configurado no CI, o endpoint deve falhar explicitamente.
        # Nunca deve fabricar uma resposta de sucesso para o playground.
        assert play_resp.status_code == 503
        assert "provedor de IA está indisponível" in play_resp.json()["detail"]


@pytest.mark.asyncio
async def test_agent_playground_maps_inference_token_usage(monkeypatch):
    """O playground deve devolver os tokens reais da inferência, não um 503."""
    from apps.api.deps import model_manager
    from services.model_runtime.types import InferenceResponse

    async def fake_generate(request, has_external_data_approval=False):
        assert request.agent_role == "qa_engineer"
        return InferenceResponse(
            content="Resposta de teste.",
            model_name="modelo-teste",
            prompt_tokens=123,
            completion_tokens=45,
        )

    monkeypatch.setattr(model_manager, "generate", fake_generate)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        play_resp = await ac.post(
            "/api/v1/agents/qa_engineer/playground",
            json={"prompt": "Responda apenas com uma frase curta."},
        )

    assert play_resp.status_code == 200
    body = play_resp.json()
    assert body["response"] == "Resposta de teste."
    assert body["model_used"] == "modelo-teste"
    assert body["tokens_prompt"] == 123
    assert body["tokens_completion"] == 45
