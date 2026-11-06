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
            id="flutter_clean_architecture",
            name="Flutter Clean Architecture & State",
            version="1.0.0",
            domain="flutter",
            desc="Boas práticas e convenções para desenvolvimento Flutter/Dart com separação de responsabilidades.",
            instructions="Ao desenvolver ou analisar código Flutter, separa as camadas de apresentação (Widgets), lógica de negócios (BLoC/Cubit) e acesso a dados (Repositories). Evita chamadas HTTP diretas nos métodos build().",
            templates={
                "bloc_template": "abstract class FeatureEvent {}\nabstract class FeatureState {}\nclass FeatureBloc extends Bloc<FeatureEvent, FeatureState> { ... }",
            },
        ),
        make_skill(
            id="fastapi_secure_backend",
            name="FastAPI Secure Backend Practices",
            version="1.0.0",
            domain="backend",
            desc="Padrões de segurança, tipagem e observabilidade para microsserviços e monólitos FastAPI.",
            instructions="Endpoints devem utilizar Pydantic v2 para validação de entrada e saída. Não expor exceções internas não tratadas no payload HTTP. Utilizar injeção de dependência para autenticação e sessões.",
            templates={
                "router_template": "@router.get('/endpoint', response_model=StandardResponse)\nasync def handler(user=Depends(get_current_user)): ...",
            },
        ),
        make_skill(
            id="owasp_code_audit",
            name="OWASP Secure Code Audit",
            version="1.0.0",
            domain="security",
            desc="Procedimento de auditoria contra OWASP Top 10 e OWASP LLM Top 10.",
            instructions="Verificar ausência de injeção SQL/Comando, desativação de transporte sem TLS, exposição de chaves privadas ou tokens no repositório e validação de permissões no backend para qualquer mutação.",
            templates={
                "audit_checklist": "1. Injeção de código/SQL: verificado\n2. Segredos em código: verificado\n3. Prevenção de Path Traversal: verificado",
            },
        ),
    ]

    for s in skills:
        file_path = out_dir / f"{s['id']}.json"
        file_path.write_text(json.dumps(s, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"[OK] Skill interna gerada: {file_path}")


if __name__ == "__main__":
    generate()
