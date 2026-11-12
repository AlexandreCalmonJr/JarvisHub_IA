# JARVIS AI Hub — capabilities

Atualizado em 12/11/2026. O estado deve ser revisto em cada release.

| Capacidade | Estado | Evidência/limite |
|---|---|---|
| Auth, RBAC e isolamento por conta | Real | Middleware fail-closed e testes em `tests/security/` |
| Chat, sessões e streaming | Real | Rotas `/api/v1/chat` |
| Especialistas | Real | Catálogo em `agents/profiles/catalog.py`; executar `scripts/smoke_agents.py` |
| Aprovações | Real | Decisão autenticada, single-use |
| Execução de scripts | Real, com aprovação | Subprocesso com sandbox e auditoria; não é VM |
| Busca web | Real, snippets | DuckDuckGo Lite; agora bloqueia com isolamento de rede |
| DuckDB analítico | Real, read-only | SELECT/WITH/EXPLAIN/DESCRIBE/SHOW; operações de escrita bloqueadas |
| Geração de BD | Real, com aprovação | Scaffold Python/FastAPI opcional com SQLite stdlib, schema, seed, init idempotente e testes; Node/Postgres continuam fora do scaffold |
| Busca Knowledge Vault | Limitada | Keyword/LIKE; não semântica |
| `vector_search` | Simulado | Embedding toy |
| Voz STT | Real opcional | faster-whisper local ao instalar `.[voice]`; requer download/modelo |
| Voz TTS | Real opcional | Piper; requer binário e modelo configurados |
| VAD WAV | Real básico | RMS local para WAV PCM mono/estéreo; não é wake word |
| Wake word/daemon desktop | Parcial | App opcional de bandeja com mute, instância única, wake word, STT/TTS locais e chat autenticado; hardware, atalho global e UX avançada pendentes |
| Voz Android | Não implementada | Escopo V4 |
| CVE, red team, WCAG, dívida técnica | Heurística | Requer ferramentas/scanners adicionais |
| Supervisor proativo | Simulado/parcial | Achados não equivalem a varredura completa |
| Quality Studio Playwright | Limitado | Gera testes; execução de browser pendente |
| Backup/restore | Implementado, não validado nesta rodada | Ensaio manual pendente |

O template SQLite gerado é detetado pelo Backend Studio e pode ser inspecionado
por conexão read-only. A opção `database=sqlite` só é selecionada quando pedida
explicitamente e faz parte do preview vinculado à aprovação humana.

O Coding Agent mostra um preview de comandos (com diretório, timeout e risco),
permite cancelar a execução em curso, termina o subprocesso cancelado e exporta
o log da sessão em Markdown. A saída é limitada e redigida antes de ser exibida.

`scripts/bench_agents.py --role <papel>` mede TTFT, duração e tokens de três
prompts fixos; `--all` executa os 78 casos dos 26 especialistas e pode levar
vários minutos, dependendo do provedor.

O builder de prompts agora injeta código do projeto apenas em intents de
arquitetura, modificação, criação, QA e segurança, e limita memórias, skills e
histórico colaborativo. O tamanho real em tokens ainda precisa ser medido pelo
benchmark com o provedor ativo.

Para afinar Ollama, `JARVIS_OLLAMA_KEEP_ALIVE` controla o tempo em memória e
`JARVIS_OLLAMA_NUM_CTX` permite um contexto entre 2.048 e 8.192 tokens. O padrão
continua adaptativo para a carga em CPU; agrupamento de inferências e warm-up
automático ainda não estão implementados.

## Prioridades abertas

- P0: ampliar auditoria de execução e cobertura de aprovação/isolamento.
- P1: ampliar testes de isolamento/aprovação, controles de execução e avaliação dos agentes.
- P2: busca de páginas, rota de pipeline e contentor/VM.
