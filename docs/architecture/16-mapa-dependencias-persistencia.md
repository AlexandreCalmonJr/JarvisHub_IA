# Mapa de dependências da persistência — SQLite → PostgreSQL

- Branch: `feature/postgresql-foundation`
- Escopo: leitura estática dos consumidores do `DatabaseManager`, telemetria e armazenamentos auxiliares.
- Situação: mapeamento inicial consolidado; requer confirmação por testes e revisão de chamadas indiretas/reflection.
- Regra: manter contratos públicos e comportamento atual até existir adapter validado.

## 1. Visão geral

O `DatabaseManager` é uma fachada síncrona de persistência usada por rotas FastAPI, runtimes de agentes e serviços internos. Além dele, existem consumidores que abrem conexão SQLite diretamente e armazenamentos SQLite independentes.

### Fluxo atual resumido

```text
FastAPI routers ───────────────┐
Agent runtimes ────────────────┤
Orchestration ─────────────────┤
SecurityCore ──────────────────┼──> DatabaseManager ──> sqlite3 ──> data/jarvis.db
Knowledge/Hardware/Workspace ──┘           │
                                           ├── project_memory.py (SQL direto)
                                           └── webhook_service.py (SQL direto)

ModelManager ──> SqliteTelemetryStore ──> sqlite3 ──> data/telemetry.db
AuthService ──> UserCredentialStore ────> sqlite3 ──> auth/users.sqlite3
AuthService ──> rate limiter SQL direto ─> sqlite3 ──> auth/rate_limits.sqlite3
```

## 2. Matriz método → consumidores

As referências abaixo foram localizadas na branch auditada. “Sem chamada direta localizada” não significa que o método seja dispensável: pode existir uso dinâmico, CLI, teste ou chamada indireta não capturada pela busca estática.

| Método do DatabaseManager | Consumidores localizados | Observação de migração |
|---|---|---|
| `register_project` | `apps/api/routers/workspace.py`; `services/orchestration/master.py` | Exigir proprietário em operações de usuário. |
| `get_project` | routers `agents`, `chat`, `coding`, `security`, `workspace`; `services/project_workspace/workspace_service.py` | Há chamada sem owner no router workspace e no serviço de workspace. |
| `list_projects` | routers `knowledge`, `workspace` | Owner é passado nos pontos identificados. |
| `list_all_projects` | `services/project_workspace/workspace_service.py` | Consulta global; classificar como admin ou substituir por consulta com escopo. |
| `delete_project` | `services/project_workspace/workspace_service.py` | Exclusão sem owner; risco de apagar projeto de outra conta se serviço não validar autorização antes. |
| `save_task` | router `chat` | Escrita vinculada ao owner recebido pela rota. |
| `get_task` | Sem chamada direta localizada | Verificar CLI/testes e manter contrato até prova de não uso. |
| `list_tasks` | router `chat` | Owner informado. |
| `list_chat_sessions` | router `chat` | Owner informado. |
| `get_session_tasks` | router `chat` | Owner informado nos fluxos de exportação/listagem. |
| `delete_session` | router `chat` | Owner informado. |
| `add_chat_message` | routers `chat`, `coding` via runtime; `services/autonomous_agent/runtime.py`; `services/coding_agent/runtime.py` | Garantir owner obrigatório para mensagens privadas. |
| `list_chat_messages` | routers `agents`, `chat`, `coding`; runtimes autonomous e coding | Owner passado nos fluxos identificados. |
| `clear_session_messages` | router `coding` | Owner informado. |
| `search_chat_history` | router `chat` | Owner informado. |
| `export_session_markdown` | router `chat` | Owner informado. |
| `purge_old_tasks` | router `chat` | Confirmar que a limpeza só atinge o proprietário ou política administrativa esperada. |
| `delete_task` | router `chat` | Owner informado. |
| `export_project_data` | Sem chamada direta localizada | Preservar até verificar CLI/testes e exportações administrativas. |
| `set_project_memory` | router `workspace` | Owner informado. |
| `list_project_memory` | router `workspace` | Owner informado. |
| `set_agent_memory` | router `agents` | Owner informado. |
| `list_agent_memories` | router `agents`; `services/autonomous_agent/runtime.py` | Owner informado nos consumidores localizados. |
| `delete_agent_memory` | router `agents` | Owner informado. |
| `clear_agent_memories` | Sem chamada direta localizada | Rever se é operação administrativa/por conta. |
| `set_agent_config` | routers `agents`, `hardware` | Atualmente configuração global por papel; definir se global ou por tenant. |
| `get_agent_configs` | `apps/api/deps.py` durante inicialização | Configuração global carregada no bootstrap. |
| `set_agent_route` | router `agents` | Owner informado. |
| `get_agent_route` | Sem chamada direta localizada na busca de consumidores | Verificar roteador/runtime e manter contrato. |
| `list_agent_routes` | router `agents` | Owner informado. |
| `delete_agent_route` | router `agents` | Owner informado. |
| `get_user_profile` | router `system` | Usa subject autenticado como owner. |
| `set_user_profile` | router `system` | Usa subject autenticado como owner. |
| `get_cached_inference` | `services/model_runtime/model_manager.py` | Cache atual usa hash de prompt; avaliar vazamento entre tenants/contextos. |
| `set_cached_inference` | `services/model_runtime/model_manager.py` | Mesma decisão de escopo do cache. |
| `create_database_backup` | router `system` | Implementação atual depende de backup SQLite; substituir por serviço específico de backup PostgreSQL. |
| `get_ponytail_level` | router `skills` | Configuração global atual; confirmar se deve ser global ou por conta. |
| `set_ponytail_level` | router `skills` | Mesma decisão de escopo. |
| `get_hardware_performance_config` | `services/hardware/performance_manager.py` | Configuração local/global; não é dado naturalmente multi-tenant sem decisão. |
| `set_hardware_performance_config` | `services/hardware/performance_manager.py` | Idem. |
| `save_user_skill` | router `skills` | Owner informado. |
| `list_user_skills` | router `skills` | Owner informado. |
| `get_user_skill` | router `skills` | Owner informado. |
| `delete_user_skill` | router `skills` | Owner informado. |
| `insert_knowledge_chunks` | `services/knowledge/knowledge_vault.py` | Owner é encaminhado pelo serviço; verificar todos os pontos de ingestão. |
| `list_knowledge_documents` | `services/knowledge/knowledge_vault.py` | Owner encaminhado. |
| `delete_knowledge_document` | `services/knowledge/knowledge_vault.py` | Owner encaminhado. |
| `search_knowledge_vault` | `services/knowledge/knowledge_vault.py` | Owner deve ser obrigatório para consulta de conteúdo privado. |
| `save_approval` | `services/security_core/approval_engine.py` | Owner armazenado no pedido. |
| `get_approval` | `services/security_core/approval_engine.py` | Método aceita owner opcional; revisar chamadas administrativas. |
| `list_approvals` | `services/security_core/approval_engine.py` | Carregamento inicial sem owner; requer política explícita. |
| `consume_approved_approval` | `services/security_core/approval_engine.py` | Owner encaminhado no consumo. |
| `update_approval_decision` | `services/security_core/approval_engine.py` | Owner/decisão devem permanecer na mesma transação. |
| `save_device` | `services/security_core/device_auth.py` | Persistência de dispositivo; owner existe no registro. |
| `get_device` | `services/security_core/device_auth.py` | Busca por ID sem owner; restringir a serviço interno e validar associação. |
| `get_device_by_token_hash` | `services/security_core/device_auth.py` | Busca por hash; manter segredo/token fora de logs e limitar exposição. |
| `list_devices` | `services/security_core/device_auth.py` | Lista global para hidratação do serviço; proteger como operação interna/admin. |
| `revoke_device` | `services/security_core/device_auth.py` | Revogação por ID sem owner explícito. |
| `update_device_last_seen` | `services/security_core/device_auth.py` | Atualização por ID; confirmar associação antes da escrita. |
| `delete_revoked_devices` | `services/security_core/device_auth.py` | Limpeza global, somente manutenção/admin. |
| `save_session` | `services/security_core/session_manager.py` | Sessão associada a user_id. |
| `get_session` | `services/security_core/session_manager.py` | Validar que a sessão pertence ao subject autenticado. |
| `list_sessions` | `services/security_core/session_manager.py` | Hidratação inicial global; operação interna. |
| `revoke_session` | `services/security_core/session_manager.py` | Revogação por ID; validar dono no fluxo HTTP. |
| `revoke_all_sessions_for_user` | `services/security_core/session_manager.py` | Operação administrativa sobre user_id. |
| `update_session_last_seen` | `services/security_core/session_manager.py` | Atualização por ID depois da validação da sessão. |
| `purge_expired_sessions` | `services/security_core/session_manager.py` | Limpeza global de manutenção. |
| `save_audit_event` | `services/security_core/audit_trail.py` | Evento deve manter actor/owner e integridade temporal. |
| `list_audit_events` | Sem chamada direta localizada | Verificar endpoints/admin/CLI antes de remover ou redesenhar. |

## 3. Consumidores fora da fachada

Estes módulos precisam ser migrados para repositórios/serviços próprios. Não podem continuar recebendo uma conexão SQLAlchemy e executando SQL SQLite por conta própria.

| Módulo | Acesso atual | Responsabilidade | Destino |
|---|---|---|---|
| `services/memory/project_memory.py` | `ProjectMemoryRepository` → API pública do `DatabaseManager` (extraído nesta etapa) | Memória de projeto | Adapter PostgreSQL do `ProjectMemoryRepository` |
| `services/proactive_operations/webhook_service.py` | `SettingsRepository` → API pública do `DatabaseManager` (extraído nesta etapa) | Persistência de webhooks/notificações | Adapter PostgreSQL de settings/webhooks |
| `services/memory/backup_restore.py` | Métodos públicos `create_database_backup` e `restore_database_backup` (extraído nesta etapa) | Backup/restore SQLite legado | `BackupService` por backend |
| `services/security_core/auth_store.py` | `sqlite3.connect` independente | Contas e hashes de senha | `UserIdentityRepository` |
| `apps/api/auth.py` | `sqlite3.connect` independente | Rate limiting persistente | `AuthRateLimitRepository` |
| `services/observability/telemetry_store.py` | SQL SQLite independente | Telemetria e feedback | `TelemetryRepository` |

## 4. Serviços e módulos que recebem o DatabaseManager

A composição central em `apps/api/deps.py` instancia o `DatabaseManager` e o injeta em:
- `ModelManager` (também usado como `inference_cache`);
- `SecurityCore`, que repassa a dependência para `AuditTrail`, `SessionManager`, `ApprovalEngine` e `DeviceAuthManager`;
- `ProjectWorkspaceService`;
- `KnowledgeVaultService`;
- `HardwarePerformanceManager`;
- `WebhookNotificationService`;
- `EngineeringIntelligenceService`;
- `JarvisMaster`;
- `CodingAgentRuntime`;
- `ChatAgentRuntime`;
- `AutonomousAgentRuntime`.

As rotas recebem a instância por dependência compartilhada, em especial `agents`, `chat`, `coding`, `hardware`, `knowledge`, `security`, `skills`, `system` e `workspace`.

## 5. Riscos de compatibilidade/isolamento identificados

### P0 — chamadas sem escopo

1. `apps/api/routers/workspace.py`: `db_manager.get_project(project_id)` sem `owner_user_id` no fluxo de criação/associação de workspace.
2. `services/project_workspace/workspace_service.py`: `list_all_projects()`, `get_project(project_id)` e `delete_project(project_id)` sem owner.
3. `services/security_core/approval_engine.py`: a hidratação inicial chama `list_approvals()` globalmente. Determinar se o engine é instância global multi-tenant ou se precisa carregar por conta.
4. `services/security_core/device_auth.py` e `session_manager.py`: métodos globais são usados para hidratação e manutenção. Separar operações de sistema das operações expostas ao usuário.

### P1 — acesso interno a detalhes SQLite

- `project_memory.py` e `webhook_service.py` conhecem a conexão privada do DatabaseManager.
- `backup_restore.py` acopla o backup à API privada SQLite.
- `telemetry_store.py`, `auth_store.py` e rate limiter implementam seus próprios esquemas e conexões.

### P1 — estado global versus por conta

Definir explicitamente o escopo de `agent_configs`, `user_settings`, `inference_cache`, `ponytail_level` e configurações de hardware. O fato de uma configuração ser guardada no banco não significa que deva ser global.

## 6. Próximas tarefas de fechamento do mapa

- [ ] Executar busca automatizada completa em todos os arquivos Python, incluindo aliases `db`, `self.db`, imports dinâmicos e chamadas indiretas.
- [ ] Confirmar métodos marcados como “sem chamada direta localizada” em testes, CLI e scripts.
- [ ] Criar testes de contrato para cada método público atualmente utilizado.
- [ ] Classificar cada método como tenant-scoped, global-admin, system-maintenance ou shared-readonly.
- [ ] Corrigir os pontos P0 de isolamento em alteração separada, com testes, antes de qualquer corte PostgreSQL.

## 7. Limites desta entrega

Este mapa é uma análise estática do código da branch; não substitui testes dinâmicos. Não foram executados serviços, não houve acesso a bancos locais, não foram lidos dados reais, e nenhuma chamada de runtime foi redirecionada. A migração do banco ainda não começou.


## 8. Implementação incremental iniciada

Na sequência do mapa, a primeira extração foi aplicada sem trocar o backend SQLite:
- Criado o contrato `ProjectMemoryRepository` e o adapter `SqliteProjectMemoryRepository`.
- `LayeredMemoryManager` deixou de abrir `db_manager._get_connection()`; agora usa os métodos públicos `set_project_memory` e `list_project_memory` através do repositório.
- Criado o contrato `SettingsRepository` e o adapter `SqliteSettingsRepository`.
- `WebhookNotificationService` deixou de executar SQL direto e passou a usar `get_setting/set_setting` do `DatabaseManager` através do repositório.
- `DatabaseBackupManager` passou a chamar `DatabaseManager.create_database_backup()`, sem acessar a conexão privada.
- A consulta de memória de projeto passou a filtrar explicitamente `owner_user_id`; quando não informado, só devolve registros legados sem proprietário.
- Adicionados os primeiros modelos SQLAlchemy de `Project`, `ProjectMemory` e `UserSetting`.
- Criada a suíte inicial de contratos em `tests/contract/test_persistence_contract.py`, preparada para receber futuramente o adapter PostgreSQL.

O adapter PostgreSQL ainda não existe e os testes ainda precisam ser executados em CI/local. O runtime continua em SQLite. O restore de snapshots continua explicitamente SQLite neste estágio.
