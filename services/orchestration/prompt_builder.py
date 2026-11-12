import logging
from typing import Any

from packages.contracts.agent import AgentRole

logger = logging.getLogger("jarvis.orchestration.prompt_builder")

INTENT_DOMAIN_MAP: dict[str, str] = {
    "conversation": "general",
    "project_creation": "web",
    "code_modification": "backend",
    "architecture_analysis": "architecture",
    "security_audit": "security",
    "qa_testing": "qa",
    "general_planning": "general",
    "code_explanation": "general",
    "multi_agent_consensus": "architecture",
}


def _bounded_text(value: Any, limit: int) -> str:
    text = str(value or "").strip()
    return text if len(text) <= limit else text[:limit].rstrip() + "…"


def build_specialist_prompt(
    agent_role: str,
    agent_registry: Any | None,
    skills_catalog: Any | None,
    db_manager: Any | None,
    intent: str,
    user_prompt: str,
    project_id: str | None = None,
    domain: str | None = None,
    previous_outputs: list[dict[str, Any]] | None = None,
    owner_user_id: str | None = None,
) -> str:
    """Monta um prompt de sistema rico com perfil do agente, skills ECC ativas, regras de projeto e histórico de colaboração."""
    role_val = agent_role.value if hasattr(agent_role, "value") else str(agent_role)
    dom = domain or INTENT_DOMAIN_MAP.get(intent, "general")

    # 1. Perfil e missão do agente a partir do AgentRegistry
    profile = None
    if agent_registry:
        try:
            role_enum = AgentRole(role_val)
            profile = agent_registry.get_profile(role_enum)
        except Exception:
            logger.debug("Perfil do agente indisponível; a usar cabeçalho genérico.", exc_info=True)

    if profile:
        header = (
            f"Você é o especialista '{profile.name}' ({role_val}) do JARVIS AI HUB.\n"
            f"MISSÃO PRINCIPAL: {profile.mission}\n"
            f"DIRETRIZES DO PAPEL: {profile.system_prompt}\n"
            "CAPACIDADES INTERNAS DA SANDBOX: Acesso local seguro para leitura e análise de arquivos de projeto. Não mencione identificadores técnicos internos do sistema (como read_file ou list_directory) como se fossem bibliotecas ou funções da linguagem do usuário."
        )
    else:
        header = f"Você é o especialista '{role_val}' do JARVIS AI HUB."

    # Ultra-otimização de latência para conversas casuais e cumprimentos:
    if intent in ("conversation", "greeting"):
        user_inst = ""
        if db_manager and hasattr(db_manager, "get_user_profile"):
            try:
                prof = db_manager.get_user_profile(owner_user_id=owner_user_id)
                c_inst = prof.get("custom_instructions") or prof.get("customInstructions")
                if c_inst and str(c_inst).strip():
                    user_inst = f"\n\nInstruções do Desenvolvedor: {str(c_inst).strip()}"
            except Exception:
                logger.debug("Instruções personalizadas indisponíveis.", exc_info=True)
        lean_footer = (
            "\n\nDIRETRIZES DE RESPOSTA:\n"
            "1. Responda em Português do Brasil com clareza, concisão e naturalidade.\n"
            "2. Conclua todas as suas frases e parágrafos de forma completa e acolhedora.\n"
            "3. Nunca mencione nomes internos de ferramentas técnicas da sandbox (read_file, sess_...)."
        )
        return f"{header}{user_inst}{lean_footer}"

    # 2. Injeção de Memórias Persistentes e Regras do Projeto
    memory_section = ""
    if db_manager and project_id:
        try:
            memories = db_manager.list_project_memory(project_id, owner_user_id=owner_user_id)
            if memories:
                items = []
                for m in memories[:5]:
                    cat = m.get("category", "geral").upper()
                    k = m.get("key", "")
                    c = m.get("content", "")
                    items.append(f"- [{cat}] {k}: {_bounded_text(c, 260)}")
                memory_section = (
                    f"\n\n### 🧠 REGRAS E MEMÓRIAS DO PROJETO ({project_id}):\n" + "\n".join(items)
                )
        except Exception:
            logger.debug("Memórias do projeto indisponíveis.", exc_info=True)

    # 2.0 Injeção de Código Fonte Real do Projeto Físico em Disco
    source_code_section = ""
    if project_id and intent in {
        "architecture_analysis",
        "code_modification",
        "project_creation",
        "qa_testing",
        "security_audit",
    }:
        try:
            from pathlib import Path

            workspace_dir = Path("workspace") / project_id
            if workspace_dir.exists() and workspace_dir.is_dir():
                file_snippets = []
                for p in sorted(workspace_dir.iterdir()):
                    if p.is_file() and p.suffix.lower() in (
                        ".html",
                        ".js",
                        ".css",
                        ".py",
                        ".json",
                        ".md",
                        ".ts",
                    ):
                        try:
                            content = p.read_text(encoding="utf-8", errors="replace")
                            preview = content[:1200] + (
                                "\n... [restante do arquivo truncado para brevidade]"
                                if len(content) > 1200
                                else ""
                            )
                            file_snippets.append(
                                f"📄 Arquivo `{p.name}`:\n```{p.suffix.lstrip('.')}\n{preview}\n```"
                            )
                        except Exception:
                            logger.debug(
                                "Ficheiro de código ilegível ignorado: %s", p.name, exc_info=True
                            )
                    if len(file_snippets) >= 2:
                        break
                if file_snippets:
                    source_code_section = (
                        f"\n\n### 📁 CÓDIGO FONTE REAL DO PROJETO EM DISCO (workspace/{project_id}):\n"
                        + "\n\n".join(file_snippets)
                        + "\nAnalise criticamente o código real acima para emitir seu parecer técnico e recomendações práticas."
                    )
        except Exception:
            logger.debug("Código-fonte real do projeto indisponível.", exc_info=True)

    # 2.1 Injeção de Memórias Episódicas do Especialista (Aprendizado Contínuo)
    agent_memory_section = ""
    if db_manager and hasattr(db_manager, "list_agent_memories"):
        try:
            agent_mems = db_manager.list_agent_memories(
                agent_role=role_val, limit=3, owner_user_id=owner_user_id
            )
            if agent_mems:
                items = []
                for am in agent_mems:
                    cat = am.get("category", "geral").upper()
                    k = am.get("key", "")
                    c = am.get("content", "")
                    items.append(f"- [{cat}] {k}: {_bounded_text(c, 220)}")
                agent_memory_section = (
                    f"\n\n### 🧠 MEMÓRIAS EPISÓDICAS E PREFERÊNCIAS APRENDIDAS ({role_val}):\n"
                    + "\n".join(items)
                )
        except Exception:
            logger.debug("Memórias episódicas do especialista indisponíveis.", exc_info=True)

    # 2.2 Injeção de Diretrizes do Perfil do Usuário (Custom Instructions & Senioridade)
    user_instructions_section = ""
    if db_manager and hasattr(db_manager, "get_user_profile"):
        try:
            user_prof = db_manager.get_user_profile(owner_user_id=owner_user_id)
            custom_inst = user_prof.get("custom_instructions") or user_prof.get(
                "customInstructions"
            )
            seniority = user_prof.get("seniority_level") or user_prof.get("seniorityLevel")
            role_title = user_prof.get("role_title") or user_prof.get("roleTitle")
            pref_parts = []
            if role_title:
                pref_parts.append(f"- Cargo do Desenvolvedor: {role_title}")
            if seniority:
                pref_parts.append(
                    f"- Nível de Senioridade: {str(seniority).upper()} (adapte profundidade e vocabulário técnico)"
                )
            if custom_inst and str(custom_inst).strip():
                pref_parts.append(
                    f'- Diretrizes de Estilo Personalizadas do Desenvolvedor:\n  "{_bounded_text(custom_inst, 500)}"'
                )
            if pref_parts:
                user_instructions_section = (
                    "\n\n### 👤 PERFIL & INSTRUÇÕES PERSONALIZADAS DO USUÁRIO:\n"
                    + "\n".join(pref_parts)
                )
        except Exception:
            logger.debug("Diretrizes do perfil do utilizador indisponíveis.", exc_info=True)

    # 2.3 Injeção da Base de Conhecimento Local-First (JARVIS Knowledge Vault / RAG)
    knowledge_section = ""
    if db_manager and hasattr(db_manager, "search_knowledge_vault") and user_prompt:
        try:
            k_results = db_manager.search_knowledge_vault(
                user_prompt, limit=3, owner_user_id=owner_user_id
            )
            if k_results:
                k_items = []
                for kr in k_results[:2]:
                    doc = kr.get("doc_name", "documento")
                    snippet = _bounded_text(kr.get("content", ""), 280).replace("\n", " ")
                    k_items.append(f'- 📄 **{doc}**: "{snippet}..."')
                knowledge_section = (
                    "\n\n### 📚 BASE DE CONHECIMENTO LOCAL (JARVIS Vault / RAG):\n"
                    + "\n".join(k_items)
                    + "\nUtilize as informações dos documentos acima como referência de autoridade técnica primária."
                )
        except Exception:
            logger.debug("Base de conhecimento local indisponível.", exc_info=True)

    # 2.4 Injeção do Modo Ponytail (Senior YAGNI / The Laziest Senior Developer)
    ponytail_section = ""
    try:
        from services.skills.ponytail_rules import get_ponytail_instruction

        p_level = (
            db_manager.get_ponytail_level()
            if (db_manager and hasattr(db_manager, "get_ponytail_level"))
            else "senior"
        )
        ponytail_section = get_ponytail_instruction(p_level)
    except Exception:
        logger.debug("Instrução do modo Ponytail indisponível.", exc_info=True)

    # 3. Injeção de Skills ECC do catálogo de habilidades ativas
    skills_section = ""
    if skills_catalog:
        try:
            skills = [
                skill
                for skill in skills_catalog.get_skills_for_agent(role_val)
                if getattr(skill, "origin", "") not in {"user_created", "imported_ecc"}
            ]
            if not skills and dom:
                skills = [
                    skill
                    for skill in skills_catalog.get_relevant_skills(dom, limit=2)
                    if getattr(skill, "origin", "") not in {"user_created", "imported_ecc"}
                ]
            if owner_user_id is not None and db_manager and hasattr(db_manager, "list_user_skills"):
                private_skills = db_manager.list_user_skills(owner_user_id=owner_user_id)
                for skill in private_skills:
                    assigned = skill.get("assigned_agents") or []
                    if role_val in assigned and skill.get("is_approved", True):
                        skills.append(
                            type(
                                "PrivateSkill",
                                (),
                                {
                                    "name": skill.get("name", skill.get("id", "Skill")),
                                    "version": skill.get("version", "1.0.0"),
                                    "description": skill.get("description", ""),
                                    "instructions": skill.get("instructions", ""),
                                },
                            )()
                        )
            if skills:
                items = []
                for s in skills[:2]:
                    items.append(
                        f"- **{s.name}** (v{s.version}): {_bounded_text(s.description, 240)}\n"
                        f"  Diretriz técnica: {_bounded_text(s.instructions, 520)}"
                    )
                skills_section = (
                    "\n\n### 🛠️ HABILIDADES TÉCNICAS E DIRETRIZES ECC ATIVAS:\n" + "\n".join(items)
                )
        except Exception:
            logger.debug("Catálogo de skills indisponível.", exc_info=True)

    # 4. Contexto de colaboração multi-agente anterior
    collab_section = ""
    if previous_outputs:
        items = []
        for prev in previous_outputs[-3:]:
            prev_role = prev.get("agent_role", "Especialista")
            prev_summary = _bounded_text(prev.get("summary", ""), 280)
            items.append(f"- **{prev_role}**: {prev_summary}")
        collab_section = (
            "\n\n### 🔄 FLUXO DE COLABORAÇÃO MULTI-AGENTE (Pareceres Prévios):\n"
            + "\n".join(items)
            + "\nAnalise o trabalho do especialista anterior sob sua perspectiva de domínio e produza seu parecer ou plano de ação complementar."
        )

    react_scaffold = (
        "\n\n### ANÁLISE:\n"
        "- Considere requisitos, restrições e riscos; apoie conclusões em evidências verificáveis.\n"
        "- Resuma a justificativa sem expor raciocínio interno passo a passo."
    )

    footer = (
        "\n\n### DIRETRIZES DE RESPOSTA:\n"
        "1. Responda em português brasileiro, com clareza e concisão.\n"
        "2. Use estrutura e exemplos só quando ajudarem a responder ao pedido.\n"
        "3. Termine a resposta e os blocos de código completos.\n"
        "4. Não revele nomes de ferramentas internas da sandbox ao usuário."
    )

    return f"{header}{memory_section}{source_code_section}{agent_memory_section}{user_instructions_section}{knowledge_section}{ponytail_section}{skills_section}{collab_section}{react_scaffold}{footer}"
