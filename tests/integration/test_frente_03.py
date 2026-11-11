import io
import zipfile
import pytest
from httpx import AsyncClient, ASGITransport
from apps.api.main import app, knowledge_vault_service, db_manager, skills_catalog
from services.orchestration.graph import build_specialist_prompt
from agents.registry import AgentRegistry


def _create_mock_docx_bytes(text: str) -> bytes:
    """Gera um arquivo .docx válido em memória usando apenas a biblioteca padrão."""
    xml_content = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:body>
        <w:p><w:r><w:t>{text}</w:t></w:r></w:p>
    </w:body>
</w:document>"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("word/document.xml", xml_content)
    return buf.getvalue()


@pytest.mark.asyncio
async def test_frente_03_knowledge_vault_docx_and_txt_indexing(tmp_path):
    """Valida indexação, chunking e busca de arquivos .txt e .docx no Knowledge Vault."""
    # 1. Cria arquivo de texto
    txt_file = tmp_path / "manual_seguranca.md"
    txt_file.write_text(
        "# Manual de Cibersegurança Corporativa\n\n"
        "Regra 01: Toda API interna deve operar em 127.0.0.1 com zero inbound externo.\n\n"
        "Regra 02: Tokens de sessão devem expirar em no máximo 24 horas.",
        encoding="utf-8",
    )

    # 2. Cria arquivo .docx
    docx_file = tmp_path / "politica_arquitetura.docx"
    docx_bytes = _create_mock_docx_bytes(
        "Diretriz de Arquitetura JARVIS: Microserviços devem desacoplar banco de dados "
        "e utilizar filas assíncronas com tratamento de falhas transacionais."
    )
    docx_file.write_bytes(docx_bytes)

    # 3. Indexa ambos no Knowledge Vault
    res_txt = knowledge_vault_service.index_file(txt_file, category="seguranca")
    assert res_txt["status"] == "indexed"
    assert res_txt["chunks_count"] >= 1

    res_docx = knowledge_vault_service.index_file(docx_file, category="arquitetura")
    assert res_docx["status"] == "indexed"
    assert res_docx["chunks_count"] >= 1

    # 4. Busca textual e relacional no Vault
    results_sec = knowledge_vault_service.search("127.0.0.1 zero inbound", limit=3)
    assert len(results_sec) >= 1
    assert "manual_seguranca.md" in [r["doc_name"] for r in results_sec]

    results_arch = knowledge_vault_service.search("Microserviços desacoplar banco", limit=3)
    assert len(results_arch) >= 1
    assert "politica_arquitetura.docx" in [r["doc_name"] for r in results_arch]

    # Limpeza
    knowledge_vault_service.delete_document("manual_seguranca.md")
    knowledge_vault_service.delete_document("politica_arquitetura.docx")


@pytest.mark.asyncio
async def test_frente_03_rag_context_injection_in_specialist_prompt(tmp_path):
    """Valida se o Knowledge Vault injeta contexto real nos prompts dos agentes especialistas."""
    guideline_file = tmp_path / "diretriz_ponytail.txt"
    guideline_file.write_text(
        "Padrão Senior Ponytail: É proibido adicionar bibliotecas externas para tarefas triviais. "
        "Reaproveite classes existentes e utilize tipagem estrita no Python.",
        encoding="utf-8",
    )
    knowledge_vault_service.index_file(guideline_file, category="qualidade")

    agent_reg = AgentRegistry()
    prompt = build_specialist_prompt(
        agent_role="software_architect",
        agent_registry=agent_reg,
        skills_catalog=skills_catalog,
        db_manager=db_manager,
        intent="architecture_analysis",
        user_prompt="Como aplicar o padrão Senior Ponytail e tipagem estrita no projeto?",
    )

    assert "### 📚 BASE DE CONHECIMENTO LOCAL (JARVIS Vault / RAG):" in prompt
    assert "diretriz_ponytail.txt" in prompt
    assert "Senior Ponytail" in prompt

    knowledge_vault_service.delete_document("diretriz_ponytail.txt")


@pytest.mark.asyncio
async def test_frente_03_chat_history_search_and_export_markdown():
    """Valida busca no histórico de conversas e exportação em Markdown estruturado."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        session_id = "test_export_session_123"
        task_id = "task_test_frente3"

        # Registra uma tarefa com estado estruturado
        db_manager.save_task(
            task_id=task_id,
            session_id=session_id,
            prompt="Como isolar a porta 8000 contra ataques cibernéticos?",
            state_dict={
                "task_id": task_id,
                "classified_intent": "security_audit",
                "selected_agents": ["cybersecurity_engineer"],
                "final_summary": "Recomenda-se bind estrito em 127.0.0.1 e verificação de integridade via firewall.",
                "agent_outputs": [
                    {
                        "agent_role": "cybersecurity_engineer",
                        "evidence": ["Bind em 127.0.0.1 verificado", "Porta isolada de interfaces públicas"],
                        "affected_files": [],
                    }
                ],
            },
        )

        # 1. Busca no histórico de chat
        search_resp = await ac.get("/api/v1/chat/search?query=isolar a porta 8000")
        assert search_resp.status_code == 200
        search_results = search_resp.json()
        assert len(search_results) >= 1
        assert any(r["session_id"] == session_id for r in search_results)

        # 2. Exporta sessão em Markdown (.md)
        export_resp = await ac.get(f"/api/v1/chat/sessions/{session_id}/export")
        assert export_resp.status_code == 200
        assert "text/markdown" in export_resp.headers.get("content-type", "")
        md_text = export_resp.text
        assert "# 📜 Histórico de Sessão JARVIS AI Hub" in md_text
        assert session_id in md_text
        assert "Como isolar a porta 8000" in md_text
        assert "cybersecurity_engineer" in md_text

        # Limpeza
        db_manager.delete_session(session_id, owner_user_id="admin")


@pytest.mark.asyncio
async def test_frente_03_ecc_skill_import_and_lifecycle():
    """Valida importação de skills ECC no formato SKILL.md e ciclo de vida no catálogo."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        skill_content = """---
name: Clean Architecture Hexagonal ECC
domain: backend
description: Padrões de arquitetura limpa com isolamento estrito de portas e adaptadores
version: 1.2.0
allowed_tools:
  - run_code
  - file_write
---

# Diretrizes da Skill Hexagonal
1. Entidades de domínio nunca importam frameworks externos.
2. Adaptadores de infraestrutura implementam interfaces de portas.
3. Testes unitários devem rodar 100% isolados de banco de dados.
"""
        # 1. Importa a skill
        import_resp = await ac.post(
            "/api/v1/skills/import-ecc",
            json={"content": skill_content},
        )
        assert import_resp.status_code == 200
        data = import_resp.json()
        assert data["status"] == "imported"
        skill_data = data["skill"]
        skill_id = skill_data["id"]
        assert "clean_architecture_hexagonal_ecc" in skill_id

        # 2. Verifica se a skill está presente no catálogo e aprovada
        registered = skills_catalog.get_skill(skill_id)
        assert registered is not None
        assert registered.is_approved is True

        # 3. Exclui/revoga a skill
        del_resp = await ac.delete(f"/api/v1/skills/{skill_id}")
        assert del_resp.status_code == 200
        assert skills_catalog.get_skill(skill_id) is None
