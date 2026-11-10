# 🏗️ Diagrama de Arquitetura e Fluxos de Dados

> **Projeto**: JARVIS AI HUB  
> **Versão**: 1.0.0  
> **Padrão**: Monólito Modular, Clean Architecture & Local-First  

---

## 1. Visão Geral da Arquitetura do Sistema

O JARVIS AI HUB adota uma arquitetura em **Monólito Modular** dividida em camadas lógicas bem definidas, garantindo desacoplamento estrito, alta velocidade de comunicação interna em memória e facilidade de manutenção.

```mermaid
flowchart TB
    subgraph UI["Camada de Apresentação (Frontend SPA)"]
        DASH["React 19 + TypeScript (16 Páginas Modulares)"]
        MOB["Mobile App (Flutter / Tailscale)"]
    end

    subgraph API["Camada de Entrada & Roteamento (FastAPI)"]
        ROUTER["FastAPI APIRouters (10 Domínios de Negócio)"]
        DEPS["Injeção de Dependências & Middlewares de Segurança"]
    end

    subgraph CORE["Núcleo de Orquestração & Inteligência"]
        MASTER["JARVIS Maestro (LangGraph StateGraph)"]
        REGISTRY["Agent Registry (26 Especialistas Lógicos)"]
        SKILLS["Skills Catalog (ECC & YAGNI Ponytail Mode)"]
        QUEUE["InferenceQueue (Serializador de CPU / max_concurrent=1)"]
    end

    subgraph SEC["Camada de Blindagem & Governança"]
        SEC_CORE["SecurityCore (RBAC & Policy Engine)"]
        APPROVAL["ApprovalEngine (Human-in-the-Loop)"]
        TOOL_GW["ToolGateway (SubprocessSandbox & Allowlist)"]
        KILL_SW["KillSwitch (Contenção Global / Tarefa)"]
    end

    subgraph INFRA["Camada de Persistência & Runtime Físico"]
        SQLITE[("SQLite WAL (64MB Cache / 256MB MMAP)")]
        OLLAMA["Ollama Runtime (llama3.2:3b / qwen2.5-coder)"]
        WORKSPACE["Git Workspaces & Worktrees (/workspace/*)"]
    end

    DASH -->|REST / SSE Streaming| ROUTER
    MOB -->|REST Seguro via VPN| ROUTER
    ROUTER --> DEPS
    DEPS --> MASTER
    MASTER --> REGISTRY
    MASTER --> SKILLS
    MASTER --> QUEUE
    QUEUE --> OLLAMA
    MASTER --> SEC_CORE
    SEC_CORE --> APPROVAL
    SEC_CORE --> TOOL_GW
    TOOL_GW --> WORKSPACE
    MASTER --> SQLITE
```

---

## 2. Fluxo de Execução de Tarefas (Chat & Deliberação Multi-Agente)

O ciclo de vida de uma requisição de chat é governado pelo **LangGraph StateGraph**, garantindo rastreabilidade, integridade de estado e tratamento de exceções com fallback heurístico.

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuário (Navegador)
    participant API as FastAPI Router (/api/v1/chat/stream)
    participant M as JARVIS Maestro (LangGraph)
    participant SEC as SecurityCore & Approval
    participant IQ as InferenceQueue
    participant LLM as Ollama (llama3.2:3b)
    participant DB as SQLite WAL (data/jarvis.db)

    U->>API: POST /api/v1/chat/stream {prompt, session_id}
    API-->>U: SSE data: {"type": "status", "stage": "starting"}
    API->>M: execute_task(prompt, session_id)
    
    activate M
    M->>M: Nó 1: Classificar Intenção & Selecionar Especialistas
    M->>SEC: Verificar Políticas & Permissões
    alt Requer Modificação em Arquivos
        SEC->>SEC: Pausar Tarefa & Gerar Approval Request
        SEC-->>U: Notificar Pendência de Aprovação Humana
    else Somente Leitura / Consulta
        M->>IQ: Enfileirar Inferência (Token Bucket)
        activate IQ
        IQ->>LLM: Gerar Tokens no Ollama
        LLM-->>IQ: Resposta do Especialista
        deactivate IQ
        M->>M: Consolidar Parecer Técnico dos Agentes
        M->>DB: Salvar Estado da Tarefa (is_completed=1)
    end
    deactivate M

    API-->>U: SSE data: {"type": "meta", "intent", "agents"}
    API-->>U: SSE data: {"type": "token", "chunk": "..."}
    API-->>U: SSE data: {"type": "done", "is_completed": true}
```

---

## 3. Fluxo de Dados de Persistência com SQLite WAL & Concorrência

Para permitir que múltiplas operações de leitura ocorram simultaneamente com gravações de auditoria e memórias, o SQLite foi ajustado com modo WAL (*Write-Ahead Logging*):

```mermaid
flowchart LR
    subgraph WRITERS["Escritores Simultâneos"]
        W1["Audit Trail Logger"]
        W2["Agent Memory Saver"]
        W3["Task Checkpointer"]
    end

    subgraph ENGINE["Mecanismo SQLite Concorrente"]
        MUTEX["busy_timeout = 5000ms\n(Fila de Espera Automática)"]
        WAL_LOG["Arquivo WAL\n(data/jarvis.db-wal)"]
        RAM_CACHE["Cache RAM de 64MB\n(cache_size = -64000)"]
    end

    subgraph READERS["Leitores Paralelos (Zero Bloqueio)"]
        R1["Dashboard Overview"]
        R2["Live Logs SSE"]
        R3["Knowledge Vault Search"]
    end

    subgraph DISK["Armazenamento Permanente"]
        DB_FILE[("data/jarvis.db")]
    end

    W1 & W2 & W3 --> MUTEX
    MUTEX --> WAL_LOG
    WAL_LOG -->|Checkpoint Atômico| DB_FILE
    R1 & R2 & R3 -.->|Leitura Direta da RAM| RAM_CACHE
    RAM_CACHE -.-> DB_FILE
```

---

## 4. Estrutura de Camadas Clean Architecture

O código segue estritamente a separação de responsabilidades em anéis concêntricos:

1. **Entidades & Contratos (`packages/contracts`)**:
   - Modelos Pydantic imutáveis (`AgentRole`, `TaskState`, `AgentOutputContract`, `ApprovalRequest`).
   - Totalmente desacoplados de qualquer framework web ou banco de dados.
2. **Casos de Uso & Serviços (`services/*`)**:
   - `services/orchestration`: Orquestração de grafos LangGraph.
   - `services/security_core`: Motor de regras, RBAC, HMAC e Kill Switch.
   - `services/model_runtime`: Gerenciamento de ciclo de vida de LLMs e fila de concorrência.
   - `services/project_workspace`: Varredura, inventário e manipulação de árvores Git.
3. **Adaptadores de Interface (`apps/api/routers/*`)**:
   - Controladores FastAPI desacoplados em 10 domínios que convertem HTTP/SSE para invocações de serviços.
4. **Infraestrutura Externa (`services/memory/database.py`, `services/tool_gateway/sandbox.py`)**:
   - Drivers SQLite, subprocessos do sistema operacional e clientes de rede local.
