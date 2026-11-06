# Plano de Resposta a Incidentes e Suporte Operacional

**JARVIS AI HUB v1.0**  
**Classificação:** Procedimento Operacional Padrão (SOP)  
**Data:** 06/11/2026  

---

## 1. Classificação e Níveis de Severidade de Incidentes

| Nível | Definição | Critérios | Tempo Máximo de Resposta |
| :--- | :--- | :--- | :--- |
| **P1 - Crítico** | Falha de contenção ou anomalia sistêmica | Tentativa de escrita sem aprovação, consumo excessivo de RAM/CPU ameaçando o host, suspeita de vazamento de credenciais. | **Imediato (< 1 minuto)** |
| **P2 - Alto** | Degradação de serviço | Provedor externo offline (com fallback ativo), fila de inferência travada, falha no banco de dados SQLite. | **< 30 minutos** |
| **P3 - Médio** | Anomalia funcional pontual | Rejeição de schema de dados, timeout de inferência isolada, rejeição de skill. | **< 4 horas** |

---

## 2. Procedimentos de Contenção de Emergência (P1)

### 2.1 Acionamento do Kill Switch Global
Se qualquer agente apresentar comportamento anômalo ou loops de execução:

1. **Via Dashboard Web**: Navegue para a aba **Security & Kill Switch** e clique no botão vermelho **DISPARAR KILL SWITCH GLOBAL**.
2. **Via App Móvel (Android/Tailscale)**: Acesse a aba **Estado** e pressione **DISPARAR KILL SWITCH GLOBAL**.
3. **Via Linha de Comando / PowerShell**:
   ```bash
   curl -X POST http://localhost:8000/api/v1/system/kill-switch -H "Content-Type: application/json" -d '{"target": "global", "reason": "Acionamento emergencial de contenção"}'
   ```
*Efeito:* O `KillSwitch` aborta instantaneamente todos os processos em execução no `ToolGateway`, cancela a fila do `InferenceQueue` e bloqueia novas requisições.

### 2.2 Cancelamento de Tarefa Específica
Para cancelar apenas uma tarefa sem interromper o restante do monólito:
```bash
curl -X POST http://localhost:8000/api/v1/system/kill-switch -H "Content-Type: application/json" -d '{"target": "task", "task_id": "task_id_aqui", "reason": "Cancelada pelo operador"}'
```

---

## 3. Procedimento de Rollback de Código no Git

Caso uma alteração aprovada apresente comportamento inesperado em produção:
1. Todas as alterações geradas pelo JARVIS ocorrem na branch dedicada `jarvis/task-<id>`.
2. Para reverter o último commit gerado pelo agente:
   ```bash
   # O GitWorkspaceManager reverte automaticamente com:
   git reset --hard HEAD~1
   ```
3. O branch de trabalho original do utilizador (`main` ou `develop`) nunca é tocado diretamente sem mesclagem manual explícita.

---

## 4. Procedimento de Restauração de Backup do SQLite

Se houver corrupção no arquivo `data/jarvis.db`:
1. Interrompa a API FastAPI.
2. Identifique o snapshot mais recente em `data/backups/`.
3. Execute o script de restauração:
   ```python
   from services.memory import DatabaseBackupManager
   mgr = DatabaseBackupManager(db_path="data/jarvis.db", backup_dir="data/backups")
   mgr.restore_latest_backup()
   ```
4. Reinicie o backend. Todas as tabelas, aprovações e memória em camadas são recuperadas em estado íntegro.

---

## 5. Procedimento de Revogação de Dispositivo Móvel Perdido

Se o smartphone de um operador for extraviado ou desautorizado:
```bash
curl -X POST http://localhost:8000/api/v1/mobile/revoke -H "Content-Type: application/json" -d '{"device_id": "dev-xxx", "reason": "Smartphone roubado/perdido"}'
```
*Efeito:* O token criptográfico do dispositivo é revogado no mesmo milissegundo. Qualquer tentativa de conexão subsequente recebe `403 Forbidden` e gera alerta `WARNING` no log de auditoria.
