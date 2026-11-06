from .types import SkillMetadata
from .validator import SkillValidationError, SkillValidator


class SkillsCatalog:
    """
    Catálogo central de skills aprovadas e versionadas.
    Permite busca por relevância, controle de versão, rollback e revogação.
    """

    def __init__(self, validator: SkillValidator | None = None):
        self.validator = validator or SkillValidator()
        # id -> SkillMetadata (versão ativa)
        self._skills: dict[str, SkillMetadata] = {}
        # id -> list[SkillMetadata] (histórico de versões para rollback)
        self._history: dict[str, list[SkillMetadata]] = {}

    def register_skill(self, skill: SkillMetadata, auto_approve: bool = False) -> SkillMetadata:
        is_valid, violations = self.validator.validate(skill)
        if not is_valid:
            raise SkillValidationError(
                f"Falha na validação da skill '{skill.id}': {'; '.join(violations)}"
            )

        skill.is_approved = auto_approve

        # Guarda no histórico para suporte a rollback
        if skill.id not in self._history:
            self._history[skill.id] = []
        self._history[skill.id].append(skill.model_copy())

        self._skills[skill.id] = skill
        return skill

    def approve_skill(self, skill_id: str) -> SkillMetadata:
        skill = self._skills.get(skill_id)
        if not skill:
            raise ValueError(f"Skill '{skill_id}' não encontrada.")
        skill.is_approved = True
        skill.is_revoked = False
        return skill

    def revoke_skill(self, skill_id: str, reason: str = "Revogação manual") -> SkillMetadata:
        skill = self._skills.get(skill_id)
        if not skill:
            raise ValueError(f"Skill '{skill_id}' não encontrada.")
        skill.is_approved = False
        skill.is_revoked = True
        return skill

    def rollback_skill(self, skill_id: str) -> SkillMetadata:
        history = self._history.get(skill_id, [])
        if len(history) < 2:
            raise ValueError(
                f"Não há versões anteriores disponíveis para rollback da skill '{skill_id}'."
            )

        # Remove versão atual e restaura a anterior
        history.pop()
        previous = history[-1].model_copy()
        self._skills[skill_id] = previous
        return previous

    def get_skill(self, skill_id: str) -> SkillMetadata | None:
        skill = self._skills.get(skill_id)
        if skill and skill.is_approved and not skill.is_revoked:
            return skill
        return None

    def get_relevant_skills(self, domain: str, limit: int = 3) -> list[SkillMetadata]:
        """Recupera apenas skills relevantes e aprovadas para o domínio da tarefa, limitando o contexto."""
        matches = [
            s
            for s in self._skills.values()
            if s.domain == domain and s.is_approved and not s.is_revoked
        ]
        return matches[:limit]

    def list_all_skills(self) -> list[SkillMetadata]:
        return list(self._skills.values())
