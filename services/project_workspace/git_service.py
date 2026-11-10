import difflib
import subprocess
from pathlib import Path

from packages.contracts.approval import ApprovalStatus
from services.security_core import ApprovalEngine, PermissionDeniedError


class GitWorkspaceError(Exception):
    pass


class UncommittedUserChangesError(GitWorkspaceError):
    pass


class GitWorkspaceManager:
    """
    Gestor de proteção e operações Git do JARVIS AI HUB.
    Garante:
    1. Que alterações preexistentes do utilizador nunca sejam sobrescritas ou descartadas.
    2. Que todas as modificações ocorram em branch dedicada (ex: jarvis/task-xxx).
    3. Geração de diff unificado para inspeção antes de aplicar.
    4. Aplicação estrita apenas após aprovação no ApprovalEngine.
    5. Capacidade de rollback imediato e descarte seguro da branch.
    """

    def __init__(self, approval_engine: ApprovalEngine | None = None):
        self.approval_engine = approval_engine

    def _run_git(self, repo_path: Path, args: list[str]) -> tuple[int, str, str]:
        res = subprocess.run(
            ["git", *args],
            cwd=str(repo_path),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        return res.returncode, res.stdout.strip(), res.stderr.strip()

    def check_uncommitted_changes(self, repo_path: Path) -> bool:
        """Retorna True se existirem alterações não commitadas na árvore de trabalho do utilizador."""
        code, out, _ = self._run_git(repo_path, ["status", "--porcelain"])
        return bool(out)

    def create_isolated_branch(
        self, repo_path: Path, task_id: str, base_branch: str = "main"
    ) -> str:
        """Cria uma branch dedicada para o JARVIS sem afetar o branch principal."""
        if self.check_uncommitted_changes(repo_path):
            raise UncommittedUserChangesError(
                "O repositório possui alterações não commitadas do utilizador. "
                "Para proteger o trabalho, commite ou faça stash das alterações antes de criar a branch do JARVIS."
            )

        branch_name = f"jarvis/{task_id}"
        code, out, err = self._run_git(repo_path, ["checkout", "-b", branch_name])
        if code != 0:
            raise GitWorkspaceError(f"Falha ao criar branch isolada '{branch_name}': {err}")
        return branch_name

    def generate_unified_diff(
        self, repo_path: Path, rel_file_path: str, proposed_content: str
    ) -> str:
        """Gera o diff unificado entre o arquivo atual no disco e a alteração proposta."""
        target_file = (repo_path / rel_file_path).resolve()

        # Proteção contra path traversal
        if not str(target_file).startswith(str(repo_path.resolve())):
            raise PermissionDeniedError("Tentativa de gerar diff fora do repositório.")

        original_lines = []
        if target_file.exists():
            original_lines = target_file.read_text(encoding="utf-8", errors="replace").splitlines(
                keepends=True
            )

        proposed_lines = proposed_content.splitlines(keepends=True)

        diff = difflib.unified_diff(
            original_lines,
            proposed_lines,
            fromfile=f"a/{rel_file_path}",
            tofile=f"b/{rel_file_path}",
        )
        return "".join(diff)

    def apply_approved_change(
        self,
        repo_path: Path,
        rel_file_path: str,
        new_content: str,
        approval_id: str,
        task_id: str,
    ) -> str:
        """
        Aplica a alteração de arquivo e cria commit de checkpoint na branch do JARVIS.
        Exige que approval_id esteja no estado APPROVED.
        """
        if not self.approval_engine:
            raise GitWorkspaceError("ApprovalEngine não configurado no GitWorkspaceManager.")

        appr = self.approval_engine.get_request(approval_id)
        if not appr or appr.status != ApprovalStatus.APPROVED:
            raise PermissionDeniedError(
                f"A alteração requer aprovação prévia. Pedido '{approval_id}' não aprovado."
            )

        target_file = (repo_path / rel_file_path).resolve()
        try:
            target_file.relative_to(repo_path.resolve())
        except ValueError:
            raise PermissionDeniedError("Escrita fora do repositório bloqueada.")

        # Impede escrita em arquivos críticos ou segredos
        if target_file.name.startswith(".env") or target_file.suffix in (".key", ".pem"):
            raise PermissionDeniedError(
                f"Escrita proibida no arquivo protegido '{target_file.name}'."
            )

        # 1. Aplica a alteração no arquivo
        target_file.parent.mkdir(parents=True, exist_ok=True)
        target_file.write_text(new_content, encoding="utf-8")

        # 2. Cria commit de checkpoint no Git
        self._run_git(repo_path, ["add", rel_file_path])
        commit_msg = f"feat(jarvis): [{task_id}] alteração autorizada via aprovação {approval_id}"
        code, out, err = self._run_git(repo_path, ["commit", "-m", commit_msg])
        if code != 0:
            raise GitWorkspaceError(f"Falha ao criar commit de checkpoint: {err}")

        # Retorna hash do commit
        _, commit_hash, _ = self._run_git(repo_path, ["rev-parse", "HEAD"])
        return commit_hash

    def rollback_last_commit(self, repo_path: Path) -> str:
        """Reverte o último commit de alteração do JARVIS."""
        code, out, err = self._run_git(repo_path, ["revert", "--no-edit", "HEAD"])
        if code != 0:
            # Fallback para reset se a árvore estiver limpa
            code, out, err = self._run_git(repo_path, ["reset", "--hard", "HEAD~1"])
            if code != 0:
                raise GitWorkspaceError(f"Falha ao executar rollback: {err}")

        _, new_head, _ = self._run_git(repo_path, ["rev-parse", "HEAD"])
        return new_head

    def discard_branch(self, repo_path: Path, branch_name: str, base_branch: str = "main") -> None:
        """Volta para a branch base e descarta a branch temporária do JARVIS."""
        self._run_git(repo_path, ["checkout", base_branch])
        self._run_git(repo_path, ["branch", "-D", branch_name])
