import json
from pathlib import Path

from services.skills_manager import SkillMetadata, SkillValidator


def make_skill(
    id: str, name: str, version: str, domain: str, desc: str, instructions: str, templates: dict
) -> dict:
    h = SkillValidator.compute_hash(instructions, templates)
    skill = SkillMetadata(
        id=id,
        name=name,
        version=version,
        origin="internal",
        license="MIT",
        description=desc,
        domain=domain,
        allowed_tools=["read_file"],
        required_permissions=["read_only"],
        content_hash=h,
        is_approved=True,
        instructions=instructions,
        templates=templates,
    )
    return skill.model_dump(mode="json")


def generate():
    out_dir = Path("skills/internal")
    out_dir.mkdir(parents=True, exist_ok=True)

    skills = [
        make_skill(
            id="react_typescript_components",
            name="React & TypeScript Component Standards",
            version="1.0.0",
            domain="web",
            desc="Padrões para componentes React funcionais com TypeScript estrito, acessibilidade e isolamento de estado.",
            instructions="Escrever componentes funcionais tipados com React.FC ou props explícitas. Evitar useEffect redundante. Garantir atributos de acessibilidade (ARIA labels e semântica HTML).",
            templates={
                "component_template": "interface Props { title: string; }\nexport const Card: React.FC<Props> = ({ title }) => <div role='region'><h2>{title}</h2></div>;",
            },
        ),
        make_skill(
            id="sql_data_modeling",
            name="SQL Data Modeling & ETL Guidelines",
            version="1.0.0",
            domain="data",
            desc="Modelagem relacional, índices, idempotência em migrações e consultas otimizadas.",
            instructions="Criar esquemas normalizados com chaves primárias e integridade referencial. Criar índices para colunas de busca frequente. Todas as operações de carga devem ser idempotentes.",
            templates={
                "migration_template": "CREATE TABLE IF NOT EXISTS metrics (\n  id TEXT PRIMARY KEY,\n  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
            },
        ),
        make_skill(
            id="devops_ci_cd_git",
            name="DevOps CI/CD & Worktree Automation",
            version="1.0.0",
            domain="operations",
            desc="Automação de pipelines de CI, containers Docker sem privilégios e Git worktrees seguras.",
            instructions="Pipelines devem executar linter, SAST e testes unitários como gates obrigatórios. Containers não devem rodar como root.",
            templates={
                "ci_job_template": "name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps: [checkout, run_tests]",
            },
        ),
        make_skill(
            id="prd_planning_management",
            name="PRD & User Story Planning",
            version="1.0.0",
            domain="management",
            desc="Elaboração de Product Requirement Documents, backlog, critérios de aceitação e estimativas.",
            instructions="Toda história de usuário deve seguir o formato 'Como [persona], quero [ação] para que [benefício]'. Critérios de aceitação devem ser verificáveis com Given/When/Then.",
            templates={
                "user_story_template": "Como desenvolvedor, quero aprovar alterações via API para que código não testado não chegue a produção.",
            },
        ),
    ]

    for s in skills:
        file_path = out_dir / f"{s['id']}.json"
        file_path.write_text(json.dumps(s, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"[OK] Skill adicional gerada: {file_path}")


if __name__ == "__main__":
    generate()
