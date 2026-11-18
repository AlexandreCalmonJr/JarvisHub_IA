# Auditoria inicial de SQLite — migração para PostgreSQL

- **Branch:** `feature/postgresql-foundation`
- **Estado:** levantamento estático inicial; runtime permanece em SQLite
- **Data:** 2026-11-18
- **Objetivo:** inventariar os pontos de persistência SQLite antes de desenhar a migração. Este documento não declara a auditoria global encerrada nem autoriza corte de banco.

## 1. Resumo executivo

A aplicação não utiliza apenas `data/jarvis.db`. A leitura do código identificou **quatro arquivos SQLite independentes** e pelo menos **21 tabelas** distribuídas entre persistência funcional, telemetria, autenticação de utilizadores e proteção contra força bruta.

| Arquivo / armazenamento | Implementação | Finalidade | Tabelas identificadas |
|---|---|---|---:|
| `data/jarvis.db` | `services/memory/database.py::DatabaseManager` | Dados funcionais, memória, tarefas, projetos, aprovações, sessões, dispositivos, auditoria e cache | 16 |
| `data/telemetry.db` | `services/observability/telemetry_store.py::SqliteTelemetryStore` | Telemetria de inferência, decisões de seleção de modelo e feedback | 3 |
| `auth/users.sqlite3` | `services/security_core/auth_store.py::UserCredentialStore` | Credenciais e contas humanas | 1 tabela principal identificada (`human_users`) |
| `auth/rate_limits.sqlite3` | `apps/api/auth.py::AuthService` | Contagem persistente de tentativas de autenticação | 1 (`auth_attempts`) |

O administrador ainda utiliza `auth/admin.json`; tokens/bootstrap e outros estados também possuem arquivos próprios. Esses arquivos não são SQLite, mas devem permanecer no inventário de persistência e segurança. A migração não deve apagar nem converter esses arquivos por conveniência sem uma decisão arquitetural separada.

## 2. Pontos de inicialização e dependências

### 2.1 Composição da aplicação

Em `apps/api/deps.py`:
- `SqliteTelemetryStore(db_path=data_dir / "telemetry.db")` é instanciado separadamente.
- `DatabaseManager(db_path=data_dir / "jarvis.db")` é instanciado como persistência principal.
- O `DatabaseManager` é injetado no `ModelManager`, `SecurityCore`, `ProjectWorkspaceService`, `KnowledgeVaultService`, `HardwarePerformanceManager`, `WebhookNotificationService`, `EngineeringIntelligenceService`, `JarvisMaster`, `CodingAgentRuntime`, `ChatAgentRuntime` e `AutonomousAgentRuntime`, entre outros.
- O `ModelManager` recebe também o `SqliteTelemetryStore`.

**Implicação:** a substituição precisa preservar contratos usados por vários serviços. Não é seguro trocar apenas a classe de conexão nem reescrever somente o módulo de memória.

### 2.2 Autenticação

Em `apps/api/auth.py`:
- `AuthService` instancia `UserCredentialStore(auth/users.sqlite3)`.
- O rate limiter abre `auth/rate_limits.sqlite3` diretamente com `sqlite3.connect`.
- O rate limiter executa `BEGIN IMMEDIATE`, limpeza por janela temporal, contagem e inserção de tentativas. A operação é deliberadamente fail-closed: erro no armazenamento bloqueia novas tentativas.

Em `services/security_core/auth_store.py`, `UserCredentialStore` executa SQL SQLite diretamente e contém migração de esquema de `human_users`. A migração de credenciais merece plano próprio, testes de hash/verificação de senha, integridade de unicidade e recuperação.

## 3. Inventário de tabelas do banco principal

Fonte: `services/memory/database.py`.

1. `user_settings` — preferências/perfil; a chave é derivada com hash do proprietário em `_account_setting_key`.
2. `inference_cache` — cache de inferência, atualmente identificado por `prompt_hash` global.
3. `projects` — projetos e caminhos locais; recebe `owner_user_id) na migração de propriedade.
4. `tasks` — tarefas e estado JSON; recebe `owner_user_id`.
5. `chat_messages` — mensagens e chamadas de ferramentas; recebe `owner_user_id`; chave numérica autoincremental.
6. `approvals` — aprovações; recebe `owner_user_id`.
7. `project_memory` — memória de projeto; recebe `owner_user_id`.
8. `agent_memories` — memória de agentes; recebe `owner_user_id` e índices de unicidade parciais para separar registros legados sem proprietário dos registros privados.
9. `agent_configs` — configuração por papel de agente; atualmente global por `role`.
10. `agent_route_assignments` — atribuições por `owner_user_id` e papel.
11. `user_skills` — skills criadas/importadas; recebe `owner_user_id`.
12. `knowledge_vault` — chunks/documentos; recebe `owner_user_id`.
13. `mobile_devices` — dispositivos; recebe `owner_user_id` na migração versão 3.
14. `user_sessions` — sessões humanas, ligadas a `user_id`.
15. `audit_events` — eventos de auditoria; contém `user_id` e `project_id`.
16. `schema_migrations` — histórico de migrações interno do SQLite.

Migrações SQLite existentes:
- v1: adiciona `owner_user_id` às tabelas privadas e índices por proprietário.
- v2: reconstrói `agent_memories` para separar unicidade global legada da unicidade por conta.
- v3: adiciona `owner_user_id` aos dispositivos.

Essas migrações próprias devem ser substituídas por migrações versionadas do Alembic no destino, preservando o histórico e os dados. Não se deve converter automaticamente os números 1–3 em versões Alembic sem validar o estado real de cada instalação.

## 4. Inventário de telemetria

Fonte: `services/observability/telemetry_store.py`.

Tabelas:
- `inference_telemetry` — métricas operacionais de inferência.
- `model_selection_decisions` — decisões de seleção de modelo/provedor.
- `inference_quality_feedback` — avaliação humana por inferência.

O módulo usa `? ` como placeholder, `sqlite3.Row`, `PRAGMA table_info`, `ON CONFLICT`, `threading.RLock` e transações explícitas. Os métodos de consulta exigem `owner_user_id` e filtram a conta. A implementação PostgreSQL deverá preservar o escopo por proprietário e a relação entre feedback e inferência; avaliar chaves estrangeiras e índices compostos no novo esquema.

## 5. Incompatibilidades SQLite que precisam ser mapeadas

A camada principal e os armazenamentos auxiliares utilizam recursos específicos:
- `sqlite3.Connection`, `sqlite3.Row`, `sqlite3.connect` e context managers de conexão.
- Placeholders posicionais `?`.
- `PRAGMA foreign_keys`, `journal_mode=WAL`, `synchronous`, `busy_timeout`, `cache_size`, `mmap_size`, `temp_store` e `table_info`.
- `executescript`, `INSERT OR IGNORE`, `INSERT OR REPLACE` (verificar ocorrências no restante do código), `AUTOINCREMENT`, `sqlite_master`, `lastrowid` (verificar ocorrências), `datetime('now')` e índices parciais.
- JSON atualmente armazenado em colunas `TEXT` com serialização manual.
- Uso de `BEGIN IMMEDIATE` no rate limiter.

A estratégia SQLAlchemy/Alembic deverá decidir explicitamente tipos PostgreSQL, JSON/JSONB, geração de IDs, tratamento de conflito, placeholders, transações, pooling e concorrência. Não fazer substituição textual em massa.

## 6. Riscos e decisões que precisam de validação

### P0 — isolamento e autenticação
1. **Escopo opcional em APIs do DatabaseManager:** vários métodos aceitam `owner_user_id=None`; em alguns casos, ausência do proprietário remove o filtro e permite consulta/alteração global. Antes do corte, classificar cada chamada como administrativa ou pertencente a usuário e tornar o comportamento explícito.
2. **Dispositivos:** `mobile_devices` já possui `owner_user_id`, mas métodos como `get_device`, `get_device_by_token_hash`, `list_devices` e operações de revogação não recebem proprietário. Confirmar se são operações exclusivamente internas/admin e reforçar os testes de autorização.
3. **Sessões:** `user_sessions` guarda `user_id`; operações administrativas de listagem/revogação precisam ser separadas das operações de sessão individual e protegidas.
4. **Credenciais:** `users.sqlite3` é outro armazenamento de autenticação. Não migrar usuários sem preservar hash de senha, normalização de username, unicidade, papéis e política de último administrador.
5. **Rate limit:** não enfraquecer a garantia fail-closed nem a atomicidade concorrente do contador ao migrar `BEGIN IMMEDIATE` para transações PostgreSQL.
6. **Dados legados sem owner:** as migrações atuais deixam linhas com `owner_user_id=NULL`. Criar política explícita de quarentena/atribuição; nunca atribuir esses dados a uma conta por suposição.

### P1 — integridade e modelo
1. `inference_cache` usa `prompt_hash` como chave global. Verificar se prompts/respostas podem conter contexto privado e se o cache deve ser isolado por usuário/modelo/provedor.
2. `agent_configs` é global por papel, enquanto `agent_route_assignments` é por conta. Confirmar quais configurações devem ser globais e quais devem ser privadas.
3. `user_settings` usa hash do proprietário embutido na chave; avaliar migração para colunas `owner_user_id` e `setting_key` com constraint única.
4. `audit_events.user_id` e `user_sessions.user_id` devem referenciar uma identidade estável; definir política de FK e exclusão de contas.
5. Verificar FKs ausentes ou incompletas entre tarefas, mensagens, aprovações, telemetria, dispositivos e contas.

### P1 — operação e compatibilidade
1. Backup atual `services/memory/backup_restore.py` usa a API nativa de backup SQLite; PostgreSQL precisa de estratégia independente de dump/restore, teste de recuperação e retenção.
2. Os quatro arquivos SQLite podem ter políticas de backup e ciclo de vida diferentes. Fazer inventário de volume, número de linhas e tamanho real antes de escolher janela de corte.
3. O benchmark existente `scripts/benchmark_sqlite.py` mede um microbenchmark SQLite isolado; não compara PostgreSQL nem representa os fluxos reais da API.
4. `docs/adr/0002-sqlite-wal-and-pragmas-concurrency.md` documenta decisão histórica de manter SQLite local. A decisão deverá ser atualizada formalmente quando a nova arquitetura for validada.

## 7. Plano de continuidade da auditoria

Antes de implementar a camada PostgreSQL:
1. Fazer busca exaustiva no repositório por `sqlite3`, `aiosqlite`, `sqlite://`, `sqlite_master`, arquivos `.db/.sqlite`, `PRAGMA`, `BEGIN IMMEDIATE` e SQL direto; classificar cada ocorrência por módulo e criticidade.
2. Mapear cada método público do `DatabaseManager` aos seus consumidores e identificar quais chamadas omitem `owner_user_id`.
3. Ler e documentar o esquema completo de `UserCredentialStore`, rate limiter e arquivos auxiliares de autenticação.
4. Inventariar testes existentes por domínio e criar matriz de paridade SQLite/PostgreSQL.
5. Medir, em cópia local e sem alterar dados reais, contagem de linhas, tamanho, integridade, índices e versões de esquema dos quatro arquivos.
6. Só então fechar o desenho de modelos SQLAlchemy, repositórios, transações e migrações Alembic.

## 8. Critérios para encerrar a Fase 1

- [ ] Todas as ocorrências de SQLite no repositório classificadas.
- [ ] Todos os bancos/arquivos persistentes e seus donos documentados.
- [ ] Todos os consumidores e contratos do `DatabaseManager` mapeados.
- [ ] Política de isolamento e dados legados sem proprietário aprovada.
- [ ] Esquema de autenticação e rate limit documentado.
- [ ] Inventário de testes e plano de migração de dados aprovado.

**Conclusão desta entrega:** a inspeção confirmou que a migração é transversal e envolve quatro armazenamentos SQLite. O levantamento estático inicial já encontrou pontos de atenção relevantes em isolamento de dispositivos/sessões, credenciais e rate limiting. A auditoria continua aberta até completar a busca integral e o mapeamento de chamadas. Nenhum banco foi iniciado, modificado, migrado ou removido nesta etapa.
