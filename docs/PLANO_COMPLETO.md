# PLANO COMPLETO — JARVIS AI HUB

> **Versão:** 1.1
> **Data:** 15/11/2026
> **Estado:** Fase 0 validada localmente; Fase 1 SEC/REL concluída; Fase 2 implementada (E2E no dashboard pendente); CAP-01/02/03/04/05–09/10–13, SIM-02/07, PERF-02/03/04/05–08, QUAL-01/02/03/04/05/06, V0 e GOV-01 implementados; PERF-01 cumprido no benchmark (mediana 564 tokens; p95 75,3 s); benchmark completo executado (78/78); eval autenticado executado (78/78, rubrica 1–5 confirmada em 15/11/2026, `mean_review_score` 4,68; Gate 2 fechado); Fase 6, SIM-01/03–06/08 e V1–V6 em aberto
> **Âmbito:** verificar, corrigir, otimizar e evoluir o que já existe, incluindo o programa de voz
> **Documento relacionado:** [VOICE_ASSISTANT.md](./VOICE_ASSISTANT.md)

---

## 0. Como usar este documento

Este é o documento de referência único para o próximo ciclo do projeto. Substitui os planos anteriores.

- As **Fases 0 a 7** cobrem a plataforma em geral.
- A **Fase 8** é o programa de voz, detalhado em [VOICE_ASSISTANT.md](./VOICE_ASSISTANT.md).
- Cada tarefa tem um **ID**, um **esforço estimado** e um **critério de aceite**.
- Nenhuma fase avança sem o **gate** da anterior.
- **Nenhum commit ou push** deve ser feito sem autorização explícita.

**Legenda:** ✅ Recomendado · 🟡 Opcional · ⛔ Não fazer agora

---

## 1. Resumo executivo

### 1.1 Objetivo

O projeto já é uma plataforma funcional de agentes com governança. O objetivo deste plano **não é adicionar funcionalidades novas**, mas sim:

1. **Provar** o que funciona.
2. **Fechar** riscos de segurança.
3. **Tornar repetível** o que hoje depende de improviso.
4. **Otimizar** latência, custo e qualidade.
5. **Substituir simulações** por implementações reais, por prioridade de valor.
6. **Entregar** com UX e documentação à altura.

### 1.2 Horizontes

| Horizonte | Foco | Resultado |
|---|---|---|
| **Ciclo 1 — 4 semanas** | Fases 0 a 3 | Plataforma confiável, segura e mais rápida |
| **Ciclo 2 — 5 semanas** | Fases 4 a 6 | Agentes melhores, simulações substituídas, entrega |
| **Contínuo** | Fase 7 | CI, smoke noturno, benchmark e auditoria |
| **Programa paralelo** | Fase 8 | Assistente por voz em segundo plano, desktop e celular |

### 1.3 O que muda para o utilizador

- A busca online passa a respeitar o isolamento de rede e a falhar de forma explícita.
- A geração de BD passa a ter um caminho repetível, testado e inspecionável.
- A execução de scripts fica mais visível, cancelável e auditada.
- Os agentes ficam mais rápidos e mais alinhados com o papel.
- As simulações (voz, busca semântica, scanners) começam a ser substituídas com critério.
- O JARVIS já pode ser invocado por voz no desktop através do daemon local; o Android continua pendente.

---

## 2. Ponto de partida

### 2.1 Estado verificado

- **26/26 agentes** responderam com sucesso no smoke autenticado de 12/11/2026 (HTTP 200, zero falhas; mediana 26,137 s, p95 62,111 s).
- **6 modelos Ollama** instalados, todos em CPU.
- **Suite completa: 416 testes passed em 156,32 s** (12/11/2026); ver `docs/BASELINE_2026-11-12.md`.
- **48 tarefas, 217 mensagens, 8 projetos, 30 memórias, 487 eventos de auditoria.**
- `/health` e dashboard funcionais.
- Backend local em `127.0.0.1:8000`.
- Bug real corrigido: mapeamento de tokens no playground (`prompt_tokens` vs `tokens_prompt`).

### 2.2 As três capacidades verificadas

| Capacidade | Estado real |
|---|---|
| **Busca online** | ✅ Funciona via DuckDuckGo Lite; snippets e leitura de páginas com allowlist (`web_read`); bloqueia quando o isolamento de rede está ativo |
| **Geração de BD** | ✅ Template nativo com SQLite (Python/FastAPI e Node/Express + Prisma) + coding agent; Postgres continua fora do scaffold |
| **Execução de scripts** | ✅ Funciona com aprovação, sandbox de subprocesso e bloqueio de padrões destrutivos |

### 2.3 As duas falhas P0 — corrigidas

1. **`web_search` ignorava o isolamento de rede.** Corrigido: a busca bloqueia antes de abrir o cliente HTTP quando `cyber_shield.network_isolated` está ativo; um teste com fixture confirma zero chamadas externas.
2. **`duckdb_query` aceitava SQL de escrita.** Corrigido: allowlist read-only (`SELECT`/`WITH`/`EXPLAIN`/`DESCRIBE`/`SHOW`), uma única instrução, com `COPY ... TO` e `ATTACH` bloqueados por regressão.

Ambas têm teste automatizado. Nesta revisão não foi identificado nenhum P0 de código em aberto.

### 2.4 Dívida técnica conhecida

- Busca do Knowledge Vault é `LIKE`, não semântica.
- `vector_search` usa embedding toy.
- Voz: STT/TTS locais reais são opcionais (`.[voice]`); falta teste em hardware, follow-up/barge-in e clientes móveis.
- CVE/red team/WCAG/dívida técnica são heurísticas/regex.
- Supervisor proativo simula achados.
- Quality Studio gera Playwright, não executa browser.
- Modelos locais têm qualidade irregular e latência alta em CPU.
- Mobile exige configuração LAN; Android ainda não tem voz nem serviço em primeiro plano.
- Agent Office é visual/gamificado.

### 2.5 Checkpoint e estado do repositório

O trabalho está commitado em `bcd48e8` (“Ajuste 12.11”) e a árvore de trabalho está limpa. O baseline de 12/11/2026 foi registado em `docs/BASELINE_2026-11-12.md`; o backup `data/jarvis.db.preplan.bak` passou `PRAGMA integrity_check`.

---

## 3. Mapa Real / Limitado / Simulado

| Capacidade | Classificação | Observação |
|---|---|---|
| Auth/RBAC/isolamento | ✅ Real | Fail-closed, sessões, permissões, isolamento por conta |
| Chat + streaming + sessões | ✅ Real | SSE, memória, exportação, pesquisa |
| 26 especialistas | ✅ Real | Perfis, ferramentas, memórias, playground |
| ReAct autónomo | ✅ Real | Iteração, ferramentas, aprovação |
| Orquestrador LangGraph | ✅ Real | Intenção, plano, delegação, mesa redonda |
| Workspace + Git + diff + aprovação | ✅ Real | Escrita só após decisão humana |
| Coding agent (~20 ferramentas) | ✅ Real | Sandbox, git, scans, web search |
| Busca online | ✅ Real, com leitura opcional | Snippets + `web_read` com allowlist; bloqueia em isolamento de rede |
| Execução de scripts | ✅ Real, com aprovação | Subprocesso, não VM |
| Geração de BD | ✅ Real, com aprovação | Templates Python/Node com SQLite + coding agent |
| SQL Playground | ✅ Real, read-only | `SELECT`/`WITH` |
| DuckDB analítico | ✅ Real, em memória | Analisa CSV/Parquet/JSON; SQL read-only |
| Scaffolding multi-stack | ✅ Real, com BD opcional | Python/Node com SQLite; Java sem template de BD |
| Data pipeline | ✅ Real, exposto | `/api/v1/data/pipeline` com aprovação; CSV/JSON → SQLite/Parquet |
| Quality Studio | ⚠️ Limitado | Executa pytest/jest; Playwright só gera |
| Design Studio | ⚠️ Heurístico | Paletas reais; WCAG por regex |
| Intelligence | ⚠️ Heurístico | LOC/complexidade reais; dívida simplificada |
| Knowledge Vault | ⚠️ Limitado | PDF/DOCX reais; busca keyword |
| `vector_search` | ❌ Simulado | Embedding toy |
| Voz | ✅ Real opcional | faster-whisper + Piper; requer `.[voice]` e configuração |
| CVE/red team | ⚠️ Heurístico | Base estática pequena + regex |
| Supervisor proativo | ⚠️ Simulado | Achados simulados; aprovação real |
| Learning Center | ⚠️ Estático | Guias + progresso |
| Agent Office | ⚠️ Visual | Gamificação, não execução |
| MCP | ✅ Real, condicionado | stdio JSON-RPC; precisa configuração |
| Webhooks | ✅ Real | Discord/Telegram |
| Backup/restore | ✅ Real | Integridade validada; ensaio de restauro pendente |
| Mobile | ✅ Real, condicionado | Flutter; sem voz nem foreground service |
| Assistente por voz em segundo plano | 🟡 Parcial | Daemon desktop com `hey_jarvis`; Android/iOS pendentes |

---

## 4. Princípios e regras de execução

1. **Baseline antes de mudança.**
2. **Segurança antes de funcionalidade.**
3. **Nenhuma alteração sem teste de regressão.**
4. **Aprovação humana é invariante** — nunca contornar.
5. **Read-only por padrão** em ferramentas de análise.
6. **Fail-closed** em autenticação, permissões e isolamento.
7. **Sem commit/push sem autorização explícita.**
8. **Sem prometer o que não existe** — atualizar `CAPABILITIES.md`.
9. **Uma frente de cada vez** — gates entre fases.
10. **Tudo o que for simulado deve estar marcado como simulado** na UI e na documentação.

---

## 5. Fase 0 — Baseline verificável

**Duração:** 2 dias · **Dependência:** checkpoint das alterações atuais

### Objetivo

Saber exatamente onde estamos, com números e evidência.

### Tarefas

| ID | Tarefa | Esforço |
|---|---|---|
| BASE-01 | ✅ Suite pytest completa | Revalidação final: **416 passed em 156,32 s** após os testes da Fase 3, a fixture de isolamento e a correção do pipeline. | 0,5d |
| BASE-02 | ✅ Ruff, TypeScript e build | Ruff global e `npm run build` (inclui `tsc`): passaram nesta rodada. | 0,5d |
| BASE-03 | ✅ Runner de smoke dos agentes | `scripts/smoke_agents.py` suporta `list`, `run`, `run-all` e `run-rest`; smoke autenticado de 12/11/2026 concluído com 26/26. | 0,5d |
| BASE-04 | ✅ Matriz de capacidades | `docs/CAPABILITIES.md` documenta estado real, limitado e simulado. | 0,5d |
| BASE-05 | 🟡 Baseline por agente | Suite/build registrados; smoke autenticado de 12/11/2026 fechou 26/26 (mediana 26,137 s, p95 62,111 s, 27.228 tokens de prompt); benchmark completo executado (78/78; mediana 27,7 s, p95 75,3 s, 564 tokens medianos de prompt); eval executado em 15/11/2026 (78/78; rubrica humana confirmada, `mean_review_score` 4,68). | 0,5d |
| BASE-06 | ✅ Revisão de auth/RBAC e segredos | Revisão de `tests/security/`, middleware fail-closed e regras RBAC; varredura de 585 arquivos rastreados encontrou apenas padrões em fixtures de teste; `data/auth` não é versionado. | 0,5d |
| BASE-07 | ✅ Backup SQLite | `data/jarvis.db.preplan.bak` preservado; banco atual e backup passaram `PRAGMA integrity_check`. | 0,25d |

**Notas de revalidação (12/11/2026):** foi corrigido um `IndentationError` no ramo SQLite de `apps/api/routers/data_pipeline.py` que impedia a importação de `apps/api/main.py`; foi adicionada uma fixture `autouse` em `tests/conftest.py` que guarda e restaura `AGENT_PROFILES`, eliminando a poluição entre testes. O `ruff format --check .` também ficou verde após formatar os 6 ficheiros pendentes.

### Entregáveis

- Relatório de baseline.
- Lista priorizada P0/P1/P2.
- `scripts/smoke_agents.py`.
- `docs/CAPABILITIES.md`.
- Backup verificado.

### Aceite

- Suite executada sem surpresas.
- Nenhuma falha P0 escondida.
- Baseline numérico guardado.
- Build e typecheck verdes.

---

## 6. Fase 1 — Segurança e confiabilidade P0

**Duração:** 5–7 dias · **Dependência:** Fase 0

### Objetivo

O que já existe não pode falhar nem ser contornado de forma silenciosa.

### 6.1 Segurança

| ID | Tarefa | Detalhe | Esforço |
|---|---|---|
| SEC-01 | ✅ `web_search` respeita isolamento | Bloqueia antes de HTTP quando isolamento está ativo; teste fixture confirma zero chamadas externas. | 0,5–1d |
| SEC-02 | ✅ DuckDB read-only | Allowlist de leitura; `COPY ... TO` e múltiplas instruções bloqueados em regressão. | 0,5–1d |
| SEC-03 | ✅ Padrões destrutivos | Filtros Windows/Unix aplicados antes da execução; cobertura de sandbox e ferramentas passou. | 0,5d |
| SEC-04 | ✅ Auditoria de execução | Comando, projeto, decisão, duração, exit code e saída redigida persistidos no evento de auditoria. | 1d |
| SEC-05 | ✅ Ciclo de aprovação | Cobertura para uso único, escopo/diff, expiração, rollback e isolamento do aprovador. | 1–1,5d |
| SEC-06 | ✅ Isolamento entre contas | Testes de segurança e API cobrem leitura, alteração e propriedade de dados privados. | 1d |

### 6.2 Confiabilidade

| ID | Tarefa | Detalhe | Esforço |
|---|---|---|
| REL-01 | ✅ Contratos de resposta | Playground mantém aliases `tokens_prompt`/`tokens_completion` e expõe também `prompt_tokens`/`completion_tokens`; tarefas retornam contrato estruturado. | 1d |
| REL-02 | ✅ Paridade playground/stream/task | Rotas usam perfil e rota da conta; playground aceita limite de tokens configurável, limites e erros preservam códigos coerentes. | 1d |
| REL-03 | ✅ Confiabilidade SSE | Testes cobrem primeiro token, cancelamento, timeout, falha do provedor e liberação do lock para nova chamada. | 1d |
| REL-04 | ✅ Erros padronizados | Chat, playground, tarefa e SSE distinguem `provider_unavailable`, `timeout`, `policy_denied` e `internal`. | 1d |

### Aceite

- Com isolamento ativo: **0 chamadas HTTP** de busca.
- `duckdb_query`: **0 escritas** possíveis.
- **100%** dos comandos auditados.
- **0 bypass** de aprovação.
- **0 falha** de isolamento entre contas.
- Endpoints críticos com teste de regressão.

---

## 7. Fase 2 — Fluxos repetíveis: busca, BD e scripts

**Duração:** 6–8 dias · **Dependência:** Fase 1

### 7.1 Geração de BD — recomendação

**Caminho recomendado (✅ Opção A): template de scaffolding com BD.**

| Stack | Primeira entrega | Adiar |
|---|---|---|
| Python/FastAPI | `sqlite3` da stdlib + `schema.sql` + `init_db.py` + `seed.py` + teste | SQLAlchemy/Alembic na primeira fase |
| Node/Next | Prisma + SQLite **ou** `node:sqlite` | ORM pesado e migrações automáticas |
| Java/Spring | H2 em dev + perfil Postgres | Configuração de produção completa |

**Regras:**

- Parâmetro `database: none | sqlite`; default `none`. `postgres` continua planeado e fora do scaffold.
- O template gera schema, script de inicialização, `.env.example` e teste que cria e consulta uma tabela.
- O coding agent continua disponível para schemas personalizados.
- O Backend Studio inspeciona o `.db` gerado em modo read-only.

**Opção B (✅ implementada):** `DataPipelineRunner` exposto em `/api/v1/data/pipeline` para importar CSV/JSON e materializar SQLite/Parquet, com aprovação vinculada, limite de 10 MB/100 000 registos e rejeição de path traversal.

**Opção C (⛔ sozinha):** depender só do agente. Funciona, mas não é repetível nem testável.

| ID | Tarefa | Esforço |
|---|---|---|
| CAP-01 | ✅ Template Python com SQLite stdlib + schema + seed + teste | Concluído: opção explícita, preview de aprovação vinculado e testes gerados |
| CAP-02 | ✅ Template Node com Prisma/SQLite | Concluído: Express + Prisma, schema, seed, `db:setup` e teste em `tests/unit/test_project_workspace.py` |
| CAP-03 | ✅ Rota `/api/v1/data/pipeline` | Concluído: CSV/JSON → SQLite/Parquet com aprovação e testes de isolamento/path traversal |
| CAP-04 | ✅ Teste de inspeção do BD gerado no Backend Studio | Concluído: descoberta, inspeção e query read-only cobertas |

O parâmetro `database` aceita `none` ou `sqlite`; Postgres continua deliberadamente fora do scaffold. O template Node usa Prisma com SQLite, e o Python usa `sqlite3` da stdlib.

### 7.2 Busca online — de “funciona” para “confiável”

| ID | Tarefa | Esforço |
|---|---|---|
| CAP-05 | ✅ Cache curto (10–15 min) por query normalizada | Concluído: cache de 12 min |
| CAP-06 | ✅ Resultado com fonte e timestamp; indicador no chat | Concluído: fontes e data expostas no stream/chat |
| CAP-07 | ✅ Falha explícita “busca indisponível” | Concluído: erro próprio e sem instruir o modelo a inventar resultados |
| CAP-08 | ✅ Testes de parsing com fixtures locais | Concluído: parsing, cache e indisponibilidade cobertos |
| CAP-09 | ✅ Leitura de páginas completas: `web_read` nos dois gateways, allowlist, SSRF/redirect revalidado, isolamento, timeout 8 s, limite 512 KB e aviso de conteúdo não confiável. | Implementado |

### 7.3 Execução de scripts — UX e controlo

| ID | Tarefa | Esforço |
|---|---|---|
| CAP-10 | ✅ Aprovação mostra comando, cwd, timeout e risco | Concluído: preview vinculativo do comando com metadados de execução |
| CAP-11 | ✅ Botão cancelar ligado ao kill switch/task cancel | Concluído: cancelamento do stream termina o subprocesso; Kill Switch por tarefa continua disponível |
| CAP-12 | ✅ Dry-run: mostrar comando sem executar | Concluído: aprovação apresenta o comando como preview e nada corre antes da decisão |
| CAP-13 | ✅ Log descarregável + limite de saída + redação visível | Concluído: exportação Markdown, saída limitada e redação na sandbox |

### Aceite

- Projeto com SQLite criado num pedido + aprovação, e o teste do projeto passa.
- Busca com cache, fonte visível e erro explícito.
- Execução cancelável, auditada e com log.
- Os três fluxos demonstráveis no dashboard.

---

## 8. Fase 3 — Performance e custo

**Duração:** 5–6 dias · **Dependência:** Fase 2

### Objetivo

Reduzir latência e uso de CPU sem perder qualidade.

| ID | Tarefa | Detalhe | Esforço |
|---|---|---|
| PERF-01 | ✅ Reduzir prompts | Conversa e cumprimentos usam prompt leve sem memórias, código, skills ou histórico; contexto de projeto só entra em intents de projeto. Teste garante menos de 2.400 caracteres no perfil mestre (1.779 caracteres, ~445 tokens estimados). O smoke do playground mede ~1.047 tokens de prompt em média; no caminho autónomo, o benchmark completo mediu mediana de **564** tokens por caso (p95 601), dentro da meta de 400–800. | Cumprido no benchmark |
| PERF-02 | ✅ Limitar geração | Playground fixo em 256; tarefas com default e máximo 1.024; stop sequences limitadas a quatro e encaminhadas aos adaptadores Ollama, OpenAI-compatíveis e Anthropic. | Implementado |
| PERF-03 | ✅ Afinar Ollama | `keep_alive` e `num_ctx` 2k–8k configuráveis por ambiente; warm-up em background no arranque e endpoint admin `POST /api/v1/models/warm-up`; `OLLAMA_NUM_PARALLEL=1` documentado como configuração do serviço Ollama. | Implementado |
| PERF-04 | ✅ Agrupar por modelo | Afinidade pelo modelo local recém-carregado (janela configurável) no roteamento automático e `ModelManager.generate_grouped` para lotes independentes; os fluxos de debate continuam sequenciais por dependerem de pareceres anteriores. | Implementado |
| PERF-05 | ✅ Roteamento por capacidade | Seleção determinística entre modelos disponíveis com preferência por código, raciocínio e escrita; validada com inventário sintético. Os modelos-alvo são preferências, não garantias de disponibilidade. | Implementado |
| PERF-06 | ✅ Cache de inferência | Cache local com chave por proprietário/modelo/contexto, somente temperatura 0, sem ferramentas, dados sensíveis ou provedor externo; prompts não são persistidos em texto claro e entradas expiram em 24 h. | Implementado |
| PERF-07 | ✅ SQLite | WAL + índices em `chat_messages(session_id)`, `knowledge_vault`, `tasks` já inicializados | Implementado |
| PERF-08 | ✅ Benchmark | `scripts/bench_agents.py` com 3 prompts fixos por agente; TTFT, tokens/s, total e p95. O runtime ReAct acumula tokens de prompt/completion por execução, incluindo reparações. Benchmark completo executado em 12/11/2026: **78/78 sucessos**, mediana **27,7 s**, p95 **75,3 s**, TTFT mediano **27,7 s**, **44.246** tokens de prompt e **4.635** de completion; o subconjunto `checks` foi repetido com prompt conciso e combinado. | Implementado; execução exige API e token |

### Metas

- **−30%** tokens de prompt.
- **−25%** latência mediana.
- **p95 < 90 s** no playground para respostas curtas em CPU.
- **0 timeouts** em prompts de 20 palavras.

### Evidência de 12/11/2026

- Smoke autenticado dos 26 especialistas em backend isolado (`:8010`, dados temporários): **26/26 sucessos**, HTTP 200, zero timeouts.
- Latência: mediana **26,137 s**, p95 **62,111 s**, máxima **79,586 s**.
- Tokens: **27.228** de prompt e **5.620** de completion; média de ~**1.047** tokens de prompt, acima da meta de 400–800.
- Warm-up do mesmo modelo no `jarvis_master` (1.343 tokens de prompt, 256 de completion): **94,378 s → 38,699 s**.
- Benchmark completo (`--all`, 78 casos, backend isolado): **78/78 sucessos**, mediana **27,7 s**, p95 **75,3 s**, máxima **109,7 s**, TTFT mediano **27,7 s**; **44.246** tokens de prompt e **4.635** de completion.
- Por prompt: `explain` 26/26 (mediana 56,8 s), `checks` 26/26 (42,2 s; subconjunto conciso 38,5 s) e `structured` 26/26 (4,6 s). Zero timeouts.
- Comparação com a execução anterior: mediana **60,7 → 27,7 s** (−54,4%), p95 **122,5 → 75,3 s** (−38,5%) e mediana de tokens de prompt **1.822 → 564** (−69,0%).
- **Conclusão:** as metas de −30% tokens, −25% latência mediana, p95 < 90 s e zero timeouts ficam cumpridas. Os 6 blocos `structured` em markdown e os 4 falsos truncamentos já foram tratados na validação determinística e no benchmark; restam as correções de prompt/modelo do QUAL-03/04.

### Nota realista

Ollama em CPU continua a ser o teto. A medição local do prompt conversacional do JARVIS Maestro ficou em 1.779 caracteres (~445 tokens por estimativa de 4 caracteres/token). O smoke de 12/11/2026 ficou em ~1.047 tokens de prompt por pedido; o benchmark completo ficou em **564** tokens medianos e **75,3 s** de p95, dentro das metas. Os modelos 7B continuam a produzir os casos mais lentos (máximo 109,7 s), pelo que GPU ou modelos menores ainda são a via para reduzir o máximo, não o p95 global.

---

## 9. Fase 4 — Qualidade dos 26 especialistas

**Duração:** 6–8 dias · **Dependência:** Fase 3

### Objetivo

Resolver respostas fora do tema e definir o modelo certo por agente.

| ID | Tarefa | Detalhe | Esforço |
|---|---|---|
| QUAL-01 | ✅ Harness de avaliação | scripts/eval_agents.py executa cenários autenticados via SSE, captura resumo/ferramentas e exporta rubrica 1–5 editável; aceita papel individual ou todos e retomada. | Implementado |
| QUAL-02 | ✅ Casos de teste | Três casos reproduzíveis por perfil: aplicação da missão, resposta estruturada e pedido fora do escopo. Avaliação humana ainda necessária para pontuar qualidade. | Implementado |
| QUAL-03 | ✅ Corrigir prompts | Contrato de resposta obrigatório no `base_agent.py` (≤300 palavras, sem JSON não pedido, chaves exatas quando pedido, ferramentas em vez de descrição, factos/inferências/lacunas, proibição de descrever projetos hipotéticos sem dados e protocolo de emergência para pedidos de saúde) e modo `ASK` explícito. Coberto por testes de perfil e runtime. | Implementado |
| QUAL-04 | ✅ Modelo predefinido por agente | `llama3.2:3b` (mestre), `qwen2.5:7b` (raciocínio) e `qwen2.5-coder:7b` (código); os 26 perfis usam modelos concretos por papel e as seeds acompanham o catálogo. A rota da conta (ex.: Groq) mantém precedência quando configurada. | Implementado |
| QUAL-05 | ✅ Validação de output | Limites de schema e comprimento no `AgentOutputContract`; reparação determinística única em `services/orchestration/output_validation.py`; uma tentativa de reparação via modelo no runtime autónomo; falhas do provedor terminam com `is_completed=False` e bloqueios explícitos. | Implementado |
| QUAL-06 | ✅ Aplicar ao ReAct | `scripts/eval_react_tools.py`: 10 casos de código com projeto real, ferramentas, aprovações e gate de segurança; `--only`, `--keep-project`, `--min-success-rate` e retry registado em `rerun_reason`. Evidência live: **10/10**, segurança OK, 2 aprovações, mediana 68,8 s, p95 80,5 s, máximo 87,0 s. | Implementado |

**Estado:** QUAL-03, QUAL-04, QUAL-05 e QUAL-06 estão implementados e cobertos por testes. O contrato de resposta dos especialistas ficou explícito (≤300 palavras, sem JSON não pedido, chaves exatas quando pedido, distinção entre factos, inferências e lacunas, proibição de descrever projetos hipotéticos sem dados e protocolo de emergência para pedidos de saúde) e o modo `ASK` passou a pedir a ferramenta diretamente, com a aprovação a ser apresentada pelo sistema. O runtime recupera chamadas de ferramenta devolvidas como texto (JSON ou literal Python), bloqueia chamadas repetidas e força uma resposta narrativa final. O harness ReAct `scripts/eval_react_tools.py` fechou **10/10** casos de código com o gate de segurança OK no `:8010` (mediana **68,8 s**, p95 **80,5 s**, máximo **87,0 s**, 2 aprovações e zero reruns); a evidência está em `data/eval_react_tools.json`. O eval de 78 casos com Groq está em `data/eval_agents_groq_qual.json`: **78/78**, zero vazias/truncadas, `structured_output` **26/26** com chaves e tipos exatos (24/26 reconhecem a ausência de dados; `qa_engineer` ainda inventa e `software_architect` é genérico) e `out_of_scope` **26/26** com recusa, dos quais **23/26** orientam emergência. A rubrica 1–5 foi confirmada pelo utilizador em 15/11/2026 e aplicada ao JSON oficial (`data/rubrica_proposta.md` mantém a proposta): **26/26** agentes com média de relevância ≥4 (100%), 22/26 com mínimo de 4 em todos os casos e `mean_review_score` **4,68** (390 notas). Os desvios residuais são de formato (25/26 respostas narrativas acima de 300 palavras), `qa_engineer`/`software_architect` no `structured_output` e três casos de `out_of_scope` sem encaminhamento de emergência.

### Metas

- **≥ 4/5** de relevância em **≥ 80%** dos agentes.
- **0** respostas vazias ou truncadas em prompts padrão.
- **≥ 90%** de sucesso em tarefas de código com ferramentas.

---

## 10. Fase 5 — Substituir simulações

**Duração:** 3–4 semanas · **Dependência:** Fases 3 e 4

**Ordem recomendada por valor:**

| ID | Item | O que fazer | Esforço |
|---|---|---|
| SIM-01 | Busca semântica no Knowledge Vault | Embeddings locais + `sqlite-vec`/FAISS; keyword como fallback | 3–4d |
| SIM-02 | ✅ Voz real | `faster-whisper` + Piper opcionais, VAD e `VoiceEngine`; falta ensaio em hardware e no mobile | 3–4d |
| SIM-03 | Segurança menos heurística | `pip-audit`/`npm audit` + snapshot OSV offline; Semgrep; regex como pré-filtro | 4–5d |
| SIM-04 | `vector_search` real | Trocar embedding toy por modelo local | 1–2d |
| SIM-05 | Supervisor proativo real | Substituir achados simulados por dependências, lint, testes e segredos | 2–3d |
| SIM-06 | Quality Studio real | Executar Playwright, não só gerar o teste | 2–3d |
| SIM-07 | ✅ Leitura de páginas web | Allowlist, SSRF, timeout e limite reutilizados por `web_read`. | 2–3d |
| SIM-08 | 🟡 Execução em contentor/VM | Isolamento mais forte que subprocesso | 1 semana+ |

### Aceite por item

- Teste de integração.
- Evidência no dashboard.
- `CAPABILITIES.md` atualizado.
- Fallback funcional quando aplicável.

### Regra

Nenhuma simulação é substituída “de uma vez”. Cada item entra por trás de interface, com fallback e teste.

---

## 11. Fase 6 — UX, entrega e operação

**Duração:** 4–5 dias · **Dependência:** Fase 2 (pode correr em paralelo com 4 e 5)

| ID | Tarefa | Estado | Esforço |
|---|---|---|---|
| UX-01 | Estados de erro/loading/empty em todas as telas | 🟡 Parcial: várias telas têm erro e retry; cobertura não auditada | 1d |
| UX-02 | Distinguir “provedor offline” de “erro interno” | ✅ Chat distingue `provider_unavailable`, `timeout`, `policy_denied` e `internal` | 0,5d |
| UX-03 | Cancelamento real de streams + retry | 🟡 Parcial: `AbortController` no chat e no coding agent; retry genérico pendente | 1d |
| UX-04 | Virtualizar listas longas (histórico, logs, telemetria) | ⬜ Em aberto | 0,5d |
| UX-05 | E2E dos 5 fluxos principais | ⬜ Em aberto; não há suite Playwright/E2E | 1,5d |
| UX-06 | Testar instalador numa máquina limpa | ⬜ Em aberto | 1d |
| UX-07 | Documento de demo com dados de exemplo | ⬜ Em aberto | 0,5d |
| OPS-01 | Ensaio de backup/restore + webhooks | 🟡 Integridade SQLite validada; restauro e webhooks não ensaiados | 1d |
| DOC-01 | Guia de configuração LAN do mobile | ⬜ Em aberto | 0,5d |

### Os 5 fluxos E2E

1. Login → chat.
2. Chat → busca → resposta com fonte.
3. Criar projeto → gerar BD → inspecionar no Backend Studio.
4. Coding → executar script → aprovar → ver log.
5. Aprovar/rejeitar escrita → verificar diff e auditoria.

### Aceite

- 5/5 fluxos verdes.
- Instalador validado.
- Backup restaurado com integridade.
- Demo reproduzível.

---

## 12. Fase 7 — Governança contínua

**Duração:** contínuo · **Dependência:** Fase 0

| ID | Tarefa | Cadência |
|---|---|---|
| GOV-01 | ✅ CI: pytest + Ruff + `tsc` + build | Cada PR; full Ruff lint/format gates added |
| GOV-02 | Smoke dos 26 agentes | Noturno |
| GOV-03 | Benchmark de performance | Semanal |
| GOV-04 | Avaliação de qualidade dos agentes | Mensal |
| GOV-05 | Revisão de segurança de novas ferramentas | Cada ferramenta nova |
| GOV-06 | Atualizar `CAPABILITIES.md` | Cada release |
| GOV-07 | Amostragem de aprovações e auditoria | Semanal |
| GOV-08 | Ensaio de backup/restore | Mensal |
| GOV-09 | Atualização de dependências | Mensal |

**Estado em 15/11/2026:** GOV-01 ativo; GOV-02 executado uma vez em 12/11/2026 (26/26); `bench_agents.py` e `eval_agents.py` foram executados em 12–15/11/2026 (78/78 em ambos), com rubrica 1–5 confirmada em 15/11/2026 (26/26 agentes com média de relevância ≥4; `mean_review_score` 4,68); GOV-06 foi aplicado nesta revisão; GOV-05/07/08/09 sem evidência nesta ronda.

### Aceite

- CI bloqueia merge com falha.
- Nenhum agente fica sem smoke por mais de 24 h.
- Documentação nunca fica atrás do código.

---

## 13. Fase 8 — Assistente por voz em segundo plano

**Duração:** 4–6 semanas · **Dependência:** Fases 1 e 2 · **Detalhe:** [VOICE_ASSISTANT.md](./VOICE_ASSISTANT.md)

### Resumo

Adicionar ao JARVIS a capacidade de:

- correr em segundo plano no Windows (bandeja, autostart);
- ouvir a palavra de ativação “Jarvis” localmente;
- gravar a pergunta, transcrever, executar e responder por voz;
- repetir o mesmo no Android com serviço em primeiro plano;
- executar comandos de assistente pessoal (timers, lembretes, clima, abrir apps, etc.);
- manter aprovação humana para ações sensíveis.

### Subfases

| Subfase | Foco | Esforço | Estado |
|---|---|---|---|
| V0 | STT/TTS reais + VAD + endpoint de comando | 3–4d | ✅ Implementado, adapters opcionais e cobertos por fixtures |
| V1 | Wake word + daemon + bandeja + autostart | 3–4d | 🟡 Parcial: daemon, bandeja, mute, instância única e `hey_jarvis`; faltam hardware, atalho global, autostart, follow-up/barge-in e notificações |
| V2 | Conversa por voz, follow-up, barge-in, TTS por frase | 3–4d | ⬜ Em aberto |
| V3 | Intent router + 10 comandos de assistente pessoal | 1–2 semanas | ⬜ Em aberto |
| V4 | Android com foreground service | 1–2 semanas | ⬜ Em aberto |
| V5 | iOS (push-to-talk/Siri) — opcional | 1 semana | ⬜ Em aberto |
| V6 | Hardening de privacidade e auditoria | contínuo | 🟡 Parcial; teste do daemon e hardware ainda necessários |

**Limite atual da wake word:** o modelo openWakeWord usado é `hey_jarvis`, treinado para “Hey Jarvis”. Dizer apenas “Jarvis” pode funcionar, mas com mais falhas; validar ou treinar um modelo dedicado faz parte do V1.

### Gate

- Desktop: dizer “Jarvis” com o dashboard fechado e receber resposta falada.
- Android: telefone no bolso, “Jarvis”, resposta pelo alto-falante.
- Segurança: 0 áudio enviado antes da wake word; 100% auditado; 0 aprovação sensível só por voz.

---

## 14. Cronograma completo

### Ciclo 1 — Confiança e velocidade

| Semana | Foco | Entregável |
|---|---|---|
| 1 | Fase 0 + SEC-01/02/03 | Baseline, contratos, duas falhas P0 corrigidas |
| 2 | SEC-04/05/06 + REL-01..04 | Auditoria, aprovações, isolamento, erros padronizados |
| 3 | Fase 2 (CAP-01, 04, 05, 06, 07, 08, 10, 11) | BD por template, busca confiável, execução controlada |
| 4 | Fase 3 (PERF-01..08) | Prompts menores, latência reduzida, benchmark |

**Gate 1:** 0 P0 aberto, suite verde, três fluxos demonstráveis.

### Ciclo 2 — Qualidade e diferenciação

| Semana | Foco | Entregável |
|---|---|---|
| 5 | QUAL-01/02 | Harness de avaliação + casos |
| 6 | QUAL-03/04/05/06 | Prompts corrigidos, modelo por agente, validação |
| 7 | SIM-01 | Busca semântica no Knowledge Vault |
| 8 | SIM-02 + UX-01/02/03 | Voz real + estados e cancelamento |
| 9 | SIM-03/04 + UX-04/05/06 + OPS/DOC | Segurança mais profunda, vector real, E2E, entrega |

**Gate 2:** metas de qualidade atingidas, release candidate demonstrável.

### Programa de voz

| Semana | Foco | Entregável |
|---|---|---|
| 10 | V0 | STT/TTS reais, VAD, `/voice/command` |
| 11 | V1 | Wake word, daemon, bandeja, autostart |
| 12 | V2 | Conversa por voz, follow-up, barge-in |
| 13–14 | V3 | 10 comandos de assistente pessoal |
| 15–16 | V4 | Android com foreground service |

**Gate 3:** assistente de voz demonstrável no desktop e no Android.

### Contínuo

- SIM-05/06/07/08 conforme valor.
- Fase 7 desde a semana 1.
- V5/V6 conforme prioridade.

### Estado em 15/11/2026

- **Ciclo 1:** semanas 1–3 implementadas; semana 4 implementada em código (PERF-01/02/03/04/05–08); o smoke autenticado de 12/11/2026 mediu latência, tokens e p95 (26/26; mediana 26,137 s; p95 62,111 s); o benchmark completo fechou **78/78** (mediana 27,7 s; p95 75,3 s; mediana 564 tokens de prompt), dentro das metas de p95 e tokens; a comparação antes/depois mostra −54,4% na mediana e −69,0% nos tokens medianos.
- **Ciclo 2:** QUAL-01/02/03/04/05/06 concluídos; SIM-01/03–06/08 e Fase 6 em aberto. Gate 2 fechado em 15/11/2026 com a rubrica 1–5 confirmada (`mean_review_score` 4,68).
- **Voz:** V0 concluído; V1 parcial; V2–V6 em aberto.
- **Governança:** GOV-01 ativo; GOV-02 executado uma vez (26/26); benchmark e eval autenticados executados (78/78 em ambos); rubrica humana confirmada em 15/11/2026.

---

## 15. Matriz de verificação por capacidade

| Capacidade | Como verificar | Critério de aceite |
|---|---|---|
| Auth/RBAC/isolamento | Matriz de testes + tentativa cruzada entre contas | 0 acessos indevidos |
| 26 agentes (playground) | Smoke com prompt curto | 26/26 em ≤ 2 tentativas |
| Agentes ReAct | Tarefa com ferramenta + aprovação | SSE, ferramenta executada, aprovação registada |
| Chat/memória/sessões | Criar, listar, pesquisar, exportar, apagar | Persistência correta por conta |
| Orquestrador | Criar projeto e alterar código por prompt | Scaffold + diff + aprovação + retoma |
| Workspace/Git | Commit, rollback, export ZIP, preview | Ficheiros corretos; rollback revertido |
| Coding agent | Ler, editar, correr teste, git diff | Sandbox ativo; escrita só após aprovação |
| Busca online | Query real + mock + isolamento | Fonte visível; 0 HTTP com isolamento |
| Geração de BD | Criar projeto com SQLite e correr teste | Tabela criada e consultada; teste verde |
| Data pipeline | Importar CSV/JSON e materializar SQLite/Parquet com aprovação | Ficheiro criado; sem aprovação não executa |
| Execução de scripts | Aprovar, rejeitar, cancelar, timeout | 0 bypass; log e auditoria |
| Studios | SQL, mock, pytest, paleta, WCAG | Respostas reais; erros explícitos |
| Knowledge Vault | Upload PDF/DOCX, indexar, buscar | Texto extraído; busca < 300 ms |
| Skills | Criar, atribuir, desativar | Skill aparece no prompt |
| Modelos/cofre | Listar, rotear, testar chave, download | Chave cifrada; fallback funciona |
| Segurança | Kill switch, auditoria, CVE/red team | Evento auditado; bloqueio efetivo |
| Ops | Logs SSE, telemetria, backup/restore, webhook | Restauro íntegro; notificação entregue |
| Frontend | Build + typecheck + E2E | Build limpo; 5 fluxos passam |
| Voz desktop | Wake word + pergunta + resposta | Parcial: daemon e fluxo implementados; hardware e `hey_jarvis` pendentes |
| Voz Android | Foreground service + áudio | Não implementado (V4) |
| Privacidade de voz | Inspeção de tráfego e retenção | 0 áudio antes da wake word |

---

## 16. Métricas e gates

### KPIs globais

| Área | Métrica | Meta |
|---|---|---|
| Confiabilidade | Sucesso dos agentes | ≥ 98% sem 5xx/timeout |
| Performance | Latência p95 do playground | < 90 s (CPU, resposta curta) |
| Performance | Tokens de prompt | −30% |
| Qualidade | Relevância | ≥ 4/5 em ≥ 80% dos agentes |
| Segurança | Bypass de aprovação | 0 |
| Segurança | Comandos auditados | 100% |
| Segurança | Chamadas de rede com isolamento | 0 |
| Capabilities | Harness | 10/10 |
| Entrega | Fluxos E2E | 5/5 |
| Documentação | `CAPABILITIES.md` | Atualizado a cada release |
| Voz | Latência de comando simples | < 5 s |
| Voz | Falsos positivos de wake word | < 1 por hora |
| Voz | Áudio antes da wake word | 0 |

### Gates

| Gate | Critério |
|---|---|
| **Gate 0** | Baseline aceite, suite executada, backup feito |
| **Gate 1** | 0 P0, 0 bypass, três fluxos demonstráveis |
| **Gate 2** | Metas de performance e qualidade atingidas ou justificadas |
| **Gate 3** | Release candidate com E2E e instalador validados |
| **Gate 4** | Assistente de voz demonstrável no desktop e no Android |

---

## 17. Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Ollama em CPU | Latência alta | Prompts menores, modelos certos, expectativas realistas, GPU opcional |
| Alterar prompts degrada agentes | Regressão | Harness de avaliação **antes** das mudanças; A/B |
| Simulações em serviços centrais | Quebra | Interface + fallback + entrada incremental |
| Alterações não commitadas | Baseline contaminado | Checkpoint autorizado antes da Fase 0 |
| DuckDuckGo limitar pedidos | Busca instável | Cache + erro explícito + fallback |
| Endurecer DuckDB quebrar queries | Perda de funcionalidade | Allowlist testada; reclassificar para `EXEC` se necessário |
| Modelos locais gerarem schemas maus | BD errada | Template reduz dependência do LLM |
| Isolamento de subprocesso | Risco no host | Aprovação, auditoria, container no futuro |
| Suite longa/flaky | Atrito | Markers, CI, timeouts, testes isolados |
| Windows/PowerShell | Comandos não executam | Usar `.venv\Scripts\python.exe`; scripts temporários |
| Crescimento do SQLite | Lentidão | WAL, índices, retenção, backup |
| Scope creep | Atraso | Gates; nada novo antes do P0 |
| Voz sempre ativa | Privacidade | Indicador visível, mute, áudio local, retenção off |
| iOS bloquear background | Expectativa errada | Não prometer; Siri Shortcut/push-to-talk |
| Bateria no Android | Abandono | Wake word leve, foreground service, teste real |

---

## 18. O que não fazer agora

- ⛔ Adicionar funcionalidades novas antes de fechar a Fase 1.
- ⛔ Fazer commit/push sem autorização explícita.
- ⛔ Trocar DuckDuckGo por API paga.
- ⛔ Adicionar Postgres gerido ou migrações multi-stack.
- ⛔ Dar shell sem aprovação, mesmo em modo `auto`.
- ⛔ Prometer isolamento de VM quando é subprocesso.
- ⛔ Substituir todas as simulações de uma vez.
- ⛔ Reescrita do orquestrador ou do runtime sem evidência de necessidade.
- ⛔ Prometer escuta contínua no iOS como a Alexa.

---

## 19. Pré-condições para começar

1. **Autorização para checkpoint** das alterações atuais (commit ou patch).
2. **Backup de `data/jarvis.db`** antes de qualquer migração.
3. **Conta de teste dedicada** para a suite de isolamento.
4. **Backend parável/reiniciável** durante os testes.
5. **Rede disponível** para um teste manual de busca; a suite usa mocks.
6. **Espaço em disco** para modelos, backups e logs.
7. **Confirmação de prioridade:** segurança primeiro, performance depois, simulações no fim.
8. **Decisão sobre o programa de voz:** Windows primeiro ou Android primeiro.

---

## 20. Próximo passo recomendado

**Não há P0 de código conhecido em aberto.** A ordem de maior valor é:

1. **Validação autenticada:** o smoke (`scripts/smoke_agents.py run-all`) foi concluído em 12/11/2026 com 26/26, o benchmark completo com 78/78 e o eval em 15/11/2026 com **78/78** casos, zero falhas, zero timeouts e zero respostas vazias/truncadas. A rubrica 1–5 foi confirmada em 15/11/2026 (`mean_review_score` 4,68; 26/26 agentes ≥4 na média), fechando o Gate 2; restam os desvios residuais de formato (25/26 acima de 300 palavras), `qa_engineer`/`software_architect` no `structured_output` e 3/26 `out_of_scope` sem encaminhamento de emergência.
2. **Medição PERF:** o benchmark completo fechou **78/78**, p95 **75,3 s** e mediana **564** tokens de prompt, dentro das metas. QUAL-03/04 estão implementados; resta decidir se o teto de CPU justifica GPU ou modelos menores.
3. **Pós-Gate 2:** corrigir os desvios residuais de formato/safety e avançar para a Fase 6.
4. **Fase 6:** fechar UX-01/03/04/05, ensaio de restauro/webhooks, instalador e guia LAN.
5. **V1 em hardware:** validar microfone, `hey_jarvis`, Piper e autostart; decidir se se treina um modelo “Jarvis” dedicado.
6. **V2–V4:** follow-up, barge-in, TTS por frase, intent router e Android com foreground service.
7. **SIM-01/03–06/08:** por valor, com fallback e teste; não substituir tudo de uma vez.

**Regra:** cada item só fecha com teste, evidência e `CAPABILITIES.md` atualizado.

---

## Anexo A — Evidências e ficheiros de referência

| Área | Ficheiro |
|---|---|
| Backend | `apps/api/main.py` |
| Routers | `apps/api/routers/*.py` |
| Dependências | `pyproject.toml` |
| Agentes | `agents/profiles/catalog.py` |
| Orquestração | `services/orchestration/graph.py`, `master.py` |
| Coding agent | `services/coding_agent/tools.py`, `runtime.py` |
| Tool gateway | `services/tool_gateway/*.py` |
| Busca | `services/tool_gateway/web_search.py` |
| Sandbox | `services/tool_gateway/sandbox.py`, `services/coding_agent/tools.py` |
| DuckDB | `services/tool_gateway/specialized_tools.py` |
| SQL Playground | `services/backend_studio/sql_playground.py` |
| Scaffolding | `services/project_workspace/scaffolder.py` |
| Data pipeline | `services/data_pipeline/pipeline.py`, `apps/api/routers/data_pipeline.py` |
| Knowledge Vault | `services/knowledge/knowledge_vault.py` |
| Voz | `services/voice_runtime/*.py`, `apps/api/routers/voice.py`, `apps/voice_daemon/main.py` |
| Desktop | `apps/desktop/main_window.py` |
| Mobile | `apps/mobile/lib/main.dart` |
| Dashboard | `apps/dashboard/src/*` |
| Testes | `tests/` |
| Documentação | `docs/` |

---

## Anexo B — Registo de decisões

| Data | Decisão | Estado |
|---|---|---|
| 12/11/2026 | Plano completo substitui planos anteriores | Aceite |
| 12/11/2026 | Segurança P0 antes de novas funcionalidades | Aceite; SEC-01/02 implementados |
| 12/11/2026 | Geração de BD por template + coding agent | Implementado (Python/Node; Postgres fora) |
| 12/11/2026 | Busca online mantém DuckDuckGo Lite | Aceite; cache, fonte e leitura com allowlist |
| 12/11/2026 | Programa de voz separado em `VOICE_ASSISTANT.md` | Aceite |
| 12/11/2026 | Windows primeiro no programa de voz | Aceite; V0 concluído e V1 parcial no desktop |
| 12/11/2026 | Aprovação sensível nunca só por voz | Aceite; `/voice/command` não executa ações sensíveis |
| 12/11/2026 | CAP-02, CAP-03 e SIM-02 concluídos | Implementado |

---

*Fim do documento.*
