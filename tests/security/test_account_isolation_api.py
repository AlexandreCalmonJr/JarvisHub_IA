from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.auth import auth_service
from apps.api.deps import db_manager, security_core, workspace_service
from apps.api.main import app


@pytest.mark.asyncio
async def test_account_a_private_data_is_not_visible_or_mutable_by_account_b(tmp_path):
    suffix = uuid.uuid4().hex[:10]
    owner_a = f"account-a-{suffix}"
    owner_b = f"account-b-{suffix}"
    task_id = f"task-a-{suffix}"
    session_id = f"session-a-{suffix}"
    project_id = f"project-a-{suffix}"
    skill_id = f"skill-a-{suffix}"
    doc_name = f"document-{suffix}.txt"

    session_a = auth_service.create_session(owner_a, "developer")
    session_b = auth_service.create_session(owner_b, "developer")

    project_dir = workspace_service.get_project_dir(project_id)
    project_dir.mkdir(parents=True, exist_ok=True)
    indexed_file = project_dir / "project-private.txt"
    indexed_file.write_text("Documento exclusivo do projeto da conta A.", encoding="utf-8")
    db_manager.register_project(
        project_id, "Projeto privado A", str(project_dir), owner_user_id=owner_a
    )
    db_manager.save_task(
        task_id=task_id,
        session_id=session_id,
        prompt="informação privada da conta A",
        state_dict={"final_summary": "resposta privada A"},
        project_id=project_id,
        owner_user_id=owner_a,
    )
    db_manager.add_chat_message(
        session_id, "user", "mensagem privada da conta A",
        project_id=project_id, owner_user_id=owner_a,
    )
    db_manager.insert_knowledge_chunks(
        doc_name=doc_name,
        file_type="TXT",
        category="privado",
        chunks=["conteúdo exclusivo da conta A"],
        owner_user_id=owner_a,
    )
    memory_id = db_manager.set_agent_memory(
        agent_role="software_architect",
        category="private",
        key=f"memory-{suffix}",
        content="memória exclusiva da conta A",
        owner_user_id=owner_a,
    )
    db_manager.save_user_skill(
        {
            "id": skill_id,
            "name": "Skill privada A",
            "origin": "user_created",
            "domain": "backend",
            "instructions": "não deve aparecer na conta B",
            "assigned_agents": ["jarvis_master"],
        },
        owner_user_id=owner_a,
    )
    db_manager.set_user_profile(
        {"displayName": "Perfil privado A"}, owner_user_id=owner_a
    )
    approval = security_core.approval_engine.create_request(
        task_id=f"approval-task-{suffix}",
        agent_role="jarvis_master",
        operation="file_write",
        impact_summary="alteração privada da conta A",
        affected_resources=[f"{project_id}/main.py"],
        owner_user_id=owner_a,
    )

    transport = ASGITransport(app=app)
    headers_a = {"Authorization": f"Bearer {session_a.session_id}"}
    headers_b = {"Authorization": f"Bearer {session_b.session_id}"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        indexed_a = await client.post(
            "/api/v1/knowledge/index-folder",
            json={"folder_path": str(project_dir), "category": "projeto"},
            headers=headers_a,
        )
        assert indexed_a.status_code == 200
        assert indexed_a.json()["indexed_count"] >= 1

        denied_b = await client.post(
            "/api/v1/knowledge/index-folder",
            json={"folder_path": str(project_dir), "category": "projeto"},
            headers=headers_b,
        )
        assert denied_b.status_code == 403

        outside_folder = tmp_path / "outside-owned-roots"
        outside_folder.mkdir()
        (outside_folder / "secret.txt").write_text("não indexar", encoding="utf-8")
        denied_outside = await client.post(
            "/api/v1/knowledge/index-folder",
            json={"folder_path": str(outside_folder), "category": "privado"},
            headers=headers_a,
        )
        assert denied_outside.status_code == 403

        tasks_b = await client.get("/api/v1/tasks", headers=headers_b)
        assert tasks_b.status_code == 200
        assert task_id not in {row["id"] for row in tasks_b.json()}

        delete_b = await client.delete(f"/api/v1/tasks/{task_id}", headers=headers_b)
        assert delete_b.status_code == 200
        assert delete_b.json()["deleted"] is False
        assert db_manager.get_task(task_id, owner_user_id=owner_a) is not None

        session_b_response = await client.get(
            f"/api/v1/chat/sessions/{session_id}", headers=headers_b
        )
        assert session_b_response.status_code == 404
        search_b = await client.get(
            "/api/v1/chat/search",
            params={"query": "privada da conta A"},
            headers=headers_b,
        )
        assert search_b.status_code == 200
        assert all(row["session_id"] != session_id for row in search_b.json())

        projects_b = await client.get("/api/v1/workspace/projects", headers=headers_b)
        assert projects_b.status_code == 200
        assert project_id not in {row.get("id") for row in projects_b.json()}

        knowledge_b = await client.get("/api/v1/knowledge/documents", headers=headers_b)
        assert knowledge_b.status_code == 200
        assert doc_name not in {row["doc_name"] for row in knowledge_b.json()}

        memories_b = await client.get(
            "/api/v1/agents/software_architect/memories", headers=headers_b
        )
        assert memories_b.status_code == 200
        assert all(
            row["content"] != "memória exclusiva da conta A"
            for row in memories_b.json()
        )

        skills_b = await client.get("/api/v1/skills", headers=headers_b)
        assert skills_b.status_code == 200
        assert skill_id not in {row.get("id") for row in skills_b.json()}

        profile_b = await client.get("/api/v1/user/profile", headers=headers_b)
        assert profile_b.status_code == 200
        assert profile_b.json()["displayName"] != "Perfil privado A"

        audit_b = await client.get("/api/v1/security/audit-logs", headers=headers_b)
        assert audit_b.status_code == 403
        logs_b = await client.get("/api/v1/system/server-logs", headers=headers_b)
        assert logs_b.status_code == 403

        approvals_b = await client.get("/api/v1/approvals", headers=headers_b)
        assert approvals_b.status_code == 200
        assert approval.id not in {row["id"] for row in approvals_b.json()}

        decide_b = await client.post(
            f"/api/v1/approvals/{approval.id}/decide",
            json={"action": "approve", "reason": "tentativa da conta B"},
            headers=headers_b,
        )
        assert decide_b.status_code == 404

        tasks_a = await client.get("/api/v1/tasks", headers=headers_a)
        assert task_id in {row["id"] for row in tasks_a.json()}
        profile_a = await client.get("/api/v1/user/profile", headers=headers_a)
        assert profile_a.json()["displayName"] == "Perfil privado A"

    db_manager.delete_session(session_id, owner_user_id=owner_a)
    db_manager.delete_task(task_id, owner_user_id=owner_a)
    db_manager.delete_knowledge_document(doc_name, owner_user_id=owner_a)
    db_manager.delete_knowledge_document("project-private.txt", owner_user_id=owner_a)
    db_manager.delete_agent_memory(memory_id, owner_user_id=owner_a)
    db_manager.delete_user_skill(skill_id, owner_user_id=owner_a)
    security_core.approval_engine.reject_request(
        approval.id, decided_by=owner_a, reason="limpeza de teste",
        owner_user_id=owner_a,
    )
    workspace_service.delete_project(project_id)
