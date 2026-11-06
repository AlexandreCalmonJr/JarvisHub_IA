import hashlib
import re

from .types import SkillMetadata

DANGEROUS_PATTERNS = [
    re.compile(r"(?i)(ignore\s+previous\s+instructions|bypass\s+polic|override\s+permission)"),
    re.compile(r"(?i)(del\s+/f\s+/s|rm\s+-rf\s+/|format\s+[a-z]:)"),
    re.compile(r"(?i)(powershell\s+-enc|invoke-expression|iex\s+)"),
    re.compile(r"(?i)(curl\s+http[s]?://|wget\s+http[s]?://)"),
]

FORBIDDEN_PERMISSIONS = {
    "system_root",
    "admin_bypass",
    "unrestricted_shell",
    "disable_audit",
    "override_kill_switch",
}


class SkillValidationError(Exception):
    pass


class SkillValidator:
    """Validador estático e de integridade para skills antes da publicação no catálogo."""

    @staticmethod
    def compute_hash(instructions: str, templates: dict) -> str:
        data = instructions + "".join(sorted(f"{k}:{v}" for k, v in templates.items()))
        return hashlib.sha256(data.encode("utf-8")).hexdigest()

    def validate(self, skill: SkillMetadata) -> tuple[bool, list[str]]:
        violations: list[str] = []

        # 1. Validação de Hash
        expected_hash = self.compute_hash(skill.instructions, skill.templates)
        if skill.content_hash != expected_hash:
            violations.append(
                f"Hash inválido: esperado {expected_hash}, obtido {skill.content_hash}"
            )

        # 2. Verificação de Tentativa de Elevação de Privilégios
        for perm in skill.required_permissions:
            if perm in FORBIDDEN_PERMISSIONS:
                violations.append(f"Permissão proibida solicitada pela skill: '{perm}'")

        # 3. Análise Estática de Instruções (Prompt Injection e Comandos Destrutivos)
        for pattern in DANGEROUS_PATTERNS:
            if pattern.search(skill.instructions):
                violations.append(
                    f"Padrão suspeito ou malicioso detetado nas instruções: {pattern.pattern}"
                )

            for t_name, t_content in skill.templates.items():
                if pattern.search(t_content):
                    violations.append(f"Padrão suspeito no template '{t_name}': {pattern.pattern}")

        # 4. Verificação de Licença
        if not skill.license or skill.license.lower() in ("unknown", "none"):
            violations.append("Licença não especificada ou desconhecida.")

        return len(violations) == 0, violations
