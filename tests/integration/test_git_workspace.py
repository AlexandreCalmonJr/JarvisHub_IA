import subprocess
from pathlib import Path

import pytest

from packages.contracts.agent import AgentRole
from services.project_workspace.git_service import (
    GitWorkspaceManager,
    UncommittedUserChangesError,
)
from services.security_core import PermissionDeniedError, SecurityCore


def _setup_git_repo(path: Path):
    subprocess.run(["git", "init", "-b", "main"], cwd=str(path), check=True, capture_output=True)
    subprocess.run(["git", "config", "user.name", "JARVIS Test"], cwd=str(path), check=True)
    subprocess.run(["git", "config", "user.email", "test@jarvis.local"], cwd=str(path), check=True)

    # Cria arquivo inicial e commit base
    (path / "lib").mkdir()
    main_file = path / "lib" / "main.dart"
    main_file.write_text("void main() { print('Versao 1.0'); }\n")

    subprocess.run(["git", "add", "."], cwd=str(path), check=True)
    subprocess.run(["git", "commit", "-m", "chore: initial commit"], cwd=str(path), check=True)


def test_git_workspace_protection_and_approval_lifecycle(tmp_path):
    repo_dir = tmp_path / "test_repo"
    repo_dir.mkdir()
    _setup_git_repo(repo_dir)

    security = SecurityCore()
    git_manager = GitWorkspaceManager(approval_engine=security.approval_engine)

    # 1. Teste de Proteção contra sobrescrita de alterações não commitadas do utilizador
    dirty_file = repo_dir / "untracked.txt"
    dirty_file.write_text("Alteração temporária do desenvolvedor")

    with pytest.raises(
        UncommittedUserChangesError, match="alterações não commitadas do utilizador"
    ):
        git_manager.create_isolated_branch(repo_dir, task_id="task-01")

    # Limpa alteração não commitada para prosseguir
    dirty_file.unlink()

    # 2. Criação de Branch Isolada para o JARVIS
    branch = git_manager.create_isolated_branch(repo_dir, task_id="task-01")
    assert branch == "jarvis/task-01"

    # 3. Geração de Diff Unificado prévio
    proposed_code = "void main() { print('Versao 2.0 com melhoria autorizada'); }\n"
    diff = git_manager.generate_unified_diff(repo_dir, "lib/main.dart", proposed_code)
    assert "--- a/lib/main.dart" in diff
    assert "+++ b/lib/main.dart" in diff
    assert "+void main() { print('Versao 2.0 com melhoria autorizada'); }" in diff

    # 4. Tentativa de aplicação sem aprovação prévia DEVE ser bloqueada
    with pytest.raises(PermissionDeniedError, match="não aprovado"):
        git_manager.apply_approved_change(
            repo_path=repo_dir,
            rel_file_path="lib/main.dart",
            new_content=proposed_code,
            approval_id="appr-fake",
            task_id="task-01",
        )

    # 5. Criação e Aprovação Humana Legítima
    req = security.approval_engine.create_request(
        task_id="task-01",
        agent_role=AgentRole.FRONTEND_MOBILE_DEVELOPER.value,
        operation="git_commit",
        impact_summary="Atualização da versão de inicialização",
        affected_resources=["lib/main.dart"],
        proposed_diff=diff,
    )
    security.approval_engine.approve_request(req.id, decided_by="lead_developer")

    # 6. Aplicação da alteração autorizada
    commit_hash = git_manager.apply_approved_change(
        repo_path=repo_dir,
        rel_file_path="lib/main.dart",
        new_content=proposed_code,
        approval_id=req.id,
        task_id="task-01",
    )
    assert len(commit_hash) == 40
    assert (repo_dir / "lib" / "main.dart").read_text() == proposed_code

    # 7. Teste do Critério de Aceitação: Rollback bem-sucedido restaurando o estado anterior
    new_head = git_manager.rollback_last_commit(repo_dir)
    assert len(new_head) == 40
    # O conteúdo do arquivo voltou exatamente à Versão 1.0!
    assert (repo_dir / "lib" / "main.dart").read_text() == "void main() { print('Versao 1.0'); }\n"
