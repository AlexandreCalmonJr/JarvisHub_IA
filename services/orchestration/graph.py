import logging
import re

logger = logging.getLogger("jarvis.orchestration.graph")
import json
from typing import Any

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from packages.contracts.agent import AgentOutputContract, AgentRole, ResourceUsage
from services.model_runtime import InferenceRequest, ModelManager
from services.model_runtime.agent_routing import resolve_account_agent_route
from services.model_runtime.context_budget import (
    context_budget,
    estimate_tokens,
    resolve_num_ctx,
    trim_turns,
)
from services.model_runtime.provider_catalog import LOCAL_MODEL_NAMES
from services.security_core import PermissionDeniedError, SecurityCore

from .output_validation import OutputContractError, validate_and_repair_contract
from .self_correction import SelfCorrectionEngine
from .state import TaskState

AGENT_ROLE_LABELS: dict[str, str] = {
    AgentRole.JARVIS_MASTER.value: "JARVIS Maestro",
    AgentRole.SOFTWARE_ARCHITECT.value: "Arquiteto de Software",
    AgentRole.PROJECT_MANAGER.value: "Gerente de Projetos",
    AgentRole.RESEARCH_ANALYST.value: "Analista de Pesquisa Técnica",
    AgentRole.PROJECT_DESIGNER_PLANNER.value: "Designer & Planejador de Projetos",
    AgentRole.UX_UI_DESIGNER.value: "Designer de UX/UI",
    AgentRole.FRONTEND_MOBILE_DEVELOPER.value: "Desenvolvedor Frontend & Mobile",
    AgentRole.BACKEND_DEVELOPER.value: "Desenvolvedor Backend (APIs)",
    AgentRole.QA_ENGINEER.value: "Engenheiro de QA & Testes",
    AgentRole.CODE_REVIEWER.value: "Revisor de Código Sênior",
    AgentRole.DATA_SCIENTIST.value: "Cientista de Dados",
    AgentRole.BUSINESS_INTELLIGENCE.value: "Business Intelligence (BI)",
    AgentRole.DATA_ENGINEERING_INTELLIGENCE.value: "Engenheiro de Inteligência de Dados",
    AgentRole.DATA_ENGINEER_PIPELINES.value: "Engenheiro de Pipelines & ETL",
    AgentRole.DEVOPS_ENGINEER.value: "Engenheiro DevOps & CI/CD",
    AgentRole.NETWORK_INFRASTRUCTURE_ENGINEER.value: "Engenheiro de Redes & Infra",
    AgentRole.CYBERSECURITY_ENGINEER.value: "Engenheiro de Cibersegurança",
    AgentRole.AUTOMATION_ENGINEER.value: "Engenheiro de Automação",
    AgentRole.THREAT_MODELING_SECURITY_ARCHITECT.value: "Arquiteto de Modelagem de Ameaças",
    AgentRole.SECURE_CODE_AUDITOR.value: "Auditor de Código Seguro",
    AgentRole.API_SECURITY_SPECIALIST.value: "Especialista em Segurança de APIs",
    AgentRole.IDENTITY_ACCESS_MANAGEMENT.value: "Gestão de Identidade e Acesso (IAM)",
    AgentRole.SOFTWARE_SUPPLY_CHAIN_SECURITY.value: "Segurança da Cadeia de Suprimentos",
    AgentRole.SOC_INCIDENT_RESPONSE.value: "Resposta a Incidentes SOC",
    AgentRole.AI_SECURITY_RED_TEAM.value: "Red Team de Segurança de IA",
    AgentRole.PRIVACY_DATA_PROTECTION.value: "Privacidade & Proteção de Dados",
}


def get_agent_label(role: str | AgentRole) -> str:
    val = role.value if hasattr(role, "value") else str(role)
    val_clean = val.lower().strip()
    return AGENT_ROLE_LABELS.get(val_clean, val.replace("_", " ").title())


from .heuristic_engine import generate_heuristic_technical_response
from .prompt_builder import INTENT_DOMAIN_MAP, build_specialist_prompt
from .workspace_actions import execute_workspace_modification

__all__ = [
    "INTENT_DOMAIN_MAP",
    "build_specialist_prompt",
    "create_master_graph",
    "execute_workspace_modification",
    "generate_heuristic_technical_response",
]


def create_master_graph(
    security_core: SecurityCore,
    model_manager: ModelManager,
    checkpointer: MemorySaver,
    workspace_service: Any = None,
    agent_registry: Any = None,
    skills_catalog: Any = None,
    db_manager: Any = None,
    tool_gateway: Any = None,
):
    """
    Constrói o grafo de execução do JARVIS Master v1 com colaboração multi-agente e injeção de contexto.
    Fluxo:
    START -> classify_intent -> plan_task -> verify_policy -> [se requer aprovação: pause/finalize | senão: execute_or_delegate] -> validate_output -> finalize_task -> END
    """
    if agent_registry is None:
        try:
            from agents.registry import AgentRegistry

            agent_registry = AgentRegistry()
        except Exception as exc:
            logger.warning("AgentRegistry indisponível; orquestração usará fallback: %s", exc)
            agent_registry = None

    if skills_catalog is None:
        try:
            from services.skills_manager import SkillsCatalog

            skills_catalog = SkillsCatalog()
        except Exception as exc:
            logger.warning("SkillsCatalog indisponível; skills não serão carregadas: %s", exc)
            skills_catalog = None

    if db_manager is None:
        try:
            from services.memory.database import DatabaseManager

            db_manager = DatabaseManager()
        except Exception as exc:
            logger.warning("DatabaseManager indisponível; persistência desativada: %s", exc)
            db_manager = None

    async def classify_intent(state: TaskState) -> dict[str, Any]:
        prompt = state["user_prompt"].lower()
        # 1. Saudação, teste de conectividade ou conversa geral amigável
        is_greeting_or_test = prompt in (
            "teste",
            "test",
            "olá",
            "ola",
            "oi",
            "hello",
            "hi",
            "bom dia",
            "boa tarde",
            "boa noite",
            "e aí",
            "e ai",
        ) or any(
            phrase in prompt
            for phrase in (
                "quem é você",
                "quem e voce",
                "o que você faz",
                "o que voce faz",
                "como você funciona",
                "como voce funciona",
                "quais suas habilidades",
                "ajuda",
            )
        )

        if is_greeting_or_test:
            intent = "conversation"
            agents = [AgentRole.JARVIS_MASTER.value]
        elif any(
            w in prompt
            for w in (
                "mesa redonda",
                "mesa-redonda",
                "roundtable",
                "debate",
                "debater",
                "deliberação",
                "consenso",
                "consensual",
                "/debate",
                "/roundtable",
                "/consenso",
            )
        ):
            intent = "multi_agent_consensus"
            if any(
                w in prompt
                for w in (
                    "ingles",
                    "inglês",
                    "idioma",
                    "idiomas",
                    "estudo",
                    "estudar",
                    "aprender",
                    "carreira",
                    "pesquisa",
                    "educação",
                )
            ):
                agents = [
                    AgentRole.RESEARCH_ANALYST.value,
                    AgentRole.PROJECT_MANAGER.value,
                    AgentRole.QA_ENGINEER.value,
                ]
            else:
                agents = [
                    AgentRole.SOFTWARE_ARCHITECT.value,
                    AgentRole.CYBERSECURITY_ENGINEER.value,
                    AgentRole.CODE_REVIEWER.value,
                ]
        elif any(
            w in prompt
            for w in (
                "criar um site",
                "criar site",
                "cria um site",
                "crie um site",
                "fazer um site",
                "desenvolver um site",
                "criar uma pagina",
                "cria uma pagina",
                "criar página",
                "landing page",
                "criar projeto",
                "cria um projeto",
                "crie um projeto",
                "novo projeto",
                "desenvolver landing",
                "criar um app",
                "cria um app",
                "crie um app",
                "criar app",
                "criar aplicativo",
                "cria um aplicativo",
                "crie um aplicativo",
                "gerar aplicativo",
                "gerar app",
                "app mobile",
                "aplicativo mobile",
                "app flutter",
                "aplicativo flutter",
                "projeto em python",
                "projeto python",
                "api em python",
                "api python",
                "projeto em java",
                "projeto java",
                "projeto em c#",
                "projeto c#",
                "projeto em csharp",
                "projeto csharp",
                "projeto dotnet",
                "projeto em go",
                "projeto go",
                "projeto golang",
                "projeto em kotlin",
                "projeto kotlin",
                "scaffold",
                "iniciar projeto",
            )
        ):
            intent = "project_creation"
            if any(
                w in prompt
                for w in (
                    "segurança",
                    "seguranca",
                    "cyber",
                    "ciber",
                    "owasp",
                    "threat",
                    "soc",
                    "shield",
                    "pentest",
                    "vulnerabilidade",
                    "firewall",
                )
            ):
                agents = [
                    AgentRole.JARVIS_MASTER.value,
                    AgentRole.CYBERSECURITY_ENGINEER.value,
                    AgentRole.SOFTWARE_ARCHITECT.value,
                    AgentRole.FRONTEND_MOBILE_DEVELOPER.value,
                    AgentRole.QA_ENGINEER.value,
                ]
            else:
                agents = [
                    AgentRole.SOFTWARE_ARCHITECT.value,
                    AgentRole.FRONTEND_MOBILE_DEVELOPER.value,
                    AgentRole.QA_ENGINEER.value,
                ]
        elif (
            len(prompt.split()) >= 6
            and any(
                marker in prompt
                for marker in (
                    "analise",
                    "análise",
                    "analisar",
                    "investigue",
                    "investigar",
                    "resolver",
                    "solucionar",
                    "diagnosticar",
                    "estratégia",
                    "planejamento",
                    "decisão",
                    "compare",
                    "avaliar",
                    "problema",
                    "problemas",
                    "causa",
                    "causas",
                )
            )
            and not any(
                action in prompt
                for action in (
                    "corrigir",
                    "corrija",
                    "implementar",
                    "implemente",
                    "editar",
                    "edite",
                    "modificar",
                    "modifique",
                    "mudar",
                    "mude",
                    "alterar",
                    "altere",
                    "adicionar",
                    "adicione",
                    "trocar",
                    "troque",
                    "atualizar",
                    "atualize",
                )
            )
        ):
            # Problemas abertos e decisões complexas convocam a mesa redonda
            # sem exigir que o utilizador conheça comandos como /debate.
            intent = "multi_agent_consensus"
            agents = [
                AgentRole.SOFTWARE_ARCHITECT.value,
                AgentRole.CYBERSECURITY_ENGINEER.value,
                AgentRole.CODE_REVIEWER.value,
            ]
        elif any(w in prompt for w in ("arquitetura", "estrutura", "diagrama", "módulos")):
            intent = "architecture_analysis"
            agents = [AgentRole.SOFTWARE_ARCHITECT.value, AgentRole.PROJECT_MANAGER.value]
        elif any(
            w in prompt for w in ("segurança", "vulnerabilidade", "threat", "owasp", "auditar")
        ):
            intent = "security_audit"
            agents = [AgentRole.CYBERSECURITY_ENGINEER.value, AgentRole.SECURE_CODE_AUDITOR.value]
        elif any(
            w in prompt
            for w in (
                "editar",
                "edite",
                "alterar",
                "altere",
                "adicionar",
                "adicione",
                "corrigir",
                "implementar",
                "fix",
                "mudar",
                "mude",
                "modificar",
                "modifique",
                "trocar",
                "troque",
                "atualizar",
                "atualize",
            )
        ):
            intent = "code_modification"
            agents = [AgentRole.FRONTEND_MOBILE_DEVELOPER.value, AgentRole.QA_ENGINEER.value]
        elif any(w in prompt for w in ("teste", "testes", "qa", "validar")):
            intent = "qa_testing"
            agents = [AgentRole.QA_ENGINEER.value, AgentRole.CODE_REVIEWER.value]
        elif any(
            w in prompt
            for w in (
                "python",
                "pyhton",
                "javascript",
                "typescript",
                "java",
                "c#",
                "csharp",
                "golang",
                "kotlin",
                "rust",
                "react",
                "flutter",
                "dart",
                "docker",
                "fastapi",
                "sql",
                "sqlite",
                "postgres",
                "mongodb",
                "api",
                "backend",
                "frontend",
                "git",
                "programar",
                "linguagem",
                "algoritmo",
                "codigo",
                "código",
                "ti",
                "tecnologia",
                "computação",
                "computacao",
                "arquitetura",
                "infraestrutura",
                "sistemas",
            )
        ) and any(
            q in prompt
            for q in (
                "como",
                "o que",
                "oque",
                "quero saber",
                "me fale",
                "me explique",
                "ensine",
                "aprender",
                "tutorial",
                "diferença",
                "qual",
                "quais",
                "por que",
                "porque",
                "exemplo",
                "guia",
                "documentação",
                "principais",
                "bibliotecas",
                "frameworks",
                "começar",
                "iniciar",
                "entender",
                "saber",
            )
        ):
            intent = "code_explanation"
            agents = [AgentRole.SOFTWARE_ARCHITECT.value]
        else:
            intent = "conversation"
            agents = [AgentRole.JARVIS_MASTER.value]

        return {
            "classified_intent": intent,
            "selected_agents": agents,
        }

    async def plan_task(state: TaskState) -> dict[str, Any]:
        intent = state.get("classified_intent", "general_planning")
        prompt = state["user_prompt"]

        if intent == "conversation":
            steps = [
                "1. Interpretar a mensagem e o contexto da conversa.",
                "2. Responder diretamente, sem convocar especialistas desnecessariamente.",
            ]
        elif intent == "project_creation":
            p_low = prompt.lower()
            if any(
                w in p_low
                for w in (
                    "segurança",
                    "seguranca",
                    "cyber",
                    "ciber",
                    "owasp",
                    "threat",
                    "soc",
                    "shield",
                    "pentest",
                    "vulnerabilidade",
                )
            ):
                steps = [
                    "1. Convocar Mesa Redonda com JARVIS Maestro, Cibersegurança, Arquiteto, Dev Frontend e QA.",
                    "2. Auditoria de Cibersegurança & Conformidade OWASP Top 10 (Engenheiro de Cibersegurança).",
                    "3. Desenho de Topologia Modular e Arquitetura Defensiva em 3 Camadas (Arquiteto de Software).",
                    "4. Criação da pasta física no disco do computador em workspace/site-seguranca.",
                    "5. Implementação da interface Dark Cyber, Scanner Interativo e Feed SOC (Dev Frontend).",
                    "6. Auditoria estática de qualidade, validação de inputs e testes de carga (Engenheiro de QA).",
                    "7. Emissão e compilação dos relatórios técnicos de cada especialista para a Mesa Redonda.",
                ]
            else:
                steps = [
                    "1. Interpretar escopo, tema e requisitos do website a partir do pedido.",
                    "2. Selecionar arquitetura limpa e padrões de layout responsivo (HTML5/CSS3 moderno).",
                    "3. Criar diretório físico dedicado no computador em workspace/<projeto>.",
                    "4. Gerar e gravar arquivos físicos: index.html, style.css, app.js e README.md.",
                    "5. Validar integridade e registar projeto no Project Workspace do dashboard.",
                ]
        elif intent == "code_modification":
            steps = [
                "1. Identificar projeto de destino e arquivos afetados no computador.",
                "2. Ler conteúdo atual dos arquivos físicos do projeto em workspace/.",
                "3. Aplicar as alterações solicitadas com geração de backup de segurança (.bak).",
                "4. Gravar arquivo modificado e emitir diff unificado para auditoria.",
            ]
        elif intent == "code_explanation":
            steps = [
                "1. Analisar os fundamentos técnicos e arquiteturais da tecnologia solicitada.",
                "2. Elaborar explicação didática e completa com exemplos de código funcionais.",
                "3. Apresentar o ecossistema, melhores práticas e próximos passos recomendados.",
            ]
        elif intent == "multi_agent_consensus":
            steps = [
                "1. Convocar Mesa Redonda Técnica com Arquiteto, Cibersegurança e Revisor de Código.",
                "2. Avaliação Arquitetural & Viabilidade Técnica (Software Architect).",
                "3. Auditoria de Superfície de Ataque & Riscos OWASP (Cybersecurity Engineer).",
                "4. Revisão de Qualidade, Manutenibilidade & YAGNI (Code Reviewer).",
                "5. Deliberação e Resolução Consensual Executiva (JARVIS Maestro).",
            ]
        elif intent == "security_audit":
            steps = [
                "1. Convocar Engenheiro de Cibersegurança e Auditor de Código Seguro.",
                "2. Inspecionar arquivos físicos e dependências do projeto em workspace/.",
                "3. Avaliar vulnerabilidades segundo o OWASP Top 10 (XSS, CSP, Injeção, Segredos).",
                "4. Emitir parecer técnico de defesa ativa com recomendações e correções de código.",
            ]
        else:
            steps = [
                f"1. Interpretar contexto e objetivo do pedido: '{prompt[:60]}...'",
                "2. Validar conformidade de segurança e modo de trabalho do projeto.",
                f"3. Executar análise com os especialistas selecionados: {', '.join(state.get('selected_agents', []))}.",
                "4. Consolidar plano, riscos e recomendações de próximos passos.",
            ]
        return {"plan_steps": steps}

    async def verify_policy(state: TaskState) -> dict[str, Any]:
        intent = state.get("classified_intent")
        project_id = state.get("project_id")
        violations: list[str] = []
        approval_required = False
        approval_id = None

        if intent == "code_modification":
            # Nenhuma escrita física é tratada como "edição rápida": todas exigem
            # pré-visualização e aprovação humana, inclusive projetos já registados.
            approval_required = True
            if not workspace_service:
                violations.append("Serviço de workspace indisponível; alteração bloqueada.")
            else:
                try:
                    preview, affected_resources = execute_workspace_modification(
                        workspace_service=workspace_service,
                        user_prompt=state["user_prompt"],
                        project_id=project_id,
                        preview_only=True,
                    )
                    if not affected_resources:
                        raise PermissionDeniedError(
                            "Não foi possível determinar o recurso físico que seria alterado."
                        )
                    appr = security_core.approval_engine.create_request(
                        task_id=state["task_id"],
                        owner_user_id=state.get("owner_user_id"),
                        agent_role=AgentRole.JARVIS_MASTER.value,
                        operation="file_write",
                        impact_summary=(
                            f"Alteração de código solicitada pelo utilizador: "
                            f"'{state['user_prompt']}'"
                        ),
                        affected_resources=affected_resources,
                        proposed_diff=preview,
                        reversible=True,
                    )
                    approval_id = appr.id
                except Exception as exc:
                    violations.append(
                        f"Pré-visualização da alteração falhou; nenhuma escrita foi realizada: {exc}"
                    )

        return {
            "policy_verified": len(violations) == 0,
            "policy_violations": violations,
            "approval_required": approval_required,
            "approval_id": approval_id,
        }

    async def execute_or_delegate(state: TaskState) -> dict[str, Any]:
        selected = state.get("selected_agents", [AgentRole.JARVIS_MASTER.value])
        intent = state.get("classified_intent", "general_planning")
        user_prompt = state["user_prompt"]
        p_lower = user_prompt.lower()
        project_id = state.get("project_id")
        domain = INTENT_DOMAIN_MAP.get(intent, "general")
        primary_agent = selected[0]
        # Resolução dinâmica do modelo preferencial do especialista primário
        prim_profile = None
        if agent_registry:
            try:
                prim_profile = agent_registry.get_profile(AgentRole(primary_agent))
            except Exception as exc:
                logger.debug("Perfil do agente principal indisponível: %s", exc)
        is_hybrid_active = bool(
            model_manager.hybrid_router
            and getattr(model_manager.hybrid_router, "online_config", None)
            and model_manager.hybrid_router.online_config.enabled
        )
        hybrid_default = (
            getattr(
                getattr(model_manager.hybrid_router, "online_config", None),
                "default_model",
                "qwen/qwen3.8-27b",
            )
            if is_hybrid_active
            else "auto"
        )

        pref = (
            prim_profile.preferred_model
            if prim_profile
            else ("auto_hybrid" if is_hybrid_active else "auto")
        )
        if not pref or pref in ("auto", "auto_hybrid"):
            # Delega a escolha ao seletor governado do ModelManager.
            model_name = "auto_hybrid" if is_hybrid_active else "auto"
        elif is_hybrid_active and pref in LOCAL_MODEL_NAMES:
            model_name = hybrid_default
        else:
            # Preferências explícitas e personalizadas do perfil são preservadas.
            model_name = pref

        key_vault = getattr(getattr(model_manager, "hybrid_router", None), "key_vault", None)

        def _route_for(role_name: str, profile_obj: Any, fallback_model: str) -> Any:
            return resolve_account_agent_route(
                db_manager=db_manager,
                key_vault=key_vault,
                owner_user_id=state.get("owner_user_id"),
                agent_role=role_name,
                fallback_key_id=getattr(profile_obj, "assigned_key_id", None),
                fallback_model=fallback_model,
            )

        prim_route = _route_for(primary_agent, prim_profile, model_name)
        if prim_route.source == "account" and prim_route.model:
            model_name = prim_route.model
        primary_key_id = prim_route.key_id

        # Tenta inferir target_project se não especificado explicitamente
        if not project_id and workspace_service:
            try:
                for prj in workspace_service.list_available_projects():
                    p_id = prj["id"].lower()
                    p_norm = p_id.replace("-", " ")
                    if (
                        p_id in p_lower
                        or p_norm in p_lower
                        or any(part in p_lower for part in p_id.split("-") if len(part) > 3)
                    ):
                        project_id = prj["id"]
                        break
            except Exception as exc:
                logger.debug("Projeto não identificado automaticamente: %s", exc)
        agent_outputs: list[dict[str, Any]] = []
        created_slug = None
        created_files: list[str] = []

        # 1. Criação física de Projeto orientada a Raciocínio Multi-Agente & Skills Reais
        if intent == "project_creation" and workspace_service:
            if any(w in p_lower for w in ("python", "py", "fastapi", "flask", "django")):
                project_type = "python"
                prefix = "py"
                dev_role = AgentRole.BACKEND_DEVELOPER
            elif any(
                w in p_lower
                for w in ("node.js", "nodejs", "node", "express", "typescript", "javascript")
            ):
                project_type = "node"
                prefix = "node"
                dev_role = AgentRole.BACKEND_DEVELOPER
            elif any(w in p_lower for w in ("java", "spring", "maven", "gradle")):
                project_type = "java"
                prefix = "java"
                dev_role = AgentRole.BACKEND_DEVELOPER
            elif any(w in p_lower for w in ("c#", "csharp", "c ##", "dotnet", ".net", "aspnet")):
                project_type = "csharp"
                prefix = "cs"
                dev_role = AgentRole.BACKEND_DEVELOPER
            elif any(
                w in p_lower
                for w in ("golang", "go ", "em go", "projeto go", "api em go", "app em go")
            ):
                project_type = "go"
                prefix = "go"
                dev_role = AgentRole.BACKEND_DEVELOPER
            elif any(w in p_lower for w in ("kotlin", "ktor")):
                project_type = "kotlin"
                prefix = "kt"
                dev_role = AgentRole.BACKEND_DEVELOPER
            elif any(
                w in p_lower
                for w in ("mobile", "app", "aplicativo", "flutter", "celular", "apk", "android")
            ):
                project_type = "flutter"
                prefix = "app"
                dev_role = AgentRole.FRONTEND_MOBILE_DEVELOPER
            else:
                project_type = "web"
                prefix = "site"
                dev_role = AgentRole.FRONTEND_MOBILE_DEVELOPER

            arch_role = AgentRole.SOFTWARE_ARCHITECT
            qa_role = AgentRole.QA_ENGINEER
            sec_role = AgentRole.CYBERSECURITY_ENGINEER

            slug = None
            is_english = any(
                k in p_lower
                for k in (
                    "ingles",
                    "inglês",
                    "english",
                    "exercicios",
                    "exercício",
                    "exercicio",
                    "quiz",
                    "praticas",
                    "prática",
                )
            )
            is_security = any(
                k in p_lower
                for k in (
                    "segurança",
                    "seguranca",
                    "cyber",
                    "ciber",
                    "owasp",
                    "threat",
                    "soc",
                    "shield",
                    "pentest",
                    "vulnerabilidade",
                    "firewall",
                    "antivirus",
                )
            )

            if is_english:
                slug = "site-exercicios-ingles"
                state["selected_agents"] = [arch_role.value, dev_role.value, qa_role.value]
            elif is_security:
                slug = "site-seguranca"
                state["selected_agents"] = [
                    AgentRole.JARVIS_MASTER.value,
                    sec_role.value,
                    arch_role.value,
                    dev_role.value,
                    qa_role.value,
                ]
            else:
                state["selected_agents"] = [arch_role.value, dev_role.value, qa_role.value]
                for kw in (
                    "cafeteria",
                    "cafe",
                    "restaurante",
                    "pizzaria",
                    "portfolio",
                    "loja",
                    "blog",
                    "ecommerce",
                    "clinica",
                    "barbearia",
                    "padaria",
                    "hotel",
                    "academia",
                    "tarefas",
                    "financeiro",
                    "educacao",
                    "cursos",
                    "dashboard",
                    "api",
                    "backend",
                    "service",
                    "auth",
                ):
                    if kw in p_lower:
                        slug = f"{prefix}-{kw}"
                        break
            if not slug:
                words = re.findall(r"[a-zA-Z0-9]+", p_lower)
                filtered = [
                    w
                    for w in words
                    if w
                    not in (
                        "criar",
                        "cria",
                        "crie",
                        "fazer",
                        "um",
                        "uma",
                        "site",
                        "para",
                        "mim",
                        "com",
                        "de",
                        "e",
                        "novo",
                        "projeto",
                        "web",
                        "pagina",
                        "simples",
                        "app",
                        "aplicativo",
                        "mobile",
                        "flutter",
                        "celular",
                        "podemos",
                        "pode",
                        "consigo",
                        "realizar",
                        "praticas",
                        "pratica",
                        "como",
                        "fazer",
                        "python",
                        "java",
                        "csharp",
                        "dotnet",
                        "go",
                        "golang",
                        "kotlin",
                    )
                ]
                if filtered:
                    slug = f"{prefix}-{'-'.join(filtered[:2])}"
                else:
                    slug = f"meu-{prefix}-{state['task_id'][-4:]}"

            created_slug = slug
            name_clean = slug.replace("-", " ").title()

            # --- ETAPA 1: Raciocínio Real do Arquiteto de Software (Software Architect) via LLM ---
            arch_sys = build_specialist_prompt(
                agent_role=arch_role.value,
                agent_registry=agent_registry,
                skills_catalog=skills_catalog,
                db_manager=db_manager,
                owner_user_id=state.get("owner_user_id"),
                intent="project_creation",
                user_prompt=user_prompt,
                project_id=slug,
                domain="frontend" if project_type in ("web", "flutter") else "backend",
            )
            arch_profile = agent_registry.get_profile(arch_role) if agent_registry else None
            arch_route = _route_for(arch_role.value, arch_profile, model_name)
            arch_model = arch_route.model or model_name
            arch_req = InferenceRequest(
                prompt=(
                    f"Como Arquiteto de Software, analise e delibere sobre a concepção técnica, modularidade e estrutura "
                    f"do projeto '{name_clean}' ({project_type}) solicitado pelo usuário: '{user_prompt}'. "
                    f"Apresente seu parecer de arquitetura, separação de responsabilidades e componentes que serão gerados."
                ),
                system_prompt=arch_sys,
                model_name=arch_model,
                max_tokens=300,
                temperature=0.3,
                timeout_seconds=20.0,
                task_id=state.get("task_id"),
                owner_user_id=state.get("owner_user_id"),
                agent_role=arch_role.value,
                key_id=arch_route.key_id,
            )
            arch_p_tokens = 0
            arch_c_tokens = 0
            arch_dur_ms = 0.0
            arch_error: str | None = None
            try:
                arch_resp = await model_manager.generate(arch_req)
                arch_summary = arch_resp.content.strip()
                arch_p_tokens = arch_resp.prompt_tokens
                arch_c_tokens = arch_resp.completion_tokens
                arch_dur_ms = arch_resp.duration_ms
            except Exception as exc:
                logger.warning("Arquiteto de Software indisponível: %s", exc)
                # Falha do provedor nunca vira "arquitetura aprovada".
                arch_error = f"{type(exc).__name__}: {exc}"[:200]
                arch_summary = (
                    f"O Arquiteto de Software não produziu parecer de arquitetura para "
                    f"'{slug}': o provedor de inferência falhou ou está indisponível."
                )

            # --- ETAPA 1.5: Auditoria do Especialista em Cibersegurança (quando aplicável) ---
            sec_summary = ""
            sec_error: str | None = None
            if is_security:
                sec_sys = build_specialist_prompt(
                    agent_role=sec_role.value,
                    agent_registry=agent_registry,
                    skills_catalog=skills_catalog,
                    db_manager=db_manager,
                    owner_user_id=state.get("owner_user_id"),
                    intent="security_audit",
                    user_prompt=user_prompt,
                    project_id=slug,
                    domain="security",
                )
                sec_profile = agent_registry.get_profile(sec_role) if agent_registry else None
                sec_route = _route_for(sec_role.value, sec_profile, model_name)
                sec_req = InferenceRequest(
                    prompt=(
                        f"Como Engenheiro de Cibersegurança, analise os requisitos de defesa ativa, modelagem de ameaças "
                        f"e conformidade com o OWASP Top 10 para o projeto '{name_clean}' solicitado pelo usuário: '{user_prompt}'."
                    ),
                    system_prompt=sec_sys,
                    model_name=sec_route.model or model_name,
                    max_tokens=300,
                    temperature=0.3,
                    timeout_seconds=20.0,
                    task_id=state.get("task_id"),
                    owner_user_id=state.get("owner_user_id"),
                    agent_role=sec_role.value,
                    key_id=sec_route.key_id,
                )
                try:
                    sec_resp = await model_manager.generate(sec_req)
                    sec_summary = sec_resp.content.strip()
                except Exception as exc:
                    logger.warning("Engenheiro de Cibersegurança indisponível: %s", exc)
                    # Nunca emitir um atestado de segurança sem auditoria real.
                    sec_error = f"{type(exc).__name__}: {exc}"[:200]
                    sec_summary = (
                        f"A auditoria de cibersegurança de '{slug}' NÃO foi executada: "
                        "o provedor de inferência falhou ou está indisponível."
                    )

            # --- ETAPA 2: Geração Física dos Arquivos pelo Desenvolvedor Especialista ---
            custom_files: dict[str, str] = {}
            if project_type == "web" and is_english:
                custom_files = workspace_service._generate_english_practice_web_scaffold(
                    slug,
                    name_clean,
                    f"Plataforma completa de exercícios e prática de inglês para '{user_prompt}'",
                )
            elif project_type == "web" and is_security:
                custom_files = workspace_service.scaffolder._generate_security_web_scaffold(
                    slug,
                    name_clean,
                    f"Portal completo de Cibersegurança e Inteligência de Ameaças para '{user_prompt}'",
                )

            # Projeto novo também é uma escrita no Workspace: nenhuma pasta/arquivo
            # é criada antes da aprovação humana vinculada ao caminho e payload proposto.
            project_root = workspace_service.get_project_dir(slug).resolve()
            if project_root.exists():
                return {
                    "policy_violations": [
                        f"O projeto '{slug}' já existe. Selecione um identificador novo ou trate a atualização como modificação aprovada."
                    ],
                    "final_summary": f"Criação bloqueada: o projeto '{slug}' já existe.",
                    "is_completed": False,
                }

            # As equipas Dev e QA produzem os seus pareceres antes da aprovação,
            # mas não recebem autorização para criar ou alterar ficheiros.
            dev_summary = (
                f"Plano de implementação preparado para {name_clean}; a escrita aguarda aprovação."
            )
            dev_tokens = 0
            dev_duration = 0.0
            dev_profile = agent_registry.get_profile(dev_role) if agent_registry else None
            dev_route = _route_for(dev_role.value, dev_profile, model_name)
            try:
                dev_resp = await model_manager.generate(
                    InferenceRequest(
                        prompt=(
                            f"Como Desenvolvedor Especialista, prepare o plano de implementação para "
                            f"'{name_clean}' ({project_type}). Pedido: {user_prompt}. "
                            "Descreva módulos, ficheiros previstos e dependências. Não execute nem grave ficheiros."
                        ),
                        system_prompt=build_specialist_prompt(
                            agent_role=dev_role.value,
                            agent_registry=agent_registry,
                            skills_catalog=skills_catalog,
                            db_manager=db_manager,
                            owner_user_id=state.get("owner_user_id"),
                            intent="project_creation",
                            user_prompt=user_prompt,
                            project_id=slug,
                            domain="frontend" if project_type in ("web", "flutter") else "backend",
                        ),
                        model_name=dev_route.model or model_name,
                        max_tokens=300,
                        temperature=0.3,
                        timeout_seconds=20.0,
                        task_id=state.get("task_id"),
                        owner_user_id=state.get("owner_user_id"),
                        agent_role=dev_role.value,
                        key_id=dev_route.key_id,
                    )
                )
                dev_summary = dev_resp.content.strip()
                dev_tokens = dev_resp.completion_tokens
                dev_duration = dev_resp.duration_ms
            except Exception as exc:
                logger.info("Plano do Desenvolvedor Especialista indisponível: %s", exc)

            qa_summary = (
                f"Plano de QA preparado para {name_clean}: validar estrutura, execução, "
                "dependências e cenários principais após a criação aprovada."
            )
            qa_tokens = 0
            qa_duration = 0.0
            qa_profile = agent_registry.get_profile(qa_role) if agent_registry else None
            qa_route = _route_for(qa_role.value, qa_profile, model_name)
            try:
                qa_resp = await model_manager.generate(
                    InferenceRequest(
                        prompt=(
                            f"Como Engenheiro de QA, prepare critérios de aceitação e testes para "
                            f"'{name_clean}' ({project_type}). Pedido: {user_prompt}. "
                            "Não execute testes nem altere ficheiros."
                        ),
                        system_prompt=build_specialist_prompt(
                            agent_role=qa_role.value,
                            agent_registry=agent_registry,
                            skills_catalog=skills_catalog,
                            db_manager=db_manager,
                            owner_user_id=state.get("owner_user_id"),
                            intent="project_creation",
                            user_prompt=user_prompt,
                            project_id=slug,
                            domain="quality_assurance",
                        ),
                        model_name=qa_route.model or model_name,
                        max_tokens=300,
                        temperature=0.2,
                        timeout_seconds=20.0,
                        task_id=state.get("task_id"),
                        owner_user_id=state.get("owner_user_id"),
                        agent_role=qa_role.value,
                        key_id=qa_route.key_id,
                    )
                )
                qa_summary = qa_resp.content.strip()
                qa_tokens = qa_resp.completion_tokens
                qa_duration = qa_resp.duration_ms
            except Exception as exc:
                logger.info("Plano de QA indisponível: %s", exc)

            agent_outputs.extend(
                [
                    AgentOutputContract(
                        agent_role=arch_role.value,
                        objective="Arquitetura do novo projeto",
                        summary=arch_summary,
                        evidence=(
                            []
                            if arch_error
                            else [f"Parecer de arquitetura produzido por '{arch_model}'."]
                        ),
                        actions_taken=(
                            []
                            if arch_error
                            else ["Análise de requisitos", "Planeamento de arquitetura"]
                        ),
                        affected_files=[],
                        tests_executed=[],
                        risks=[],
                        blockers=(
                            [f"Arquiteto de Software indisponível ({arch_error})."]
                            if arch_error
                            else []
                        ),
                        resource_usage=ResourceUsage(
                            model_name=model_name,
                            tokens_prompt=arch_p_tokens,
                            tokens_completion=arch_c_tokens,
                            duration_ms=arch_dur_ms,
                        ),
                        next_recommendation=(
                            "Restabelecer o provedor de inferência e repetir a fase de arquitetura."
                            if arch_error
                            else "Rever o plano e aprovar a criação do projeto."
                        ),
                    ).model_dump(),
                    AgentOutputContract(
                        agent_role=dev_role.value,
                        objective="Plano de implementação",
                        summary=dev_summary,
                        evidence=["Plano técnico preparado; nenhuma alteração física executada."],
                        actions_taken=["Planeamento de módulos e ficheiros"],
                        affected_files=[],
                        tests_executed=[],
                        risks=[],
                        blockers=[],
                        resource_usage=ResourceUsage(
                            model_name=model_name,
                            tokens_prompt=0,
                            tokens_completion=dev_tokens,
                            duration_ms=dev_duration,
                        ),
                        next_recommendation="Implementar após a aprovação humana.",
                    ).model_dump(),
                    AgentOutputContract(
                        agent_role=qa_role.value,
                        objective="Plano de qualidade e aceitação",
                        summary=qa_summary,
                        evidence=["Critérios de QA preparados; nenhum teste foi executado."],
                        actions_taken=["Planeamento de critérios de aceitação"],
                        affected_files=[],
                        tests_executed=[],
                        risks=[],
                        blockers=[],
                        resource_usage=ResourceUsage(
                            model_name=model_name,
                            tokens_prompt=0,
                            tokens_completion=qa_tokens,
                            duration_ms=qa_duration,
                        ),
                        next_recommendation="Executar testes após a criação aprovada.",
                    ).model_dump(),
                ]
            )
            if is_security and sec_summary:
                agent_outputs.append(
                    AgentOutputContract(
                        agent_role=sec_role.value,
                        objective="Revisão defensiva do projeto",
                        summary=sec_summary,
                        evidence=(
                            []
                            if sec_error
                            else ["Revisão de requisitos de segurança; sem escrita no workspace."]
                        ),
                        actions_taken=[] if sec_error else ["Análise defensiva e de ameaças"],
                        affected_files=[],
                        tests_executed=[],
                        risks=[],
                        blockers=(
                            [f"Engenheiro de Cibersegurança indisponível ({sec_error})."]
                            if sec_error
                            else []
                        ),
                        resource_usage=ResourceUsage(
                            model_name=model_name,
                            tokens_prompt=0,
                            tokens_completion=0,
                            duration_ms=0.0,
                        ),
                        next_recommendation=(
                            "Restabelecer o provedor e executar a auditoria de segurança antes de publicar."
                            if sec_error
                            else "Validar os controlos durante a implementação aprovada."
                        ),
                    ).model_dump()
                )

            pending_project = {
                "project_id": slug,
                "name": name_clean,
                "description": (
                    f"Projeto {project_type.upper()} criado pelo JARVIS AI HUB "
                    f"a partir do pedido: '{state['user_prompt']}'"
                ),
                "project_type": project_type,
                "database": (
                    "sqlite"
                    if project_type in {"python", "py", "fastapi", "node"}
                    and re.search(r"\bsqlite(?:3)?\b", state["user_prompt"], re.IGNORECASE)
                    else "none"
                ),
                "files": custom_files if custom_files else None,
            }
            approval_preview = json.dumps(
                {
                    "project_id": slug,
                    "name": name_clean,
                    "project_type": project_type,
                    "database": pending_project["database"],
                    "files": custom_files or "Scaffold padrão do tipo selecionado",
                },
                ensure_ascii=False,
                indent=2,
            )
            approval = security_core.approval_engine.create_request(
                task_id=state["task_id"],
                owner_user_id=state.get("owner_user_id"),
                agent_role=AgentRole.JARVIS_MASTER.value,
                operation="project_create",
                impact_summary=(
                    f"Criar projeto {project_type.upper()} '{name_clean}' no Workspace "
                    f"com base no pedido: {state['user_prompt']}"
                ),
                affected_resources=[str(project_root)],
                proposed_diff=approval_preview,
                reversible=True,
            )
            return {
                "approval_required": True,
                "approval_id": approval.id,
                "pending_project": pending_project,
                "agent_outputs": agent_outputs,
                "final_summary": (
                    f"Projeto '{name_clean}' preparado. A criação física aguarda aprovação humana."
                ),
                "is_completed": False,
            }

        elif intent == "code_modification" and workspace_service:
            try:
                msg, affected = execute_workspace_modification(
                    workspace_service=workspace_service,
                    user_prompt=state["user_prompt"],
                    project_id=project_id,
                    task_id=state.get("task_id"),
                    approval_id=state.get("approval_id"),
                )
            except Exception as exc:
                # Nenhuma escrita ocorreu: reportar como bloqueio, nunca como sucesso.
                reason = str(exc)[:400]
                agent_outputs.append(
                    AgentOutputContract(
                        agent_role=primary_agent,
                        objective="Modificação de arquivo de projeto no computador",
                        summary=f"A alteração solicitada não foi aplicada: {reason}",
                        evidence=[],
                        actions_taken=[],
                        affected_files=[],
                        tests_executed=[],
                        risks=[],
                        blockers=[reason],
                        resource_usage=ResourceUsage(
                            model_name=model_name,
                            tokens_prompt=0,
                            tokens_completion=0,
                            duration_ms=0.0,
                        ),
                        next_recommendation=(
                            "Reformular o pedido com o ficheiro e o trecho exatos, ou usar o Coding Agent."
                        ),
                    ).model_dump()
                )
                return {
                    "final_summary": (
                        "Não foi possível aplicar a alteração de código. Nada foi escrito em disco."
                        f"\n\nMotivo: {reason}"
                    ),
                    "is_completed": False,
                    "agent_outputs": agent_outputs,
                }

            primary_output = AgentOutputContract(
                agent_role=primary_agent,
                objective="Modificação de arquivo de projeto no computador",
                summary=msg,
                evidence=[
                    f"Ficheiro lido do disco e regravado: {', '.join(affected) or 'n/d'}",
                    "Diff unificado gerado a partir do conteúdo real do arquivo",
                ],
                actions_taken=["Aplicação da alteração aprovada por um humano"],
                affected_files=affected,
                # Nenhum teste é executado nesta via: não inventar verificações.
                tests_executed=[],
                risks=[],
                blockers=[],
                resource_usage=ResourceUsage(
                    model_name=model_name,
                    tokens_prompt=0,
                    tokens_completion=0,
                    duration_ms=0.0,
                ),
                next_recommendation="Recarregue o navegador para visualizar a alteração aplicada.",
            )
            agent_outputs.append(primary_output.model_dump())

        # 3. Interação conversacional inteligente (Diálogo, Dúvidas gerais, Planejamento)
        elif intent == "conversation":
            p_stripped = user_prompt.strip().lower()
            if p_stripped in (
                "oi",
                "olá",
                "ola",
                "bom dia",
                "boa tarde",
                "boa noite",
                "hello",
                "hi",
            ):
                llm_text = (
                    "Olá! Estou online com meus 26 especialistas técnicos prontos para colaborar.\n\n"
                    "Como posso te ajudar hoje? Posso criar projetos, debater arquitetura, auditar código ou responder qualquer pergunta técnica."
                )
            else:
                conv_sys = (
                    "Você é o JARVIS Maestro, o assistente central e orquestrador de IA do JARVIS Hub. "
                    "Responda SEMPRE em português do Brasil, de forma atenciosa, inteligente, detalhada e personalizada à solicitação do usuário. "
                    "Nunca use templates pré-moldados. Raciocine profundamente sobre o assunto pedido."
                )
                session_id = state.get("session_id")
                owner_user_id = state.get("owner_user_id")
                effective_prompt = user_prompt

                # Compactação contínua de histórico da sessão no orquestrador (H3)
                if db_manager and session_id and hasattr(db_manager, "list_chat_messages"):
                    try:
                        raw_history = db_manager.list_chat_messages(
                            session_id, limit=20, owner_user_id=owner_user_id
                        )
                        history_turns: list[dict[str, str]] = []
                        for m in raw_history:
                            role = m.get("role")
                            content = (m.get("content") or "").strip()
                            if role in ("user", "assistant") and content:
                                history_turns.append({"role": role, "content": content})
                        if history_turns:
                            turns_to_trim = (
                                [{"role": "system", "content": conv_sys}]
                                + history_turns
                                + [{"role": "user", "content": user_prompt}]
                            )
                            trimmed_turns, dropped = trim_turns(
                                turns_to_trim,
                                num_ctx=resolve_num_ctx(),
                                output_reserve=1000,
                            )
                            if dropped:
                                logger.debug(
                                    "Orquestrador: histórico compactado (%d turnos antigos removidos) na sessão %s",
                                    dropped,
                                    session_id,
                                )
                            history_formatted = []
                            for t in trimmed_turns[1:-1]:
                                r = "Usuário" if t["role"] == "user" else "JARVIS"
                                history_formatted.append(f"{r}: {t['content']}")
                            if history_formatted:
                                effective_prompt = (
                                    "Histórico recente da conversa:\n"
                                    + "\n".join(history_formatted[-8:])
                                    + f"\n\nUsuário: {user_prompt}"
                                )
                    except Exception as exc:
                        logger.debug(
                            "Falha ao recuperar/compactar histórico do chat no orquestrador: %s",
                            exc,
                        )

                conv_req = InferenceRequest(
                    prompt=effective_prompt,
                    system_prompt=conv_sys,
                    model_name=model_name,
                    max_tokens=1000,
                    temperature=0.7,
                    timeout_seconds=45.0,
                    task_id=state.get("task_id"),
                    owner_user_id=owner_user_id,
                    agent_role=primary_agent,
                    key_id=primary_key_id,
                )
                try:
                    conv_resp = await model_manager.generate(conv_req)
                    llm_text = conv_resp.content.strip()
                    if db_manager and session_id and hasattr(db_manager, "add_chat_message"):
                        try:
                            db_manager.add_chat_message(
                                session_id=session_id,
                                role="user",
                                content=user_prompt,
                                project_id=project_id,
                                owner_user_id=owner_user_id,
                            )
                            db_manager.add_chat_message(
                                session_id=session_id,
                                role="assistant",
                                content=llm_text,
                                project_id=project_id,
                                owner_user_id=owner_user_id,
                            )
                        except Exception as exc:
                            logger.debug("Falha ao persistir turnos da conversa no banco: %s", exc)
                except Exception as exc:
                    logger.exception(
                        "O modelo conversacional não conseguiu responder à tarefa %s",
                        state.get("task_id"),
                    )
                    raise RuntimeError(
                        f"O JARVIS não conseguiu gerar a resposta porque o provedor de IA falhou: {exc}"
                    ) from exc

            primary_output = AgentOutputContract(
                agent_role=primary_agent,
                objective="Interação conversacional e assistência inteligente personalizada",
                summary=llm_text,
                evidence=["Resposta conversacional gerada pelo modelo."],
                actions_taken=[],
                affected_files=[],
                tests_executed=[],
                risks=[],
                blockers=[],
                resource_usage=ResourceUsage(
                    model_name=model_name,
                    tokens_prompt=20,
                    tokens_completion=len(llm_text.split()),
                    duration_ms=15.0,
                ),
                next_recommendation="Aguardando feedback ou nova instrução do usuário.",
            )
            agent_outputs.append(primary_output.model_dump())

        # 4. Mesa Redonda Multi-Agente (Deliberação & Consenso entre 3 Especialistas)
        elif intent == "multi_agent_consensus":
            clean_prompt = (
                user_prompt.replace("/debate", "")
                .replace("/roundtable", "")
                .replace("/consenso", "")
                .strip()
            )
            if not clean_prompt:
                clean_prompt = "Debatam a estratégia ideal e plano de ação para o desafio atual."

            is_educational = any(
                w in clean_prompt.lower()
                for w in (
                    "ingles",
                    "inglês",
                    "idioma",
                    "idiomas",
                    "estudo",
                    "estudar",
                    "aprender",
                    "carreira",
                    "pesquisa",
                    "educação",
                    "rotina",
                )
            )

            if is_educational:
                role_1 = AgentRole.RESEARCH_ANALYST.value
                role_2 = AgentRole.PROJECT_MANAGER.value
                role_3 = AgentRole.QA_ENGINEER.value

                title_1 = "Metodologias & Evidências Científicas (Research Analyst)"
                title_2 = "Plano de Ação & Cronograma Sustentável (Project Manager)"
                title_3 = "Métricas de Retenção & Consistência (QA Engineer)"

                prompt_1 = f"Como Analista de Pesquisa, levante as melhores metodologias comprovadas de aprendizado, recursos recomendados e imersão ativa para: '{clean_prompt}'"
                prompt_2 = f"Como Gerente de Projetos, desenhe o cronograma semanal de estudos (ex: 20 min diários), divisão de fases e marcos práticos para: '{clean_prompt}'"
                prompt_3 = f"Como Engenheiro de Qualidade e Avaliação, defina os métodos de validação contínua (ex: repetição espaçada, autoavaliação e prática conversacional) para: '{clean_prompt}'"

                fallback_1 = f"Metodologia: Foco em Comprehensible Input (assimilação natural), técnica de Shadowing para pronúncia e imersão diária de 20 minutos para '{clean_prompt}'."
                fallback_2 = f"Cronograma: Divisão em ciclos de 30 dias com micro-hábitos diários, 5 expressões úteis por dia e revisão semanal de metas para '{clean_prompt}'."
                fallback_3 = f"Garantia de Qualidade: Testes de retenção espaçada (SRS), diálogos guiados no chat e acompanhamento de vocabulário ativo para '{clean_prompt}'."

                consensus_title = "🏛️ Mesa Redonda Multi-Agente: Aprendizado & Maestria"
                verdict = "Aprovado por consenso unânime entre Pesquisa, Metodologia e Avaliação de Qualidade."
                pillar_a = "**Metodologia Comprovada**: Imersão diária e Comprehensible Input sem tradução mental."
                pillar_b = "**Rotina Estruturada**: 20 minutos/dia com metas claras e sustentáveis."
                pillar_c = "**Validação Contínua**: Prática ativa de conversação guiada aqui no JARVIS e repetição espaçada."
            else:
                role_1 = AgentRole.SOFTWARE_ARCHITECT.value
                role_2 = AgentRole.CYBERSECURITY_ENGINEER.value
                role_3 = AgentRole.CODE_REVIEWER.value

                title_1 = "Parecer do Arquiteto de Software"
                title_2 = "Parecer do Engenheiro de Cibersegurança"
                title_3 = "Parecer do Revisor de Código & QA (Modo Ponytail)"

                prompt_1 = f"Como Arquiteto de Software, apresente sua análise estrutural, viabilidade, escalabilidade e trade-offs para: '{clean_prompt}'"
                prompt_2 = f"Como Engenheiro de Cibersegurança, avalie as superfícies de ataque, mitigações OWASP, sanitização de inputs e blindagem necessária para: '{clean_prompt}'. Leia o parecer arquitetural anterior, identifique riscos omitidos, concorde ou discorde com justificativa e proponha mitigação."
                prompt_3 = f"Como Revisor de Código Sênior sob a disciplina Ponytail (YAGNI/DRY), revise criticamente os pareceres anteriores sobre '{clean_prompt}'. Aponte contradições, lacunas, riscos e a menor implementação testável. Não aprove automaticamente os pareceres."

                fallback_1 = f"Análise Arquitetural: recomendada estrutura modular com baixo acoplamento e separação estrita de responsabilidades para '{clean_prompt}'."
                fallback_2 = f"Parecer de Segurança: validação estrita de inputs, controle de acesso local e blindagem 127.0.0.1 prioritários para '{clean_prompt}'."
                fallback_3 = f"Parecer de Revisão: foco estrito em YAGNI, preferência por bibliotecas nativas da plataforma e testes unitários diretos para '{clean_prompt}'."

                consensus_title = "🏛️ Mesa Redonda Técnica: Deliberação Multidisciplinar"
                verdict = "Aprovado por deliberação consensual com 3 votos favoráveis."
                pillar_a = "**Decisão Arquitetural**: Estrutura enxuta e modular com desacoplamento de serviços."
                pillar_b = "**Mitigação de Segurança**: Blindagem de portas, sanitização contra injeções e isolamento de dados sensíveis."
                pillar_c = "**Simplicidade & YAGNI**: Implementação focada nas bibliotecas padrão da plataforma, evitando pacotes desnecessários."

            # Delegação sequencial real: cada especialista recebe os pareceres anteriores.
            peer_outputs: list[dict[str, Any]] = []
            peer_contracts: list[dict[str, Any]] = []
            specialist_specs = [
                (role_1, prompt_1, "research" if is_educational else "backend"),
                (role_2, prompt_2, "planning" if is_educational else "security"),
                (role_3, prompt_3, "qa"),
            ]
            for specialist_role, specialist_task, specialist_domain in specialist_specs:
                specialist_system = build_specialist_prompt(
                    agent_role=specialist_role,
                    agent_registry=agent_registry,
                    skills_catalog=skills_catalog,
                    db_manager=db_manager,
                    owner_user_id=state.get("owner_user_id"),
                    intent="expert_deliberation",
                    user_prompt=clean_prompt,
                    project_id=project_id,
                    domain=specialist_domain,
                    previous_outputs=peer_outputs,
                )
                specialist_profile = None
                if agent_registry:
                    try:
                        specialist_profile = agent_registry.get_profile(AgentRole(specialist_role))
                    except Exception as exc:
                        logger.debug("Perfil de %s indisponível: %s", specialist_role, exc)
                specialist_fallback_model = (
                    specialist_profile.preferred_model
                    if specialist_profile and specialist_profile.preferred_model
                    else model_name
                )
                specialist_route = _route_for(
                    specialist_role,
                    specialist_profile,
                    specialist_fallback_model,
                )
                specialist_model = specialist_route.model or model_name
                specialist_request = InferenceRequest(
                    prompt=specialist_task,
                    system_prompt=specialist_system,
                    model_name=specialist_model,
                    max_tokens=500,
                    temperature=0.25,
                    timeout_seconds=300.0,
                    task_id=state.get("task_id"),
                    owner_user_id=state.get("owner_user_id"),
                    agent_role=specialist_role,
                    key_id=specialist_route.key_id,
                )
                try:
                    specialist_response = await model_manager.generate(specialist_request)
                except Exception as exc:
                    logger.exception(
                        "Especialista %s falhou na tarefa %s", specialist_role, state.get("task_id")
                    )
                    raise RuntimeError(
                        f"O especialista {specialist_role} não conseguiu executar sua etapa: {exc}"
                    ) from exc
                specialist_text = (specialist_response.content or "").strip()
                if not specialist_text:
                    raise RuntimeError(
                        f"O especialista {specialist_role} retornou uma resposta vazia."
                    )
                peer_outputs.append(
                    {
                        "agent_role": specialist_role,
                        "summary": specialist_text,
                    }
                )
                peer_contracts.append(
                    AgentOutputContract(
                        agent_role=specialist_role,
                        objective=specialist_task,
                        summary=specialist_text,
                        evidence=["Resposta produzida por inferência real do especialista."],
                        actions_taken=["Analisou o pedido e os pareceres anteriores disponíveis."],
                        affected_files=[],
                        tests_executed=[],
                        risks=[],
                        blockers=[],
                        resource_usage=ResourceUsage(
                            model_name=specialist_model,
                            tokens_prompt=getattr(specialist_response, "prompt_tokens", 0) or 0,
                            tokens_completion=getattr(specialist_response, "completion_tokens", 0)
                            or 0,
                            duration_ms=getattr(specialist_response, "duration_ms", 0.0) or 0.0,
                        ),
                        next_recommendation="Aguardar a consolidação do JARVIS Maestro.",
                    ).model_dump()
                )

            # Orçamento governado de contexto para evitar truncamento no Ollama (H3)
            num_ctx = resolve_num_ctx()
            budget = context_budget(num_ctx, output_reserve=1200)
            clean_tokens = estimate_tokens(clean_prompt)
            avail_for_peers = max(400, budget - clean_tokens - 400)
            per_peer_limit_chars = max(800, (avail_for_peers // max(1, len(peer_outputs))) * 4)

            bounded_peers = []
            for item in peer_outputs:
                role = item["agent_role"]
                summary_text = item["summary"]
                if len(summary_text) > per_peer_limit_chars:
                    summary_text = (
                        summary_text[:per_peer_limit_chars].rstrip()
                        + "… [truncado para adequação à janela de contexto]"
                    )
                bounded_peers.append(f"Parecer de {role}:\n{summary_text}")

            master_prompt = (
                f"Delibere como JARVIS Maestro sobre a tarefa: {clean_prompt}.\n\n"
                + "\n\n".join(bounded_peers)
                + "\n\nCompare as recomendações, identifique convergências e divergências, "
                "resolva conflitos com justificativa e apresente um plano final. "
                "Não invente consenso, testes, ferramentas, evidências ou ações que não ocorreram."
            )
            master_system = build_specialist_prompt(
                agent_role=AgentRole.JARVIS_MASTER.value,
                agent_registry=agent_registry,
                skills_catalog=skills_catalog,
                db_manager=db_manager,
                owner_user_id=state.get("owner_user_id"),
                intent="multi_agent_consensus",
                user_prompt=clean_prompt,
                project_id=project_id,
                domain="planning",
                previous_outputs=peer_outputs,
            )
            master_profile = (
                agent_registry.get_profile(AgentRole.JARVIS_MASTER) if agent_registry else None
            )
            master_route = _route_for(AgentRole.JARVIS_MASTER.value, master_profile, model_name)
            try:
                master_response = await model_manager.generate(
                    InferenceRequest(
                        prompt=master_prompt,
                        system_prompt=master_system,
                        model_name=master_route.model or model_name,
                        max_tokens=1200,
                        temperature=0.2,
                        timeout_seconds=240.0,
                        task_id=state.get("task_id"),
                        owner_user_id=state.get("owner_user_id"),
                        agent_role=AgentRole.JARVIS_MASTER.value,
                        key_id=master_route.key_id,
                    )
                )
            except Exception as exc:
                logger.exception(
                    "Síntese do JARVIS Maestro falhou na tarefa %s", state.get("task_id")
                )
                raise RuntimeError(
                    f"O JARVIS Maestro não conseguiu consolidar os pareceres: {exc}"
                ) from exc
            master_summary = (master_response.content or "").strip()
            if not master_summary:
                raise RuntimeError("O JARVIS Maestro retornou uma síntese vazia.")

            consensus_summary = (
                f"# {consensus_title}\n\n"
                + "\n\n".join(
                    f"### {index}. {role}\n{summary}"
                    for index, (role, summary) in enumerate(
                        [(item["agent_role"], item["summary"]) for item in peer_outputs],
                        start=1,
                    )
                )
                + f"\n\n### Deliberação do JARVIS Maestro\n\n{master_summary}"
            )
            agent_outputs.extend(peer_contracts)
            agent_outputs.append(
                AgentOutputContract(
                    agent_role=AgentRole.JARVIS_MASTER,
                    objective="Consolidação dos pareceres realmente produzidos pelos especialistas.",
                    summary=master_summary,
                    evidence=[
                        "Síntese gerada após receber os pareceres dos especialistas convocados."
                    ],
                    actions_taken=[
                        "Comparou os pareceres e consolidou convergências, divergências e recomendações."
                    ],
                    affected_files=[],
                    tests_executed=[],
                    risks=[],
                    blockers=[],
                    resource_usage=ResourceUsage(
                        model_name=model_name,
                        tokens_prompt=getattr(master_response, "prompt_tokens", 0) or 0,
                        tokens_completion=getattr(master_response, "completion_tokens", 0) or 0,
                        duration_ms=getattr(master_response, "duration_ms", 0.0) or 0.0,
                    ),
                    next_recommendation="Revisar a síntese e decidir os próximos passos.",
                ).model_dump()
            )
            llm_text = consensus_summary

            # 5. Demais intenções (arquitetura, análise, qa, planejamento): inferência com contexto enriquecido
        else:
            system_prompt = build_specialist_prompt(
                agent_role=primary_agent,
                agent_registry=agent_registry,
                skills_catalog=skills_catalog,
                db_manager=db_manager,
                owner_user_id=state.get("owner_user_id"),
                intent=intent,
                user_prompt=user_prompt,
                project_id=project_id,
                domain=domain,
            )
            # Otimização de latência: em CPU local, limita tokens de resposta para entrega veloz (<10s)
            req_max_tokens = (
                600
                if not is_hybrid_active
                and intent in ("conversation", "general_planning", "code_explanation")
                else 1200
            )
            inference_req = InferenceRequest(
                prompt=user_prompt,
                system_prompt=system_prompt,
                model_name=model_name,
                max_tokens=req_max_tokens,
                temperature=0.3,
                timeout_seconds=240.0,
                task_id=state.get("task_id"),
                owner_user_id=state.get("owner_user_id"),
                agent_role=primary_agent,
                key_id=primary_key_id,
            )

            try:
                inference_resp = await model_manager.generate(inference_req)
                llm_text = inference_resp.content.strip()
                prompt_tokens = inference_resp.prompt_tokens
                comp_tokens = inference_resp.completion_tokens
                dur_ms = inference_resp.duration_ms
            except Exception as exc:
                logger.exception(
                    "A inferência do especialista primário %s falhou na tarefa %s",
                    primary_agent,
                    state.get("task_id"),
                )
                raise RuntimeError(
                    f"O especialista {primary_agent} não conseguiu executar a análise: {exc}"
                ) from exc

            primary_output = AgentOutputContract(
                agent_role=primary_agent,
                objective=f"Executar análise técnica para a intenção '{intent}'",
                summary=llm_text,
                evidence=["Resposta produzida pela inferência do especialista primário."],
                actions_taken=["Análise do pedido e do contexto fornecido."],
                affected_files=[],
                tests_executed=[],
                risks=[],
                blockers=[],
                resource_usage=ResourceUsage(
                    model_name=model_name,
                    tokens_prompt=prompt_tokens,
                    tokens_completion=comp_tokens,
                    duration_ms=dur_ms,
                ),
                next_recommendation="Submeter recomendações ao utilizador para revisão.",
            )
            agent_outputs.append(primary_output.model_dump())

        # Delegação sequencial real para todos os especialistas selecionados.
        # Não depende de provedor híbrido: também funciona com modelos locais.
        secondary_agents = (
            selected[1:] if intent not in ("project_creation", "multi_agent_consensus") else []
        )
        execution_errors: list[str] = []
        for secondary_role in secondary_agents:
            try:
                role_enum = AgentRole(secondary_role)
            except Exception:
                execution_errors.append(f"Especialista desconhecido no catálogo: {secondary_role}")
                continue

            secondary_profile = None
            if agent_registry:
                try:
                    secondary_profile = agent_registry.get_profile(role_enum)
                except Exception as exc:
                    logger.warning("Não foi possível carregar o perfil %s: %s", secondary_role, exc)

            secondary_model = (
                secondary_profile.preferred_model
                if secondary_profile and secondary_profile.preferred_model
                else model_name
            )
            secondary_route = _route_for(
                secondary_role,
                secondary_profile,
                secondary_model,
            )
            secondary_model = secondary_route.model or model_name
            secondary_system = build_specialist_prompt(
                agent_role=secondary_role,
                agent_registry=agent_registry,
                skills_catalog=skills_catalog,
                db_manager=db_manager,
                owner_user_id=state.get("owner_user_id"),
                intent=intent,
                user_prompt=user_prompt,
                project_id=project_id,
                domain=domain,
                previous_outputs=agent_outputs,
            )
            secondary_prompt = (
                f"Execute sua análise como especialista {secondary_role} para o pedido abaixo.\n"
                f"Pedido original: {user_prompt}\n\n"
                "Considere criticamente os pareceres anteriores incluídos no contexto. "
                "Aponte concordâncias, divergências, riscos e recomendações específicas. "
                "Não afirme que executou ferramentas, testes ou alterações que não realizou."
            )
            try:
                secondary_response = await model_manager.generate(
                    InferenceRequest(
                        prompt=secondary_prompt,
                        system_prompt=secondary_system,
                        model_name=secondary_model,
                        max_tokens=1000,
                        temperature=0.25,
                        timeout_seconds=300.0,
                        task_id=state.get("task_id"),
                        owner_user_id=state.get("owner_user_id"),
                        agent_role=secondary_role,
                        key_id=secondary_route.key_id,
                    )
                )
                secondary_text = (secondary_response.content or "").strip()
                if not secondary_text:
                    raise RuntimeError("resposta vazia")
                agent_outputs.append(
                    AgentOutputContract(
                        agent_role=role_enum,
                        objective=f"Análise complementar de {secondary_role}.",
                        summary=secondary_text,
                        evidence=["Resposta produzida por inferência real do especialista."],
                        actions_taken=["Analisou o pedido e os pareceres anteriores."],
                        affected_files=[],
                        tests_executed=[],
                        risks=[],
                        blockers=[],
                        resource_usage=ResourceUsage(
                            model_name=secondary_model,
                            tokens_prompt=getattr(secondary_response, "prompt_tokens", 0) or 0,
                            tokens_completion=getattr(secondary_response, "completion_tokens", 0)
                            or 0,
                            duration_ms=getattr(secondary_response, "duration_ms", 0.0) or 0.0,
                        ),
                        next_recommendation="Aguardar a consolidação do JARVIS Maestro.",
                    ).model_dump()
                )
            except Exception as exc:
                logger.exception(
                    "Delegação do especialista %s falhou na tarefa %s",
                    secondary_role,
                    state.get("task_id"),
                )
                execution_errors.append(f"{secondary_role}: {exc}")
                agent_outputs.append(
                    AgentOutputContract(
                        agent_role=role_enum,
                        objective=f"Etapa delegada a {secondary_role}.",
                        summary="Este especialista não concluiu a análise.",
                        evidence=[],
                        actions_taken=[],
                        affected_files=[],
                        tests_executed=[],
                        risks=[],
                        blockers=[str(exc)],
                        resource_usage=ResourceUsage(model_name=secondary_model),
                        next_recommendation="Verificar o provedor/modelo e repetir esta etapa.",
                    ).model_dump()
                )

        res_dict: dict[str, Any] = {
            "agent_outputs": agent_outputs,
            "current_step": len(agent_outputs),
            "is_completed": not execution_errors,
        }
        if execution_errors:
            res_dict["error"] = "Uma ou mais etapas delegadas falharam: " + "; ".join(
                execution_errors
            )
        if "llm_text" in locals() and llm_text:
            res_dict["final_summary"] = llm_text
        elif agent_outputs:
            res_dict["final_summary"] = agent_outputs[0].get("summary", "")
        return res_dict

    async def validate_output(state: TaskState) -> dict[str, Any]:
        # Valida schema, comprimento e sintaxe e aplica no máximo uma reparação por output.
        outputs = state.get("agent_outputs", [])
        validated = []
        for out in outputs:
            raw_summary = out.get("summary", "")
            healed_summary, corrections = SelfCorrectionEngine.heal_markdown_text(raw_summary)
            if corrections:
                out["summary"] = healed_summary
                evidence_list = out.get("evidence")
                if isinstance(evidence_list, list):
                    evidence_list.append(
                        f"Auto-correção sintática aplicada: {len(corrections)} correções"
                    )
            try:
                repaired = validate_and_repair_contract(out)
            except OutputContractError:
                logger.warning(
                    "Contrato de saída inválido para %s; a aplicar fallback seguro.",
                    out.get("agent_role"),
                    exc_info=True,
                )
                try:
                    repaired = validate_and_repair_contract(
                        {
                            "agent_role": AgentRole.JARVIS_MASTER.value,
                            "objective": out.get("objective")
                            or "Objetivo não especificado pelo especialista.",
                            "summary": out.get("summary")
                            or "Sem resumo produzido pelo especialista.",
                            "next_recommendation": out.get("next_recommendation")
                            or "Revisar a resposta e repetir a execução.",
                        }
                    )
                except OutputContractError:
                    logger.exception("Fallback do contrato de saída também falhou.")
                    repaired = validate_and_repair_contract(
                        {
                            "agent_role": AgentRole.JARVIS_MASTER.value,
                            "objective": "Objetivo não especificado pelo especialista.",
                            "summary": "Sem resumo produzido pelo especialista.",
                            "next_recommendation": "Revisar a resposta e repetir a execução.",
                        }
                    )
            validated.append(repaired.contract.model_dump())
        res: dict[str, Any] = {"agent_outputs": validated}
        if state.get("final_summary"):
            res["final_summary"] = state["final_summary"]
        return res

    async def finalize_task(state: TaskState) -> dict[str, Any]:
        if state.get("approval_required"):
            appr_id = state.get("approval_id")
            if state.get("classified_intent") == "project_creation":
                impact = "criação de projeto e gravação dos ficheiros no Workspace"
            else:
                impact = "alteração de código pendente de revisão"
            prepared_summary = state.get("final_summary")
            approval_notice = (
                f"Solicitação '{appr_id}' aguarda aprovação humana no Approval Center. "
                f"Impacto: {impact}. Nenhum ficheiro foi alterado ainda."
            )
            summary = (
                f"{prepared_summary}\n\n{approval_notice}"
                if prepared_summary
                else f"A operação requer aprovação humana prévia. {approval_notice}"
            )
            return {"final_summary": summary, "is_completed": False}

        if state.get("policy_violations"):
            summary = f"Execução bloqueada por violação de políticas: {'; '.join(state['policy_violations'])}"
            return {"final_summary": summary, "is_completed": False}

        if state.get("error"):
            partial = state.get("final_summary") or "A execução multiagente não foi concluída."
            return {
                "final_summary": (partial + "\n\n**Execução parcial:** " + str(state["error"])),
                "is_completed": False,
            }

        if state.get("final_summary"):
            return {"final_summary": state["final_summary"], "is_completed": True}

        intent = state.get("classified_intent")
        outputs = state.get("agent_outputs", [])
        primary_summary = outputs[0].get("summary", "") if outputs else ""

        # O resumo final é direto, conversacional e limpo (estilo Claude / ChatGPT / Gemini)
        # Detalhes técnicos e pareceres de cada especialista são visualizados no accordion de raciocínio
        return {
            "final_summary": primary_summary or "Operação concluída com sucesso.",
            "is_completed": True,
        }

    def route_after_policy(state: TaskState) -> str:
        if state.get("approval_required") or state.get("policy_violations"):
            return "finalize_task"
        return "execute_or_delegate"

    # Monta o grafo com LangGraph
    workflow = StateGraph(TaskState)

    workflow.add_node("classify_intent", classify_intent)
    workflow.add_node("plan_task", plan_task)
    workflow.add_node("verify_policy", verify_policy)
    workflow.add_node("execute_or_delegate", execute_or_delegate)
    workflow.add_node("validate_output", validate_output)
    workflow.add_node("finalize_task", finalize_task)

    workflow.add_edge(START, "classify_intent")
    workflow.add_edge("classify_intent", "plan_task")
    workflow.add_edge("plan_task", "verify_policy")

    workflow.add_conditional_edges(
        "verify_policy",
        route_after_policy,
        {
            "execute_or_delegate": "execute_or_delegate",
            "finalize_task": "finalize_task",
        },
    )

    workflow.add_edge("execute_or_delegate", "validate_output")
    workflow.add_edge("validate_output", "finalize_task")
    workflow.add_edge("finalize_task", END)

    return workflow.compile(checkpointer=checkpointer)
