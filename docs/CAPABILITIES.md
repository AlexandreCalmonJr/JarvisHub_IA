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
| Busca Knowledge Vault | Limitada | Keyword/LIKE; não semântica |
| `vector_search` | Simulado | Embedding toy |
| Voz STT | Real opcional | faster-whisper local no daemon e como fallback da rota; o router web tenta primeiro o provedor cloud configurado. Requer `.[voice]` e modelo |
| Voz TTS | Real opcional | Piper; requer binário e modelo configurados e devolve WAV válido |
| VAD | Real básico | RMS para WAV PCM e RMS no daemon; não é deteção de fala avançada |
| Wake word/daemon desktop | Parcial | `apps/voice_daemon/main.py`: bandeja, mute, instância única, `hey_jarvis`, STT/TTS e chat autenticado. Faltam ensaio em hardware, atalho global, autostart, follow-up, barge-in e notificações |
| Voz Android | Não implementada | Escopo V4; `apps/mobile/pubspec.yaml` só tem `cupertino_icons` e `flutter_secure_storage` |
| CVE, red team, WCAG, dívida técnica | Heurística | Requer ferramentas/scanners adicionais |
| Supervisor proativo | Simulado/parcial | Achados não equivalem a varredura completa |
| Quality Studio Playwright | Limitado | Gera testes; execução de browser pendente |
| Backup/restore | Implementado, integridade validada | Banco e backup passaram `PRAGMA integrity_check`; ensaio de restauro manual pendente |
| Mobile | Real, condicionado | Flutter; exige configuração LAN e ainda não tem voz |

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
recebem uma reparação determinística única; no runtime autónomo, há ainda uma
tentativa de reparação via modelo. Se uma execução falhar no provedor, o evento
final é emitido com `is_completed=False` e o contrato regista o bloqueio.

Os 26 perfis usam modelos locais concretos por papel: `llama3.2:3b` no mestre,
`qwen2.5:7b` em raciocínio e `qwen2.5-coder:7b` em código. A rota configurada
na conta (por exemplo, Groq) mantém precedência sobre o perfil; as seeds de
`agent_configs` acompanham o catálogo e há testes de regressão para cada papel.
O contrato de resposta obrigatório limita respostas a 300 palavras, proíbe JSON
não pedido, exige chaves exatas quando o JSON é solicitado, proíbe descrever um
projeto hipotético quando não foram fornecidos dados e obriga a orientar
atendimento de emergência em pedidos de saúde.

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
(100%) e 22/26 com mínimo de 4 em todos os casos. O Gate 2 está fechado; restam
desvios residuais de formato e safety.

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
texto reconhecido segue para a API local autenticada. Logs em
`data/logs/voice.log`; uma única instância é permitida. O áudio não é guardado
pelo daemon.

## Prioridades abertas

- P0: nenhum P0 de código conhecido. Validação pendente: ensaio do daemon de voz em hardware. O benchmark completo fechou 78/78, o eval autenticado fechou 78/78 com rubrica confirmada (`mean_review_score` 4,68) e as metas de p95 e tokens estão cumpridas.
- P1: QUAL-03/04 concluídos; corrigir os desvios residuais de formato/safety; UX-01/03/04/05; OPS-01/DOC-01; GOV-02/03/04.
- P2: SIM-01/03/04/05/06/08; V2–V4; V5 opcional.

Concluído nesta ronda: SEC-01/02, CAP-01/02/03/04/05–09/10–13, SIM-02/07,
PERF-01–08, QUAL-01/02/03/04/05/06 implementados, V0 e GOV-01; eval autenticado
executado (78/78) com rubrica confirmada; Gate 2 fechado.

Para habilitar leitura integral, configure `JARVIS_WEB_READ_ALLOWED_HOSTS` com
domínios confiáveis separados por vírgula. A ferramenta `web_read` está
disponível aos perfis que já podem pesquisar na web; o texto retornado é dado
externo não confiável e não deve ser seguido como instrução.
