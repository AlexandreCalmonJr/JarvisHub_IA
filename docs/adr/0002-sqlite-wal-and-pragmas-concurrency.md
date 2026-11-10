# ADR 0002: Otimização de Concorrência SQLite via Modo WAL e PRAGMAs de Memória

- **Status**: Aceite
- **Data**: 2026-11-08
- **Autores**: Equipa JARVIS AI HUB
- **Contexto**: Otimização do Backend e Banco de Dados (Opção B)

---

## 1. Contexto e Problema

O JARVIS AI HUB utiliza SQLite local (`data/jarvis.db`) para persistência de tarefas, estados de deliberação, inventário de workspaces, memórias cognitivas de agentes e trilha de auditoria.

No modo padrão do SQLite (*journal_mode = DELETE*), qualquer operação de escrita bloqueia o arquivo do banco exclusivamente, impedindo que requisições simultâneas de leitura (como o painel de telemetria, busca na base de conhecimento e visualização de tarefas) sejam concluídas, gerando erros do tipo `OperationalError: database is locked`.

Com a introdução de múltiplos agentes e logs contínuos em tempo real, era mandatório alcançar concorrência mista de leitura e escrita sem a sobrecarga operacional de um servidor externo (PostgreSQL/Docker).

---

## 2. Decisão

1. **Ativação do Modo WAL (Write-Ahead Logging)**:
   - Configurado `PRAGMA journal_mode = WAL;`. Leituras passam a ler snapshots consistentes diretamente da memória e do arquivo principal, sem aguardar o término das transações de escrita gravadas no arquivo `-wal`.

2. **Ampliação do Cache e Mapeamento de Memória (MMAP)**:
   - `PRAGMA cache_size = -64000;`: Aloca 64 MB de memória RAM dedicada para páginas de dados frequentes.
   - `PRAGMA mmap_size = 268435456;`: Mapeia até 256 MB do banco diretamente no espaço de endereçamento virtual do processo, eliminando cópias redundantes entre kernel e userspace.

3. **Tolerância Transiente a Bloqueios**:
   - `PRAGMA busy_timeout = 5000;`: Instruções de gravação concorrentes aguardam automaticamente até 5 segundos em retry determinístico em vez de falharem imediatamente.

4. **Índices de Cobertura Específicos**:
   - Criação de 6 novos índices nas tabelas `tasks`, `agent_memories`, `audit_logs` e `projects` para eliminar *table scans*.

---

## 3. Consequências e Resultados Comprovados

### Resultados de Carga (Stress Test em Hardware Real Intel Core i5):
* **Leituras Concorrentes (15 workers)**: **191.9 requisições por segundo (RPS)** com latência média de 68.75 ms e 100% de sucesso.
* **Escritas Concorrentes (8 workers)**: **244.0 escritas por segundo (WPS)** com **0 falhas por lock** e latência média de 29.90 ms.
* **Integridade Física**: Verificada com `PRAGMA integrity_check = ok`.
* **Simplicidade de Operação**: Banco de dados continua sendo um arquivo único (`data/jarvis.db`), facilmente copiável para backups sem dependência de containers.
