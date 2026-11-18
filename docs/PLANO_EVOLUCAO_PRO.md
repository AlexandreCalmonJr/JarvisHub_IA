# PLANO MESTRE DE EVOLUÇÃO INTEGRADA — JARVIS AI HUB (VERSÃO 4.0.0-PRO)
> **Versão:** 4.0.0-PRO · **Data:** Novembro de 2026 · **Status:** Documento Canônico de Arquitetura & Roteiro Mestre  
> **Escopo:** Paridade Total com Claude Code, Aider, Devin, OpenBot e Cursor; Arquitetura de Persistência Dual-Engine (SQLite Async Buffer + PostgreSQL); Engenharia de Backend Resiliente; Design System Minimalista OpenBot de 4 Zonas; Voice HUD / Dynamic Island; e Acesso Zero-Atrito Mobile/Desktop.

---

## 1. Sumário Executivo & Visão do Produto

O **JARVIS AI HUB** foi concebido e consolidado como uma plataforma local-first completa e centralizada, integrando Dashboard Web, Janela Desktop nativa, Aplicativo Mobile (Flutter), Assistente de Voz em tempo real com hotkey global, Modelos Locais via Ollama e uma camada corporativa de Governança (`SecurityCore`, `ApprovalEngine`, Kill Switch e Trilha de Auditoria imutável).

Em contrapartida, ferramentas de ponta como **Claude Code (Anthropic)** e **Aider** são especialistas 100% focadas na velocidade, ergonomia e autonomia do desenvolvedor no código (CLI interativa com TUI de alta velocidade, indexação sintática ultra-compacta via AST/Tree-sitter, loops autônomos de teste/correção e edição cirúrgica com rollback instantâneo). Paralelamente, **Devin** e **OpenBot** exploram subagentes concorrentes em containers efêmeros e design ergonômico moderno.

O **Plano 4.0.0-PRO** tem como objetivo estratégico **fechar todas as lacunas técnicas em relação ao estado da arte**, elevando o JARVIS AI HUB a uma plataforma de engenharia de software de classe mundial, mantendo e potencializando seus diferenciais únicos: **privacidade local absoluta, assistência de voz nativa e governança institucional**.

---

## 2. Diagnóstico Técnico & Matriz Competitiva SOTA

### 2.1 Matriz Comparativa de Capacidades

| Recurso / Capacidade | JARVIS AI HUB (Hoje) | Claude Code (Anthropic) | Aider / OpenCode | Cursor / Roo Code | Devin / OpenBot | Meta JARVIS 4.0.0-PRO |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Privacidade Local-First / Zero Cloud Lock-in** | **Total (100% Offline)** | Nuvem Fechada (API) | Híbrido (BYOK) | Nuvem / Proxy | Nuvem Fechada | **Total (100% Offline + BYOK)** |
| **Assistente de Voz Desktop em Tempo Real** | **Nativo (<100ms, Barge-in)** | Inexistente | Inexistente | Inexistente | Inexistente | **Nativo (HUD + Dynamic Island)** |
| **Aplicativo Mobile Dedicado (Android/iOS)** | **Nativo (Flutter)** | Inexistente | Inexistente | Inexistente | Parcial (Intel OpenBot) | **Nativo + Pareamento QR Code** |
| **Governança, Aprovação Humana e Kill Switch** | **Total (`SecurityCore`)** | Confirmação CLI básica | Confirmação no chat | Inexistente | Ad-hoc | **Total (Audit DB + Web/App Approval)** |
| **Experiência de Linha de Comando (TUI CLI)** | Parcial (`apps/cli/`) | **Líder (TUI ultrarrápido)** | **Líder (REPL rich)** | Terminal IDE | Terminal Web | **Líder (`jarvis code` / `jarvis repl`)** |
| **Mapeamento de Repositório (Repo Map AST)** | Parcial (`ASTIndexer`) | Heurístico | **Líder (<1k tokens PageRank)**| Tree-sitter / LSP | AST avançado | **Líder (Tree-sitter PageRank <1k)** |
| **Loop Autônomo de Teste (Test-Fix-Verify)** | Parcial (Turnos manuais) | **Autônomo contínuo** | **Autônomo (--test)** | Parcial | **Totalmente autônomo** | **Totalmente Autônomo com Rollback** |
| **Edição Cirúrgica & Rollback Instantâneo** | Parcial (`edit_file` exact) | Patch / Diff | **Líder (Search/Replace + git)**| Multi-file Diffs | Sandbox git | **Unified Diff Tolerante + `/undo` Git** |
| **Integração Nativa na IDE (Extensão VS Code)** | Inexistente (REST/WS exposto)| Inexistente | Inexistente | **Líder (Editor nativo)**| Inexistente | **Extensão VS Code Oficial** |
| **Persistência Relacional & Concorrência** | SQLite WAL (Contenção pontual)| Stateless / Sessões | SQLite local | SQLite / Nuvem | Postgres nuvem | **Dual-Engine (Async Buffer + Postgres)**|
| **Sandboxing & Ambientes Efêmeros** | Subprocesso Sanitizado | Subprocesso local | Subprocesso local | Sandbox IDE | **Docker / MicroVMs** | **Container Docker/WSL Efêmero** |

---

### 2.2 Análise Detalhada das 6 Grandes Lacunas Técnicas

1. **Experiência de Linha de Comando (CLI Interativa no Terminal):**
   - *Como Claude Code / Aider operam:* O desenvolvedor digita `claude` ou `aider` na raiz do projeto. Um REPL de terminal de alta velocidade (Rich/Prompt Toolkit) oferece autocomplete com `/`, atalhos de barra (`/add`, `/diff`, `/test`, `/undo`), syntax highlighting e visualização de markdown/diff colorido.
   - *No JARVIS:* Acesso concentrado no Dashboard Web (`127.0.0.1:8000`) ou PyWebView.
   - *Ação 4.0:* Executável de terminal `jarvis` com comandos `jarvis code "prompt"`, `jarvis repl`, visualização de diff colorido com Rich e atalhos rápidos.

2. **Mapeamento Semântico de Repositório (Repo Map com Tree-sitter / PageRank):**
   - *Como Aider / Claude Code operam:* Para repositórios com centenas de arquivos, geram um *Repo Map* via AST (Tree-sitter/ctags): representação ultra-compactada de arquivos, classes, métodos e assinaturas de funções ranqueadas por PageRank de relevância. Consome menos de 1.000 tokens e dá visão arquitetural completa ao modelo antes da leitura detalhada.
   - *No JARVIS:* Busca pontual via `read_file`, `list_directory`, `glob` e `grep`.
   - *Ação 4.0:* Módulo `services/coding_agent/repo_map.py` com extração sintática AST, cache em disco e injeção automática no prompt de sistema do agente.

3. **Loop Autônomo Fechado de Teste e Correção (Test-Fix-Verify Loop):**
   - *Como Claude Code / Devin operam:* Loop autônomo contínuo: `Edita Código` $\to$ `Executa Suite de Testes` $\to$ `Detecta Traceback/Falha` $\to$ `Ajusta Código` $\to$ `Reexecuta`. Só encerra quando o comando de teste retornar código 0 ou atingir o limite seguro de iterações.
   - *No JARVIS:* Execução turno a turno dependente de novas instruções do usuário.
   - *Ação 4.0:* Modo autônomo de objetivo `jarvis "conserte o bug X" --test "pytest tests/unit" --max-turns 10`.

4. **Edição Cirúrgica de Código & Rollback Instantâneo (`/undo`):**
   - *Como Aider / Cursor operam:* Blocos `<<<< SEARCH / ==== / >>>> REPLACE` ou Unified Diffs com tolerância a whitespace/indentação. Em caso de falha, comando `/undo` desfaz imediatamente o commit git local, restaurando o workspace.
   - *No JARVIS:* `_run_edit_file` exige casamento estrito de strings e backups `.bak` manuais.
   - *Ação 4.0:* Parser de Unified Diff tolerante com aplicação de hunks e transações Git com rollback automático em falhas de compilação ou rejeição.

5. **Integração Nativa no Editor (Extensão VS Code):**
   - *Como Cursor / Roo Code operam:* Conectados ao Language Server Protocol (LSP), diagnósticos de erro da IDE e edição inline com `Ctrl+K`.
   - *No JARVIS:* API REST e WebSocket prontas, mas sem extensão de editor.
   - *Ação 4.0:* Criação de `jarvis-vscode-extension` em TypeScript para conexão ao backend FastAPI local.

6. **Sandboxing e Ambientes Efêmeros (Docker / MicroVMs):**
   - *Como Devin opera:* Execução de comandos isolada em containers Docker ou MicroVMs efêmeras, garantindo integridade do sistema operacional.
   - *No JARVIS:* Comandos rodam no shell do host com filtros de segurança e Kill Switch.
   - *Ação 4.0:* Execução opcional em containers Docker/WSL com mapeamento seguro de volumes.

---

## 3. Arquitetura de Persistência & Banco de Dados Dual-Engine

### 3.1 O Diagnóstico do SQLite Atual & O Dilema Arquitetural

O JARVIS utiliza uma arquitetura híbrida embarcada:
- **SQLite (WAL Mode + 256MB MMAP):** `data/jarvis.db`, `users.sqlite3` e `telemetry.db` para dados relacionais, memórias, sessões e auditoria.
- **LanceDB (Apache Arrow / Rust):** `data/vectors/` para busca vetorial semântica de alta performance (RAG).
- **DuckDB:** Consultas analíticas ultrarrápidas em arquivos tabulares e parquet.

**A Força do SQLite:** Embarcado no processo, zero latência de rede, zero configuração externa. Permite ao usuário baixar o instalador de 143 MB (`JarvisHub-Setup-v3.0.1.exe`), clicar e rodar sem instalar Docker, serviços ou portas externas.  
**O Ponto de Contenção:** No SQLite, apenas um processo pode escrever por vez. Em picos simultâneos (gravação de áudio contínua + telemetria + Coding Agent editando arquivos + auditoria), pode ocorrer contenção transitória (`database is locked`).

### 3.2 A Solução: Arquitetura Dual-Engine

```mermaid
flowchart TD
    subgraph App["JARVIS AI HUB Runtime"]
        WriteEvent["Operação de Escrita\n(Chat / Telemetria / Auditoria)"]
        ReadEvent["Operação de Leitura"]
    end

    subgraph DualEngine["Engine de Persistência Pluggable"]
        ConfigCheck{"DATABASE_URL configurada?"}
        
        subgraph SQLiteEngine["Engine Local Padrão (SQLite + Async Buffer)"]
            WriteQueue["Async Write Buffer\n(asyncio.Queue em Memória)"]
            Worker["Background Batch Worker\n(aiosqlite lote a cada 1s / 100 itens)"]
            SQLiteFile[("SQLite DB Local\n(WAL + 256MB MMAP)")]
        end

        subgraph PostgresEngine["Engine Enterprise (PostgreSQL 16)"]
            AsyncPG["SQLAlchemy 2.0 / asyncpg\nConnection Pool"]
            PostgresDB[("PostgreSQL 16 +\npgvector")]
        end
    end

    WriteEvent --> ConfigCheck
    ReadEvent --> ConfigCheck

    ConfigCheck -->|Não / Vazia| WriteQueue
    WriteQueue --> Worker
    Worker --> SQLiteFile
    ConfigCheck -->|Sim (postgresql://)| AsyncPG
    AsyncPG --> PostgresDB
```

1. **Curto Prazo (Imediato no SQLite — Async Write Queue & Batching):**
   - Fila não-bloqueante (`asyncio.Queue`) com worker em segundo plano (`aiosqlite`).
   - Escritas de telemetria, logs e histórico são enfileiradas em memória e descarregadas em lote a cada 1 segundo ou a cada 100 eventos.
   - Elimina 100% dos erros de `database is locked` sem alterar os requisitos do instalador desktop.
2. **Médio Prazo (Suporte a PostgreSQL 16 Enterprise):**
   - Variável de ambiente opcional: `DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/jarvis`.
   - Se definida, o sistema direciona as conexões para o PostgreSQL com extensão `pgvector`, ideal para deploys em servidores, VPS e ambientes corporativos.
3. **Cache Semântico Vetorial (LanceDB):**
   - Substituição de comparação exata por hash SHA-256 por similaridade semântica de cosseno ($> 0.95$).
   - Perguntas idênticas ou similares retornam em menos de 5ms sem custo de tokens de LLM.

---

## 4. Engenharia de Backend, Modelos & Concorrência

### Pilar 1: Modelos & Inferência Inteligente
- **Roteamento em Cascata Adaptativa (Model Cascading):**
  - Heurística ultrarrápida (<5ms): prompts simples (formatação JSON, saudações, extrações) são direcionados para modelos locais compactos (Qwen 2.5 1.5B / Phi-3 Mini) com latência < 150ms.
  - Tarefas complexas de código ou raciocínio são enviadas a modelos de 70B ou nuvem (Claude 3.5 Sonnet / GPT-4o).
  - Circuit Breaker transparente: em caso de HTTP 429 ou timeout (>5s) na nuvem, o backend comuta imediatamente para o modelo local do Ollama sem interrupção do chat.
- **Prefix Caching (KV-Cache):**
  - Estruturação estável das mensagens de sistema para ativar Prefix Caching automático (Ollama local e APIs em nuvem). Redução de até 80% no custo e corte de 50% no TTFT.
- **VRAM Manager Dinâmico:**
  - Descarregamento dinâmico de modelos pesados da memória de vídeo após 5 minutos de inatividade, liberando a GPU.
  - Suporte a modelos particionados GGUF de grande escala (Kimi-K3, DeepSeek-R1, Qwen 2.5 Coder) com retomada resiliente de downloads parciais.

### Pilar 2: Orquestração de Agentes & Execução Durável
- **Checkpointing Durável (Resumable Agent Graphs):**
  - Gravação de snapshots de estado a cada etapa executada do grafo. Em caso de queda de energia ou reinicialização, o sistema recupera o ponto exato da tarefa: *"Tarefa de refatoração interrompida no passo 8 de 14. Deseja continuar?"*.
- **Pausa Humana Assíncrona (`ApprovalBroker`):**
  - Operações de alto risco suspendem a corrotina (`SUSPENDED_WAITING_APPROVAL`) via `asyncio.Event`, liberando CPU/RAM e notificando o usuário via WebSocket/Push. A aprovação no navegador ou app mobile retoma a execução instantaneamente.
- **Subagentes Paralelos Efêmeros:**
  - Capacidade de despachar subagentes em background (ex: um pesquisa documentação externa enquanto outro roda testes unitários), agregando os resultados sem poluir a janela de contexto principal.

### Pilar 3: Memória e Recuperação Semântica (RAG Avançado)
- **Busca Híbrida com RRF (Reciprocal Rank Fusion):**
  - Fusão da busca léxica exata (SQLite FTS5 / BM25) com busca vetorial densa (LanceDB):
    $$RRF\_Score(d) = \sum_{m \in M} \frac{1}{k + rank_m(d)}$$
  - Garante recuperação precisa tanto de conceitos abstratos quanto de identificadores literais exatos (`def calculate_contrast_ratio()`, `ERR_089`).
- **Memory Dream / Consolidação Noturna de Memória:**
  - Worker em segundo plano que roda durante períodos de ociosidade, destilando conversas diárias, sintetizando fatos de longo prazo e removendo redundâncias do banco.

### Pilar 4: Performance de I/O e Governança de Processos
- **In-Process EventBus Assíncrono:**
  - Barramento central baseado em `asyncio.Queue` desacoplando publicadores (`agent.step_completed`, `voice.speech_started`, `model.first_token`) de consumidores (telemetria, auditoria, WebSockets).
- **Windows Job Objects para Sandboxing Local:**
  - Execução de comandos do subprocesso encapsulada em Job Objects nativos do Windows com limites rígidos de RAM (máx. 1.5 GB por comando), timeout e encerramento em cascata de processos órfãos.

---

## 5. Arquitetura Visual, UI/UX Minimalista & Design System OpenBot

### 5.1 A Grade Ergonômica de 4 Zonas

```
+---------------------------------------------------------------------------------------------------------+
|                                    [ Dynamic Island: 🟣 👋 ]                                            |
+----+-----------------------+-------------------------------------------------------------------+--------+
| R  | GAVETA DE CONTEXTO    | ÁREA DE TRABALHO PRINCIPAL                                        | DOCK   |
| A  | (Sub-menu retrátil    |                                                                   | DE     |
| I  | dependente da página) | [💬 Calmon Dev +]               [💻 ollama/qwen2.5-coder:7b v]    | AGENTES|
| L  |                       | ----------------------------------------------------------------- | (Direi-|
|    | Pesquisar...          |                                                                   |  ta)   |
| 💬 |                       | 2 etapas >                                                        |        |
| 🔀 | QA Tester             | [x] Perguntas canceladas                                          |  (🟣)  |
| ✓: | Copy Editor           |                                                                   |  (🔵)  |
| 📈 | Bug Fixer             |                      Você: Como está o computador?                |  (🟠)  |
| 🗄️ | Security              |                                                                   |  (🟢)  |
| ⋯  | Design                | JARVIS:                                                           |   +    |
|    |                       | Vou verificar o estado do computador: CPU, memória e temperatura. |        |
| 🏬 |                       | 12 etapas > [Desdobramento de tools]                              |        |
| ❓  |                       |                                                                   |        |
| ⚙️ |                       | ----------------------------------------------------------------- |        |
| 👤 |                       | [ + ] [ Mensagem para JARVIS...                ] [🎙️] [🔊]        |        |
+----+-----------------------+-------------------------------------------------------------------+--------+
```

1. **Zona 1: Trilho Esquerdo Fixo Ultra-Slim (64px - `#0c0c0e`):**
   - Ícone do robô lilás no topo.
   - Ícones de acesso rápido: Chat (`💬`), Fluxos de Trabalho (`🔀`), Tarefas (`✓:`), Uso & Custos (`📈`), Biblioteca (`🗄️`).
   - Menu `⋯` com pop-up de pinagem (`📌`) para customização do desenvolvedor.
   - Rodapé: Loja de Apps (`🏬`), Ajuda (`❓`), Configurações (`⚙️`) e Seletor de Servidor (`👤`).
2. **Zona 2: Gaveta de Contexto Retrátil (240px):**
   - Adapta-se ao contexto ativo (lista de conversas e agentes no Chat, árvore de arquivos na Biblioteca, catálogo de integrações na Loja).
3. **Zona 3: Dynamic Island Superior & Top Bar:**
   - Entalhe flutuante com feedback animado do assistente, ondas de voz reativas e status de hardware.
   - Barra de abas superior (`[Calmon Dev] [+]`) e seletor rápido de modelo de IA.
4. **Zona 4: Dock de Agentes Flutuante à Direita (56px):**
   - Avatares 3D coloridos em squircle (QA Tester 🟣, Copy Editor 🔵, Bug Fixer 🟠, Security 🟢, `+`).

### 5.2 Estrutura de UX Minimalista (Linear / Raycast Style)
- **4 Modos Essenciais:** Agrupamento das 19 abas legadas em 4 áreas principais:
  - **Studio (`Ctrl+1`):** Chat Unificado, Coding Agent e Split Canvas.
  - **Workspace (`Ctrl+2`):** Arquivos do projeto, repositório Git e tarefas ativas.
  - **Fleet (`Ctrl+3`):** 26 Agentes Especializados, Teammates e Modelos (Ollama/HuggingFace).
  - **System (`Ctrl+4`):** Central de Segurança, Aprovações, Telemetria de Tokens e Configurações.
- **Split Canvas Interativo:**
  - Lado Esquerdo (45%): Diálogo, raciocínio e pílulas de ferramentas.
  - Lado Direito (55%): Canvas interativo com visualização ao vivo de código, renderização HTML/React em tempo real, diagramas Mermaid e visualizador de Diffs interativo (Split e Unificado).
- **Command Palette Global (`Ctrl + K`):**
  - Acesso universal instantâneo por teclado a qualquer rota, comando, modelo ou acionamento de emergência (Kill Switch).
- **Thought Disclosure Colapsável:**
  - Raciocínio exibido em pílula limpa (`X etapas >` / `Pensando por 2.4s ▼`), expansível com tipografia monoespaçada sem poluir o histórico.

---

## 6. Experiência de Voz & Feedback Visual

1. **Voice HUD / Dynamic Island Flutuante:**
   - Componente translúcido (*frosted glass* com `backdrop-filter: blur(16px)`).
   - **4 Estados Animados:**
     - `Escutando:` Espectrograma de áudio ao vivo com 5 a 7 barras reativas aos decibéis do microfone.
     - `Pensando:` Gradiente luminoso suave em rotação contínua.
     - `Respondendo:` Onda senoidal reativa sincronizada com o sintetizador de fala.
     - `Mutado:` Indicador âmbar discreto com atalho de reativação (`Ctrl+Shift+M`).
   - Transcrição ao vivo (*Live Transcript*) exibindo o texto reconhecido em tempo real.
2. **Overlay Global Transparente no Windows:**
   - Mini-janela nativa sem bordas *Always on Top* acionada pelo atalho global `Ctrl+Shift+J`, exibindo o HUD de voz sobre qualquer aplicação.
3. **Silero VAD & Barge-in Ultrarrápido:**
   - Detecção de término de fala com pausa adaptativa de 500ms (reduzindo a latência pela metade).
   - Cancelamento instantâneo do buffer de áudio ao detectar voz do usuário durante fala do JARVIS (*barge-in*).
4. **Síntese Neural Offline de Alta Fidelidade:**
   - Suporte integrado a modelos neurais leves e ultra-realistas (Supertonic 3, Kokoro TTS 82M e Parakeet TDT 0.6B v3).

---

## 7. Acesso Zero-Atrito & Conectividade Mobile / Remota

1. **Auto-Login Transparente no Desktop (`JarvisHub.exe`):**
   - Verificação de sessão de usuário do Windows no host local, eliminando a tela manual de token admin.
2. **Autenticação Biométrica no Navegador (WebAuthn / Passkeys):**
   - Suporte a Windows Hello (digital / PIN) no Chrome e Edge.
3. **Pareamento Instantâneo por QR Code:**
   - Geração de QR Code temporário e criptografado na tela de configurações (`/settings`), lido pela câmera do app Flutter para autenticação em 1 segundo.
4. **Descoberta Automática de Servidor via mDNS / Zeroconf:**
   - Anúncio do serviço na rede local (`jarvis.local:8000`). O aplicativo mobile localiza automaticamente a máquina na rede Wi-Fi sem que o usuário precise digitar IPs.
5. **Acesso Remoto Seguro (4G/5G):**
   - Suporte nativo a túnel P2P privado via Tailscale ou Cloudflare Tunnel gratuito com TLS e 2FA, sem necessidade de abertura de portas no roteador doméstico.
6. **Progressive Web App (PWA):**
   - Manifest e Service Worker no dashboard, permitindo instalação com 1 clique no iOS e Android via navegador.
7. **Notificações Push com Aprovação Humana no Celular:**
   - Notificações ricas no celular com botões de ação imediata: *"Build concluído com sucesso. Deseja aplicar o commit?"* $\to$ `[ Aprovar ]` `[ Rejeitar ]`.

---

## 8. Cronograma de Execução em 5 Fases

```mermaid
gantt
    title Cronograma Mestre 4.0.0-PRO (Fullstack & Engenharia)
    dateFormat  YYYY-MM-DD
    section Fase 1: Acesso & Voz
    Auto-login Desktop, Dynamic Island / Voice HUD & WebAuthn :done, f1, 2026-11-17, 1d
    section Fase 2: UI/UX Minimalista
    4 Modos, Split Canvas, Command Palette Ctrl+K & Diffs    :done, f2, 2026-11-17, 1d
    section Fase 3: Persistência & Backend
    Async Write Queue, Dual-Engine Postgres, EventBus & Checkpoints :done, f3, 2026-11-17, 1d
    section Fase 4: Paridade de Código
    CLI TUI, Repo Map Tree-sitter, Test-Fix Loop & Rollback Git      :done, f4, 2026-11-17, 1d
    section Fase 5: Mobile & Conectividade
    mDNS Zeroconf, QR Code Pairing, PWA & Push Notifications        :done, f5, 2026-11-17, 1d
```

---

## 9. Matriz de Entregáveis Técnicos & Status Detalhado

| ID | Área | Componente / Arquivo | Status | Descrição da Entrega |
|:---|:---|:---|:---:|:---|
| **E01** | Frontend | `apps/dashboard/src/components/navigation/PrimaryRail.tsx` | **Concluído ✓** | Trilho fixo ultra-slim 64px (`#0c0c0e`), pinagem de atalhos (`📌`) e navegação completa. |
| **E02** | Frontend | `apps/dashboard/src/components/navigation/AgentDock.tsx` | **Concluído ✓** | Dock vertical direito com squircle 3D para especialistas sincronizado com o chat. |
| **E03** | Frontend | `apps/dashboard/src/components/navigation/DynamicIsland.tsx` | **Concluído ✓** | Entalhe flutuante com ondas reativas de voz e status de CPU/RAM. |
| **E04** | Frontend | `apps/dashboard/src/components/chat/OpenBotChatHeader.tsx` & `MessageBubble.tsx` | **Concluído ✓** | Abas de chat, seletor de modelos e pílulas de etapas colapsáveis (`X etapas >`). |
| **E05** | Frontend | `apps/dashboard/src/components/workflows/WorkflowCanvasView.tsx` | **Concluído ✓** | Canvas infinito com dot grid, nós arrastáveis, conexões SVG e dock de ferramentas. |
| **E06** | Frontend | `apps/dashboard/src/components/usage/UsageAnalyticsView.tsx` | **Concluído ✓** | Telemetria de CPU/RAM, curva suave SVG de 30 dias e grid de 5 cartões de tokens. |
| **E07** | Frontend | `apps/dashboard/src/components/store/AppStoreView.tsx` | **Concluído ✓** | Catálogo de integrações (Slack, Telegram, WhatsApp, GitHub) e webhooks. |
| **E08** | Frontend | `apps/dashboard/src/components/ProjectWorkspaceView.tsx` | **Concluído ✓** | Biblioteca OpenBot com gaveta lateral 240px, visualização lista/grade e empty state. |
| **E09** | Frontend | `apps/dashboard/src/components/settings/SettingsView.tsx` | **Concluído ✓** | Configurações de voz (Parakeet VAD 1.5s, Kokoro TTS, teste `▷ Ouvir`) e provedores de IA. |
| **E10** | Backend | `services/persistence/write_buffer.py` | **Concluído ✓** | Async Write Queue não-bloqueante para SQLite eliminando erros de contenção. |
| **E11** | Backend | `services/persistence/dual_engine.py` | **Concluído ✓** | Abstração pluggable suportando SQLite local e PostgreSQL 16 via `DATABASE_URL`. |
| **E12** | Backend | `services/events/event_bus.py` | **Concluído ✓** | In-Process EventBus assíncrono para desacoplamento de telemetria e auditoria. |
| **E13** | Coding | `apps/cli/main.py` & `ui.py` | **Concluído ✓** | Terminal TUI interativo com Rich e atalhos de barra (`/diff`, `/undo`, `/test`, `/map`). |
| **E14** | Coding | `services/coding_agent/repo_map.py` | **Concluído ✓** | Gerador de Repo Map sintático compacto (<1000 tokens) via AST e ranking. |
| **E15** | Coding | `services/coding_agent/autonomous_loop.py` | **Concluído ✓** | Test-Fix-Verify Loop com execução de testes e rollback transacional git `/undo`. |
| **E16** | Coding | `services/coding_agent/unified_diff.py` | **Concluído ✓** | Parser de Unified Diff e Search/Replace tolerante a indentação/espaçamento. |
| **E17** | Mobile | `apps/api/routers/system.py` & `SettingsView.tsx` | **Concluído ✓** | Descoberta LAN UDP beacon (8001), QR Code instantâneo e PWA manifest instalável. |

---

## 10. Governança e Regras Rígidas de Execução

1. **Princípio "Fez $\to$ Testou $\to$ Validou":**
   - Cada componente ou serviço implementado deve ser acompanhado imediatamente de testes unitários ou de integração e compilação do frontend.
   - Nenhuma entrega é dada como concluída sem validação verde.
2. **Comandos de Teste Obrigatórios:**
   - **Backend:** `.venv\Scripts\python.exe -m pytest tests/`
   - **Frontend:** `npm run build` na pasta `apps/dashboard`
3. **Controle de Versão:**
   - **Nenhum commit ou push no repositório remoto sem autorização prévia e explícita do usuário.**
   - A árvore de trabalho deve ser mantida limpa e organizada.
