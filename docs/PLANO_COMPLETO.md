# PLANO COMPLETO — JARVIS AI HUB

> **Versão:** 1.0  
> **Data:** 12/11/2026  
> **Estado:** proposta de execução (nada neste documento foi implementado por si só)  
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
- O JARVIS passa a poder ser invocado por voz (“Jarvis”) no desktop e, depois, no Android.

---

## 2. Ponto de partida

### 2.1 Estado verificado

- **26/26 agentes** responderam com sucesso no playground, 0 falhas.
- **6 modelos Ollama** instalados, todos em CPU.
- **70 ficheiros de teste**, suite completa ainda não executada nesta ronda.
- **48 tarefas, 217 mensagens, 8 projetos, 30 memórias, 487 eventos de auditoria.**
- `/health` e dashboard funcionais.
- Backend local em `127.0.0.1:8000`.
- Bug real corrigido: mapeamento de tokens no playground (`prompt_tokens` vs `tokens_prompt`).

### 2.2 As três capacidades verificadas

| Capacidade | Estado real |
|---|---|
| **Busca online** | ✅ Funciona via DuckDuckGo Lite; disponível nos 26 agentes; devolve snippets, não lê páginas |
| **Geração de BD** | ⚠️ Não é nativa; funciona por código gerado + execução com aprovação |
| **Execução de scripts** | ✅ Funciona com aprovação, sandbox de subprocesso e bloqueio de padrões destrutivos |

### 2.3 As duas falhas P0

1. **`web_search` ignora o isolamento de rede.** O modo de isolamento só é aplicado ao adaptador de inferência cloud. A busca continua a sair para a Internet mesmo com isolamento ativo.
2. **`duckdb_query` aceita SQL de escrita.** É classificada como `READ`, mas corre SQL arbitrário; um `COPY ... TO` pode escrever ficheiros sem aprovação.

### 2.4 Dívida técnica conhecida

- Busca do Knowledge Vault é `LIKE`, não semântica.
- `vector_search` usa embedding toy.
- Voz: STT local devolve frase fixa; TTS local devolve WAV vazio.
- CVE/red team/WCAG/dívida técnica são heurísticas/regex.
- Supervisor proativo simula achados.
- Quality Studio gera Playwright, não executa browser.
- Modelos locais têm qualidade irregular e latência alta em CPU.
- Mobile exige configuração LAN.
- Agent Office é visual/gamificado.

### 2.5 Alterações não commitadas

Há alterações em `apps/api/routers/{system,workspace,agents}.py`, testes e vários ficheiros do dashboard. **Antes de começar, é preciso um checkpoint** (commit ou patch) com autorização explícita, para que o baseline não se misture com trabalho novo.

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
| Busca online | ✅ Real, limitada | Snippets, sem leitura de páginas |
| Execução de scripts | ✅ Real, com aprovação | Subprocesso, não VM |
| Geração de BD | ⚠️ Indireta | Código + aprovação + execução |
| SQL Playground | ✅ Real, read-only | `SELECT`/`WITH` |
| DuckDB analítico | ✅ Real, em memória | Analisa CSV/Parquet/JSON |
| Scaffolding multi-stack | ✅ Real, sem BD | Python usa dicionário em memória |
| Data pipeline | ✅ Real, não exposto | Serviço testado, sem rota |
| Quality Studio | ⚠️ Limitado | Executa pytest/jest; Playwright só gera |
| Design Studio | ⚠️ Heurístico | Paletas reais; WCAG por regex |
| Intelligence | ⚠️ Heurístico | LOC/complexidade reais; dívida simplificada |
| Knowledge Vault | ⚠️ Limitado | PDF/DOCX reais; busca keyword |
| `vector_search` | ❌ Simulado | Embedding toy |
| Voz | ❌ Simulado | Frase fixa + WAV vazio |
| CVE/red team | ⚠️ Heurístico | Base estática pequena + regex |
| Supervisor proativo | ⚠️ Simulado | Achados simulados; aprovação real |
| Learning Center | ⚠️ Estático | Guias + progresso |
| Agent Office | ⚠️ Visual | Gamificação, não execução |
| MCP | ✅ Real, condicionado | stdio JSON-RPC; precisa configuração |
| Webhooks | ✅ Real | Discord/Telegram |
| Backup/restore | ✅ Real | A validar em ensaio |
| Mobile | ✅ Real, condicionado | Flutter; precisa LAN |
| Assistente por voz em segundo plano | ❌ Não existe | Programa da Fase 8 |

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
| BASE-01 | Correr a suite completa: `.venv\Scripts\python.exe -m pytest -q` | 0,5d |
| BASE-02 | Ruff (lint/format) e `tsc --noEmit` + `npm run build` | 0,5d |
| BASE-03 | Promover o runner temporário a `scripts/smoke_agents.py` (`list`, `run`, `run-all`, `run-rest`) | 0,5d |
| BASE-04 | Criar `docs/CAPABILITIES.md` com a matriz Real/Limitado/Simulado | 0,5d |
| BASE-05 | Registar baseline: sucesso, latência por agente, tokens, modelos, 503/timeout | 0,5d |
| BASE-06 | Matriz de auth/RBAC/isolamento e revisão de segredos no repo | 0,5d |
| BASE-07 | Backup de `data/jarvis.db` antes de qualquer migração | 0,25d |

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
|---|---|---|---|
| SEC-01 | `web_search` respeitar isolamento | Consultar `cyber_shield.network_isolated` no motor ou nos call sites; devolver motivo explícito; teste com mock que falha se houver HTTP | 0,5–1d |
| SEC-02 | `duckdb_query` read-only | Allowlist `SELECT`/`WITH`/`EXPLAIN`/`DESCRIBE`/`SHOW`; bloquear `COPY`, `ATTACH`, `INSTALL`, `LOAD`, `CREATE`, `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`; teste com `COPY ... TO` | 0,5–1d |
| SEC-03 | Endurecer padrões destrutivos | Windows e Unix; manter como primeiro filtro | 0,5d |
| SEC-04 | Auditoria de execução | Registar utilizador, projeto, comando, decisão, duração, exit code e saída redigida | 1d |
| SEC-05 | Testes de aprovação | Escrita, rollback, criação de projeto, coding agent; expirada, cancelada e reutilizada | 1–1,5d |
| SEC-06 | Isolamento entre contas | Ampliar testes para todos os endpoints novos | 1d |

### 6.2 Confiabilidade

| ID | Tarefa | Detalhe | Esforço |
|---|---|---|---|
| REL-01 | Contratos de resposta | `InferenceResponse` ↔ `AgentOutput`; `prompt_tokens` vs `tokens_prompt` | 1d |
| REL-02 | Paridade playground/stream/task | Mesmo agente, modelo, tokens e erros coerentes | 1d |
| REL-03 | Testes SSE | Primeiro token, cancelamento, timeout, erro do provedor, libertação de lock | 1d |
| REL-04 | Erros padronizados | `provider_unavailable`, `timeout`, `policy_denied`, `internal`; frontend distingue | 1d |

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

- Parâmetro `database: none | sqlite | postgres`; default `none`.
- O template gera schema, script de inicialização, `.env.example` e teste que cria e consulta uma tabela.
- O coding agent continua disponível para schemas personalizados.
- O Backend Studio inspeciona o `.db` gerado em modo read-only.

**Opção B (🟡 P2):** expor `DataPipelineRunner` em `/api/v1/data/pipeline` para importar CSV/JSON e materializar SQLite/Parquet. O serviço já está testado, mas não tem rota.

**Opção C (⛔ sozinha):** depender só do agente. Funciona, mas não é repetível nem testável.

| ID | Tarefa | Esforço |
|---|---|---|
| CAP-01 | Template Python com SQLite stdlib + schema + seed + teste | 2d |
| CAP-02 | Template Node com Prisma/SQLite (🟡 opcional) | 1,5d |
| CAP-03 | Rota `/api/v1/data/pipeline` (🟡 P2) | 2d |
| CAP-04 | Teste de inspeção do BD gerado no Backend Studio | 0,5d |

### 7.2 Busca online — de “funciona” para “confiável”

| ID | Tarefa | Esforço |
|---|---|---|
| CAP-05 | Cache curto (10–15 min) por query normalizada | 1d |
| CAP-06 | Resultado com fonte e timestamp; indicador no chat | 0,5d |
| CAP-07 | Falha explícita “busca indisponível” | 0,5d |
| CAP-08 | Testes de parsing com fixtures locais | 0,5d |
| CAP-09 | 🟡 Leitura de páginas completas com allowlist e limite (P2) | 2–3d |

### 7.3 Execução de scripts — UX e controlo

| ID | Tarefa | Esforço |
|---|---|---|
| CAP-10 | Aprovação mostra comando, cwd, timeout e risco | 1d |
| CAP-11 | Botão cancelar ligado ao kill switch/task cancel | 1d |
| CAP-12 | Dry-run: mostrar comando sem executar | 0,5d |
| CAP-13 | Log descarregável + limite de saída + redação visível | 0,5d |

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
|---|---|---|---|
| PERF-01 | Reduzir prompts | De 1.000–1.700 para 400–800 tokens; contexto dinâmico; histórico truncado | 1,5d |
| PERF-02 | Limitar geração | `max_tokens` por modo: playground 128–256; tarefa 512–1.024; stop sequences | 1d |
| PERF-03 | Afinar Ollama | `keep_alive`, `num_ctx` 4k–8k, threads, `OLLAMA_NUM_PARALLEL=1`, warm-up | 1d |
| PERF-04 | Agrupar por modelo | Evitar troca constante e recarregamento | 1d |
| PERF-05 | Roteamento por capacidade | Código → `qwen2.5-coder:7b`; raciocínio → `deepseek-r1:1.5b`; escrita → `qwen2.5:7b`; evitar `phi3.5` em tarefas estruturadas | 1d |
| PERF-06 | Cache de inferência | Validar e usar `inference_cache` para prompts idempotentes | 1d |
| PERF-07 | SQLite | WAL + índices em `chat_messages(session_id)`, `knowledge_vault`, `tasks` | 0,5d |
| PERF-08 | Benchmark | `scripts/bench_agents.py` com 3 prompts fixos por agente; TTFT, tokens/s, total | 1d |

### Metas

- **−30%** tokens de prompt.
- **−25%** latência mediana.
- **p95 < 90 s** no playground para respostas curtas em CPU.
- **0 timeouts** em prompts de 20 palavras.

### Nota realista

Ollama em CPU continua a ser o teto. Se as metas não forem atingidas, documentar o limite e considerar GPU ou modelos menores.

---

## 9. Fase 4 — Qualidade dos 26 especialistas

**Duração:** 6–8 dias · **Dependência:** Fase 3

### Objetivo

Resolver respostas fora do tema e definir o modelo certo por agente.

| ID | Tarefa | Detalhe | Esforço |
|---|---|---|---|
| QUAL-01 | Harness de avaliação | `scripts/eval_agents.py`; rubrica 1–5: relevância, aderência ao papel, formato, ferramentas, alucinação | 1,5d |
| QUAL-02 | Casos de teste | 3–5 prompts por agente, incluindo “não sei / fora do âmbito” | 2d |
| QUAL-03 | Corrigir prompts | Piores desempenhos; exemplos curtos; limites explícitos | 1,5d |
| QUAL-04 | Modelo predefinido por agente | Com base no benchmark, em vez de `auto_hybrid` cego | 1d |
| QUAL-05 | Validação de output | Schema + comprimento; uma tentativa de reparação | 1d |
| QUAL-06 | Aplicar ao ReAct | Mesmo harness para chamadas de ferramentas | 1d |

### Metas

- **≥ 4/5** de relevância em **≥ 80%** dos agentes.
- **0** respostas vazias ou truncadas em prompts padrão.
- **≥ 90%** de sucesso em tarefas de código com ferramentas.

---

## 10. Fase 5 — Substituir simulações

**Duração:** 3–4 semanas · **Dependência:** Fases 3 e 4

**Ordem recomendada por valor:**

| ID | Item | O que fazer | Esforço |
|---|---|---|---|
| SIM-01 | Busca semântica no Knowledge Vault | Embeddings locais + `sqlite-vec`/FAISS; keyword como fallback | 3–4d |
| SIM-02 | Voz real | `faster-whisper` para STT; Piper/SAPI para TTS | 3–4d |
| SIM-03 | Segurança menos heurística | `pip-audit`/`npm audit` + snapshot OSV offline; Semgrep; regex como pré-filtro | 4–5d |
| SIM-04 | `vector_search` real | Trocar embedding toy por modelo local | 1–2d |
| SIM-05 | Supervisor proativo real | Substituir achados simulados por dependências, lint, testes e segredos | 2–3d |
| SIM-06 | Quality Studio real | Executar Playwright, não só gerar o teste | 2–3d |
| SIM-07 | 🟡 Leitura de páginas web | Allowlist, limite de tamanho, timeout | 2–3d |
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

| ID | Tarefa | Esforço |
|---|---|---|
| UX-01 | Estados de erro/loading/empty em todas as telas | 1d |
| UX-02 | Distinguir “provedor offline” de “erro interno” | 0,5d |
| UX-03 | Cancelamento real de streams + retry | 1d |
| UX-04 | Virtualizar listas longas (histórico, logs, telemetria) | 0,5d |
| UX-05 | E2E dos 5 fluxos principais | 1,5d |
| UX-06 | Testar instalador numa máquina limpa | 1d |
| UX-07 | Documento de demo com dados de exemplo | 0,5d |
| OPS-01 | Ensaio de backup/restore + webhooks | 1d |
| DOC-01 | Guia de configuração LAN do mobile | 0,5d |

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
| GOV-01 | CI: pytest + Ruff + `tsc` + build | Cada PR |
| GOV-02 | Smoke dos 26 agentes | Noturno |
| GOV-03 | Benchmark de performance | Semanal |
| GOV-04 | Avaliação de qualidade dos agentes | Mensal |
| GOV-05 | Revisão de segurança de novas ferramentas | Cada ferramenta nova |
| GOV-06 | Atualizar `CAPABILITIES.md` | Cada release |
| GOV-07 | Amostragem de aprovações e auditoria | Semanal |
| GOV-08 | Ensaio de backup/restore | Mensal |
| GOV-09 | Atualização de dependências | Mensal |

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

| Subfase | Foco | Esforço |
|---|---|---|
| V0 | STT/TTS reais + VAD + endpoint de comando | 3–4d |
| V1 | Wake word + daemon + bandeja + autostart | 3–4d |
| V2 | Conversa por voz, follow-up, barge-in, TTS por frase | 3–4d |
| V3 | Intent router + 10 comandos de assistente pessoal | 1–2 semanas |
| V4 | Android com foreground service | 1–2 semanas |
| V5 | iOS (push-to-talk/Siri) — opcional | 1 semana |
| V6 | Hardening de privacidade e auditoria | contínuo |

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
| Execução de scripts | Aprovar, rejeitar, cancelar, timeout | 0 bypass; log e auditoria |
| Studios | SQL, mock, pytest, paleta, WCAG | Respostas reais; erros explícitos |
| Knowledge Vault | Upload PDF/DOCX, indexar, buscar | Texto extraído; busca < 300 ms |
| Skills | Criar, atribuir, desativar | Skill aparece no prompt |
| Modelos/cofre | Listar, rotear, testar chave, download | Chave cifrada; fallback funciona |
| Segurança | Kill switch, auditoria, CVE/red team | Evento auditado; bloqueio efetivo |
| Ops | Logs SSE, telemetria, backup/restore, webhook | Restauro íntegro; notificação entregue |
| Frontend | Build + typecheck + E2E | Build limpo; 5 fluxos passam |
| Voz desktop | Wake word + pergunta + resposta | Funciona com dashboard fechado |
| Voz Android | Foreground service + áudio | Funciona com ecrã bloqueado |
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

**Começar pela Fase 0**, porque dá base a tudo:

1. Checkpoint das alterações atuais.
2. Backup do banco.
3. Suite completa + lint + typecheck + build.
4. `docs/CAPABILITIES.md`.
5. Lista P0/P1/P2.

Se houver pouco tempo, a alternativa de maior valor imediato é:

1. Escrever os dois testes que provam as falhas P0.
2. Corrigir `web_search` e `duckdb_query`.
3. Só depois voltar à Fase 0 completa.

**Recomendação:** Fase 0 primeiro, mas com os dois testes P0 a entrar logo na semana 1 — não vale a pena esperar para fechar riscos reais.

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
| Data pipeline | `services/data_pipeline/pipeline.py` |
| Knowledge Vault | `services/knowledge/knowledge_vault.py` |
| Voz | `services/voice_runtime/*.py`, `apps/api/routers/voice.py` |
| Desktop | `apps/desktop/main_window.py` |
| Mobile | `apps/mobile/lib/main.dart` |
| Dashboard | `apps/dashboard/src/*` |
| Testes | `tests/` |
| Documentação | `docs/` |

---

## Anexo B — Registo de decisões

| Data | Decisão | Estado |
|---|---|---|
| 12/11/2026 | Plano completo substitui planos anteriores | Proposto |
| 12/11/2026 | Segurança P0 antes de novas funcionalidades | Proposto |
| 12/11/2026 | Geração de BD por template + coding agent | Proposto |
| 12/11/2026 | Busca online mantém DuckDuckGo Lite | Proposto |
| 12/11/2026 | Programa de voz separado em `VOICE_ASSISTANT.md` | Proposto |
| 12/11/2026 | Windows primeiro no programa de voz | A confirmar |
| 12/11/2026 | Aprovação sensível nunca só por voz | Proposto |

---

*Fim do documento.*
