def generate_heuristic_technical_response(
    user_prompt: str,
    intent: str,
    role: str = "JARVIS Maestro",
    domain: str = "general",
) -> str:
    """
    Motor Heurístico de Alta Fidelidade (Local Contingency Engine).
    Gera pareceres estruturados, ricos em Markdown, com pilares, recomendações práticas
    e próximos passos para o usuário caso haja indisponibilidade no modelo de inferência.
    """
    p_lower = user_prompt.lower()

    if any(
        w in p_lower
        for w in (
            "inglês",
            "ingles",
            "idioma",
            "idiomas",
            "língua",
            "lingua",
            "english",
            "aprender falar",
        )
    ):
        topic_title = "Roteiro Prático & Metodologia de Estudo de Inglês"
        overview = (
            "Aprender inglês com fluência e rapidez fundamenta-se em **imersão ativa diária, assimilação natural "
            "(Comprehensible Input) e aplicação prática contínua**. Em vez de focar apenas em regras gramaticais abstratas, "
            "o segredo é exercitar os 4 pilares da língua com consistência e naturalidade."
        )
        pillars = [
            "**1. Comprehensible Input & Escuta Ativa (20 min/dia)**: Consuma conteúdos em inglês no seu nível de compreensão atual (podcasts didáticos como 'BBC 6 Minute English', vídeos no YouTube com áudio e legendas em inglês, músicas com letras).",
            "**2. Expansão de Vocabulário & Chunks (SRS)**: Memorize frases e expressões úteis do dia a dia em vez de palavras isoladas. Utilize sistemas de repetição espaçada (como Anki) para fixar de 5 a 10 estruturas práticas diárias.",
            "**3. Prática de Pronúncia com Shadowing**: Escute falantes nativos e repita as frases em voz alta quase instantaneamente, absorvendo ritmo, entonação e a ligação natural entre palavras (connected speech).",
            "**4. Conversação & Raciocínio Direto**: Comece pensando em inglês sobre tarefas cotidianas e pratique pequenos diálogos no chat comigo. Posso corrigir sua gramática de forma amigável e sugerir alternativas naturais.",
        ]
        tools = [
            "Comprehensible Input",
            "Método Shadowing",
            "Repetição Espaçada (SRS)",
            "BBC Learning English",
            "Diálogos Conversacionais",
        ]
        next_steps = (
            "Vamos começar agora mesmo? Me diga: qual é o seu nível atual (Iniciante, Intermediário ou Avançado)? "
            "Ou simplesmente digite: 'Let's practice English!' para iniciarmos nosso primeiro diálogo guiado."
        )
    elif any(
        w in p_lower
        for w in (
            "oi",
            "olá",
            "ola",
            "bom dia",
            "boa tarde",
            "boa noite",
            "ajuda",
            "quem é você",
            "o que você faz",
        )
    ):
        topic_title = "JARVIS AI Hub — Como Posso Ajudar Você Hoje?"
        overview = (
            "Olá! Sou o **JARVIS**, seu assistente soberano de Inteligência Artificial. "
            "Estou aqui para ajudá-lo com conversas naturais, aprendizado de novos tópicos ou idiomas (como inglês), "
            "redação de textos, raciocínio lógico, pesquisas na web ou engenharia completa de software."
        )
        pillars = [
            "**1. Aprendizado & Conversação**: Explicações didáticas, tutoria de idiomas e raciocínio estruturado.",
            "**2. Pesquisa Web Segura**: Busca de informações atualizadas na internet com proteção SSRF e fontes verificadas.",
            "**3. Desenvolvimento de Software**: Criação de interfaces modernas, código limpo, testes e arquitetura sob demanda.",
        ]
        tools = [
            "Conversação Natural",
            "Pesquisa Web Segura",
            "Tutoria Didática",
            "Modelos Locais Soberanos",
        ]
        next_steps = "Digite sua dúvida, tópico de estudo ou pedido de projeto para começarmos!"
    elif any(
        w in p_lower
        for w in (
            "ti",
            "tecnologia",
            "informação",
            "computação",
            "infraestrutura",
            "infra",
            "sistemas",
        )
    ):
        topic_title = "Tecnologia da Informação & Engenharia de Sistemas"
        overview = (
            "A **Tecnologia da Informação (TI)** moderna transcende o suporte operacional, "
            "atuando como a espinha dorsal estratégica de qualquer produto de software. Ela abrange desde o "
            "gerenciamento de infraestrutura confiável e pipelines de CI/CD até o desenvolvimento de sistemas "
            "distribuídos escaláveis, governança de dados e cibersegurança contínua."
        )
        pillars = [
            "**1. Arquitetura & Desenvolvimento Moderno**: Microsserviços e Monólitos Modulares, APIs REST/gRPC limpas, tipagem estrita e desacoplamento com Clean Architecture.",
            "**2. Cloud Native & Infraestrutura**: Contêineres (Docker), orquestração segura, computação distribuída e automação via IaC (Terraform/Ansible).",
            "**3. Cibersegurança & Conformidade**: Modelo Zero Trust, proteção contra OWASP Top 10, isolamento 127.0.0.1 em ambientes locais, criptografia em trânsito e em repouso.",
            "**4. Observabilidade & Operações (DevOps/SRE)**: Monitoramento proativo, tracing distribuído, agregação de logs em tempo real e orquestração de resiliência com circuit breakers.",
            "**5. Inteligência Artificial & Engenharia de Dados**: Adoção de modelos locais soberanos (LLMs Locais), RAG vetorial de baixa latência e pipelines ETL assíncronos.",
        ]
        tools = [
            "FastAPI / Python",
            "Docker",
            "PostgreSQL / SQLite WAL",
            "Ollama",
            "React / Vite",
            "OpenTelemetry",
        ]
        next_steps = (
            "Você pode solicitar ao JARVIS criar um novo projeto (ex: `/create-project web cafeteria` ou `/create-project python api`), "
            "disparar uma mesa redonda técnica com `/debate` ou executar uma auditoria de cibersegurança com `/audit`."
        )
    elif any(
        w in p_lower
        for w in ("arquitetura", "clean", "design", "padrões", "solid", "padroes", "backend")
    ):
        topic_title = "Arquitetura de Software & Clean Design"
        overview = (
            "Uma arquitetura sólida prioriza **baixo acoplamento, alta coesão e separação estrita de responsabilidades**. "
            "Seguindo a Clean Architecture e os princípios SOLID, o domínio central de negócio é totalmente isolado "
            "de frameworks, drivers de banco de dados e detalhes de entrega."
        )
        pillars = [
            "**1. Inversão de Dependências (DIP)**: O código de negócio depende de contratos/interfaces abstratas, não de implementações concretas.",
            "**2. Segregação de Camadas**: Divisão clara entre Core Domain, Application Services, Data Repositories e Presentation/API Routers.",
            "**3. Single Responsibility (SRP)**: Cada classe, módulo ou rota possui um único motivo para mudar.",
            "**4. Pragmatismo & YAGNI (Ponytail)**: Desenvolver apenas o que agrega valor mensurável, evitando sobre-engenharia prematura.",
        ]
        tools = [
            "Domain-Driven Design (DDD)",
            "Repository Pattern",
            "Pydantic Schemas",
            "Dependency Injection",
        ]
        next_steps = "Para analisar a estrutura do seu projeto atual, utilize o comando `/doc` ou visualize a árvore de pastas no Project Workspace."
    elif any(
        w in p_lower
        for w in ("segurança", "seguranca", "owasp", "vulnerabilidade", "threat", "auth")
    ):
        topic_title = "Engenharia de Cibersegurança & Blindagem de Aplicações"
        overview = (
            "A segurança em profundidade requer validação sanitizada em todas as fronteiras de I/O, princípio do "
            "menor privilégio e confinamento estrito de tráfego de rede."
        )
        pillars = [
            "**1. Blindagem de Rede**: Confinamento seguro em `127.0.0.1`, rejeitando binds em `0.0.0.0` sem autenticação mTLS.",
            "**2. Proteção contra Injeção**: Uso exclusivo de queries parametrizadas (Prepared Statements) e validação de esquemas via Pydantic.",
            "**3. Sanitização de Execução**: Bloqueio de chamadas perigosas (`eval`, `exec`, `os.system`) e sandbox estrita com whitelist.",
            "**4. Trilha de Auditoria (Audit Trail)**: Gravação append-only com hash SHA-256 e timestamps UTC de todas as operações sensíveis.",
        ]
        tools = ["OWASP Top 10", "Argon2id", "Pydantic V2", "Bandit / Semgrep", "AuditTrail"]
        next_steps = "Execute o comando `/audit` para disparar uma varredura completa de vulnerabilidades no projeto ativo."
    else:
        is_coding_context = any(
            k in p_lower
            for k in (
                "código",
                "codigo",
                "função",
                "funcao",
                "api",
                "software",
                "endpoint",
                "bug",
                "erro",
                "banco",
                "tabela",
                "react",
                "python",
            )
        )
        if is_coding_context:
            topic_title = f"Parecer Técnico Estruturado: {user_prompt[:50]}"
            overview = (
                f"Análise técnica elaborada pelo **{role}** para o contexto de desenvolvimento: *'{user_prompt}'*.\n\n"
                "O ecossistema JARVIS opera sob governança multi-agente, combinando heurísticas especializadas "
                "com modelos de linguagem soberanos para garantir confiabilidade de engenharia e código limpo."
            )
            pillars = [
                "**1. Análise de Requisitos e Escopo**: Delimitação clara de entradas, saídas esperadas e restrições operacionais.",
                "**2. Boas Práticas e Padrões da Indústria**: Modularidade estrita, código tipado, manutenibilidade e cobertura por testes automatizados.",
                "**3. Eficiência de Recursos**: Execução otimizada em hardware local com baixo consumo de memória RAM.",
                "**4. Segurança e Auditoria**: Rastreabilidade completa de todas as deliberações e ações tomadas pelos especialistas.",
            ]
            tools = ["Python 3.12+", "Clean Architecture", "Pydantic V2", "Pytest"]
            next_steps = "Para implementar componentes ou aprofundar qualquer detalhe, envie suas instruções específicas."
        else:
            topic_title = f"Orientação & Análise: {user_prompt[:50]}"
            overview = (
                f"Orientações elaboradas pelo **{role}** para o tema: *'{user_prompt}'*.\n\n"
                "Aqui estão as recomendações principais organizadas de forma clara e prática para você:"
            )
            pillars = [
                "**1. Fundamentos & Clareza**: Compreensão dos conceitos centrais antes de avançar para etapas complexas.",
                "**2. Aplicação Prática**: Colocar os conhecimentos em prática por meio de rotinas e exercícios regulares.",
                "**3. Acompanhamento Contínuo**: Ajustar métodos e estratégias de acordo com seus resultados e necessidades.",
            ]
            tools = ["Raciocínio Didático", "Metodologia Prática", "Planejamento Estruturado"]
            next_steps = "Envie uma mensagem dizendo qual aspecto você gostaria de aprofundar ou explorar em seguida!"

    pillars_str = "\n".join(pillars)
    tools_str = ", ".join(f"`{t}`" for t in tools)

    return (
        f"### 🌐 {topic_title}\n\n"
        f"{overview}\n\n"
        f"#### ⚙️ Pilares Fundamentais:\n"
        f"{pillars_str}\n\n"
        f"#### 🛠️ Tecnologias e Padrões Recomendados:\n"
        f"{tools_str}\n\n"
        f"#### 🚀 Recomendações e Próximos Passos:\n"
        f"{next_steps}"
    )
