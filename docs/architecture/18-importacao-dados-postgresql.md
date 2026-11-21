# Importação controlada de dados SQLite → PostgreSQL

- Estado: modelos, migrações e importador implementados e validados em ambiente isolado; PostgreSQL **não** está ativo no runtime.
- Âmbito atual: todas as tabelas de dados — `human_users`, `projects`, `project_memory`, `user_settings`, `inference_telemetry`, `model_selection_decisions`, `inference_quality_feedback`, `tasks`, `chat_messages`, `approvals`, `agent_memories`, `agent_configs`, `agent_route_assignments`, `user_skills`, `knowledge_vault`, `mobile_devices`, `user_sessions`, `audit_events`, `mock_endpoints` e `learning_progress`.
- Opt-in: `auth_attempts` (rate-limit transitório) e `inference_cache` (cache transitória com prompts crus).

## 1. Componentes

| Componente | Responsabilidade |
|---|---|
| `services/database/config.py` | Resolve `JARVIS_DATABASE_BACKEND`, valida a URL, normaliza PostgreSQL para `psycopg` e falha fechado. |
| `services/database/engine.py` | Cria o engine SQLAlchemy e verifica `SELECT 1` sem fallback. |
| `services/database/session.py` | `DatabaseRuntime`: engine + fábrica de sessões com commit/rollback explícitos. |
| `alembic.ini` + `services/database/migrations/` | Migrações versionadas; `0001_initial_schema` cria identidade, projetos, settings e telemetria; `0002_remaining_domains` cria os restantes domínios. |
| `services/database/migration/importer.py` | Cópias íntegras, validação, importação transacional, reset de sequências e relatório. |
| `services/database/migration/cli.py` | Interface operacional (`python -m services.database.migration.cli`). |

O antigo `services/persistence/dual_engine.py` deixou de fingir suportar PostgreSQL: uma URL PostgreSQL agora levanta erro e indica `DatabaseRuntime`. O caminho suportado é SQLAlchemy síncrono com `psycopg`; não existe fallback silencioso para SQLite.

Enquanto o runtime for SQLite, `DatabaseManager` valida o ambiente com `ensure_sqlite_runtime`: se `JARVIS_DATABASE_BACKEND=postgresql` (ou uma URL PostgreSQL) estiver configurado, o arranque falha com instruções claras em vez de ignorar a seleção. O objetivo é impedir que uma configuração PostgreSQL aparente estar ativa quando o processo continua a escrever em SQLite.

## 2. Garantias de segurança

1. **Origem intocada**: cada ficheiro SQLite é copiado com a API de backup do SQLite. A importação lê apenas a cópia, em modo `mode=ro`.
2. **Cópia verificada**: `PRAGMA quick_check` tem de devolver `ok`; o relatório regista SHA-256, tamanho e caminho da cópia.
3. **Destino explícito**: a URL tem de ser PostgreSQL e a revisão Alembic tem de coincidir exatamente com o head.
4. **Destino vazio por omissão**: qualquer tabela ocupada aborta antes de escrever. `--allow-non-empty` é obrigatório para reexecuções, que apenas inserem registos em falta.
5. **Validação antes da escrita**: datas, JSON, inteiros, booleanos, roles, ratings, owners e relações são validados. Linhas inválidas abortam a importação por omissão (`--on-error skip` só após revisão).
6. **Transação única**: inserts, verificações de órfãos, reset de sequências e contagens decorrem na mesma transação; uma falha faz rollback total.
7. **Texto livre preservado**: prompts, conteúdo de chat, diffs, razões, instruções, system prompts, corpos de mock e respostas de cache são copiados exatamente, incluindo espaços iniciais/finais e quebras de linha. Só identificadores e campos de configuração passam por normalização.
8. **Datas**: timestamps com timezone mantêm o instante. Timestamps legados sem timezone são interpretados como UTC; no conjunto real isto afeta apenas três `agent_configs.updated_at`.
9. **Unicidade de memórias**: `agent_memories` usa índices únicos parciais — `(agent_role, category, key)` quando `owner_user_id IS NULL` e `(owner_user_id, agent_role, category, key)` quando o dono existe.
10. **IDs explícitos**: `chat_messages.id` é `BigInteger Identity`; os IDs legados são preservados e a sequência PostgreSQL é reposta após a importação para o próximo `INSERT` não colidir.
11. **Transitórios fora do padrão**: `auth_attempts` só é importado com `--include-auth-attempts`, e apenas para uma tabela de destino vazia. `inference_cache` só é importado com `--include-inference-cache`, por conter prompts crus.
12. **Sem credenciais no relatório**: a URL é mascarada. As cópias contêm hashes de passwords e devem ser protegidas e eliminadas após validação.

## 3. Utilização

Pré-requisitos: PostgreSQL a correr (`infra/postgres/compose.yaml`), `JARVIS_DATABASE_URL` definida e migrações aplicadas.

```bash
# 1. Esquema
alembic upgrade head
alembic current
alembic check

# 2. Ensaio sem escrita
python -m services.database.migration.cli \
  --source-dir data \
  --target-url "$JARVIS_DATABASE_URL" \
  --backup-dir data/migration-backups \
  --report migration-dry-run.json \
  --dry-run

# 3. Importação real
python -m services.database.migration.cli \
  --source-dir data \
  --target-url "$JARVIS_DATABASE_URL" \
  --backup-dir data/migration-backups \
  --report migration-report.json

# 4. Reexecução idempotente (apenas registos em falta)
python -m services.database.migration.cli \
  --source-dir data \
  --target-url "$JARVIS_DATABASE_URL" \
  --backup-dir data/migration-backups \
  --report migration-report-2.json \
  --allow-non-empty

# 5. Opt-in explícito
python -m services.database.migration.cli \
  --source-dir data \
  --target-url "$JARVIS_DATABASE_URL" \
  --allow-non-empty \
  --include-inference-cache
```

`--source-dir` deve conter `jarvis.db`, `telemetry.db`, `learning_progress.sqlite3` e `auth/users.sqlite3` (e, opcionalmente, `auth/rate_limits.sqlite3`).

## 4. Resultado da validação local

Execução de 2026-11-20 sobre cópias dos dados reais, em `jarvis_hub_test` (schema `0002_remaining_domains`):

| Tabela | Linhas válidas | Inseridas | Inválidas |
|---|---:|---:|---:|
| `human_users` | 1 | 1 | 0 |
| `projects` | 8 | 8 | 0 |
| `project_memory` | 1 | 1 | 0 |
| `user_settings` | 5 | 5 | 0 |
| `inference_telemetry` | 36 | 36 | 0 |
| `model_selection_decisions` | 34 | 34 | 0 |
| `inference_quality_feedback` | 0 | 0 | 0 |
| `tasks` | 39 | 39 | 0 |
| `approvals` | 1 | 1 | 0 |
| `chat_messages` | 207 | 207 | 0 |
| `agent_memories` | 30 | 30 | 0 |
| `agent_configs` | 29 | 29 | 0 |
| `agent_route_assignments` | 0 | 0 | 0 |
| `user_skills` | 0 | 0 | 0 |
| `knowledge_vault` | 0 | 0 | 0 |
| `mobile_devices` | 8 | 8 | 0 |
| `user_sessions` | 23 | 23 | 0 |
| `audit_events` | 788 | 788 | 0 |
| `mock_endpoints` | 0 | 0 | 0 |
| `learning_progress` | 0 | 0 | 0 |

Total: **1 210 linhas inseridas, 0 inválidas**. `auth_attempts` e `inference_cache` não entram na importação padrão; os testes de opt-in cobrem ambos os caminhos.

Verificações: `project_memory_orphans=0`, `inference_feedback_orphans=0`, `human_users_duplicate_normalized=0`, `tasks_project_orphans=0`, `chat_messages_project_orphans=0`, `approvals_task_orphans=0`. A sequência de `chat_messages` foi reposta com base no maior ID legado (374; próximo ID 375) e um `INSERT` sem ID devolveu 375. Uma comparação campo a campo entre as cópias e o PostgreSQL confirmou todas as linhas, incluindo texto livre com espaços e quebras de linha. A reexecução com `--allow-non-empty` inseriu zero linhas.

Estes números são locais e variam com os dados de cada instalação.

## 5. O que falta antes de ativar PostgreSQL

- Trocar o wiring de `DatabaseManager`/repositórios por adaptadores PostgreSQL sem alterar contratos públicos.
- Testar autenticação, isolamento entre contas, concorrência, rollback, backup e restauração no PostgreSQL.
- Executar benchmark com o mesmo conjunto de dados e carga.
- Ativar por configuração explícita (`JARVIS_DATABASE_BACKEND=postgresql` e URL `psycopg`) e documentar o rollback para SQLite.

Até esses passos estarem concluídos, o runtime mantém-se em SQLite e a migração não está terminada.
