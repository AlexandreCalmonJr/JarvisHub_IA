# Arquitetura proposta da persistência definitiva

- Branch: `feature/postgresql-foundation`
- Estado: desenho técnico inicial; sem ativação PostgreSQL.
- Princípio central: preservar módulos existentes por meio de contratos/compatibilidade, migrando implementação de persistência por domínio.

## 1. Decisão arquitetural proposta

**PostgreSQL será a implementação principal futura; os módulos de negócio não devem depender diretamente de SQLAlchemy, psycopg ou sqlite3.**

A aplicação já possui um contrato legado síncrono importante: `DatabaseManager`. Vários routers e serviços o chamam de forma síncrona. Para reduzir o raio de mudança, a primeira implementação PostgreSQL deve manter uma fachada síncrona compatível e usar SQLAlchemy 2.x síncrono com driver psycopg 3.

Não converter toda a aplicação para async nesta migração. Uma conversão async generalizada alteraria dezenas de chamadas, runtimes e rotas, aumentando o risco de regressões sem ser requisito para adotar PostgreSQL. Um caminho assíncrono poderá ser avaliado depois, com métricas que justifiquem a mudança.

## 2. Camadas

```text
┌───────────────────────────────────────────────────────────────┐
│ API / Routers / Agents / Orchestration / Background services  │
│ contratos de serviço atuais; sem SQL e sem driver de banco     │
└──────────────────────────────┬────────────────────────────────┘
                               │
┌──────────────────────────────▼────────────────────────────────┐
│ Application services / compatibilidade                        │
│ DatabaseManager (fachada legada) + serviços por domínio       │
│ contratos: Projects, Tasks, Chat, Memory, Security, etc.       │
└──────────────────────────────┬────────────────────────────────┘
                               │
┌──────────────────────────────▼────────────────────────────────┐
│ Ports / Repositories / Unit of Work                            │
│ interfaces tipadas; transações explícitas; owner obrigatório   │
└──────────────────────────────┬────────────────────────────────┘
                               │
┌──────────────────────────────▼────────────────────────────────┐
│ Infrastructure                                                  │
│ SQLAlchemy 2.x | psycopg 3 | Alembic | pool | health checks     │
│ PostgreSQL 17 + pgvector + pg_stat_statements                  │
└───────────────────────────────────────────────────────────────┘
```

### 2.1 Application / compatibilidade

- Manter inicialmente `from services.memory import DatabaseManager` e os métodos públicos existentes.
- Fazer `DatabaseManager` atuar como fachada/adapter, delegando a repositórios por domínio.
- Não obrigar agentes, routers e serviços a importar modelos SQLAlchemy.
- Preservar os formatos de retorno atuais (`dict`, `list[dict]`, `bool`, IDs e strings) durante a primeira migração.
- Introduzir contratos tipados por domínio sem trocar todos os consumidores numa única entrega.

### 2.2 Ports e repositórios por domínio

| Port / repositório | Responsabilidade | Métodos legados absorvidos |
|---|---|---|
| `ProjectRepository` | projetos, propriedade e exportação | `register_project`, `get_project`, `list_projects`, `delete_project`, `export_project_data` |
| `TaskRepository` | tarefas e sessões | `save_task`, `get_task`, `list_tasks`, `get_session_tasks`, `delete_task`, `purge_old_tasks` |
| `ConversationRepository` | mensagens, histórico e exportação | `add_chat_message`, `list_chat_messages`, `list_chat_sessions`, `delete_session`, `clear_session_messages`, `search_chat_history`, `export_session_markdown` |
| `MemoryRepository` | memórias de projeto e agentes | `set_project_memory`, `list_project_memory`, `set_agent_memory`, `list_agent_memories`, `delete_agent_memory`, `clear_agent_memories` |
| `AgentConfigRepository` | configuração e rotas de agentes | `set_agent_config`, `get_agent_configs`, `set_agent_route`, `get_agent_route`, `list_agent_routes`, `delete_agent_route` |
| `UserSettingsRepository` | perfil, preferências e configurações pessoais | `get_user_profile`, `set_user_profile`, Ponytail e preferências pessoais após definição de escopo |
| `InferenceCacheRepository` | cache de inferência com isolamento definido | `get_cached_inference`, `set_cached_inference` |
| `SkillRepository` | skills privadas | `save_user_skill`, `list_user_skills`, `get_user_skill`, `delete_user_skill` |
| `KnowledgeRepository` | documentos, chunks e pesquisa | `insert_knowledge_chunks`, `list_knowledge_documents`, `delete_knowledge_document`, `search_knowledge_vault` |
| `ApprovalRepository` | solicitações e decisões | `save_approval`, `get_approval`, `list_approvals`, `consume_approved_approval`, `update_approval_decision` |
| `DeviceRepository` | registro e revogação de dispositivos | `save_device`, `get_device`, `get_device_by_token_hash`, `list_devices`, `revoke_device`, `update_device_last_seen`, `delete_revoked_devices` |
| `SessionRepository` | sessões humanas | `save_session`, `get_session`, `list_sessions`, `revoke_session`, `revoke_all_sessions_for_user`, `update_session_last_seen`, `purge_expired_sessions` |
| `AuditRepository` | trilha de auditoria | `save_audit_event`, `list_audit_events` |
| `TelemetryRepository` | métricas, seleção e feedback | métodos atuais de `SqliteTelemetryStore` |
| `IdentityRepository` | usuários e credenciais | operações atuais de `UserCredentialStore` |
| `AuthRateLimitRepository` | contagem atômica de tentativas | rate limiter de `AuthService` |
| `WebhookRepository` | estado de webhooks/notificações | SQL direto de `WebhookNotificationService` |
| `BackupService` | backup, restore e verificação | `create_database_backup` e `backup_restore.py` |

O agrupamento é lógico; os repositórios poderão ser implementados em lotes. Não é necessário criar 18 classes antes de existir uso. A separação serve para delimitar responsabilidade e testes.

### 2.3 Unit of Work e transações

- Criar uma unidade de trabalho por operação de aplicação/transação, não uma sessão SQLAlchemy global compartilhada.
- Repositórios recebem a sessão da unidade de trabalho; não criam engine/conexão a cada chamada.
- Uma transação deve abranger alterações que precisam ser atômicas (por exemplo, decisão/consumo de aprovação, gravação de mensagem e estado da tarefa quando aplicável).
- Leitura longa, exportação e processamento de IA não devem manter transação aberta.
- Nunca manter conexão de banco aberta durante chamada a modelo, rede, Docker ou ferramentas externas.

### 2.4 Infraestrutura

Estrutura-alvo sugerida:

```text
services/
└── database/
    ├── __init__.py
    ├── config.py
    ├── engine.py
    ├── session.py
    ├── base.py
    ├── unit_of_work.py
    ├── ports/
    │   ├── projects.py
    │   ├── tasks.py
    │   ├── conversations.py
    │   ├── memory.py
    │   ├── security.py
    │   └── telemetry.py
    ├── models/
    │   ├── identity.py
    │   ├── workspace.py
    │   ├── conversation.py
    │   ├── memory.py
    │   ├── security.py
    │   └── telemetry.py
    ├── repositories/
    │   ├── postgres/
    │   └── sqlite_legacy/
    ├── migrations/
    │   └── versions/
    ├── backup/
    ├── monitoring/
    └── tests/
        ├── contract/
        ├── integration/
        └── performance/
```

Alembic pode usar `services/database/migrations` como diretório versionado. A estrutura pode ser refinada sem mover agora o código SQLite existente.

## 3. Configuração e seleção de backend

Não reutilizar a seleção automática atual de `services/persistence/dual_engine.py` como mecanismo de produção sem revisão.

Problemas encontrados nesse protótipo:
- se PostgreSQL falha na inicialização, ele troca silenciosamente para SQLite;
- a criação do engine não comprova que o banco está alcançável;
- a execução SQL usa SQL textual genérico, sem adaptação suficiente de placeholders/dialetos;
- não há repositórios tipados nem migrações Alembic;
- o startup atual em `apps/api/deps.py` continua instanciando `DatabaseManager` SQLite diretamente; o dual engine não está integrado como substituto comprovado.

Configuração-alvo explícita:
- `JARVIS_DATABASE_BACKEND=sqlite|postgresql`;
- `JARVIS_DATABASE_URL` ou `DATABASE_URL` como segredo fornecido pelo ambiente;
- `JARVIS_DATABASE_POOL_SIZE`, `JARVIS_DATABASE_MAX_OVERFLOW`, `JARVIS_DATABASE_POOL_TIMEOUT` configuráveis;
- em modo PostgreSQL, falha de conexão/migração deve impedir startup (fail closed); **nunca fazer fallback silencioso para SQLite**;
- SQLite continua selecionável apenas enquanto adapter legado for necessário para desenvolvimento/rollback.

Não colocar senha real em `.env.example`, logs, testes ou commits.

## 4. Isolamento multi-tenant como regra de persistência

Cada operação privada deverá receber um contexto autenticado/escopo de tenant. Não confiar em `owner_user_id` vindo livremente do payload.

Classificação:
- `TENANT_SCOPED`: exige owner e aplica filtro no repositório;
- `GLOBAL_ADMIN`: somente com autorização administrativa explícita;
- `SYSTEM_MAINTENANCE`: limpeza/rotação, sem exposição em rotas de usuário;
- `SHARED_READONLY`: catálogo compartilhado explicitamente aprovado.

Regras:
1. Operações de leitura, update e delete de dados privados devem incluir owner no predicado SQL.
2. Ausência de owner em operação tenant-scoped deve gerar erro, nunca ampliar a consulta.
3. Usar FKs compostas quando apropriado, por exemplo `(owner_user_id, project_id)`, para impedir referências cruzadas.
4. Avaliar Row-Level Security do PostgreSQL como defesa adicional, não como substituto da autorização na aplicação. Se habilitada, definir contexto por transação e testar pool/reuso de conexões.
5. Separar funções administrativas globais de repositórios usados por requests.
6. Política explícita para registros legados com owner nulo: quarentena/atribuição validada, sem adivinhação.

## 5. Modelagem PostgreSQL

- IDs: manter IDs públicos existentes quando necessário; usar UUID para entidades novas quando fizer sentido. Evitar converter IDs sem requisito.
- Datas: normalizar timestamps para UTC e `TIMESTAMPTZ`.
- Booleanos: `BOOLEAN`, não inteiro.
- JSON: usar `JSONB` quando houver consultas/índices reais; manter `TEXT` para conteúdo opaco sem pesquisa estruturada.
- Dinheiro/custos: `NUMERIC` para valores financeiros que exigem precisão; métricas operacionais podem continuar `DOUBLE PRECISION` se a semântica justificar.
- Índices: projetar a partir das consultas observadas e `EXPLAIN (ANALYZE, BUFFERS)`; índices compostos devem começar pelos filtros de owner usados com frequência.
- Restrições: adicionar `NOT NULL`, `CHECK`, `UNIQUE` e FKs depois de classificar dados legados e validar limpeza.
- pgvector: extensão disponível na infraestrutura, mas adoção da coluna vetorial fica para etapa separada; não bloquear a primeira migração relacional.

## 6. Compatibilidade e migração incremental

Sequência segura:
1. Criar contratos de teste sobre o comportamento atual de `DatabaseManager`.
2. [Em andamento] Extrair os acessos SQL diretos de `project_memory.py`, `webhook_service.py` e `backup_restore.py` para repositórios/métodos públicos, mantendo SQLite. A primeira extração de memória, settings e backup já foi registrada; resta ampliar o padrão para os demais domínios.
3. Extrair telemetria, credenciais e rate limiter para interfaces próprias; manter os stores SQLite como implementação inicial.
4. Introduzir modelos SQLAlchemy e Alembic sem ativar PostgreSQL no runtime.
5. Implementar repositórios PostgreSQL por domínio.
6. Criar adapter `DatabaseManager` que preserva a API atual e delega aos repositórios.
7. Executar a mesma suíte de contrato contra SQLite e PostgreSQL.
8. Migrar cópias dos bancos, reconciliar contagens e validar isolamento.
9. Habilitar PostgreSQL por configuração explícita em ambiente de teste.
10. Só depois preparar janela de corte e rollback.

Não fazer dual-write por padrão. Para o primeiro corte, preferir snapshot consistente e janela controlada. Dual-write/CDC só se requisito formal exigir indisponibilidade quase zero e houver reconciliação idempotente.

## 7. Dependências

Já consta no `pyproject.toml`:
- `sqlalchemy>=2.0.35`;
- `aiosqlite>=0.20.0`.

Ainda não identificado no bloco de dependências consultado:
- `alembic`;
- driver PostgreSQL síncrono `psycopg[binary]`.

Adicionar as dependências em commit separado, com lock/ambiente de teste e verificação de compatibilidade, quando a implementação da infraestrutura começar. Não adicionar asyncpg apenas por estar citado no protótipo atual: a primeira estratégia proposta é síncrona para preservar contratos.

## 8. Estratégia de testes e observabilidade

- Contratos: mesma entrada/saída e mesmas regras de owner para os adapters SQLite e PostgreSQL.
- Integração: FKs, constraints, transações, rollback, concorrência e idempotência.
- Segurança: teste cruzado entre duas contas para cada repositório tenant-scoped.
- Migração: contagem por tabela, hashes/checagens de conteúdo, chaves órfãs, dados nulos e amostras de leitura.
- Performance: P50/P95/P99, throughput, pool wait, CPU, RAM, I/O, locks e erros.
- Observabilidade: `pg_stat_statements`, métricas de pool, health check de conexão e logs sem SQL com segredos/PII.
- Backup: dump/restore testado e ensaio de recuperação em ambiente isolado.

## 9. Critérios de aceitação antes do PostgreSQL ser o padrão

- Nenhum consumidor de negócio executa SQL SQLite diretamente.
- Nenhuma rota tenant-scoped omite owner.
- Suite de contrato passa nos dois adapters.
- Testes de isolamento não apresentam acesso cruzado.
- Migrações Alembic reproduzíveis do zero.
- Migração de dados com reconciliação 100%.
- Backup e restore demonstrados.
- Benchmark comparável executado e publicado.
- Startup PostgreSQL falha fechado quando o banco não está disponível.
- Rollback documentado e testado.

## 10. O que ainda não foi feito

Nenhum modelo SQLAlchemy foi criado, nenhuma dependência foi adicionada, nenhuma migração Alembic foi gerada e o runtime continua usando SQLite. Este documento fixa a direção proposta, sujeita à revisão dos contratos e ao fechamento do mapa de chamadas.


## 11. Primeira fatia implementada

A branch já contém uma primeira implementação da arquitetura, sem ativar PostgreSQL:
- Contratos `ProjectMemoryRepository` e `SettingsRepository`.
- Adapters SQLite que usam somente a API pública do `DatabaseManager`.
- Modelos SQLAlchemy iniciais para `Project`, `ProjectMemory` e `UserSetting`.
- `LayeredMemoryManager` e `WebhookNotificationService` migrados para os contratos de repositório.
- Backup SQLite delegado ao método público do `DatabaseManager`.
- Testes de contrato iniciais com isolamento de proprietário e compatibilidade da configuração global legada.

Ainda não há engine PostgreSQL, repositórios PostgreSQL, Alembic nem corte de runtime. A próxima fatia deve validar a suíte de contratos e extrair os demais módulos antes de ampliar o modelo relacional.


## 12. Segunda fatia implementada

Foram adicionados os contratos e adapters SQLite de identidade, rate limit e telemetria:

- `IdentityRepository` / `SqliteIdentityRepository`; `UserCredentialStore` conserva a API de autenticação e a política PBKDF2.
- `AuthRateLimitRepository` / `SqliteAuthRateLimitRepository`; `AuthService.check_rate_limit` conserva assinatura e fail-closed.
- `TelemetryRepository` / `SqliteTelemetryRepository`; o import histórico `SqliteTelemetryStore` continua disponível como alias.
- Modelos SQLAlchemy para identidade, tentativas de autenticação e telemetria.
- Testes de contrato de identidade e rate limit, além dos testes de telemetria existentes.

### Limites da fatia

O backend ativo continua SQLite. Ainda não foi criado o adapter PostgreSQL para estes contratos, não há conversão de esquema/dados, e os modelos SQLAlchemy ainda não são aplicados por Alembic. A compatibilidade será confirmada pela execução dos gates Python completos, incluindo os testes de autenticação e telemetria.


## 13. Primeiro adapter SQLAlchemy

Foi acrescentado `SqlAlchemyIdentityRepository`, que implementa o contrato de identidade usando uma `session_factory` injetada. A implementação:

- normaliza o identificador de utilizador em `username_normalized` para preservar unicidade sem distinção de maiúsculas/minúsculas;
- preserva os hashes PBKDF2 existentes, pois o hashing continua na fachada `UserCredentialStore`;
- traduz colisões de username para o erro de domínio já utilizado pela API;
- bloqueia as linhas dos administradores ativos durante a verificação do último administrador, protegendo contra desativações concorrentes;
- foi coberta por teste de contrato usando SQLAlchemy sobre SQLite, sem ligar o runtime ao novo adapter.

Este adapter ainda não foi validado contra uma instância PostgreSQL real e não é selecionado pelo arranque. A próxima etapa é aplicar o mesmo padrão ao rate limit e telemetria, depois criar testes de integração com PostgreSQL e Alembic antes de qualquer troca de backend.
