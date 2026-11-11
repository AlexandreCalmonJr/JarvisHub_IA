"""
Testes de Governança e Segurança em Operações de Escrita e Modificação de Arquivos.

Cobre rigorosamente os 7 cenários obrigatórios:
1. Arquivo não muda sem aprovação.
2. Arquivo muda após aprovação válida.
3. Caminhos fora do workspace são bloqueados (Path Traversal).
4. Links simbólicos não permitem fuga fora da raiz do projeto.
5. Agentes read-only não escrevem.
6. Kill Switch bloqueia operações de escrita e modificação.
7. Operações ficam registradas na trilha de auditoria inviolável.
"""

import os
import logging
import tempfile
from pathlib import Path
import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.deps import security_core, tool_gateway, workspace_service
from apps.api.main import app
from packages.contracts.agent import AgentRole
from packages.contracts.security import AuditEventSeverity
from services.security_core import PermissionDeniedError
from services.tool_gateway import ToolExecutionRequest
from services.orchestration.workspace_actions import execute_workspace_modification


@pytest.fixture
def test_project_id():
    pid = "test_gov_write_proj"
    workspace_service.scaffold_project(
        project_id=pid,
        name="Gov Write Test Project",
        project_type="python",
        files={"main.py": "print('initial content')\n"},
    )
    yield pid
    # Cleanup
    try:
        workspace_service.delete_project(pid)
    except Exception as exc:
        logging.getLogger(__name__).debug("Cleanup de projeto falhou: %s", exc)


@pytest.mark.asyncio
async def test_01_file_does_not_change_without_approval(test_project_id):
    """1. Arquivo não muda sem aprovação humana expressa."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Primeira chamada sem approval_id deve retornar approval_required
        res = await client.post(
            "/api/v1/security/apply-policy",
            json={
                "project_id": test_project_id,
                "template_id": "fastapi_headers",
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "approval_required"
        assert "approval_id" in data
        approval_id = data["approval_id"]
        assert data["file"] == "security_headers.py"
        assert "diff" in data

        # O arquivo NÃO deve existir no disco
        proj_dir = workspace_service.get_project_dir(test_project_id)
        target_file = proj_dir / "security_headers.py"
        assert not target_file.exists(), "O arquivo foi gravado prematuramente sem aprovação!"

        # 2. Chamada com approval_id pendente (ainda não aprovado) deve falhar
        res_pending = await client.post(
            "/api/v1/security/apply-policy",
            json={
                "project_id": test_project_id,
                "template_id": "fastapi_headers",
                "approval_id": approval_id,
            },
        )
        assert res_pending.status_code == 403
        assert not target_file.exists(), "O arquivo foi gravado com aprovação ainda pendente!"


@pytest.mark.asyncio
async def test_02_file_changes_after_valid_approval(test_project_id):
    """2. Arquivo muda após aprovação humana válida e verificada pelo servidor."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Solicita aplicação de política gerando aprovação
        req_res = await client.post(
            "/api/v1/security/apply-policy",
            json={
                "project_id": test_project_id,
                "template_id": "fastapi_headers",
            },
        )
        assert req_res.status_code == 200
        approval_id = req_res.json()["approval_id"]

        # 2. Humano aprova a operação via endpoint oficial de decisões
        decide_res = await client.post(
            f"/api/v1/approvals/{approval_id}/decide",
            json={"action": "approve", "reason": "Política de segurança aprovada pelo arquiteto"},
        )
        assert decide_res.status_code == 200
        assert decide_res.json()["status"] == "approved"

        # 3. Executa a aplicação com o approval_id aprovado
        apply_res = await client.post(
            "/api/v1/security/apply-policy",
            json={
                "project_id": test_project_id,
                "template_id": "fastapi_headers",
                "approval_id": approval_id,
            },
        )
        assert apply_res.status_code == 200
        data = apply_res.json()
        assert data["status"] == "applied"

        # 4. Verifica que o arquivo foi realmente gravado no disco
        proj_dir = workspace_service.get_project_dir(test_project_id)
        target_file = proj_dir / "security_headers.py"
        assert target_file.exists(), "O arquivo aprovado não foi gravado no disco!"
        content = target_file.read_text(encoding="utf-8")
        assert "SecurityHeadersMiddleware" in content


@pytest.mark.asyncio
async def test_03_paths_outside_workspace_are_blocked(test_project_id):
    """3. Caminhos fora do workspace são rigorosamente bloqueados (Path Traversal)."""
    # 1. Validação direta no PermissionEngine
    with pytest.raises(PermissionDeniedError, match="fora do diretório do projeto"):
        security_core.permission_engine.validate_path_access(
            test_project_id, "../../system32/cmd.exe"
        )

    with pytest.raises(PermissionDeniedError, match="fora do diretório do projeto"):
        security_core.permission_engine.validate_path_access(
            test_project_id, "C:/Windows/System32/drivers/etc/hosts"
        )

    # 2. Bloqueio no WorkspaceService.modify_project_file
    with pytest.raises(PermissionDeniedError):
        workspace_service.modify_project_file(
            test_project_id,
            rel_path="../../../secret.txt",
            new_content="malicious payload",
        )

    # 3. Bloqueio nas rotas da API
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Leitura bloqueada
        res_read = await client.get(
            f"/api/v1/workspace/projects/{test_project_id}/file",
            params={"path": "../../passwords.txt"},
        )
        assert res_read.status_code == 403

        # Escrita bloqueada
        res_write = await client.post(
            f"/api/v1/workspace/projects/{test_project_id}/files/write",
            json={
                "path": "../../../leak.txt",
                "content": "hacked",
                "reason": "malicious traversal test",
            },
        )
        assert res_write.status_code == 403


@pytest.mark.asyncio
async def test_04_symlinks_cannot_escape_project_root(test_project_id):
    """4. Links simbólicos não permitem fuga fora da raiz autorizada do projeto."""
    proj_dir = workspace_service.get_project_dir(test_project_id)

    # Cria pasta temporária e arquivo fora do workspace
    with tempfile.TemporaryDirectory() as external_temp:
        external_file = Path(external_temp) / "sensitive_external.txt"
        external_file.write_text("sensivel_externo_nao_mexer", encoding="utf-8")

        symlink_path = proj_dir / "symlink_outside"
        try:
            os.symlink(external_temp, symlink_path, target_is_directory=True)
        except OSError:
            pytest.skip("Ambiente não permitiu criação de symlink (permissões de SO).")

        try:
            # Tentativa de validar acesso a arquivo através do symlink que aponta para fora
            with pytest.raises(PermissionDeniedError, match="fora do diretório do projeto"):
                security_core.permission_engine.validate_path_access(
                    test_project_id, "symlink_outside/sensitive_external.txt"
                )

            # Tentativa de modificar via workspace_service
            with pytest.raises(PermissionDeniedError):
                workspace_service.modify_project_file(
                    test_project_id,
                    rel_path="symlink_outside/sensitive_external.txt",
                    new_content="conteudo_modificado_ilegalmente",
                )

            # O arquivo externo não pode ter mudado
            assert external_file.read_text(encoding="utf-8") == "sensivel_externo_nao_mexer"
        finally:
            if symlink_path.is_symlink() or symlink_path.exists():
                try:
                    os.unlink(symlink_path)
                except OSError as exc:
                    logging.getLogger(__name__).debug("Remoção do symlink de teste falhou: %s", exc)


@pytest.mark.asyncio
async def test_05_read_only_agents_cannot_write(test_project_id):
    """5. Agentes configurados em modo Somente Leitura (Read-Only) não podem escrever."""
    # 1. Tentativa de write_file com RESEARCH_ANALYST (agente read-only)
    req_write = ToolExecutionRequest(
        tool_name="write_file",
        arguments={"path": "analise.txt", "content": "tentativa de escrita"},
        agent_role=AgentRole.RESEARCH_ANALYST.value,
        project_id=test_project_id,
    )
    with pytest.raises(PermissionDeniedError, match="Somente Leitura"):
        await tool_gateway.execute_tool(req_write)

    # 2. Tentativa de edit_file com RESEARCH_ANALYST
    req_edit = ToolExecutionRequest(
        tool_name="edit_file",
        arguments={"path": "main.py", "target": "print", "replacement": "logger.info"},
        agent_role=AgentRole.RESEARCH_ANALYST.value,
        project_id=test_project_id,
    )
    with pytest.raises(PermissionDeniedError, match="Somente Leitura"):
        await tool_gateway.execute_tool(req_edit)

    # 3. Tentativa de delete_file com RESEARCH_ANALYST
    req_delete = ToolExecutionRequest(
        tool_name="delete_file",
        arguments={"path": "main.py"},
        agent_role=AgentRole.RESEARCH_ANALYST.value,
        project_id=test_project_id,
    )
    with pytest.raises(PermissionDeniedError, match="Somente Leitura"):
        await tool_gateway.execute_tool(req_delete)

    # 4. Agente read-only PODE executar ferramentas seguras de leitura
    req_read = ToolExecutionRequest(
        tool_name="read_file",
        arguments={"file_path": "main.py"},
        agent_role=AgentRole.RESEARCH_ANALYST.value,
        project_id=test_project_id,
    )
    read_result = await tool_gateway.execute_tool(req_read)
    assert read_result.success is True
    assert "initial content" in read_result.stdout


@pytest.mark.asyncio
async def test_06_kill_switch_blocks_file_operations(test_project_id):
    """6. Kill Switch ativo bloqueia todas as operações de escrita, modificação e exclusão."""
    security_core.kill_switch.trigger_global_kill("Teste de contenção de segurança")
    try:
        # 1. modify_project_file bloqueado
        with pytest.raises(PermissionDeniedError, match="Kill Switch"):
            workspace_service.modify_project_file(
                test_project_id,
                rel_path="main.py",
                new_content="novo conteudo apos kill switch",
            )

        # 2. delete_project bloqueado
        with pytest.raises(PermissionDeniedError, match="Kill Switch"):
            workspace_service.delete_project(test_project_id)

        # 3. ToolGateway bloqueado
        req = ToolExecutionRequest(
            tool_name="write_file",
            arguments={"path": "teste_ks.py", "content": "# block"},
            agent_role=AgentRole.API_SECURITY_SPECIALIST.value,
            project_id=test_project_id,
        )
        with pytest.raises(PermissionDeniedError, match="Kill Switch"):
            await tool_gateway.execute_tool(req)

        # 4. API apply-policy bloqueada mesmo se houvesse aprovação
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/workspace/projects/{test_project_id}/files/write",
                json={"path": "main.py", "content": "novo", "reason": "teste"},
            )
            assert res.status_code == 403
    finally:
        security_core.kill_switch.reset_global_kill(authorized_by="admin_test")


@pytest.mark.asyncio
async def test_07_file_operations_recorded_in_audit_trail(test_project_id):
    """7. Operações de modificação e tentativas de violação são auditadas no AuditTrail."""
    # Dispara uma violação de path traversal para auditar
    try:
        security_core.permission_engine.validate_path_access(
            test_project_id, "../../etc/shadow"
        )
    except PermissionDeniedError:
        pass

    # Realiza uma alteração legítima de arquivo no projeto
    workspace_service.modify_project_file(
        test_project_id,
        rel_path="main.py",
        new_content="print('audited modification')\n",
        reason="Teste de registro de auditoria",
    )

    events = security_core.audit.list_events()

    # Verifica se evento de alerta de path traversal foi gravado
    traversal_events = [
        e for e in events
        if e.operation == "PATH_TRAVERSAL_BLOCKED" and e.project_id == test_project_id
    ]
    assert len(traversal_events) > 0, "Alerta PATH_TRAVERSAL_BLOCKED não registrado na auditoria!"
    assert traversal_events[-1].severity == AuditEventSeverity.SECURITY_ALERT

    # Verifica se evento de modificação foi gravado
    modify_events = [
        e for e in events
        if e.operation == "PROJECT_FILE_MODIFIED" and e.project_id == test_project_id
    ]
    assert len(modify_events) > 0, "PROJECT_FILE_MODIFIED não registrado na auditoria!"
    assert modify_events[-1].status == "SUCCESS"


@pytest.mark.asyncio
async def test_08_agent_cannot_self_approve_file_modification(test_project_id):
    """8. Agente não pode aprovar a própria operação de escrita de arquivo."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Gera pedido de aprovação
        res = await client.post(
            "/api/v1/security/apply-policy",
            json={
                "project_id": test_project_id,
                "template_id": "fastapi_headers",
            },
        )
        assert res.status_code == 200
        approval_id = res.json()["approval_id"]

        # Agente tenta se autoaprovar
        decide_res = await client.post(
            f"/api/v1/approvals/{approval_id}/decide",
            json={
                "action": "approve",
                "decided_by": AgentRole.API_SECURITY_SPECIALIST.value,
                "reason": "Autoaprovacao de agente",
            },
        )
        assert decide_res.status_code == 403
        assert "não possuem permissão para autoaprovar" in decide_res.json()["detail"]


@pytest.mark.asyncio
async def test_09_protected_files_blocked_from_modification(test_project_id):
    """9. Modificação direta de arquivos protegidos (.env, .pem, .key e .git) é proibida."""
    with pytest.raises(PermissionDeniedError, match="arquivo protegido"):
        workspace_service.modify_project_file(
            test_project_id,
            rel_path=".env",
            new_content="SECRET_KEY=leak",
        )

    with pytest.raises(PermissionDeniedError, match="arquivo protegido"):
        workspace_service.modify_project_file(
            test_project_id,
            rel_path="production.pem",
            new_content="FAKE_CERTIFICATE",
        )

    with pytest.raises(PermissionDeniedError, match="arquivo protegido|repositório Git"):
        workspace_service.modify_project_file(
            test_project_id,
            rel_path=".git/config",
            new_content="[core] hacked = true",
        )

@pytest.mark.asyncio
async def test_08_workspace_api_write_requires_matching_human_approval(test_project_id):
    """Workspace API não escreve antes da aprovação e rejeita pedidos pendentes."""
    project_dir = workspace_service.get_project_dir(test_project_id)
    target = project_dir / "main.py"
    original = target.read_text(encoding="utf-8")
    payload = {
        "path": "main.py",
        "content": "print('approved content')\n",
        "reason": "Teste de aprovação explícita",
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        requested = await client.post(
            f"/api/v1/workspace/projects/{test_project_id}/files/write",
            json=payload,
        )
        assert requested.status_code == 200
        data = requested.json()
        assert data["status"] == "approval_required"
        assert target.read_text(encoding="utf-8") == original

        pending_attempt = await client.post(
            f"/api/v1/workspace/projects/{test_project_id}/files/write",
            json={**payload, "approval_id": data["approval_id"]},
        )
        assert pending_attempt.status_code == 403
        assert target.read_text(encoding="utf-8") == original

        decision = await client.post(
            f"/api/v1/approvals/{data['approval_id']}/decide",
            json={"action": "approve", "reason": "Aprovado no teste E2E"},
        )
        assert decision.status_code == 200
        assert decision.json()["status"] == "approved"

        applied = await client.post(
            f"/api/v1/workspace/projects/{test_project_id}/files/write",
            json={**payload, "approval_id": data["approval_id"]},
        )
        assert applied.status_code == 200
        assert applied.json()["status"] == "saved"
        assert target.read_text(encoding="utf-8") == payload["content"]


def test_09_external_import_requires_an_explicitly_allowed_root(monkeypatch, tmp_path):
    """A importação fora do workspace só é permitida quando a raiz é configurada."""
    external_root = tmp_path / "approved-imports"
    external_root.mkdir()
    project = external_root / "sample"
    project.mkdir()

    monkeypatch.delenv("JARVIS_WORKSPACE_IMPORT_ROOTS", raising=False)
    with pytest.raises(PermissionDeniedError, match="raiz autorizada"):
        workspace_service.validate_import_root(str(project))

    monkeypatch.setenv("JARVIS_WORKSPACE_IMPORT_ROOTS", str(external_root))
    assert workspace_service.validate_import_root(str(project)) == project.resolve()



def test_10_orchestrator_workspace_edit_is_preview_only_until_approved(tmp_path):
    """O caminho antigo do JARVIS Master não pode escrever sem aprovação."""
    project_id = "test_orchestrator_approval"
    initial = "<html><head><title>Inicial</title></head><body><h1>Inicial</h1></body></html>"
    workspace_service.scaffold_project(
        project_id=project_id,
        name="Orchestrator Approval Test",
        project_type="web",
        files={"index.html": initial},
    )
    task_id = "task-orchestrator-approval-test"
    prompt = "mude o título para Jarvis Seguro"

    try:
        preview, resources = execute_workspace_modification(
            workspace_service=workspace_service,
            user_prompt=prompt,
            project_id=project_id,
            preview_only=True,
        )
        target = workspace_service.get_project_dir(project_id) / "index.html"
        assert target.read_text(encoding="utf-8") == initial
        assert resources == [str(target.resolve())]
        assert "Jarvis Seguro" in preview

        with pytest.raises(PermissionDeniedError, match="aprovação humana"):
            execute_workspace_modification(
                workspace_service=workspace_service,
                user_prompt=prompt,
                project_id=project_id,
                task_id=task_id,
            )
        assert target.read_text(encoding="utf-8") == initial

        approval = security_core.approval_engine.create_request(
            task_id=task_id,
            agent_role="jarvis_master",
            operation="file_write",
            impact_summary="Alterar o título do projeto de teste",
            affected_resources=resources,
            proposed_diff=preview,
        )
        security_core.approval_engine.approve_request(
            approval.id,
            decided_by="admin_test",
            decision_reason="Aprovado no teste",
        )
        message, changed = execute_workspace_modification(
            workspace_service=workspace_service,
            user_prompt=prompt,
            project_id=project_id,
            approval_id=approval.id,
            task_id=task_id,
        )
        assert "após aprovação humana" in message
        assert changed == resources
        assert "Jarvis Seguro" in target.read_text(encoding="utf-8")
    finally:
        workspace_service.delete_project(project_id)
