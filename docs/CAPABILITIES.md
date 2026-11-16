# JARVIS AI Hub — capabilities

Atualizado em 13/11/2026. O estado deve ser revisto em cada release.

| Capacidade | Estado | Evidência/limite |
|---|---|---|
| Auth, RBAC e isolamento por conta | Real | Middleware fail-closed e testes em `tests/security/` |
| Chat, sessões e streaming | Real | Rotas `/api/v1/chat`; SSE com cancelamento e erros padronizados |
| Especialistas | Real | Catálogo em `agents/profiles/catalog.py`; executar `scripts/smoke_agents.py` |
| Aprovações | Real | Decisão autenticada, single-use, com expiração e escopo |
| Execução de scripts | Real, com aprovação | Subprocesso com sandbox, cancelamento e auditoria; não é VM |
| Busca web | Real, snippets | DuckDuckGo Lite; cache de 12 min; bloqueia com isolamento de rede |
| Leitura de páginas web | Real, com allowlist | `web_read` usa `JARVIS_WEB_READ_ALLOWED_HOSTS`; revalida redirects/SSRF, bloqueia em isolamento, limita resposta a 512 KB/8 s e marca texto como não confiável. Allowlist vazia desativa a leitura. |
| DuckDB analítico | Real, read-only | SELECT/WITH/EXPLAIN/DESCRIBE/SHOW; operações de escrita bloqueadas |
| Geração de BD | Real, com aprovação | Scaffolds Python/FastAPI (SQLite stdlib) e Node/Express (Prisma/SQLite), com schema, seed, setup e testes; Postgres continua fora do scaffold |
| Data pipeline | Real, com aprovação | `/api/v1/data/pipeline` importa CSV/JSON e materializa SQLite/Parquet; limite de 10 MB/100 000 registos, path traversal rejeitado e aprovação vinculada |
| Busca Knowledge Vault | Real | Busca semântica híbrida via LanceDB + embeddings locais Ollama (`nomic-embed-text`, 768 dimensões) com fallback fail-safe para keyword/LIKE |
| `vector_search` | Real local | `LocalEmbeddingService` (`nomic-embed-text`, 768 dimensões) com cache e fallback determinístico |
| Voz STT | Real opcional | faster-whisper local no daemon e como fallback da rota; o router web tenta primeiro o provedor cloud configurado. Requer `.[voice]` e modelo |
| Voz TTS | Real opcional | Piper; requer binário e modelo configurados e devolve WAV válido |
| VAD | Real básico | RMS para WAV PCM e RMS no daemon; não é deteção de fala avançada |
| Wake word/daemon desktop | Real completo (V1) | `apps/voice_daemon/main.py`: bandeja, mute, instância única, `hey_jarvis`, atalho global Windows (`Ctrl+Shift+J`), autostart no Registro (`HKCU Run`), notificações de sistema, janela de follow-up (6 s) e chat autenticado |
| Voz Android | Não implementada | Escopo V4; `apps/mobile/pubspec.yaml` só tem `cupertino_icons` e `flutter_secure_storage` |
| CVE, red team, WCAG, dívida técnica | Real com pip-audit & Bandit | `CVEScannerService` integrado com `pip-audit` (PyPI/OSV) e base offline expandida; SAST com AST Bandit para Python e pré-filtro OWASP multi-linguagem; nova ferramenta `audit_dependencies` |
| Supervisor proativo | Simulado/parcial | Achados não equivalem a varredura completa |
| Quality Studio Playwright | Real (testes E2E) | 5/5 fluxos principais E2E executados e verdes via Playwright (`apps/dashboard/e2e/`) |
| Backup/restore | Implementado e validado | Ensaio reproduzível via `scripts/rehearse_ops.py` (`data/ops_rehearsal.json`): integridade, schema, contagens e foreign keys validadas; webhooks Discord/Telegram validados |
| Mobile | Real, condicionado | Flutter; documentado em `docs/operations/14-guia-configuracao-lan-mobile.md`; ainda não tem voz |

O template SQLite gerado é detetado pelo Backend Studio e pode ser inspecionado
por conexão read-only. A opção `database=sqlite` só é selecionada quando pedida
explicitamente e faz parte do preview vinculado à aprovação humana.

O Coding Agent mostra um preview de comandos (com diretório, timeout e risco),
permite cancelar a execução em curso, termina o subprocesso cancelado e exporta
o log da sessão em Markdown. A saída é limitada e redigida antes de ser exibida.

`scripts/smoke_agents.py` lista e executa os 26 especialistas. `scripts/bench_agents.py --role <papel>`
mede TTFT, duração e tokens de três prompts fixos; `--all` executa os 78 casos
dos 26 especialistas e pode levar vários minutos, dependendo do provedor.
`scripts/eval_agents.py` gera a rubrica 1–5 e os casos por perfil. As três
ferramentas exigem backend ativo e `JARVIS_ADMIN_TOKEN`. O smoke autenticado de
12/11/2026 passou 26/26, o benchmark completo fechou 78/78 e o eval autenticado
de 15/11/2026 fechou **78/78** com zero falhas; a rubrica 1–5 foi confirmada em
15/11/2026 (`mean_review_score` 4,68).

O builder de prompts injeta código do projeto apenas em intents de arquitetura,
modificação, criação, QA e segurança, e limita memórias, skills e histórico
colaborativo. O prompt conversacional do perfil mestre ficou em 1.779 caracteres
(~445 tokens estimados); o tamanho real dos restantes fluxos foi medido pelo
benchmark com o provedor ativo (ver abaixo).

O contrato de saída dos especialistas é validado quanto a schema e comprimento
no `packages/contracts/agent.py` e em `services/orchestration/output_validation.py`.
Resumos vazios, truncados, com JSON inválido ou embrulhados numa cerca markdown
recebem uma reparação determinística única. Respostas narrativas acima de 300
palavras acionam uma reparação via modelo no runtime autónomo e, se continuarem
longas, uma compactação determinística em fronteira de frase; respostas vazias
são repetidas uma vez sem ferramentas. Se uma execução falhar no provedor, o
evento final é emitido com `is_completed=False` e o contrato regista o bloqueio.

Os 26 perfis usam modelos locais concretos por papel: `llama3.2:3b` no mestre,
`qwen2.5:7b` em raciocínio e `qwen2.5-coder:7b` em código. A rota configurada
na conta (por exemplo, Groq) mantém precedência sobre o perfil; as seeds de
`agent_configs` acompanham o catálogo e há testes de regressão para cada papel.
O contrato de resposta obrigatório limita respostas a 300 palavras, proíbe JSON
não pedido, exige chaves exatas quando o JSON é solicitado e, sem dados
concretos, obriga a começar `analise` pela declaração de que os dados não foram
fornecidos. Em pedidos de saúde, a primeira frase deve orientar de imediato para
atendimento de emergência (192/SAMU), sem diagnóstico nem prescrição.

O runtime ReAct recupera chamadas de ferramenta devolvidas como texto (JSON ou
literal Python), desde que o nome esteja autorizado no perfil, evita ciclos de
chamadas repetidas e força uma resposta narrativa final. O harness
`scripts/eval_react_tools.py` cobre 10 tarefas de código com projeto real,
aprovações e um gate de segurança; a execução live fechou **10/10** com
segurança OK, mediana **68,8 s**, p95 **80,5 s** e máximo **87,0 s**.

**Smoke autenticado (12/11/2026):** backend isolado em `:8010` com token
administrativo local, **26/26 respostas HTTP 200** e zero falhas. Latência
mediana **26,137 s**, p95 **62,111 s**, máxima **79,586 s**; **27.228** tokens de
prompt e **5.620** de completion. O warm-up do mesmo modelo reduziu um pedido do
`jarvis_master` de **94,378 s para 38,699 s**. O prompt médio do smoke foi de
~**1.047 tokens**, acima da meta de 400–800.

**Benchmark completo (12/11/2026):** 78 casos no mesmo backend isolado,
**78/78 sucessos**, mediana **27,7 s**, p95 **75,3 s**, TTFT mediano **27,7 s**,
**44.246** tokens de prompt e **4.635** de completion. O subconjunto `checks`
foi repetido com um prompt conciso (26/26; mediana 38,5 s; p95 53,1 s) e
combinado com os restantes 52 casos. As metas de −30% tokens, −25% latência
mediana, p95 < 90 s e zero timeouts ficam cumpridas. Os 6 blocos `structured`
em markdown passaram a ser desembrulhados pela reparação determinística, e os 4
falsos truncamentos eram o limite de 500 caracteres do benchmark, já removido;
as correções de prompt/modelo do QUAL-03/04 foram aplicadas e revalidadas no eval
de 15/11/2026.

**Eval autenticado (15/11/2026):** 78 casos (26 especialistas × 3) no `:8010`
com Groq `openai/gpt-oss-120b`: **78/78 concluídos**, zero falhas, zero timeouts,
zero respostas vazias e zero truncamentos. `structured_output` ficou em
**26/26** com JSON válido, chaves e tipos exatos; **24/26** reconhecem
explicitamente a ausência de dados, **1/26** (`qa_engineer`) ainda inventa um
código que não foi fornecido e **1/26** (`software_architect`) é genérico sem
explicitar a falta de dados. `out_of_scope`: **26/26** recusam prescrever e
**23/26** orientam emergência; `data_scientist`, `network_infrastructure_engineer`
e `secure_code_auditor` recusam mas não indicam emergência. `mission_application`:
26/26 completas e sem alegação de inspeção; o limite de 300 palavras foi excedido
em 25/26 (mediana 357, máximo 430), pelo que o formato fica em 3–4 na proposta.
A rubrica 1–5 foi confirmada em 15/11/2026 e aplicada ao JSON oficial:
`mean_review_score` **4,68**, **26/26** agentes com média de relevância ≥4
(100%) e 22/26 com mínimo de 4 em todos os casos. O Gate 2 está fechado; os
desvios residuais de formato e safety foram corrigidos no run suplementar de
16/11/2026 (abaixo).

**Correções pós-Gate 2 (16/11/2026):** o limite de 300 palavras passou a ser
imposto no runtime (reparação única via modelo + compactação determinística em
fronteira de frase) e respostas vazias são repetidas uma vez sem ferramentas.
O run suplementar `data/eval_agents_groq_qual_pos_fix.json` fechou **78/78**,
sem falhas, respostas vazias ou truncamentos: `structured_output` **26/26**
válido, com ausência de dados declarada e sem marcadores de invenção;
`out_of_scope` **26/26** com orientação de emergência; `mission_application`
**0/26** acima de 300 palavras (122–293, mediana 164). A rubrica humana do run
suplementar ainda não foi aplicada; a proposta automática não aplicada dá
26/26 agentes com relevância ≥4, mas sinaliza 5/26 casos de missão com
`hallucination_control=3` por assumirem contexto não fornecido. A rubrica
oficial mantém-se a de 15/11 (4,68). Suite completa pós-correções: **448
passed em 218,37 s**; Ruff `check` e `format --check` passam (284 ficheiros).

Para afinar Ollama, `JARVIS_OLLAMA_KEEP_ALIVE` controla o tempo em memória e
`JARVIS_OLLAMA_NUM_CTX` permite um contexto entre 2.048 e 8.192 tokens. O warm-up
corre em background no arranque (`JARVIS_OLLAMA_WARMUP=0` desativa) e pode ser
forçado por `POST /api/v1/models/warm-up` com admin; `JARVIS_OLLAMA_WARMUP_MODELS`
escolhe modelos separados por vírgula. `JARVIS_MODEL_AFFINITY_SECONDS` (900 s por
padrão, 0 desativa) mantém a seleção automática no modelo local recém-carregado,
e `ModelManager.generate_grouped` executa lotes independentes agrupados por modelo.
No serviço Ollama, definir `OLLAMA_NUM_PARALLEL=1` para CPU; a fila interna já
serializa inferências pesadas.

O daemon de voz requer `.[voice]`, `JARVIS_VOICE_TOKEN`, `JARVIS_PIPER_EXECUTABLE`
e `JARVIS_PIPER_MODEL`. O microfone fica no PC, a wake word é local e apenas o
texto reconhecido segue para a API local autenticada. Suporta atalho global (`Ctrl+Shift+J`),
inicialização com Windows (`HKCU Run`), notificações na bandeja, janela de follow-up (6s),
TTS por frase com baixa latência e interrupção imediata via barge-in.
O Intent Router em `/api/v1/voice/command` atende 10 comandos de assistente pessoal
(horas, data, timers, lembretes, clima, saúde do sistema, cálculo seguro via AST, repetição
de respostas anteriores, cancelamento e abertura de aplicativos/pastas), exigindo aprovação
no painel para qualquer ação sensível. Logs em `data/logs/voice.log`; uma única instância
é permitida. O áudio não é guardado pelo daemon.

## Prioridades abertas

- P0: nenhum P0 de código conhecido. Validação pendente: ensaio do daemon de voz em hardware físico com microfone real. O benchmark completo fechou 78/78, o eval autenticado fechou 78/78 com rubrica confirmada (`mean_review_score` 4,68) e as metas de p95 e tokens estão cumpridas.
- P1: V5 (iOS opcional) e ensaio em hardware real de microfone.
- P2: V6 contínuo de auditoria e telemetria.

Concluído nesta ronda: SEC-01..06, CAP-01..13, SIM-01 (Busca Semântica LanceDB + nomic-embed-text), SIM-02, SIM-03 (Auditoria real pip-audit/bandit), SIM-04 (`vector_search` real), SIM-05 (Supervisor proativo com inspeções reais de CVEs, segredos e SAST), SIM-06 (Quality Studio com execução real de Playwright em Chromium headless), SIM-07, SIM-08 (`ContainerSandbox` com Docker/Podman e fallback seguro), PERF-01..08, QUAL-01..06, Fase 6 completa (UX-01..07, OPS-01, DOC-01), V0, V1 (Wake word + daemon + bandeja + autostart + atalho global), V2 (Conversa contínua, follow-up, TTS por frase, barge-in), V3 (Intent router + 10 comandos de assistente pessoal determinísticos seguros), V4 (Mobile Flutter com comandos de voz determinísticos e polling de aprovações em tempo real) e GOV-01; suíte completa verde; Gate 0, Gate 1, Gate 2 e Gate 3 oficialmente fechados.

Para habilitar leitura integral, configure `JARVIS_WEB_READ_ALLOWED_HOSTS` com
domínios confiáveis separados por vírgula. A ferramenta `web_read` está
disponível aos perfis que já podem pesquisar na web; o texto retornado é dado
externo não confiável e não deve ser seguido como instrução.
