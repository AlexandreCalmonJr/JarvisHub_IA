# Matriz de compatibilidade — Frontend_JarvisHub × FastAPI

Branch de auditoria: `integration/frontend-unification`.

## Critério de classificação

- **Rota existente**: método/caminho equivalente encontrado nos decorators FastAPI inspecionados. Ainda requer validar schema, status codes e semântica com testes.
- **Parcial / contrato divergente**: existe domínio ou rota próxima, mas faltam operações ou a forma de chamada/payload não coincide.
- **Ausente no FastAPI**: não foi encontrada rota equivalente nos routers registrados em `apps/api/main.py`. A funcionalidade não deve ser ligada a uma resposta simulada nem depender do Express antigo.
- **Não é endpoint de backend**: lógica visual, PWA ou estado transitório de interface.

A análise cobre os 18 módulos de serviço TypeScript do frontend de origem, as rotas de autenticação observadas no AuthGate e os decorators dos routers FastAPI registrados. Chamadas construídas dinamicamente e operações indiretas precisam de confirmação adicional durante a migração.

## Resultado executivo

O backend já oferece uma base sólida para os principais domínios (chat, workspace, agentes, modelos, skills, conhecimento, segurança, coding, studios, sistema, hardware, voz, mobile pairing e autenticação). A compatibilidade, porém, não é integral.

Os maiores blocos sem correspondência direta são Brain/Brain Server, integrações, orquestração visual/workflows, IDE assistida, Companion/Push e várias operações avançadas de gestão de agentes/modelos. Algumas rotas de origem apontam para caminhos antigos ou métodos diferentes dos publicados pelo FastAPI.

## Matriz por domínio

| Serviço no frontend de origem | Chamadas/recursos identificados | Estado no FastAPI | Observação / ação |
|---|---|---|---|
| Chat | `/chat`, `/chat/stream`, sessões, pesquisa, exportação, tarefas, purge, transcrição | **Rota existente / contrato a validar** | Chat SSE, sessões, export e tasks existem. Comparar método e payload de purge; validar SSE completo e transcrição. |
| Workspace | projetos, ficheiros, importação, memória, Git history, abrir pasta/código, webhooks | **Maioritariamente existente** | Rotas de projeto/file/memory/import/open-root/git-history e webhooks existem. Confirmar chamadas para file write e open-folder e contrato de aprovação. |
| Models | catálogo, hybrid config/test, Hugging Face, recomendações, hardware, providers, arena, vault | **Parcial** | Catálogo, hybrid config/test, Hugging Face, recomendações e vault base existem. Não foram encontradas rotas `/models/hardware`, `/models/providers`, `/models/recommendations/apply`, `/models/arena`; vault tem divergência em update/scope. |
| Hardware | hardware profile, otimizações, performance mode | **Existente** | Rotas `/system/hardware-profile`, `/system/apply-hardware-optimizations` e `/hardware/performance-mode` existem. |
| Agents | catálogo, detalhes, config, skills, versões/rollback, agent routes, memories, playground, tools, task/stream | **Parcial** | GET catálogo/detalhe, PUT config, memories, playground, tools, agent routes, stream/task/history existem. Não foram encontradas rotas para criar/remover agente, vincular skills, listar versões e rollback. |
| Skills | catálogo, toggle, assign agents, Ponytail, create, delete, ECC import | **Rota existente** | Rotas equivalentes encontradas em `skills.py`; validar schemas e permissões por operação. |
| Knowledge | documents, upload, index folder/text, search, delete | **Rota existente** | Todas as famílias de rota foram encontradas. Validar upload e indexação com isolamento por proprietário. |
| Security | approvals, decide, kill switch, shield, isolation, CVE, red-team, policy | **Maioritariamente existente** | Rotas principais existem. Recursos de Sentinel e permissions matrix do módulo Phase 5 não foram encontrados nos decorators analisados. |
| Studios | mock server, SQL playground, backend studio, quality studio, design studio, executive intelligence | **Maioritariamente existente** | Rotas para mock server, SQL, QA, design e relatórios executivos existem. Verificar os caminhos dinâmicos usados pelo serviço e os contratos de artefactos. |
| System | health, resources, logs, backup, telemetry, feedback, profile, webhooks | **Rota existente** | Rotas equivalentes encontradas; validar stream de logs e payloads de telemetria. |
| Coding | tools, MCP reload, coding session messages, approvals, run stream | **Rota existente / contrato a validar** | Rotas equivalentes existem. Confirmar se o frontend chama `/coding/tools` ou o endpoint publicado `/tools`; manter o caminho canónico do FastAPI. |
| Profile | `/user/profile` | **Rota existente** | Perfil usa principal autenticado e proprietário resolvido no servidor. |
| Brain | memórias, distilação, settings, federation, relay, asset sharing | **Ausente** | Não existe router Brain incluído no `main.py` analisado. Criar serviço/rotas FastAPI antes de ligar UI. |
| Brain Server | perfis, export/import, backup, bundles, workspaces, Python lanes, MCP servers | **Ausente** | Não existe router Brain Server registado. Exige desenho de segurança e persistência, não copiar estado global do Express. |
| Integrations | catálogo, providers, GitHub inspect/import, Figma sync, context sets | **Ausente / parcial** | Não foi encontrado router `integrations` no `main.py`; há capacidades MCP e GitHub em outros domínios, mas não substituem automaticamente estes contratos. |
| Orchestration | office state, roundtable, workflows CRUD/generate/run, artifact generation | **Ausente / parcial** | Não foram encontradas rotas dedicadas `/office`, `/workflows` e `/artifacts`. Há agentes e teammates, mas não são paridade de workflows. |
| Security Phase 5 | IDE workspace/propose/apply/checkpoints, permissions matrix, Sentinel | **Parcial** | Algumas capacidades de segurança existem, mas não foram encontradas as rotas `/ide/*`, `/security/permissions-matrix` e `/security/sentinel/*`. |
| Companion Phase 6 | voice briefing/converse, push config/test, companion state/pair/commands/script | **Parcial** | Voz oferece transcribe/synthesize/command e mobile pairing existe; briefing/converse, push e companion command lifecycle não foram encontrados. |
| AuthGate de origem | password login, bootstrap, me, logout, users, change password, profiles, personal registration, Firebase session, mobile pair | **Parcial** | Login/bootstrap/me/logout/users/password change/mobile pair existem. `/auth/profiles`, `/auth/register-personal` e `/auth/firebase-session` não foram encontrados. Não migrar esses fluxos como se fossem suportados. |

## Decisões de adaptação de autenticação/sessão

1. O FastAPI mantém a autoridade de autenticação e autorização.
2. Login web usa `POST /api/v1/auth/password-login`; primeiro acesso usa `POST /api/v1/auth/bootstrap/exchange`.
3. A sessão web é mantida pelo cookie `jarvis_session` com `HttpOnly`, `SameSite=Strict` e `Secure` quando HTTPS.
4. `GET /api/v1/auth/me` valida a sessão e devolve identidade/permissões. `POST /api/v1/auth/logout` revoga a sessão e limpa o cookie.
5. O navegador não deve persistir `session_id` em localStorage/sessionStorage, nem enviar `X-Jarvis-Session`. A resposta de login web não inclui `session_token`; isso é intencional.
6. Fluxos de Google/Firebase e registo pessoal não serão ativados até existir uma implementação FastAPI com validação de identidade, política de conta, rate limit, auditoria e testes.
7. A troca de palavra-passe usa `POST /api/v1/auth/password/change`, com palavra-passe atual e nova palavra-passe.

## Migração já iniciada nesta branch

- Criado transporte central `apiFetch` em `apps/dashboard/src/services/api/client.ts`, com credenciais same-origin e cookie de sessão.
- Migrados os serviços `chat`, `agents`, `models` e `workspace` para o transporte central.
- Migrado o `AuthGate` do dashboard para usar o mesmo transporte.
- Adicionado `scripts/api-session.test.mjs` e script `test:api-session`; o teste está incluído no `test:dashboard`.
- Não foi introduzido token em Web Storage nem cabeçalho de sessão próprio.

## Limitações e próximos lotes

1. Confirmar o resultado do CI após os commits de transporte.
2. Criar testes de contrato por domínio com schemas e métodos, começando por Auth, Chat e Agents.
3. Corrigir os caminhos divergentes de coding e models, com teste antes de alterar comportamento.
4. Migrar visualmente os componentes que ainda só existem no frontend de origem, em pequenos lotes; as telas já existentes no dashboard não serão copiadas por cima sem comparação.
5. Implementar no FastAPI os domínios ausentes (Brain, Integrations, Orchestration/Workflows, IDE/Sentinel e Companion) por contratos versionados, persistência por conta, autorização e auditoria.
6. Remover Express somente depois da paridade e homologação.

## Limite desta auditoria

A matriz é uma comparação estática de chamadas e rotas declaradas, não uma prova de execução end-to-end. Compatibilidade real exige validar schemas, parâmetros, métodos, permissões, códigos HTTP, streaming, dados por conta e resultados de testes. Nenhuma rota marcada como existente deve ser considerada homologada apenas pela presença do decorator.
