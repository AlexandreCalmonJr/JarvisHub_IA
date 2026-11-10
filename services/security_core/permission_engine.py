from pathlib import Path

from packages.contracts.agent import AgentRole
from packages.contracts.security import AuditEventSeverity, ProjectWorkMode

from .audit_trail import AuditTrail


class PermissionDeniedError(Exception):
    pass


# Ações críticas que exigem autorização humana explícita
CRITICAL_OPERATIONS: set[str] = {
    "file_write",
    "file_delete",
    "directory_clean",
    "git_commit",
    "git_push",
    "git_branch_switch",
    "shell_exec",
    "dependency_install",
    "network_request",
    "secret_access",
    "config_mutate",
}

# Papéis estritamente analíticos / somente-leitura
READ_ONLY_ROLES: set[AgentRole] = {
    AgentRole.RESEARCH_ANALYST,
    AgentRole.CODE_REVIEWER,
    AgentRole.THREAT_MODELING_SECURITY_ARCHITECT,
    AgentRole.PRIVACY_DATA_PROTECTION,
}


class PermissionEngine:
    """
    Motor central de autorização e políticas.
    Garante que:
    1. Apenas diretórios expressamente autorizados possam ser lidos/acessados (bloqueando path traversal e escapes).
    2. Modos de trabalho (ex: read_only, plan_only) sejam aplicados rigorosamente.
    3. Agentes de perfil analítico não executem escritas ou comandos.
    4. Nenhuma operação crítica seja executada sem aprovação humana.
    5. Agentes NÃO possam alterar suas próprias permissões.
    """

    def __init__(self, audit_trail: AuditTrail | None = None):
        self._audit_trail = audit_trail
        # Mapeamento de project_id -> raiz absoluta autorizada
        self._project_allowlists: dict[str, Path] = {}
        # Mapeamento de project_id -> modo de trabalho
        self._project_modes: dict[str, ProjectWorkMode] = {}

    def register_project(
        self, project_id: str, root_path: str, mode: ProjectWorkMode = ProjectWorkMode.READ_ONLY
    ) -> None:
        """Regista um diretório de projeto autorizado, normalizando caminhos absolutos."""
        resolved = Path(root_path).resolve()
        if not resolved.exists() or not resolved.is_dir():
            raise ValueError(
                f"O caminho do projeto '{root_path}' não existe ou não é um diretório válido."
            )

        self._project_allowlists[project_id] = resolved
        self._project_modes[project_id] = mode

        if self._audit_trail:
            self._audit_trail.record_event(
                operation="PROJECT_REGISTERED_IN_ALLOWLIST",
                status="REGISTERED",
                project_id=project_id,
                parameters={"resolved_path": str(resolved), "mode": mode.value},
                severity=AuditEventSeverity.INFO,
            )

    def set_project_mode(
        self, project_id: str, new_mode: ProjectWorkMode, authorized_by: str
    ) -> None:
        """Apenas utilizadores humanos autorizados podem alterar o modo de trabalho de um projeto."""
        if project_id not in self._project_allowlists:
            raise ValueError(f"Projeto '{project_id}' não se encontra registado.")

        # Bloqueia alteração por agentes
        if any(authorized_by == r.value for r in AgentRole):
            raise PermissionDeniedError(
                "Agentes de IA não têm permissão para alterar o modo de trabalho do projeto!"
            )

        self._project_modes[project_id] = new_mode
        if self._audit_trail:
            self._audit_trail.record_event(
                operation="PROJECT_MODE_CHANGED",
                status="UPDATED",
                user_id=authorized_by,
                project_id=project_id,
                parameters={"new_mode": new_mode.value},
                severity=AuditEventSeverity.WARNING,
            )

    def validate_path_access(self, project_id: str, target_path: str) -> Path:
        """
        Garante que target_path esteja rigorosamente dentro da raiz permitida do projeto.
        Impede ataques de path traversal (ex: ../../../windows/system32).
        """
        if project_id not in self._project_allowlists:
            raise PermissionDeniedError(
                f"Projeto '{project_id}' não possui diretório autorizado registado."
            )

        project_root = self._project_allowlists[project_id]

        # Resolve caminho absoluto tratando links simbólicos e traversals
        target = Path(target_path)
        if not target.is_absolute():
            resolved_target = (project_root / target).resolve()
        else:
            resolved_target = target.resolve()

        # Verifica contenção estrita
        try:
            resolved_target.relative_to(project_root)
        except ValueError:
            if self._audit_trail:
                self._audit_trail.record_event(
                    operation="PATH_TRAVERSAL_BLOCKED",
                    status="DENIED",
                    project_id=project_id,
                    parameters={"attempted_path": target_path, "allowed_root": str(project_root)},
                    severity=AuditEventSeverity.SECURITY_ALERT,
                    reason="Tentativa de acesso fora do diretório autorizado do projeto.",
                )
            raise PermissionDeniedError(
                f"Acesso negado: o caminho '{target_path}' está fora do diretório do projeto '{project_root}'."
            )

        return resolved_target

    def check_operation_permission(
        self,
        agent_role: AgentRole,
        project_id: str,
        operation: str,
        has_human_approval: bool = False,
    ) -> bool:
        """
        Valida se um agente tem autorização para realizar determinada operação no projeto.
        Lança PermissionDeniedError se a operação for bloqueada.
        """
        mode = self._project_modes.get(project_id, ProjectWorkMode.READ_ONLY)

        # 1. Regra de Agentes Read-Only
        if agent_role in READ_ONLY_ROLES:
            if operation in {"file_write", "file_delete", "shell_exec", "git_commit"}:
                raise PermissionDeniedError(
                    f"O agente '{agent_role.value}' possui perfil estritamente de leitura e não pode executar '{operation}'."
                )

        # 2. Regra de Modo Read-Only ou Plan-Only do Projeto
        if mode in {ProjectWorkMode.READ_ONLY, ProjectWorkMode.PLAN_ONLY}:
            if operation in {"file_write", "file_delete", "git_commit", "dependency_install"}:
                raise PermissionDeniedError(
                    f"O projeto está no modo '{mode.value}'. Operações de alteração de arquivos estão desativadas."
                )

        # 3. Operações Críticas exigem aprovação explícita
        if operation in CRITICAL_OPERATIONS and not has_human_approval:
            raise PermissionDeniedError(
                f"A operação crítica '{operation}' exige aprovação humana explícita."
            )

        return True

    def requires_approval(self, agent_role: AgentRole, operation: str) -> bool:
        """Indica se a operação é crítica e requer aprovação humana explícita."""
        return operation in CRITICAL_OPERATIONS

    def can_propose_operation(
        self, agent_role: AgentRole, project_id: str, operation: str
    ) -> bool:
        """
        Verifica se o especialista pode propor a execução da operação para aprovação.
        Agentes estritamente analíticos (READ_ONLY_ROLES) não podem propor modificações
        de código ou comandos de sistema, mas especialistas autônomos podem propor
        alterações críticas para serem aprovadas pelo operador humano no ApprovalCenter.
        """
        if agent_role in READ_ONLY_ROLES:
            if operation in {"file_write", "file_delete", "shell_exec", "git_commit"}:
                return False
        mode = self._project_modes.get(project_id, ProjectWorkMode.READ_ONLY)
        if mode in {ProjectWorkMode.READ_ONLY, ProjectWorkMode.PLAN_ONLY}:
            if operation in {"file_write", "file_delete", "git_commit", "dependency_install"}:
                return False
        return True
