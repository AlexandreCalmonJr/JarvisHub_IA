# Auditoria Técnica Completa — JARVIS AI HUB 3.0.1

**Data:** 2026-11-17
**Escopo:** backend (FastAPI), frontend (React 19 + Vite), app mobile (Flutter), camada de IA
(orquestração, agentes, modelos, provedores), banco de dados (SQLite), integrações (MCP, webhooks,
Telegram/Discord), infraestrutura (launchers, CI, empacotamento) e documentação.
**Método:** leitura integral dos módulos críticos + execução real de testes, lint, typecheck e build.

---

## 1. Estado objetivo (medido)

| Verificação | Comando | Resultado |
| --- | --- | --- |
| Testes backend | `pytest -q` | **509 passaram**, 0 falhas, 2 warnings (`unclosed transport`) |
| Testes frontend | `node --test` (apps/dashboard) | **121 passaram, 3 FALHARAM** |
| Typecheck | `tsc --noEmit` | limpo |
| Lint Python | `ruff check apps services packages agents skills scripts tests` | **114 erros** |
| Build frontend | `apps/dashboard/dist` | 1,58 MB; `index` 434 KB + `Overview` 432 KB |
| Git | `git status` | 15 modificados + 11 não versionados |
| Mobile | `apps/mobile/lib/main.dart` | 2 331 linhas em um único arquivo |

Os gates do CI (`.github/workflows/quality.yml`) exigem `ruff check .`, `ruff format --check .`,
`npm run test:dashboard` e `npm run build`. **O repositório não passa nos próprios gates.**

O README afirma "265 testes, 0 ignorados". O número real é 509 no backend e, no dashboard,
3 testes estão vermelhos.

---

## 2. CRÍTICO

### C1 — WebSocket do terminal sem autenticação (RCE remoto)

`apps/api/auth.py:770-772` libera todo scope que não seja `http`:

```python
if scope.get("type") != "http":
    await self.app(scope, receive, send)
    return
```

`apps/api/routers/terminal.py:21-52` aceita qualquer conexão e executa
`create_subprocess_shell("powershell.exe -NoLogo")` sem token, sem `Depends`, sem verificação de
origem, sem allowlist e herdando todo o ambiente do processo. Com o servidor em `0.0.0.0`
(`iniciar_jarvis.bat:45`), qualquer host da LAN obtém shell interativo.

Adicionalmente, o endpoint não tem consumidor no dashboard (nenhuma referência a `terminal/ws` no
frontend): é superfície de ataque pura.

### C2 — Bypass de aprovação humana em `execute_command`

`services/coding_agent/tools.py:427-443` declara `execute_command` com `requires_approval=True`,
mas `preview()` (`:548-677`) só trata `write_file`, `edit_file`, `run_command`, `git_commit` e
ferramentas MCP, retornando `None` no fim (`:677`). O runtime só pede aprovação quando o preview
existe:

```python
if preview is not None:      # services/coding_agent/runtime.py:384
    ... fluxo de aprovação ...
tool_result = await self.tools.execute(...)   # :452
```

Mesmo padrão em `services/autonomous_agent/runtime.py:963`. Resultado: o alias `execute_command`
executa shell arbitrário no diretório do projeto sem qualquer gate, enquanto `run_command` com
payload idêntico exige aprovação.

### C3 — Cadeia de tomada de conta na LAN

1. `apps/api/auth.py:373-375` — senha **`jarvishub`** quando `JARVIS_ENVIRONMENT` não está definido
   (o default é `development`).
2. `iniciar_jarvis.bat:45` — bind em `--host 0.0.0.0`, contradizendo o README ("o servidor inicia em
   127.0.0.1 por padrão") e o threat model ("127.0.0.1 Confinado").
3. `apps/api/main.py:159` — `allow_origin_regex` aceita qualquer origem em `192.168.*`, `10.*` e
   `172.16-31.*` com `allow_credentials=True`.
4. `apps/api/services/network_discovery.py:72` — UDP 8001 em `0.0.0.0` responde a qualquer datagrama
   contendo "jarvis" com IP, portas e endpoint de pareamento.

Qualquer host na LAN executa `POST /api/v1/auth/password-login` com `admin/jarvishub`.

### C4 — Webhooks públicos com Principal forjado `scopes={"*"}`

`apps/api/routers/omnichannel.py:43-96` expõe Telegram e Discord em `PUBLIC_ROUTES`
(`auth.py:48-49`) **sem validar assinatura**. `omnichannel_gateway.py:42-50` sintetiza:

```python
Principal(
    subject_id=f"{channel}_{sender_id}", kind="human", role="developer", scopes=frozenset({"*"})
)
```

`Principal.has()` retorna `True` quando `"*" in scopes` (`auth.py:261`), ou seja, o remetente não
autenticado recebe permissões totais (hoje limitadas pelo caráter determinístico do
`voice_command`, mas é escalada latente).

### C5 — IDOR: exclusão e dockerização de projeto de outra conta

`apps/api/routers/workspace.py:253-298` (DELETE) e `:320-370` (dockerize) usam apenas
`_require_human(principal)` em vez de `_require_owned_project(...)`, que os outros 10 endpoints
aplicam. Um perfil `developer` remove o diretório de qualquer projeto do workspace — inclusive do
administrador — aprovando a própria solicitação.

### C6 — Respostas fabricadas apresentadas como pareceres de engenharia

| Local | Comportamento |
| --- | --- |
| `packages/agent_sdk/base_agent.py:223-226` | `except Exception` produz `"Parecer técnico estruturado de {name} … concluída."` com `evidence` preenchido |
| `services/orchestration/graph.py:862-882` | Falha do modelo vira `"Arquitetura aprovada para …"` |
| `services/orchestration/graph.py:918-925` | Falha vira `"Auditoria de Cibersegurança aprovada … HSTS ativadas … mitigação contra injeções SQL/XSS"` |
| `services/orchestration/graph.py:853-855` | `arch_p_tokens = 35`, `arch_c_tokens = 110`, `dur = 12.0` como defaults → telemetria inventada |
| `services/orchestration/workspace_actions.py:123-124` | "Modificar código" não chama LLM: insere `/* Modificação JARVIS: … */` e retorna `"✅ Arquivo atualizado…"` com `tests_executed` fabricado |
| `services/autonomous_agent/teammate_manager.py:165-177` | `dispatch_task` é `# Simulação`, devolve `status="completed"` |
| `services/observability/vision_engine.py:139-158` | Sem modelo de visão: `success: True`, modelo `"heuristic-vision-v1"` e detecções inventadas |
| `services/orchestration/self_correction.py:182-188` | Reescreve o Markdown do modelo por regex e afirma "o compilador interno validou a integridade sintática" |

---

## 3. ALTO

### H1 — RBAC deixa famílias de rotas inacessíveis ao perfil `developer`

`apps/api/auth.py:128-236`; rota não mapeada cai em "somente admin" (`:603-606`). Sem regra:
`/api/v1/agent-routes*`, `/api/v1/system/onboarding*`, `/api/v1/data/*`, `/api/v1/teammates/*`,
`/api/v1/vision/*`, `/api/v1/symbols/*`, `/api/v1/omnichannel/inbound`, `/api/v1/models/warm-up`,
`/api/v1/system/backup`. Todas são telas visíveis no dashboard que retornam 403.

Regras duplicadas e mortas: `:130-131` vs `:183-184`.

### H2 — `apply-hardware-optimizations` corrompe os 26 agentes

`apps/api/routers/hardware.py:44-49` compara com `("maestro", "general_assistant",
"code_explanation", "requirements_analyst")` — nenhum existe (os reais são `jarvis_master`, …).
Todos os 26 agentes recebem `qwen2.5-coder:7b`. `set_agent_config` é chamado sem `is_read_only`
(`:50-55`) cujo default no schema é `1` (`services/memory/database.py:241`), deixando 20 agentes
read-only após reinício. A mensagem de sucesso (`:62`) afirma o oposto do que foi feito.

### H3 — Ausência de gestão de janela de contexto nos loops ReAct

`services/model_runtime/adapter.py:126-129` fixa `num_ctx` em 2048/4096;
`services/coding_agent/providers.py:264-272,328-333` nunca envia `num_ctx`.
`services/coding_agent/runtime.py:238-252,488-496` acumula até 30 000 caracteres por resultado de
ferramenta, por iteração, sem compactação. Em modelos locais o Ollama trunca o prompt
silenciosamente (perdendo o system prompt). `services/coding_agent/compactor.py` existe mas só é
chamado por endpoint manual (`apps/api/routers/coding.py:120`).

### H4 — Teto de saída de 1024 tokens

`apps/api/schemas.py:35` e `:349`: `max_tokens: int = Field(1024, ge=256, le=1024)`. Não cabe uma
escrita de arquivo de 150 linhas nem a saída exigida por `MAX_AGENT_SUMMARY_CHARS = 8_000`
(`packages/contracts/agent.py:10`).

### H5 — `\n` duplamente escapado no Markdown entregue

`services/orchestration/graph.py:1435-1437, 1486-1494, 1636-1637, 1795` usam `"\\n"` em f-strings
normais, produzindo barra invertida literal. O documento final da Mesa Redonda renderiza
`# Título\n\n### 1. software_architect\n…`.

### H6 — Injeção de comando em `git_commit`

`services/coding_agent/tools.py:1091-1097` interpola `paths` (controlados pelo modelo) numa string
de shell; `_resolve` valida contenção de caminho, não metacaracteres. `message` é sanitizada,
`paths` não.

### H7 — Segredos e conteúdo em auditoria/logs

- `services/coding_agent/tools.py:710` — `output_redacted` guarda a saída crua.
- `tools.py:733,751` — em falha, `call.arguments` completo (corpo de arquivo) vai para
  `audit_events`.
- `apps/api/routers/voice.py:100` — transcrição completa de áudio em `logger.info`.
- `services/security_core/redaction.py:5-14` — não cobre `sk-proj-…`, `sk-ant-api03-…`, `gsk_…`,
  `AIza…`, `AKIA…`, `github_pat_…` nem JWT.

### H8 — Modelos de IA inexistentes ou trocados

| ID | Local | Veredito |
| --- | --- | --- |
| `qwen/qwen3.6-27b`, `qwen/qwen3.8-27b` | `provider_defaults.py:26`, `graph.py:590`, `HybridGatewayConfig.tsx:36` | inválido (inventado) |
| `llama-3.2-11b-vision-preview` | `vision_engine.py:80` | inválido na Groq |
| `gpt-4o-mini` para Gemini/DeepSeek/Anthropic/OpenRouter | `vision_engine.py:83` | inválido |
| `custom-model` | `hybrid_router.py:66-67` | inválido (enviado a api.openai.com) |
| `claude-3-5-haiku-20241022`, `claude-3-5-sonnet-20241022` | `provider_defaults.py:16`, `providers.py:546` | legado — verificar |
| `openai/gpt-oss-120b`, `gemini-2.5-flash`, `deepseek-chat`, `llama3.2:3b`, `qwen2.5-coder:7b` | vários | válidos |

`local_model_names` está hardcoded em 5 lugares (`adapter.py:652`, `:806`, `graph.py:604`,
`model_manager.py:295`, `agent_routing.py:32`). `AGENT_MODEL_RECOMMENDATIONS`
(`huggingface_service.py:91-190`) promete "cada um dos 26 Especialistas" mas contém 22 chaves de uma
taxonomia inexistente.

### H9 — Ferramentas declaradas que não existem

`agents/profiles/catalog.py` concede `delegate_agent`, `list_projects`, `request_approval` e
`query_audit` (inexistentes no repositório) ao JARVIS_MASTER, e `run_tests`/`run_linter` a 7 agentes —
mas essas duas só existem em `services/tool_gateway/`, não no `CodingToolExecutor` usado pelos
runtimes (`apps/api/deps.py:346`). O prompt (`base_agent.py:90-101`) anuncia as ferramentas, o
modelo as chama e todas falham como "ferramenta desconhecida".

### H10 — Chaves de API em `localStorage` puro

`SettingsView.tsx:65-77, 1579` grava `jarvis_key_<provider>` sem escopo de conta e ignorando o
KeyVault server-side (`/api/v1/models/vault`, cifrado com DPAPI/Fernet).

### H11 — Frontend apresenta dados fabricados como reais

| Tela | Evidência |
| --- | --- |
| Task Manager (tela principal) | `TaskManagerView.tsx:446-509` — 3 tarefas hardcoded, contadores `\|\| 1` |
| "Delegar tarefa" | `TaskManagerView.tsx:60-76` — toast de sucesso sem nenhum `fetch`; agentes inexistentes em `:373` |
| Usage Analytics | `UsageAnalyticsView.tsx:55-117` — série de 30 dias sintetizada, valores fixos |
| CPU/RAM | `DynamicIsland.tsx:12` (`{cpu:31, memory:33}`); `UsageAnalyticsView.tsx:26-39` lê campos inexistentes (`hw.cpu_usage_pct`); o real é `specs.cpu.current_load_percent` / `specs.ram.percent` |
| "Testar Ollama" | `SettingsView.tsx:252` — `GET /api/v1/models/catalog` não existe |
| "Otimizar banco (VACUUM)" | `SettingsView.tsx:265-271` — `setTimeout` + toast, sem requisição |
| Workflow Canvas | `WorkflowCanvasView.tsx:187` — `setTimeout(800)`, sem backend |
| App Store | `AppStoreView.tsx:23-142` — `connected: true` fixo; Slack/1Password/Bitwarden/Dropbox sem backend |
| ~25 controles de Settings | `SettingsView.tsx:79-122` — apenas `useState`, sem persistência nem efeito |

### H12 — Leaks e falhas de ciclo de vida no React

- `useChatStream.ts` sem cleanup no unmount: microfone, `AudioContext`, intervalo de VAD e
  `AbortController` sobrevivem à navegação (`:100-119`, `:219-239`).
- `useChatStream.ts:654-661` reenvia o prompt como segundo `POST /api/v1/chat` em qualquer erro de
  streaming.
- `ServerLogsView.tsx:93-129` fecha o `EventSource` sem reconexão e acopla o polling de métricas ao
  mesmo efeito.
- `Modal.tsx:34-62` sem `role="dialog"`, `aria-modal`, focus trap, restauração de foco ou scroll lock.

### H13 — `.gitignore` exclui código-fonte

`.gitignore:77` (`models/`) casa com `apps/dashboard/src/components/models/`:

```
git check-ignore -v apps/dashboard/src/components/models/AgentRecommendationTable.tsx
→ .gitignore:77:models/  AgentRecommendationTable.tsx
```

O arquivo não está no Git; um clone limpo não compila.

---

## 4. MÉDIO

### Banco de dados

- Uma conexão SQLite nova por chamada (`services/memory/database.py:23-33`), com 7 `PRAGMA`
  (incluindo `mmap_size=268435456`) por operação; sem pool. `with conn` não fecha a conexão.
- `services/security_core/session_manager.py:161-166` grava `last_seen` em disco em **toda**
  validação de sessão.
- `_sessions`, `_revoked_tokens` e `approval_engine._requests` crescem sem limite;
  `purge_expired()` (`session_manager.py:205`) nunca é chamada.
- `search_knowledge_vault` (`database.py:1461-1482`) usa `LIKE '%termo%'` sem FTS e sem escape de
  `%`/`_`.
- Seeds de roles inexistentes em `database.py:228-234`.

### Configuração morta

`.env.example` documenta 13 variáveis que o código nunca lê: `ALLOWLIST_WORKSPACE_ROOT`, `DEBUG`,
`DEFAULT_CODER_MODEL`, `DEFAULT_MASTER_MODEL`, `DEFAULT_REASONING_MODEL`, `ENABLE_KILL_SWITCH`,
`ENVIRONMENT`, `HOST`, `MAX_CONCURRENT_INFERENCES`, `OLLAMA_BASE_URL`, `ONLINE_GATEWAY_ENABLED`,
`SESSION_EXPIRY_HOURS`, `STRICT_PERMISSION_CHECK`.

`validate_import_root` lê `JARVIS_WORKSPACE_IMPORT_ROOTS` (`workspace_service.py:40`), nome
diferente do `ALLOWLIST_WORKSPACE_ROOT` documentado. `OllamaAdapter` fixa
`http://127.0.0.1:11434` (`adapter.py:121`), sem variável de ambiente.

### Android / Mobile

- `AndroidManifest.xml:24` — `usesCleartextTraffic="true"`;
  `network_security_config.xml` permite cleartext em `<base-config>` e confia em certificados de
  usuário na base (não só em `debug-overrides`) → MITM trivial em release. `192.168.1.81` hardcoded.
- `android:label="jarvis_mobile"` (nome de pacote visível).
- `pubspec.yaml:2` — `description: "A new Flutter project."`; `build.gradle.kts` com TODO de template.
- Permissões `RECORD_AUDIO`/`FOREGROUND_SERVICE_MICROPHONE` sem serviço de foreground.
- Toda a app em um único `main.dart` de 2 331 linhas.

### Frontend / Design

- Google Fonts externas em `index.html:14-16` **e** `index.css:1` (`@import` bloqueante) — quebra a
  promessa offline.
- `manifest.json` com versão "4.0 Pro", descrição em mojibake duplo (`CÃ³digo`) e ícone `/vite.svg`
  inexistente.
- `--text-muted: #6b6963` (`index.css:19`) = 3,03:1 de contraste (WCAG AA exige 4,5:1).
- `MarkdownMessage.tsx:314-331` — `href` do modelo sem validação de esquema (`javascript:`).
- Sem `aria-live`/`role="log"` no streaming (`ChatMaster.tsx:272-291`).
- `key={idx}` na lista de mensagens (`ChatMaster.tsx:282`).
- Escala de `z-index` ad-hoc (100/999/1000/1500/9999).
- 280 `any` em projeto `strict: true`.
- Sem ESLint, mas com comentários `eslint-disable-next-line react-hooks/exhaustive-deps`.
- `vite.config.ts:9-11` — `host: '0.0.0.0'` + `allowedHosts: true` (desliga proteção anti
  DNS-rebinding).

### Arquitetura de IA

- Roteamento por substring: `apps/api/routers/chat.py:25-136` e
  `services/orchestration/graph.py:108-433`. `"ajuda"` classifica como conversa; `"ti"` casa dentro
  de "inteligência".
- Fallback silencioso de provedor: `hybrid_router.py:565-585`, `providers.py:747-761`
  (`except Exception` → modelo local 3B, inclusive para erros de código).
- Streaming descarta `delta.tool_calls`: `providers.py:515-520`.
- Custo só em RAM: `hybrid_router.py:269-287,322-327` — restart zera o orçamento.
- `last_stream_usage` no adapter compartilhado: `adapter.py:498` (streams concorrentes se
  sobrescrevem).
- Sem retry/backoff para 429/5xx.
- Cache de inferência nunca acerta: `model_manager.py:69-82` exige `temperature == 0`, call sites
  usam 0.2-0.7.

### Testes

Falhas no dashboard: `every registered tab has a canonical path and a shell renderer`,
`OpenBot Store full-screen layout integration in App.tsx`,
`workspace page distinguishes loading failures from an empty project list`.
Os E2E fabricam payloads (`01-login-chat.spec.ts:38` injeta `sources: []`), mascarando que o backend
não envia `sources`.

---

## 5. Código extenso

| Arquivo | Linhas | Observação |
| --- | --- | --- |
| `apps/mobile/lib/main.dart` | 2 331 | app inteira em um arquivo |
| `services/orchestration/graph.py` | 1 845 | `execute_or_delegate` = função única de ~1 150 linhas (`:566-1717`) |
| `services/project_workspace/scaffolder.py` | 3 802 | 26 templates embutidos como strings |
| `apps/dashboard/src/components/settings/SettingsView.tsx` | 2 490 | ~90 `useState`, 14 seções |
| `apps/dashboard/src/components/SkillsManagerView.tsx` | 2 049 | catálogo + modal + política + import |
| `services/memory/database.py` | 1 981 | 45+ métodos em uma classe |
| `services/coding_agent/tools.py` | 1 274 | 23 ferramentas + preview + auditoria |
| `services/autonomous_agent/runtime.py` | 1 287 | idem |
| `services/coding_agent/providers.py` | 1 085 | 3 provedores + resiliência + SSE |
| `agents/profiles/catalog.py` | 816 | 26 perfis com prompts inline |

## 6. Código morto e duplicado (~1 500 linhas)

`services/orchestration/heuristic_engine.py`, `services/orchestration/event_router.py` (nunca
despachado), `services/coding_agent/autonomous_loop.py` (sem chamadores; assinatura incompatível;
`rollback_git()` faz `git checkout -- .` e destrói trabalho não commitado),
`hybrid_router.record_cost` (nunca chamado), `MockAdapter`, 4 cópias de `resolve_model_name`,
2 `INTENT_DOMAIN_MAP` com valores diferentes (`workspace_actions.py:187` vs `prompt_builder.py`),
8 funções de API exportadas e nunca usadas no dashboard.

---

## 7. Plano de correção

### P0 — segurança

1. Autenticar o WebSocket do terminal (ou removê-lo).
2. `preview()` fail-closed para toda ferramenta com `requires_approval`.
3. Remover a senha default em instalações não configuradas; bind em `127.0.0.1` por padrão; CORS
   restrito a allowlist explícita.
4. Assinatura de webhook Telegram/Discord e remoção do Principal com `scopes={"*"}`.
5. `_require_owned_project` no DELETE e no dockerize do workspace.
6. Corrigir `.gitignore:77` e versionar `AgentRecommendationTable.tsx`.

### P1 — integridade do produto

7. Eliminar os caminhos de "sucesso fabricado" (C6/H11).
8. Corrigir `hardware.py:44-49` e o default `is_read_only=1`.
9. `num_ctx` explícito e compactação de histórico; elevar `max_tokens`.
10. Tabela única de modelos por provedor; remover IDs inventados.
11. Corrigir `\\n` → `\n` em `graph.py`.

### P2 — dívida que trava release

12. `ruff check .` e `ruff format --check .` verdes; corrigir os 3 testes do dashboard.
13. ESLint + `react-hooks/exhaustive-deps`; AuthContext único (hoje há 19 bootstraps de `/auth/me`).
14. Quebrar `execute_or_delegate`, `SettingsView`, `SkillsManagerView`, `main.dart`, `scaffolder`.
15. Fechar leaks de React, re-POST duplicado, acessibilidade do `Modal` e contraste WCAG.
16. `.env.example` real; alinhar `ALLOWLIST_WORKSPACE_ROOT` → `JARVIS_WORKSPACE_IMPORT_ROOTS`.
17. Purgar estruturas em memória e reduzir escrita por request.

---

## 8. Pontos corretos (verificados)

- `permission_engine.validate_path_access` bloqueia path traversal e audita a tentativa.
- `UserCredentialStore` usa PBKDF2-HMAC-SHA256 com 310 000 iterações e dummy-hash contra timing
  attack; desativação do último admin é impedida.
- Fluxo de aprovação do workspace calcula fingerprint do diff e consome a aprovação uma única vez
  (anti-replay); `approval_engine.approve_request` recusa autoaprovação por agente.
- `KeyVault` cifra com DPAPI no Windows e Fernet com keyfile restrito nos demais.
- `AuthMiddleware` é fail-closed para rotas não mapeadas; identidade sempre vem do servidor.
- Migrações SQLite com `schema_migrations` + `SAVEPOINT`.
- 509 testes de backend passam de fato.

---

## 9. Correções aplicadas nesta auditoria (P0 + gates)

> Os números de gates desta secção são os da data original (17/11). O estado final, com os P1
> fechados em 18/11, está na secção 11.

Todas as alterações abaixo foram verificadas com a suíte completa, `ruff check`, `ruff format
--check`, `tsc --noEmit` e `npm run build`.

### Segurança

| ID | Correção | Arquivos |
| --- | --- | --- |
| C1 | WebSocket do terminal passa a exigir credencial (cookie de sessão ou Bearer), recusa dispositivos e perfis sem `coding:use`, valida o projeto da conta, usa `create_subprocess_exec` (sem shell), com prazo de inatividade e auditoria de abertura/fecho/rejeição | `apps/api/routers/terminal.py` |
| C2 | `execute_command` incluído no `preview()` e os dois runtimes passam a ser **fail-closed**: ferramenta com `requires_approval` que não produza pré-visualização é bloqueada | `services/coding_agent/tools.py`, `services/coding_agent/runtime.py`, `services/autonomous_agent/runtime.py` |
| C3 | Senha `jarvishub` só existe em ambiente de desenvolvimento **declarado**; instalação sem `JARVIS_ENVIRONMENT` recebe senha aleatória em arquivo restrito; CORS deixa de aceitar intervalos privados com credenciais (passa a allowlist explícita); launcher liga-se a `127.0.0.1` por padrão e a LAN exige `--lan` | `apps/api/auth.py`, `apps/api/main.py`, `iniciar_jarvis.bat` |
| C4 | Webhooks Telegram/Discord exigem segredo partilhado e assinatura Ed25519 respectivamente, falham fechado (503) sem configuração e registam rejeições; o principal sintético de canal deixa de ter `scopes={"*"}` | `apps/api/routers/omnichannel.py`, `services/proactive_operations/omnichannel_gateway.py` |
| C5 | `DELETE /workspace/projects/{id}` e `POST .../dockerize` passam a exigir posse do projeto | `apps/api/routers/workspace.py` |
| H13 | `.gitignore` ancora `/models/` à raiz e `AgentRecommendationTable.tsx` foi versionado | `.gitignore`, `git add` |

### Produto e correção funcional

| ID | Correção | Arquivos |
| --- | --- | --- |
| H2 | "Aplicar otimizações de hardware" usa os `AgentRole` reais, separa papéis de raciocínio dos de código, preserva `is_read_only` do catálogo, sincroniza o `agent_registry` e devolve a lista de papéis alterados | `apps/api/routers/hardware.py`, `services/memory/database.py` |
| H5 | `\\n` literais substituídos por quebras de linha reais (prompt do Maestro, documento final da Mesa Redonda, prompt secundário e aviso de execução parcial) | `services/orchestration/graph.py` |
| H1 | `/api/v1/omnichannel/inbound` passa a ter regra RBAC explícita (`chat:use`) | `apps/api/auth.py` |
| — | Cabeçalho secundário e padding centralizados em `FULLSCREEN_TABS`/`NO_HEADER_TABS`, eliminando a condição triplicada e corrigindo o layout da Loja e dos Fluxos | `apps/dashboard/src/App.tsx` |
| — | Sidebar passa a listar Fluxos de Trabalho, Uso & Consumo e Loja (abas registadas mas inacessíveis no menu) | `apps/dashboard/src/components/Sidebar.tsx` |
| — | `/me` deixa de verificar a senha `jarvishub` por PBKDF2 em cada pedido; usa o marcador de senha provisória, limpo após a troca | `apps/api/routers/auth.py` |

### Gates de qualidade

| Gate | Antes | Depois |
| --- | --- | --- |
| `ruff check .` | 114 erros | 0 |
| `ruff format --check .` | 26 ficheiros por formatar | 0 |
| `pytest -q` | 509 passam | **515 passam** (6 testes novos de segurança) |
| `npm run test:dashboard` | 121/124 (3 falhas) | **124/124** |
| `tsc --noEmit` | limpo | limpo |
| `npm run build` | ok | ok (9,3 s) |

### Testes ajustados

- `tests/integration/test_terminal_ws.py` — reescrito: rejeita ligação anónima e cookie inválido;
  o ciclo autenticado usa sessão de administrador.
- `tests/integration/test_omnichannel.py` — assina pedidos com segredo/Ed25519, cobre assinatura
  ausente, corpo adulterado e ausência de configuração (503).
- `tests/integration/test_security_cve_and_sandbox.py` — **teste flaky corrigido**: o fixture
  "projeto seguro" (`requests==2.32.0`, `urllib3==2.1.0`) tem advisories reais no OSV, por isso
  o `pip-audit` online fazia `is_safe` oscilar conforme a conectividade do executor. O caminho
  online passou a ser explicitamente desativado, tornando o teste determinístico e de 12 s → 0,4 s.
- `apps/dashboard/scripts/workspace.test.mjs` e `store.test.mjs` — asserções alinhadas com a
  implementação atual (a mensagem de erro do workspace e o `activeTab === 'store'` do rail eram
  drift de teste, não regressões).

### Novos achados durante a correção

- **`CVEScannerService` depende de rede e de estado externo** (`services/security_core/cve_scanner.py:250-305`):
  `pip-audit` corre com `timeout=12` s. Quando falha, o relatório continua `completed` e `is_safe:
  true` — ou seja, **uma falha de rede produz um atestado de segurança silencioso**. Deve expor
  `scan_mode: "offline" | "authoritative"` e um aviso explícito no relatório.
- `tests/conftest.py` injeta um token de administrador em todas as chamadas `http://test` (exceto
  com `x-no-auth`), pelo que a suíte não exercita negações de RBAC para `developer`/`auditor`.

### Dívida conhecida que permanece (P1/P2)

Itens C6, H3, H4, H6, H7, H8, H9, H10, H11, H12 e todo o capítulo 4 continuavam em aberto nesta
data — em particular: dados fabricados no dashboard, gestão de janela de contexto, teto de 1024
tokens, IDs de modelo inexistentes, ferramentas declaradas sem implementação, injeção de comando
em `git_commit`, vazamento de conteúdo para auditoria, acessibilidade do `Modal` e o `.env.example`
com 13 variáveis mortas. **O estado atualizado está na secção 11.**

**Nota de teste:** `tests/conftest.py` injeta automaticamente um token de administrador em *todas*
as chamadas `http://test`, exceto quando o cabeçalho `x-no-auth` está presente. Por isso a suíte
existente não exercita negações de RBAC para os perfis `developer` e `auditor`; é uma lacuna de
cobertura a corrigir com um cliente autenticado por perfil.

---

## 10. P1 de frontend aplicado

| # | Item | Alteração |
| --- | --- | --- |
| 1 | CPU/RAM reais | `DynamicIsland` deixou de ter `{cpu:31, memory:33}` fixos; `App.tsx` passou a consultar `GET /system/resources` no mesmo ciclo de polling e a enviar `cpu_percent`/`ram_percent`. `UsageAnalyticsView` lia `hw.cpu_usage_pct`/`hw.memory_percent` (campos inexistentes) e passou a usar `fetchResources()`. `fetchResources` ganhou o tipo `SystemResourceUsage` em vez de `any` |
| 2 | Diagnóstico do Ollama | `SettingsView` chamava `GET /api/v1/models/catalog` (404). Passou a `GET /api/v1/models`, com mensagem que reporta modelos instalados e rota ativa |
| 3 | Loja duplicada | Existiam **duas** implementações da Loja: `components/store/AppStoreView.tsx` (609 linhas, `INITIAL_APPS` e `connected: true` fixos) e a Loja dentro de `SkillsManagerView` (com `jarvis_connected_apps` persistido e coberta por testes). A primeira foi **eliminada**; a rota `/store` passa a renderizar a implementação real |
| 4 | Task Manager | As 3 linhas hardcoded ("Resuma os processos seletivos…", "Northwind Traders", "arxiv.org") e os contadores `\|\| 1` foram removidos. O hub agrupa `tasks` reais em **Em andamento** / **Concluídas** com estado vazio explícito. A delegação deixou de inventar `task_<timestamp>` e executa `POST /api/v1/agents/{role}/task` com um dos 26 agentes reais (`ALL_26_AGENTS`), recarregando a lista. O botão de microfone sem `onClick` foi removido e o formulário fica desativado sem a permissão `agents:use` |
| 5 | Código morto | Removidos `Sidebar.tsx` (755), `chat/QuickPrompts.tsx` (204), `chat/ChatHeader.tsx` (123), `ui/index.tsx` (99) e `store/AppStoreView.tsx` (609) — **1 790 linhas**. `AgentRecommendationTable.tsx` (124) não foi removido: estava documentado no README e passou a ser **integrado** no `ModelManagerView` (usa `fetchAgentModelRecommendations`, já existente) |
| 6 | `useChatStream` | Adicionado cleanup no unmount: pára o `MediaRecorder`, aborta o `AbortController` e liberta microfone/`AudioContext`/VAD |
| 7 | Acessibilidade | `Modal` passou a ter `role="dialog"`, `aria-modal`, `aria-labelledby/describedby`, foco inicial, focus trap com Tab/Shift+Tab, restauração de foco, bloqueio de scroll com contador para modais empilhados e `aria-label` no fechar. `ChatMaster` ganhou `role="log"` + `aria-live="polite"`. `ChatInput` e os dois campos do Task Manager ganharam nome acessível |
| 8 | Links do modelo | `MarkdownMessage` valida o esquema do `href` (`http`, `https`, `mailto`); `javascript:`/`data:`/`file:` passam a ser mostrados como texto |
| 9 | Ctrl+K | Adicionadas as 3 abas em falta (Loja, Fluxos, Uso) à paleta de comandos |
| 10 | Contraste e CSS | `--text-muted` subiu de `#6b6963` (3,03:1) para `#8a877f` (4,6:1). Removidas as 9 classes mortas, duplicação de selector e o bloco `.jarvis-sidebar`. **`@keyframes fadeIn` foi reposto** — era usado por estilos inline (`Modal`, `ChatMaster`) e não por classe, pelo que a detecção automática o classificou como morto |

### Também corrigido neste ciclo

- `index.html`: `theme-color` alinhado com a paleta real, `color-scheme: dark`, `<noscript>`, ícone
  próprio; `@import` de fontes duplicado removido do CSS (era bloqueante).
- `manifest.json`: versão "4.0 Pro" → "3.0.1", descrição em UTF-8 correto, ícones `icon.svg` e
  `icon-maskable.svg` criados (antes apontava para `/vite.svg`, inexistente).
- `scripts/router.test.mjs` passou a validar o `PrimaryRail` em vez do `Sidebar` morto.
- `scripts/openbot-fase2.test.mjs`: o teste que exigia as 3 categorias fictícias do Task Manager foi
  substituído por asserções sobre o agrupamento real, o endpoint de delegação e a ausência de dados
  inventados.

### Estado dos gates após o P1 de frontend

| Gate | Antes | Depois |
| --- | --- | --- |
| `tsc --noEmit` | limpo | limpo |
| `npm run test:dashboard` | 124 | **125** (um teste novo, dois reescritos) |
| `npm run build` | ok | ok · sem chunk `AppStoreView` |
| Ficheiros TS/TSX | 108 | **103** |
| `<div onClick>` sem teclado | 38 | 35 |
| `<input>` sem nome acessível | 90 | **87** |
| `aria-live` | 1 | 2 |

### Dívida de frontend que permanece

- **87 `<input>` sem nome acessível** (maioria em `SettingsView`, `WebhooksModal`,
  `HybridGatewayConfig`, `KeyVaultManager`): o varrimento deve ser feito por componente, derivando
  `aria-label` do `placeholder` onde exista.
- **35 `<div onClick>`** convertidos para `<button>`/`role="button"` com `tabIndex` e `onKeyDown`.
- **19 bootstraps duplicados de `/auth/me`** → um único `AuthContext` com `can(permission)`.
- **Controlos de Settings sem efeito** — reduzido em 18/11: o falso "VACUUM" foi removido, os
  controlos de servidor/JWT/log passaram a somente leitura e as políticas de sandbox passaram a
  ser descritivas em vez de toggles falsos. Restam preferências locais por ligar (ver §11.4).
- **SSE sem reconexão** no `ServerLogsView` — corrigido em 18/11 (ver §11).
- **`fetchGitHistory`, `searchChatHistory`, `fetchResources`** (agora usado), `toggleNetworkIsolation`
  e `fetchCyberShieldStatus` continuam sem UI.

---

## 11. Fecho da auditoria (18/11/2026)

Esta secção fecha o ciclo de correção iniciado na auditoria de 17/11. Só são marcados como
corrigidos os itens com alteração de código e teste/gate reproduzível; o que não foi ligado ao
backend fica explicitamente na dívida (§11.4).

### 11.1 Matriz de fecho

| ID | Estado | Correção e evidência |
| --- | --- | --- |
| H4 | **Corrigido** | Teto de saída passou a `DEFAULT_OUTPUT_TOKENS=2048` / `MAX_OUTPUT_TOKENS=8192` também no `AgentRunConfig` do coding agent. O E2E 4 expôs a última cópia do limite de 1024 (`max_tokens=2048` rejeitado pela Pydantic); `services/coding_agent/types.py` passou a usar as constantes partilhadas e `tests/unit/test_coding_agent.py` cobre o orçamento de saída |
| H6 | **Corrigido** | `git_commit` deixou de usar shell: `WorkspaceService.run_git_command` recebe uma lista de argumentos e usa `create_subprocess_exec`/`subprocess.run`. Teste confirma que `$(...)` e backticks não são interpretados e que aspas legítimas são preservadas |
| H7 | **Corrigido** | `redaction.py` cobre `sk-proj-`, `sk-ant-`, `gsk_`, `AIza`, `AKIA`/`ASIA`, `github_pat_`, `ghp*`, JWT, Bearer, `xox*`, `hf_`, `sk_live_` e chaves privadas; `redact_data` usa limites de palavra (não mascara `keywords`/`monkey`). `AuditTrail` redige `reason`; `tools.py` redige `output_redacted`/`error`/`command` e usa `_audit_arguments_summary` (trunca corpos e redige segredos). A transcrição completa deixou de ser registada em `voice.py`. Coberto por `tests/security/test_security_core.py` e `tests/unit/test_coding_agent.py` |
| H8 | **Corrigido** | `provider_catalog.py` é a fonte única de provedores, `LOCAL_MODEL_NAMES` e `supports_sampling`. Anthropic usa `claude-haiku-5-5` por omissão; IDs legados são mapeados em `provider_defaults.py`; geração 5.x omite `temperature`. `AGENT_MODEL_RECOMMENDATIONS` cobre os 26 `AgentRole` reais e só referencia modelos locais conhecidos. Coberto por `tests/unit/test_provider_catalog.py` |
| H9 | **Corrigido** | As 20 ferramentas declaradas nos perfis existem no `CodingToolExecutor`; `delegate_agent`, `list_projects`, `request_approval` e `query_audit` já não são declaradas como ferramentas de código. Regressão em `tests/unit/test_coding_agent.py` |
| C6 | **Corrigido** | `AgentRegistry`, `SkillsCatalog` e `DatabaseManager` registam `logger.warning` quando falham na inicialização, em vez de falharem silenciosamente |
| H10 | **Corrigido** | `SettingsView` integra o `KeyVaultManager`; as chaves `jarvis_key_*` e os prompts de API key em `localStorage` foram removidos |
| H11 | **Corrigido na UI** | `UsageAnalyticsView` usa `/api/v1/system/inference-telemetry` (série diária, provedores, tokens e custos reais); `WorkflowCanvasView` deixou de simular execução com sucesso; `SettingsView` exporta diagnóstico real de `/api/v1/system/health/details`, o teste de Ollama usa `/api/v1/models`, e o falso "VACUUM" foi removido. O estado de atualização e a descoberta móvel deixaram de inventar valores |
| H12 | **Corrigido** | `ServerLogsView` usa telemetria real e reconecta o SSE com backoff exponencial (1 s→30 s); `fetchModelMetrics`/`/system/model-metrics` foram removidos. `useChatStream` deixou de reenviar o POST em erro de streaming, evitando tarefas duplicadas |
| UX-05 | **Corrigido** | `FileInfo.name`/`rel_path`, corrida RAF em `useChatStream`, bloqueio do `InitialPasswordChangeModal`, sobreposição da session pill e corrida de seleção de projeto. Fluxo E2E 4 isolado verde |
| H3 | **Em aberto** | O runtime autónomo já usa `resolve_num_ctx`, mas os loops ReAct do orquestrador continuam sem gestão explícita de janela de contexto |
| Acessibilidade | **Parcial** | Números da auditoria (87 `<input>` sem nome acessível, 35 `<div onClick>`, 19 bootstraps de `/auth/me`) não foram todos fechados neste ciclo |

### 11.2 Gates executados

| Gate | Resultado |
| --- | --- |
| `ruff check .` | 0 erros |
| `ruff format --check .` | 339 ficheiros formatados |
| `pytest -q` | **526 passed** em ~4 min (exit code 1 apenas pelo `PytestUnraisableExceptionWarning` de transportes asyncio fechados no PowerShell) |
| `npm run test:dashboard` | **125/125** |
| `tsc --noEmit` | limpo |
| `npm run build` | ok (7,8 s) |
| E2E Playwright | **5/5** em 16,6 s (login/chat, fontes, workspace/SQL, coding com aprovação, aprovação/diff/auditoria) |

### 11.3 Achados do E2E corrigidos neste ciclo

- **`AgentRunConfig.max_tokens` ainda limitava a 1024** apesar do H4: o fluxo 4 falhava com
  `Input should be less than or equal to 1024` ao receber 2048. Passou a usar as constantes
  partilhadas (`2048` por omissão, `8192` máximo).
- **`SettingsView` simulava um VACUUM** com `setTimeout` e uma notificação de sucesso. O botão foi
  removido; a UI mantém apenas o backup real (`POST /api/v1/system/backup`).
- **Descoberta móvel inventava `192.168.1.81`/`8000`** quando `/system/discovery` falhava. Passou a
  mostrar `—`/`INDISPONÍVEL` e a indicar que o pareamento por QR Code continua disponível.
- **Configuração do servidor parecia editável**: bind, porta, JWT, runtime e log level passaram a
  somente leitura, com aviso de que são definidos no arranque do backend.
- **Tab de atualizações afirmava estar sincronizada** sem verificar releases; passou a declarar o
  estado como não verificado.

### 11.4 Dívida remanescente (honesta)

- **H3**: gestão de janela de contexto nos loops ReAct do orquestrador.
- **Preferências locais de `SettingsView` ainda não ligadas**: notificações do sistema operativo,
  tema/contraste, Dynamic Island/Dock, comportamento do cliente desktop e canal de atualização.
  Estão rotuladas como locais/não aplicadas, mas não produzem efeito global.
- **Acessibilidade**: 87 `<input>` sem nome acessível, 35 `<div onClick>` e 19 bootstraps de
  `/auth/me` continuam por resolver.
- **Projetos externos importados** não são reidratados após reinício do backend (`_inventories` em
  memória); o E2E evita o 409 com estado limpo por execução, mas a persistência falta.
- **`CVEScannerService`**: uma falha de rede do `pip-audit` continua a produzir relatório
  `completed`/`is_safe: true`; falta expor `scan_mode` e um aviso explícito.
- **Cobertura RBAC**: `tests/conftest.py` injeta token de administrador em todas as chamadas
  `http://test`, pelo que as negações para `developer`/`auditor` não são exercitadas pela suíte.
- **`.env.example`** mantém variáveis mortas (13 à data da auditoria).
- **Rubrica de qualidade**: não houve nova pontuação humana neste ciclo. A referência oficial
  continua a ser a rubrica de 15/11 (`mean_review_score=4.68`, 390 notas); o run de 16/11 é
  evidência suplementar sem rubrica humana. Nenhuma meta de qualidade é declarada cumprida por
  este fecho.

### 11.5 Estado de entrega

- Sem commit e sem push, conforme pedido.
- Backend normal permanece em `127.0.0.1:8000`; o E2E usa backend isolado em `:8020`, Vite em
  `:3100` e fake Ollama em `:11435`, com dados temporários em `tmp/e2e`.
- `:8010` não foi usado.

