# Auditoria de Paridade: Claude Code / OpenCode × JARVIS AI HUB

> **Documento canônico 13** — diagnóstico técnico do repositório, registro da primeira
> fatia vertical do *Coding Agent* e da conclusão dos itens P1 de paridade.
>
> **Data:** 08/11/2026
> **Escopo:** backend Python/FastAPI, serviços de domínio, dashboard React, aplicação
> desktop, persistência SQLite, documentação e testes.
> **Baseline de testes:** `143 passed` e `npm run build` sem erros (bundle inicial 326.74 kB).

---

## 1. Sumário executivo

O JARVIS AI HUB já possui uma base sólida de **governança** (SecurityCore, ApprovalEngine,
Kill Switch, auditoria, sandbox de subprocessos) e uma interface ampla (17 telas). O que
faltava para ser comparável ao **Claude Code** e ao **OpenCode** era o núcleo que define
esses produtos: **um agente que realmente lê, edita, pesquisa e executa código em loop,
com ferramentas reais e aprovação humana no meio do caminho**.

Antes desta entrega, o fluxo principal (`services/orchestration/graph.py`) era
predominantemente **heurístico**: classificava intenções por regex, montava planos fixos e,
em caso de falha do modelo, devolvia respostas técnicas simuladas. O `ToolGateway` não
oferecia escrita de arquivos. O chat clássico não enviava histórico ao modelo e não
persistia mensagens individuais.

Esta entrega adiciona uma **fatia vertical completa e funcional**:

1. `services/coding_agent/` — runtime de tool-calling independente de fornecedor.
2. Ferramentas reais de arquivo, busca, Git e shell, confinadas ao projeto.
3. Aprovação humana assíncrona que **pausa e retoma** o loop.
4. Persistência fiel de mensagens, chamadas e resultados no SQLite.
5. API SSE em `/api/v1/coding/*` e tela **Coding Agent** no dashboard.
6. Testes unitários cobrindo segurança, aprovação, timeout e loop do agente.

Em seguida, os cinco itens P1 prioritários foram concluídos: **chat unificado** com
memória e streaming real, **Anthropic com tool calling e SSE** no adaptador legado,
**cliente MCP** com descoberta de ferramentas, **`git_commit` com aprovação** e
**router real + code splitting** no dashboard. O bundle inicial caiu de ~691 kB para
**326.74 kB** e a suíte chegou a **143 testes**.

---

## 2. Matriz de paridade

Legenda: ✅ implementado e utilizável · 🟡 parcial ou com limitações · ❌ ausente.

| Capacidade de mercado | Claude Code | OpenCode | JARVIS (antes) | JARVIS (agora) |
| :--- | :-: | :-: | :-: | :-: |
| Loop agente ↔ ferramentas | ✅ | ✅ | ❌ (grafo heurístico) | ✅ |
| Leitura de arquivos com offset/limit | ✅ | ✅ | 🟡 (API de workspace) | ✅ |
| Edição cirúrgica por string exata | ✅ | ✅ | ❌ | ✅ |
| Escrita/criação de arquivos | ✅ | ✅ | 🟡 (scaffold fixo) | ✅ |
| Busca por glob e regex (`grep`) | ✅ | ✅ | 🟡 (scanner de inventário) | ✅ |
| Execução de testes/build/lint | ✅ | ✅ | 🟡 (runners fixos) | ✅ (shell geral) |
| Git status/diff | ✅ | ✅ | 🟡 (serviço de workspace) | ✅ |
| Aprovação humana por operação | ✅ | ✅ | 🟡 (só orquestração) | ✅ |
| Modos plan / ask / auto | ✅ | ✅ | ❌ | ✅ |
| Histórico de conversa enviado ao modelo | ✅ | ✅ | ❌ | ✅ (chat unificado) |
| Persistência por mensagem | ✅ | ✅ | ❌ (`tasks` agregadas) | ✅ |
| Streaming de eventos do agente | ✅ | ✅ | 🟡 (tokens simulados) | ✅ (SSE real) |
| Suporte a OpenAI / Anthropic / Ollama | ✅ | ✅ | 🟡 (texto apenas) | ✅ (texto + tools + stream) |
| Contexto do projeto (árvore + instruções) | ✅ | ✅ | 🟡 | ✅ (`JARVIS.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`) |
| Terminal interativo nativo | ✅ | ✅ | ❌ | ❌ (P2) |
| Editor de código embutido | ✅ | ✅ | ❌ | ❌ (P2) |
| Sessões retomáveis com checkpoint | ✅ | ✅ | 🟡 (LangGraph) | 🟡 (histórico SQLite; sem replay de tool calls em voo) |
| Servidor MCP | ✅ | ✅ | ❌ | ✅ (cliente stdio/JSON-RPC) |
| Subagentes paralelos | ✅ | ✅ | 🟡 (grafo multiagente) | ❌ (P2) |
| Indexação semântica do repositório | ✅ | 🟡 | 🟡 (Knowledge Vault manual) | 🟡 |
| Interface desktop nativa | ✅ | ✅ | 🟡 (PyWebView) | 🟡 |
| Router e deep links no frontend | ✅ | ✅ | ❌ (estado + parsing manual) | ✅ (History API) |
| Code splitting por tela | ✅ | ✅ | ❌ (bundle único) | ✅ (`React.lazy`) |

---

## 3. Lacunas e bugs encontrados na auditoria

### P0 — corrigidos nesta entrega

1. **Ausência de runtime de ferramentas.** O grafo atual simulava execução e não tinha
   escrita de arquivos. → Criado `services/coding_agent/runtime.py` com loop real,
   `max_iterations`, timeout global e cancelamento por Kill Switch.
2. **Chat sem memória.** `apps/api/routers/chat.py` chamava `execute_task()` apenas com o
   prompt atual; nenhuma mensagem anterior era enviada. → O novo agente carrega as últimas
   40 mensagens da sessão e persiste cada turno.
3. **Aprovação síncrona incompatível com agente assíncrono.** O `ApprovalEngine` não
   bloqueia nem retoma um loop. → Criado `ApprovalBroker` com `asyncio.Event`, timeout e
   integração com `/api/v1/approvals/{id}/decide`.
4. **Nenhuma ferramenta de edição confiável.** → `edit_file` valida trecho exato,
   ambiguidade e gera backup `.bak` + diff unificado.
5. **Execução de shell ausente no workspace.** → `SubprocessSandbox.run_shell_command()`
   com ambiente sanitizado, timeout, kills de órfãos e redação de segredos.

### P1 — concluídos nesta segunda entrega

6. **Chat clássico sem memória e sem streaming real** → unificado ao runtime
   `ChatAgentRuntime` (ver 4.7). O grafo heurístico continua disponível como motor
   `orchestrator` para ações de código e aprovações.
7. **Anthropic sem streaming nem tool calling no adaptador legado** → `generate()` agora
   envia/parseia `tool_use`/`tool_result` e `generate_stream()` tem branch SSE nativo para
   Anthropic, com DLP aplicado nos dois caminhos (ver 4.8).
8. **Presets de modelo desatualizados** → `gemini-3.5-flash` substituído por
   `gemini-2.5-flash` em `PROVIDER_PRESETS` e `_default_model_for_provider()`.
9. **Sem MCP** → cliente stdio/JSON-RPC implementado, com descoberta e registro dinâmico
   de ferramentas no executor (ver 4.9).
10. **Frontend sem router e sem code splitting** → router próprio com History API e
    `React.lazy`/`Suspense` por tela (ver 4.10).
11. **Sem `git_commit`** → ferramenta EXEC com aprovação, sanitização de mensagem e
    exclusão de backups `.bak` (ver 4.11).

### P1 — lacunas remanescentes (não bloqueantes)

12. **Grafo heurístico**: `generate_heuristic_technical_response()` ainda é fallback de
    produção quando o motor `orchestrator` é escolhido. Deve ser substituído por erro
    explícito ou por um agente de degradação honesto.
13. **ToolGateway limitado**: ferramentas fixas, sem plugins. O Coding Agent usa um
    executor próprio; a unificação dos catálogos segue desejável.
14. **Sem indexação semântica automática**: o Knowledge Vault exige indexação manual.
15. **Checkpoint de tool calls em voo**: uma aprovação pendente é rejeitada com segurança
    se o processo reiniciar; não há replay automático.

### P2 — melhorias de produto

16. **Desktop é apenas um shell PyWebView** (`apps/desktop/main_window.py`), sem editor,
    terminal integrado ou bandeja nativa.
17. **Sem subagentes paralelos** ou mesa redonda executável de verdade (o `/debate` é
    apenas um prompt).
18. **Sem terminal interativo** (PTY) — o shell do agente é one-shot.
19. **Sem checkpoints de tool calls em voo**: se o processo cair durante uma aprovação, a
    operação não é retomada automaticamente (é rejeitada com segurança).
20. **Métricas de custo/token** não são agregadas por sessão do Coding Agent.
21. **Sem sandbox de SO** para servidores MCP e comandos de terceiros.

---

## 4. O que foi implementado nesta entrega

### 4.1 Arquitetura do novo módulo

```
services/coding_agent/
├── __init__.py        # exporta runtime, chat, tools, broker e providers
├── types.py           # contratos (ToolSpec, ToolCall, ChatTurn, AgentRunConfig...)
├── context.py         # árvore do projeto + JARVIS.md/AGENTS.md/CLAUDE.md/README.md
├── providers.py       # Ollama / OpenAI-compatível / Anthropic com tool calling e stream
├── chat.py            # chat conversacional com memória e streaming real
├── tools.py           # 10 ferramentas reais + validação + diff + auditoria
├── broker.py          # aprovação humana assíncrona (asyncio.Event)
└── runtime.py         # loop ReAct com eventos SSE e persistência

services/mcp/
├── client.py          # transporte stdio + JSON-RPC 2.0
├── service.py         # configuração, descoberta e registro no executor
└── types.py           # McpServerConfig, McpToolInfo, McpToolOutcome
```

### 4.2 Ferramentas disponíveis

| Ferramenta | Risco | Aprovação | Descrição |
| :--- | :-: | :-: | :--- |
| `read_file` | leitura | não | Lê com offset/limit e numeração de linhas |
| `list_directory` | leitura | não | Lista arquivos com tamanho e tipo |
| `glob` | leitura | não | Localiza arquivos por padrão (`**/*.tsx`) |
| `grep` | leitura | não | Regex por arquivo/linha, com filtro `include` |
| `write_file` | escrita | sim (modo ask) | Cria/substitui com backup e diff |
| `edit_file` | escrita | sim (modo ask) | Substituição exata com validação de ambiguidade |
| `run_command` | execução | sim (modo ask) | Shell confinado, timeout e bloqueio destrutivo |
| `git_status` | leitura | não | Status curto do repositório |
| `git_diff` | leitura | não | Diff não commitado (opcional por arquivo) |
| `git_commit` | execução | sim (modo ask) | Commit com mensagem sanitizada; ignora `.bak` |

### 4.3 Modos de operação

- **`plan`** — somente leitura. Ferramentas de escrita/execução nem são enviadas ao modelo.
- **`ask`** — pausa antes de cada escrita/comando e exige decisão humana.
- **`auto`** — executa direto no sandbox; bloqueios duros de segurança continuam ativos.

### 4.4 API

| Método | Rota | Função |
| :--- | :--- | :--- |
| `GET` | `/api/v1/coding/tools` | Ferramentas, modos e provedor ativo |
| `GET` | `/api/v1/coding/sessions/{id}/messages` | Histórico fiel da sessão |
| `DELETE` | `/api/v1/coding/sessions/{id}/messages` | Limpa o histórico |
| `POST` | `/api/v1/coding/run/stream` | Executa o agente via SSE |
| `GET` | `/api/v1/coding/approvals` | Aprovações pendentes |
| `POST` | `/api/v1/coding/approvals/{id}/decide` | Aprova/recusa e retoma o loop |

Eventos SSE emitidos: `start`, `thinking`, `assistant`, `tool_call`, `tool_result`,
`approval_required`, `final`, `error`.

### 4.5 Persistência

Nova tabela `chat_messages` em `services/memory/database.py`:

```sql
CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  project_id TEXT,
  role TEXT NOT NULL,              -- user | assistant | tool
  content TEXT NOT NULL DEFAULT '',
  tool_calls_json TEXT,
  tool_call_id TEXT,
  tool_name TEXT,
  created_at TIMESTAMP NOT NULL
);
```

Métodos: `add_chat_message`, `list_chat_messages`, `clear_session_messages`.

### 4.6 Interface

Nova tela **Coding Agent** (`apps/dashboard/src/components/CodingAgentView.tsx`):

- seleção de projeto, modo e modelo;
- linha do tempo com mensagens, chamadas e saídas de ferramentas;
- cartão de aprovação com diff e recursos afetados;
- botão de interromper execução;
- criação de nova sessão e limpeza de histórico;
- atalho na sidebar e na paleta de comandos (`Ctrl+K`), rota `/coding`.

### 4.7 Chat unificado com memória e streaming

O endpoint `/api/v1/chat` e o SSE `/api/v1/chat/stream` passaram a escolher o motor via
campo `engine`:

| Valor | Comportamento |
| :--- | :--- |
| `auto` (padrão) | Usa o runtime conversacional quando o provedor está acessível e o pedido não é uma ação de código; caso contrário, usa o orquestrador. |
| `agent` | Força `ChatAgentRuntime` (conversa, explicação, análise). |
| `orchestrator` | Mantém o grafo clássico, com aprovações e criação de projeto. |

O runtime conversacional (`services/coding_agent/chat.py`) carrega as últimas 40
mensagens da sessão, persiste cada turno em `chat_messages`, injeta contexto do projeto
(quando há `project_id`) e faz streaming token a token nos provedores Ollama, OpenAI,
Anthropic e compatíveis. Pedidos acionáveis (criar projeto, editar, rollback, auditoria,
mesa redonda) continuam no orquestrador para preservar as aprovações humanas. Em `auto`,
se o provedor falhar antes do primeiro token (chave inválida, serviço offline), o
endpoint cai silenciosamente para o orquestrador reutilizando a mesma sessão, sem
duplicar mensagens. Com `engine: agent`, a falha é reportada ao cliente em vez de
trocar de motor.

```json
{ "prompt": "Explique a arquitetura do projeto", "session_id": "s-123", "engine": "auto" }
```

Novos endpoints de leitura:

| Método | Rota | Função |
| :--- | :--- | :--- |
| `GET` | `/api/v1/chat/sessions/{id}/messages` | Histórico por mensagem |
| `GET` | `/api/v1/chat/sessions/{id}` | Sessão com tarefas + mensagens |

### 4.8 Adaptador legado: Anthropic e presets

`services/model_runtime/types.py` ganhou `tools`, `tool_choice`, `tool_calls` e
`finish_reason` em `InferenceRequest`/`InferenceResponse`. Em `adapter.py`:

- `generate()` detecta Anthropic e envia `tools` no formato `input_schema`, parseando
  blocos `tool_use` de volta para o formato OpenAI;
- `generate()` de provedores OpenAI-compatíveis lê `message.tool_calls` e
  `finish_reason`;
- `generate_stream()` tem branch SSE nativo para Anthropic (`content_block_delta`) e
  aplica DLP (`cyber_shield`) também no streaming;
- `gemini-3.5-flash` → `gemini-2.5-flash` nos presets e no default do adaptador.

### 4.9 Cliente MCP (Model Context Protocol)

Implementação própria, sem dependências novas:

```
services/mcp/
├── client.py    # stdio, JSON-RPC 2.0, initialize, tools/list, tools/call
├── service.py   # leitura da configuração, descoberta e registro no executor
└── types.py     # McpServerConfig, McpToolInfo, McpToolOutcome
```

Configuração opcional em `data/mcp_servers.json`:

```json
{
  "servers": [
    {
      "id": "filesystem",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "enabled": true,
      "risk": "exec",
      "requires_approval": true,
      "timeout_seconds": 60
    }
  ]
}
```

Campos: `id`, `command`, `args`, `env`, `cwd`, `enabled`, `risk` (`read`/`write`/`exec`),
`requires_approval` e `timeout_seconds`. Sem o arquivo, nada é iniciado.

As ferramentas descobertas são registradas como `mcp__<servidor>__<ferramenta>`, com
preview genérico `MCP_CALL` e execução via handler externo. Ações com
`requires_approval=true` passam pelo mesmo broker das ferramentas nativas.

| Método | Rota | Função |
| :--- | :--- | :--- |
| `GET` | `/api/v1/mcp/status` | Servidores, estado e ferramentas |
| `POST` | `/api/v1/mcp/reload` | Reinicia descoberta e registra no executor |

No dashboard, o botão **Recarregar MCP** em *Ferramentas disponíveis* dispara o reload e
actualiza o catálogo.

### 4.10 Router real e code splitting

`apps/dashboard/src/router.ts` implementa navegação com History API:

- URLs profundas (`/chat`, `/coding`, `/agents`, `/models`, `/approvals`...);
- botões voltar/avançar via `popstate`;
- compatibilidade com o formato legado `?tab=...`;
- normalização da URL inicial com `replaceState`.

Cada tela usa `React.lazy()` + `Suspense`, com o ChatMaster carregado apenas quando a
aba de chat é visitada. Resultado do build:

| Métrica | Antes | Agora |
| :--- | ---: | ---: |
| Bundle principal | ~691 kB | **326.74 kB** |
| Chunks por tela | 1 | 44 |
| Aviso de chunk > 500 kB | sim | não |

### 4.11 `git_commit` com aprovação

Ferramenta de risco `exec` com `requires_approval=true` no modo `ask`:

- mensagem sanitizada (sem quebras de linha, aspas, `$`, `%`, `!`, backticks) e limitada
  a 300 caracteres;
- caminhos validados pela allowlist do projeto;
- `git add -A` com exclusão explícita de `*.bak` via pathspec;
- preview `GIT_COMMIT` mostra a mensagem e os recursos afetados;
- commit não é reversível, por isso nunca é automático fora do modo `auto`.

---

## 5. Segurança e limites

- Toda resolução de caminho passa por `PermissionEngine.validate_path_access()`;
  caminhos absolutos e `..` são bloqueados, inclusive em `write_file`.
- Comandos destrutivos conhecidos (`rm -rf /`, `mkfs`, `format`, `dd if=`,
  `diskpart`, `reg delete`, `curl | sh`, `Invoke-Expression`, etc.) são bloqueados
  antes da aprovação.
- O shell roda com ambiente sanitizado (remove `*KEY*`, `*TOKEN*`, `*SECRET*`,
  `*PASSWORD*`) e saída redigida por `redact_string`.
- Agentes não podem autoaprovar: `ApprovalEngine` rejeita `decided_by` igual a um papel
  de agente, prefixo `agent_` ou string vazia.
- Timeout de aprovação (padrão 15 min) rejeita automaticamente a operação.
- Desconexão do cliente cancela o ticket pendente (`cancel_ticket`).
- Kill Switch global ou por `task_id` interrompe o loop entre iterações.
- Servidores MCP só são iniciados a partir de configuração explícita local; ferramentas
  externas seguem a política de `risk`/`requires_approval` e passam pelo broker quando
  exigem aprovação.
- Nenhum agente pode autoaprovar `git_commit`, `MCP_CALL` ou qualquer ferramenta externa.
- Limites: `max_iterations` (padrão 12), timeout global (padrão 180 s), leitura máxima
  de 400 kB/800 linhas, saída de ferramenta truncada para o modelo em 30 k caracteres.
- **Ainda não há sandbox de SO** (container/VM): o confinamento é de caminho e de
  política, não de kernel. Executar apenas projetos confiáveis.

---

## 6. Roadmap recomendado

### P0 — concluído

- [x] Runtime de tool-calling com providers OpenAI/Anthropic/Ollama.
- [x] Ferramentas de leitura, escrita, busca, Git e shell.
- [x] Aprovação humana assíncrona e integração com o Approval Center.
- [x] Histórico persistido por mensagem.
- [x] API SSE e tela no dashboard.
- [x] Testes de segurança e loop.

### P1 — concluído

- [x] Unificar o chat clássico ao novo runtime (motor `auto`/`agent`/`orchestrator`).
- [x] Corrigir streaming/tool calling Anthropic e presets de modelo no adaptador legado.
- [x] Cliente MCP (descoberta e execução de ferramentas externas).
- [x] Code splitting no frontend (`React.lazy`) e router real (History API).
- [x] Ferramenta `git_commit` com aprovação e mensagem sanitizada.

### P1 — restante

- [ ] Substituir respostas heurísticas simuladas por fallback honesto.
- [ ] Indexação semântica automática do repositório.
- [ ] Checkpoint de tool calls em voo para retomada após reinício.

### P2 — evolução de produto

- [ ] Terminal PTY interativo no desktop.
- [ ] Editor Monaco embutido com diffs aplicáveis.
- [ ] Subagentes paralelos (explorer, reviewer, tester).
- [ ] Sandbox de SO (container/namespace) para execução não confiável.
- [ ] Custo/tokens por sessão e orçamento por execução.
- [ ] Mesa redonda executável com consenso estruturado.

---

## 7. Como validar

```powershell
# Backend (inclui os testes do Coding Agent, chat e MCP)
.venv\Scripts\python.exe -m pytest tests\unit\test_coding_agent.py -q
.venv\Scripts\python.exe -m pytest tests\unit\test_chat_runtime.py -q
.venv\Scripts\python.exe -m pytest tests\integration\test_coding_api.py -q
.venv\Scripts\python.exe -m pytest tests\integration\test_mcp_client.py -q
.venv\Scripts\python.exe -m pytest -q

# Frontend
cd apps\dashboard
npm run build

# Uso via API
curl -X POST http://127.0.0.1:8000/api/v1/coding/run/stream ^
  -H "Content-Type: application/json" ^
  -d "{\"prompt\":\"Leia o README e resuma a arquitetura\",\"project_id\":\"meu-projeto\",\"mode\":\"ask\"}"

# Chat unificado (motor conversacional)
curl -X POST http://127.0.0.1:8000/api/v1/chat ^
  -H "Content-Type: application/json" ^
  -d "{\"prompt\":\"Explique a arquitetura\",\"session_id\":\"s-1\",\"engine\":\"auto\"}"

# MCP (sem data/mcp_servers.json retorna zero servidores)
curl http://127.0.0.1:8000/api/v1/mcp/status
curl -X POST http://127.0.0.1:8000/api/v1/mcp/reload
```

Na interface: menu **Coding Agent** ou `Ctrl+K` → “Coding Agent”.

---

## 8. Critérios de aceite atendidos

| Critério | Evidência |
| :--- | :--- |
| Agente executa ferramentas reais em loop | `runtime.py` + testes `test_auto_mode_writes_file_and_persists_history` |
| Escrita exige aprovação humana no modo `ask` | teste `test_ask_mode_waits_for_approval_then_executes` |
| Rejeição impede a escrita | teste `test_ask_mode_rejection_prevents_write` |
| Modo `plan` não escreve | teste `test_plan_mode_blocks_write_tools` |
| Path traversal bloqueado | teste `test_blocks_path_traversal_and_absolute_paths` |
| Comandos destrutivos bloqueados | teste `test_blocks_dangerous_shell_commands` |
| Agente não autoaprova | teste `test_agent_cannot_self_approve` |
| Timeout de aprovação rejeita | teste `test_timeout_rejects_request` |
| Histórico persistido por mensagem | teste do runtime + `list_chat_messages` |
| Chat envia histórico ao modelo | `test_chat_streams_and_persists_history` |
| Fallback de streaming sem suporte nativo | `test_chat_uses_fallback_streaming_when_provider_lacks_stream` |
| `git_commit` exige aprovação e ignora `.bak` | `test_git_commit_requires_approval_and_excludes_backups` |
| Cliente MCP descobre e executa ferramenta | `test_mcp_discovery_registers_tool_and_executes_it` |
| MCP sem configuração é no-op | `test_mcp_without_config_is_noop` |
| Build do dashboard íntegro e dividido | `npm run build` (326.74 kB, 44 chunks, sem aviso >500 kB) |
| API do agente íntegra | testes `test_coding_tools_endpoint_lists_modes_and_tools` e `test_coding_session_history_roundtrip` |
| Aprovação via API retoma o runtime | testes `test_coding_approval_requires_human_decision` e `test_coding_approval_forbids_agent_self_approval` |
| Suíte completa sem regressões | `143 passed` |
