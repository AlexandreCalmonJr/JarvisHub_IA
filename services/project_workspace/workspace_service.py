import difflib
import logging
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from packages.contracts.security import ProjectWorkMode
from services.security_core import PermissionDeniedError, SecurityCore

from .analyzer import ArchitectureReport, ProjectAnalyzer
from .scanner import ProjectInventory, ProjectScanner
from .scaffolder import ProjectScaffolder
from .dockerizer import ProjectDockerizer

logger = logging.getLogger("jarvis.workspace")


class ProjectWorkspaceService:
    """
    Serviço central de Project Workspace.
    Controla o registo seguro de pastas locais, inventário, análise e scaffolding/modificação física de arquivos.
    """

    def __init__(self, security_core: SecurityCore, base_dir: Path | str | None = None):
        self.security_core = security_core
        self.scanner = ProjectScanner()
        self.analyzer = ProjectAnalyzer()
        self.scaffolder = ProjectScaffolder()
        self.dockerizer = ProjectDockerizer(workspace=self)
        self._inventories: dict[str, ProjectInventory] = {}
        self._reports: dict[str, ArchitectureReport] = {}
        self._sandbox = None
        if base_dir:
            self.base_dir = Path(base_dir).resolve()
        else:
            self.base_dir = (Path.cwd() / "workspace").resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def get_project_dir(self, project_id: str) -> Path:
        """Retorna o caminho físico seguro do diretório do projeto no computador."""
        # Se for um projeto externo registrado
        if project_id in self._inventories:
            inv = self._inventories[project_id]
            if inv.root_path and Path(inv.root_path).exists():
                return Path(inv.root_path).resolve()

        if hasattr(self.security_core, "permission_engine") and hasattr(self.security_core.permission_engine, "_project_allowlists"):
            if project_id in self.security_core.permission_engine._project_allowlists:
                return self.security_core.permission_engine._project_allowlists[project_id]

        p_dir = (self.base_dir / project_id).resolve()
        base_resolved = self.base_dir.resolve()
        try:
            p_dir.relative_to(base_resolved)
        except ValueError:
            raise PermissionDeniedError(f"Caminho do projeto fora do workspace autorizado: '{project_id}'")
        if p_dir == base_resolved:
            raise PermissionDeniedError(f"Identificador de projeto inválido: '{project_id}'")
        return p_dir

    def register_and_scan(
        self,
        project_id: str,
        folder_path: str,
        mode: ProjectWorkMode = ProjectWorkMode.READ_ONLY,
    ) -> ArchitectureReport:
        # 1. Regista no Permission Engine para garantir que apenas essa pasta seja lida
        self.security_core.permission_engine.register_project(
            project_id=project_id,
            root_path=folder_path,
            mode=mode,
        )

        resolved_path = self.security_core.permission_engine.validate_path_access(project_id, ".")

        # 2. Executa inventário de leitura
        inventory = self.scanner.scan(project_id=project_id, root_path=resolved_path)
        self._inventories[project_id] = inventory

        # 3. Executa análise de arquitetura e segurança (read-only)
        report = self.analyzer.analyze(inventory)
        self._reports[project_id] = report

        return report

    def get_inventory(self, project_id: str) -> ProjectInventory | None:
        return self._inventories.get(project_id)

    def get_report(self, project_id: str) -> ArchitectureReport | None:
        return self._reports.get(project_id)

    def _find_vscode_executable(self) -> str | None:
        """Localiza de forma resiliente o executável do VS Code no sistema operacional."""
        # 1. Verifica primeiro executáveis nativos Code.exe nos locais padrão do Windows
        if sys.platform == "win32":
            local_app = os.environ.get("LOCALAPPDATA", "")
            prog_files = os.environ.get("ProgramFiles", "C:\\Program Files")
            prog_files_x86 = os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)")

            candidates = [
                Path(local_app) / "Programs" / "Microsoft VS Code" / "Code.exe",
                Path(prog_files) / "Microsoft VS Code" / "Code.exe",
                Path(prog_files_x86) / "Microsoft VS Code" / "Code.exe",
                Path(local_app) / "Programs" / "Microsoft VS Code" / "bin" / "code.cmd",
                Path(prog_files) / "Microsoft VS Code" / "bin" / "code.cmd",
                Path(prog_files_x86) / "Microsoft VS Code" / "bin" / "code.cmd",
            ]
            for c in candidates:
                if c.exists():
                    return str(c.resolve())

        # 2. Verifica PATH global
        for cmd_name in ("Code.exe", "code.exe", "code", "code.cmd"):
            found = shutil.which(cmd_name)
            if found:
                return found

        return None

    def open_project_folder(self, project_id: str) -> str:
        """Abre o explorador de arquivos nativo do sistema operacional na pasta do projeto."""
        project_dir = self.get_project_dir(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)

        norm_path = os.path.normpath(str(project_dir.resolve()))
        logger.info("Abrindo pasta no Explorer: %s", norm_path)
        if sys.platform == "win32":
            # No Windows, invoca explorer.exe com fallback seguro para os.startfile
            opened = False
            try:
                subprocess.Popen(["explorer.exe", norm_path])
                opened = True
            except Exception as e1:
                logger.warning("subprocess explorer.exe falhou: %s. Tentando os.startfile.", e1)

            if not opened:
                try:
                    os.startfile(norm_path)
                    opened = True
                except Exception as e2:
                    logger.error("os.startfile também falhou: %s", e2)
                    raise RuntimeError(f"Não foi possível abrir o Explorer para {norm_path}: {e2}")
        elif sys.platform == "darwin":
            subprocess.Popen(["open", norm_path])
        else:
            subprocess.Popen(["xdg-open", norm_path])

        return norm_path

    def open_root_folder(self) -> str:
        """Abre o diretório geral de workspace no Windows Explorer."""
        self.base_dir.mkdir(parents=True, exist_ok=True)
        norm_path = os.path.normpath(str(self.base_dir.resolve()))
        logger.info("Abrindo pasta raiz de workspaces no Explorer: %s", norm_path)
        if sys.platform == "win32":
            try:
                subprocess.Popen(["explorer.exe", norm_path])
            except Exception:
                try:
                    os.startfile(norm_path)
                except Exception:
                    pass
        elif sys.platform == "darwin":
            subprocess.Popen(["open", norm_path])
        else:
            subprocess.Popen(["xdg-open", norm_path])
        return norm_path

    def open_project_in_editor(self, project_id: str) -> str:
        """Abre a pasta do projeto no VS Code (se instalado)."""
        project_dir = self.get_project_dir(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)
        norm_path = os.path.normpath(str(project_dir.resolve()))

        vscode_bin = self._find_vscode_executable()
        if not vscode_bin:
            raise RuntimeError(
                "O comando do Visual Studio Code ('Code.exe' ou 'code') não foi localizado no seu computador. "
                "Certifique-se de que o VS Code está instalado."
            )

        logger.info("Abrindo projeto no VS Code via executável '%s': %s", vscode_bin, norm_path)
        if sys.platform == "win32":
            if vscode_bin.lower().endswith(".exe"):
                # Executa o executável .exe diretamente sem shell=True evitando erro de aspas do cmd.exe
                subprocess.Popen([vscode_bin, norm_path])
            else:
                # Script .cmd executado via cmd.exe com passagem limpa de argumentos
                subprocess.Popen(["cmd.exe", "/c", vscode_bin, norm_path])
        else:
            subprocess.Popen([vscode_bin, norm_path])
        return norm_path

    def delete_project(self, project_id: str) -> bool:
        """Exclui fisicamente a pasta do projeto no disco e remove registros de inventário."""
        if hasattr(self.security_core, "kill_switch") and self.security_core.kill_switch.is_global_killed():
            raise PermissionDeniedError("Operação de exclusão suspensa pelo Kill Switch Global.")

        project_dir = self.get_project_dir(project_id)
        if not project_dir.exists():
            return False

        base_resolved = self.base_dir.resolve()
        if project_dir == base_resolved:
            raise PermissionDeniedError("Tentativa de exclusão da raiz de workspaces bloqueada.")

        def _remove_readonly(func, path, _):
            import os, stat
            try:
                os.chmod(path, stat.S_IWRITE)
                func(path)
            except Exception:
                pass

        shutil.rmtree(project_dir, onerror=_remove_readonly)
        self._inventories.pop(project_id, None)
        self._reports.pop(project_id, None)

        if hasattr(self.security_core, "permission_engine"):
            if hasattr(self.security_core.permission_engine, "_project_allowlists"):
                self.security_core.permission_engine._project_allowlists.pop(project_id, None)
            if hasattr(self.security_core.permission_engine, "_project_modes"):
                self.security_core.permission_engine._project_modes.pop(project_id, None)

        if self.security_core.audit:
            self.security_core.audit.record_event(
                operation="PROJECT_DELETED",
                status="SUCCESS",
                project_id=project_id,
                parameters={"path": str(project_dir)},
            )
        return True

    def _run_git(self, project_dir: Path, args: list[str]) -> subprocess.CompletedProcess:
        """Executa um comando Git estritamente isolado no repositório do projeto."""
        norm_dir = project_dir.resolve()
        git_dir = norm_dir / ".git"

        # Proteção estrita: se não tem .git próprio, não executa para não vazar para repositórios pai
        if not git_dir.exists():
            return subprocess.CompletedProcess(
                args=["git"] + args,
                returncode=128,
                stdout="",
                stderr="fatal: not a git repository",
            )

        cmd = ["git", "--git-dir", str(git_dir), "--work-tree", str(norm_dir)] + args
        return subprocess.run(
            cmd,
            cwd=str(norm_dir),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )

    async def run_shell_command(
        self,
        command: str,
        cwd: Path | None = None,
        timeout_seconds: float | None = None,
    ) -> tuple[int, str, str, float]:
        """Executa um comando de shell confinado ao diretório do projeto.

        Delega ao :class:`SubprocessSandbox`, que aplica ambiente sanitizado,
        timeout rigoroso, encerramento de processos órfãos e redação de segredos.
        """
        from services.tool_gateway.sandbox import SubprocessSandbox

        if self._sandbox is None:
            self._sandbox = SubprocessSandbox()
        target = cwd or self.base_dir
        return await self._sandbox.run_shell_command(
            command, Path(target), timeout_seconds
        )

    def ensure_git_repo(self, project_id: str) -> bool:
        """Inicializa um repositório Git local isolado no projeto se ainda não existir."""
        project_dir = self.get_project_dir(project_id)
        if not project_dir.exists():
            return False

        git_dir = project_dir / ".git"
        if not git_dir.exists() or not (git_dir / "HEAD").exists():
            try:
                # 1. Executa git init puro isolado no diretório da pasta
                init_res = subprocess.run(
                    ["git", "init"],
                    cwd=str(project_dir.resolve()),
                    capture_output=True,
                    text=True,
                )
                if init_res.returncode != 0:
                    logger.warning("Falha no git init em '%s': %s", project_dir, init_res.stderr)
                    return False

                # 2. Configura usuário local do repositório
                self._run_git(project_dir, ["config", "user.name", "JARVIS AI Hub"])
                self._run_git(project_dir, ["config", "user.email", "jarvis@local"])
                self._run_git(project_dir, ["config", "commit.gpgsign", "false"])

                # 3. Commit inicial se já houver arquivos
                self._run_git(project_dir, ["add", "-A"])
                st = self._run_git(project_dir, ["status", "--porcelain"])
                if st.stdout.strip():
                    self._run_git(project_dir, ["commit", "-m", "feat(scaffold): Inicializacao do repositorio pelo JARVIS"])
                logger.info("Repositorio Git isolado inicializado em '%s'", project_dir)
                return True
            except Exception as e:
                logger.warning("Falha ao inicializar Git para o projeto '%s': %s", project_id, e)
                return False
        return True

    def commit_project_changes(self, project_id: str, message: str) -> str | None:
        """Adiciona arquivos modificados e cria um commit Git semântico local."""
        project_dir = self.get_project_dir(project_id)
        if not project_dir.exists():
            return None

        self.ensure_git_repo(project_id)
        try:
            self._run_git(project_dir, ["add", "-A"])
            status = self._run_git(project_dir, ["status", "--porcelain"])
            if status.stdout.strip():
                clean_msg = message.replace('"', "'")
                self._run_git(project_dir, ["commit", "-m", clean_msg])
                head = self._run_git(project_dir, ["rev-parse", "--short", "HEAD"])
                commit_hash = head.stdout.strip()
                logger.info("Commit Git '%s' gerado no projeto '%s': %s", commit_hash, project_id, clean_msg)
                return commit_hash
            head = self._run_git(project_dir, ["rev-parse", "--short", "HEAD"])
            return head.stdout.strip() if head.returncode == 0 else None
        except Exception as e:
            logger.warning("Falha ao gerar commit Git no projeto '%s': %s", project_id, e)
            return None

    def rollback_last_change(self, project_id: str) -> dict:
        """Desfaz a última alteração via Git rollback no projeto local."""
        project_dir = self.get_project_dir(project_id)
        if not project_dir.exists():
            raise FileNotFoundError(f"Projeto '{project_id}' não encontrado no disco.")

        self.ensure_git_repo(project_id)

        # Verifica se há commit anterior (HEAD~1)
        check_parent = self._run_git(project_dir, ["rev-parse", "--verify", "HEAD~1"])
        if check_parent.returncode != 0:
            return {
                "status": "cannot_rollback",
                "project_id": project_id,
                "message": "O projeto está no commit inicial de criação. Não há alterações anteriores para reverter.",
            }

        last_commit_info = self._run_git(project_dir, ["log", "-1", "--pretty=format:%h - %s"])
        undone_commit = last_commit_info.stdout.strip()

        # Executa git reset --hard HEAD~1
        reset_res = self._run_git(project_dir, ["reset", "--hard", "HEAD~1"])
        if reset_res.returncode != 0:
            raise RuntimeError(f"Erro ao executar rollback Git: {reset_res.stderr}")

        new_head_res = self._run_git(project_dir, ["log", "-1", "--pretty=format:%h - %s"])
        current_head = new_head_res.stdout.strip()

        # Rescaneia inventário e atualiza arquitetura
        inventory = self.scanner.scan(project_id=project_id, root_path=project_dir)
        self._inventories[project_id] = inventory
        self._reports[project_id] = self.analyzer.analyze(inventory)

        if self.security_core.audit:
            self.security_core.audit.record_event(
                operation="PROJECT_ROLLBACK_EXECUTED",
                status="SUCCESS",
                project_id=project_id,
                parameters={"undone_commit": undone_commit, "current_head": current_head},
            )

        return {
            "status": "rolled_back",
            "project_id": project_id,
            "undone_commit": undone_commit,
            "current_head": current_head,
            "message": f"Alteração desfeita com sucesso! Repositório restaurado para: {current_head}",
        }

    def get_git_history(self, project_id: str, max_count: int = 15) -> list[dict]:
        """Retorna histórico de commits semânticos locais do projeto."""
        project_dir = self.get_project_dir(project_id)
        if not project_dir.exists():
            return []

        self.ensure_git_repo(project_id)
        log_res = self._run_git(
            project_dir,
            ["log", f"-n{max_count}", "--pretty=format:%h||%an||%ad||%s", "--date=short"],
        )
        if log_res.returncode != 0 or not log_res.stdout.strip():
            return []

        commits = []
        for line in log_res.stdout.strip().split("\n"):
            parts = line.split("||")
            if len(parts) == 4:
                commits.append({
                    "hash": parts[0],
                    "author": parts[1],
                    "date": parts[2],
                    "message": parts[3],
                })
        return commits

    def export_clean_project_zip(self, project_id: str) -> tuple[bytes, str]:
        """Gera um arquivo ZIP limpo do projeto, excluindo dependências pesadas e caches."""
        import io
        import zipfile

        project_dir = self.get_project_dir(project_id)
        if not project_dir.exists():
            raise FileNotFoundError(f"Projeto '{project_id}' não existe no disco.")

        EXCLUDED_DIRS = {
            "node_modules", ".venv", "venv", "env", "__pycache__", ".git",
            ".pytest_cache", ".mypy_cache", ".idea", ".vscode", "dist", "build",
            "target", ".gradle", "bin", "obj",
        }
        EXCLUDED_EXTS = {".pyc", ".pyo", ".pyd", ".bak", ".tmp", ".log"}

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for item in project_dir.rglob("*"):
                if item.is_file():
                    rel = item.relative_to(project_dir)
                    if any(part in EXCLUDED_DIRS for part in rel.parts):
                        continue
                    if item.suffix.lower() in EXCLUDED_EXTS:
                        continue
                    z.write(item, str(rel))
        buf.seek(0)
        return buf.getvalue(), f"{project_id}-clean.zip"

    def dockerize_project(self, project_id: str) -> dict[str, Any]:
        """Cria automaticamente Dockerfile, docker-compose.yml e .dockerignore para a stack do projeto."""
        project_dir = self.get_project_dir(project_id)
        return self.dockerizer.dockerize_project(project_id=project_id, project_dir=project_dir)

    def import_external_project(self, folder_path: str, custom_name: str | None = None) -> dict:
        """Importa e conecta uma pasta física existente no computador ao JARVIS AI HUB."""
        path = Path(folder_path).resolve()
        if not path.exists() or not path.is_dir():
            raise FileNotFoundError(f"O diretório informado não foi encontrado: '{folder_path}'")

        project_id = (custom_name or path.name).lower().replace(" ", "-").replace("_", "-")
        # Registra permissões no SecurityCore
        try:
            self.security_core.permission_engine.register_project(
                project_id=project_id,
                root_path=str(path),
                mode=ProjectWorkMode.EDIT_APPROVED,
            )
        except Exception as exc:
            logger.debug("Registo de permissão para projeto importado: %s", exc)

        inventory = self.scanner.scan(project_id=project_id, root_path=path)
        self._inventories[project_id] = inventory
        report = self.analyzer.analyze(inventory)
        self._reports[project_id] = report

        return {
            "id": project_id,
            "name": custom_name or path.name.replace("-", " ").title(),
            "path": str(path),
            "file_count": len(inventory.files) if inventory else 0,
            "files": [f.relative_path for f in inventory.files[:8]] if inventory else [],
            "report": report,
        }

    def scaffold_project(
        self,
        project_id: str,
        name: str,
        description: str = "",
        project_type: str = "web",
        files: dict[str, str] | None = None,
    ) -> dict:
        """
        Cria a pasta física no computador em workspace/<project_id>
        e grava todos os arquivos físicos do projeto (Python, Java, C#, Go, Kotlin, Flutter ou Web).
        """
        project_dir = self.get_project_dir(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)

        if not files:
            p_type = (project_type or "web").lower()
            if p_type in ("python", "py", "fastapi"):
                files = self._generate_default_python_scaffold(project_id, name, description)
            elif p_type in ("java", "spring", "maven"):
                files = self._generate_default_java_scaffold(project_id, name, description)
            elif p_type in ("csharp", "c#", "dotnet", "cs"):
                files = self._generate_default_csharp_scaffold(project_id, name, description)
            elif p_type in ("go", "golang"):
                files = self._generate_default_go_scaffold(project_id, name, description)
            elif p_type in ("kotlin", "kt"):
                files = self._generate_default_kotlin_scaffold(project_id, name, description)
            elif p_type in ("flutter", "mobile"):
                files = self._generate_default_flutter_scaffold(project_id, name, description)
            else:
                files = self._generate_default_web_scaffold(project_id, name, description)

        created_files: list[str] = []
        for rel_path, content in files.items():
            target_file = (project_dir / rel_path).resolve()
            try:
                target_file.relative_to(project_dir)
            except ValueError:
                continue
            target_file.parent.mkdir(parents=True, exist_ok=True)
            target_file.write_text(content, encoding="utf-8")
            created_files.append(rel_path)

        # Regista no Permission Engine para acesso futuro
        try:
            self.security_core.permission_engine.register_project(
                project_id=project_id,
                root_path=str(project_dir),
                mode=ProjectWorkMode.EDIT_APPROVED,
            )
        except Exception as exc:
            logger.debug("Registo de permissão já existente ou ignorado: %s", exc)

        inventory = self.scanner.scan(project_id=project_id, root_path=project_dir)
        self._inventories[project_id] = inventory
        report = self.analyzer.analyze(inventory)
        self._reports[project_id] = report

        # Inicializa repositório Git local com commit semântico de scaffold
        try:
            self.ensure_git_repo(project_id)
        except Exception as e:
            logger.debug("Aviso ao inicializar git no scaffold: %s", e)

        if self.security_core.audit:
            self.security_core.audit.record_event(
                operation="PROJECT_SCAFFOLDED",
                status="SUCCESS",
                project_id=project_id,
                parameters={"files_created": created_files, "path": str(project_dir), "project_type": project_type},
            )

        return {
            "project_id": project_id,
            "name": name,
            "root_path": str(project_dir),
            "project_type": project_type,
            "files_created": created_files,
            "report": report,
        }

    def read_project_file(self, project_id: str, rel_path: str) -> str:
        """Lê o arquivo físico do projeto no computador de forma segura."""
        project_dir = self.get_project_dir(project_id)
        if not project_dir.exists():
            raise FileNotFoundError(f"Projeto '{project_id}' não existe no disco.")

        if hasattr(self.security_core, "permission_engine"):
            if hasattr(self.security_core.permission_engine, "_project_allowlists"):
                if project_id not in self.security_core.permission_engine._project_allowlists:
                    self.security_core.permission_engine.register_project(
                        project_id=project_id,
                        root_path=str(project_dir),
                        mode=ProjectWorkMode.EDIT_APPROVED,
                    )
            target = self.security_core.permission_engine.validate_path_access(project_id, rel_path)
        else:
            target = (project_dir / rel_path).resolve()
            try:
                target.relative_to(project_dir)
            except ValueError:
                raise PermissionDeniedError(f"Caminho fora do projeto: '{rel_path}'")

        if not target.is_file():
            raise FileNotFoundError(
                f"Arquivo '{rel_path}' não foi encontrado no projeto '{project_id}'."
            )

        return target.read_text(encoding="utf-8")

    def modify_project_file(
        self,
        project_id: str,
        rel_path: str,
        new_content: str,
        reason: str = "Modificação solicitada via chat",
    ) -> dict:
        """Modifica um arquivo no disco, gerando backup .bak e diff unificado com validações de segurança."""
        if hasattr(self.security_core, "kill_switch") and self.security_core.kill_switch.is_global_killed():
            raise PermissionDeniedError("Operação de escrita suspensa pelo Kill Switch Global.")

        project_dir = self.get_project_dir(project_id)
        if not project_dir.exists():
            raise FileNotFoundError(f"Projeto '{project_id}' não existe no disco.")

        # Validação estrita via PermissionEngine (path traversal, symlinks e limites de raiz)
        if hasattr(self.security_core, "permission_engine"):
            if hasattr(self.security_core.permission_engine, "_project_allowlists"):
                if project_id not in self.security_core.permission_engine._project_allowlists:
                    self.security_core.permission_engine.register_project(
                        project_id=project_id,
                        root_path=str(project_dir),
                        mode=ProjectWorkMode.EDIT_APPROVED,
                    )
            target = self.security_core.permission_engine.validate_path_access(project_id, rel_path)
        else:
            target = (project_dir / rel_path).resolve()
            try:
                target.relative_to(project_dir)
            except ValueError:
                raise PermissionDeniedError(f"Caminho fora do projeto: '{rel_path}'")

        # Bloqueio de modificação em arquivos sensíveis e internos (.env, .pem, .key e .git)
        if target.name.startswith(".env") or target.suffix in (".key", ".pem"):
            raise PermissionDeniedError(f"Modificação proibida no arquivo protegido '{target.name}'.")
        try:
            target.relative_to(project_dir / ".git")
            raise PermissionDeniedError("Modificação direta de arquivos internos do repositório Git bloqueada.")
        except ValueError:
            pass

        old_content = target.read_text(encoding="utf-8", errors="replace") if target.is_file() else ""

        # Gera backup se o arquivo já existia
        if target.is_file():
            backup_path = target.with_suffix(target.suffix + ".bak")
            backup_path.write_text(old_content, encoding="utf-8")

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(new_content, encoding="utf-8")

        # Gera diff unificado
        diff_lines = list(
            difflib.unified_diff(
                old_content.splitlines(keepends=True),
                new_content.splitlines(keepends=True),
                fromfile=f"a/{rel_path}",
                tofile=f"b/{rel_path}",
            )
        )
        diff_str = "".join(diff_lines)

        inventory = self.scanner.scan(project_id=project_id, root_path=project_dir)
        self._inventories[project_id] = inventory
        self._reports[project_id] = self.analyzer.analyze(inventory)

        if self.security_core.audit:
            self.security_core.audit.record_event(
                operation="PROJECT_FILE_MODIFIED",
                status="SUCCESS",
                project_id=project_id,
                parameters={"file": rel_path, "diff_size": len(diff_str), "reason": reason},
            )

        commit_hash = self.commit_project_changes(project_id, f"fix({rel_path}): {reason}")

        return {
            "project_id": project_id,
            "file": rel_path,
            "diff": diff_str,
            "commit_hash": commit_hash,
            "status": "modified",
        }

    def list_available_projects(self) -> list[dict]:
        """Lista todos os projetos na pasta workspace/ e projetos registrados com caminhos absolutos e tipo."""
        if not self.base_dir.exists():
            return []
        projects = []
        seen_ids = set()

        for item in self.base_dir.iterdir():
            if item.is_dir() and not item.name.startswith("."):
                all_file_paths = [
                    p for p in item.rglob("*") if p.is_file() and not p.name.startswith(".")
                ]
                files = [p.name for p in all_file_paths]
                total_bytes = sum(p.stat().st_size for p in all_file_paths if p.exists())
                size_str = (
                    f"{round(total_bytes / (1024 * 1024), 2)} MB"
                    if total_bytes >= 1024 * 1024
                    else f"{round(total_bytes / 1024, 1)} KB"
                )
                
                # Detecta tipo de projeto
                p_type = "web"
                f_names = [f.lower() for f in files]
                if any(f.endswith(".py") or f == "requirements.txt" for f in f_names):
                    p_type = "python"
                elif any(f == "pom.xml" or f.endswith(".java") for f in f_names):
                    p_type = "java"
                elif any(f.endswith(".csproj") or f.endswith(".cs") for f in f_names):
                    p_type = "csharp"
                elif any(f == "go.mod" or f.endswith(".go") for f in f_names):
                    p_type = "go"
                elif any(f.endswith(".kt") or f.endswith(".kts") for f in f_names):
                    p_type = "kotlin"
                elif any(f == "pubspec.yaml" or f.endswith(".dart") for f in f_names):
                    p_type = "flutter"

                has_web_preview = any(f == "index.html" for f in f_names)

                seen_ids.add(item.name)
                projects.append(
                    {
                        "id": item.name,
                        "name": item.name.replace("-", " ").replace("_", " ").title(),
                        "path": str(item),
                        "project_type": p_type,
                        "file_count": len(files),
                        "files": files[:16],
                        "size_formatted": size_str,
                        "has_web_preview": has_web_preview,
                    }
                )

        # Inclui projetos externos registrados
        for pid, inv in self._inventories.items():
            if pid not in seen_ids and inv.root_path and Path(inv.root_path).exists():
                seen_ids.add(pid)
                f_names = [f.name.lower() for f in inv.files]
                p_type = "external"
                if any(f.endswith(".py") for f in f_names):
                    p_type = "python"
                elif any(f.endswith(".java") for f in f_names):
                    p_type = "java"
                elif any(f.endswith(".cs") for f in f_names):
                    p_type = "csharp"
                elif any(f.endswith(".go") for f in f_names):
                    p_type = "go"
                elif any(f.endswith(".kt") for f in f_names):
                    p_type = "kotlin"
                elif any(f.endswith(".dart") for f in f_names):
                    p_type = "flutter"

                projects.append(
                    {
                        "id": pid,
                        "name": pid.replace("-", " ").replace("_", " ").title(),
                        "path": str(inv.root_path),
                        "project_type": p_type,
                        "file_count": len(inv.files),
                        "files": [f.rel_path for f in inv.files[:12]],
                    }
                )

        return projects

    # Delegação compatível para o módulo Scaffolder desacoplado
    def _generate_english_practice_web_scaffold(self, project_dir: Path, project_name: str) -> list[str]:
        return self.scaffolder._generate_english_practice_web_scaffold(project_dir, project_name)

    def _generate_default_web_scaffold(self, project_dir: Path, project_name: str, initial_prompt: str) -> list[str]:
        return self.scaffolder._generate_default_web_scaffold(project_dir, project_name, initial_prompt)

    def _generate_default_flutter_scaffold(self, project_dir: Path, project_name: str, initial_prompt: str) -> list[str]:
        return self.scaffolder._generate_default_flutter_scaffold(project_dir, project_name, initial_prompt)

    def _generate_default_python_scaffold(self, project_dir: Path, project_name: str, initial_prompt: str) -> list[str]:
        return self.scaffolder._generate_default_python_scaffold(project_dir, project_name, initial_prompt)

    def _generate_default_java_scaffold(self, project_dir: Path, project_name: str, initial_prompt: str) -> list[str]:
        return self.scaffolder._generate_default_java_scaffold(project_dir, project_name, initial_prompt)

    def _generate_default_csharp_scaffold(self, project_dir: Path, project_name: str, initial_prompt: str) -> list[str]:
        return self.scaffolder._generate_default_csharp_scaffold(project_dir, project_name, initial_prompt)

    def _generate_default_go_scaffold(self, project_dir: Path, project_name: str, initial_prompt: str) -> list[str]:
        return self.scaffolder._generate_default_go_scaffold(project_dir, project_name, initial_prompt)

    def _generate_default_kotlin_scaffold(self, project_dir: Path, project_name: str, initial_prompt: str) -> list[str]:
        return self.scaffolder._generate_default_kotlin_scaffold(project_dir, project_name, initial_prompt)
