# 🔄 Manual de Operação, Backup e Recuperação de Desastres

> **Projeto**: JARVIS AI HUB  
> **Versão**: 1.0.0  
> **Banco de Dados**: SQLite WAL (`data/jarvis.db`)  

---

## 1. Operação Diária do Hub

### Inicialização e Encerramento
* **Inicialização**: Executar `python -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000`.
* **Parada Suave**: Pressionar `Ctrl + C` no terminal. O Uvicorn encerra conexões ativas e descarrega a fila de inferência.
* **Monitorização em Tempo Real**: Acessar a página **Server Logs** (`/logs`) para visualizar telemetria SSE, latência média por modelo e fluxo de requisições.

---

## 2. Procedimentos de Backup do Banco de Dados

Como o SQLite está configurado em **Modo WAL**, os dados recentes residem temporariamente no arquivo de log `-wal`. O backup deve ser realizado com segurança sem corromper transações ativas.

### 2.1. Backup a Quente (Hot Backup sem Parar o Servidor)

Execute o comando PowerShell abaixo para forçar o checkpoint do WAL e criar uma cópia consistente:

```powershell
# Script de Backup Automático
$DataHora = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupDir = "backups"

if (!(Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir }

# 1. Forçar checkpoint das escritas pendentes no SQLite
.venv\Scripts\python.exe -c "import sqlite3; conn = sqlite3.connect('data/jarvis.db'); conn.execute('PRAGMA wal_checkpoint(TRUNCATE);'); conn.close()"

# 2. Copiar arquivo principal para pasta de backups
Copy-Item -Path "data\jarvis.db" -Destination "$BackupDir\jarvis_$DataHora.db" -Force

Write-Host "Backup concluído com sucesso em: $BackupDir\jarvis_$DataHora.db" -ForegroundColor Green
```

### 2.2. Política de Retenção de Backups
Recomenda-se manter:
* 7 cópias diárias mais recentes.
* 4 backups semanais.
* 1 backup mensal de auditoria.

---

## 3. Recuperação de Desastres (Disaster Recovery)

Se o arquivo `data/jarvis.db` for corrompido (ex: desligamento abrupto de energia durante escrita pesada):

### Passo a Passo de Recuperação:

1. **Parar o Servidor Backend**:
   Encerrar o processo do Uvicorn ou matar a tarefa ativa.

2. **Verificar a Integridade do Banco Atual**:
   ```powershell
   .venv\Scripts\python.exe -c "import sqlite3; conn = sqlite3.connect('data/jarvis.db'); print(conn.execute('PRAGMA integrity_check;').fetchone()[0]); conn.close()"
   ```
   Se a saída for diferente de `ok`, o banco está comprometido.

3. **Restaurar a Partir do Backup Mais Recente**:
   ```powershell
   # 1. Renomear arquivo corrompido para análise forense
   Move-Item -Path "data\jarvis.db" -Destination "data\jarvis_corrompido.db" -Force
   Remove-Item -Path "data\jarvis.db-wal" -ErrorAction SilentlyContinue
   Remove-Item -Path "data\jarvis.db-shm" -ErrorAction SilentlyContinue

   # 2. Copiar a última versão íntegra
   Copy-Item -Path "data\jarvis.db.bak" -Destination "data\jarvis.db" -Force

   # 3. Validar integridade do arquivo restaurado
   .venv\Scripts\python.exe -c "import sqlite3; conn = sqlite3.connect('data/jarvis.db'); print('Status:', conn.execute('PRAGMA integrity_check;').fetchone()[0]); conn.close()"
   ```

4. **Reiniciar o Servidor**:
   Inicialize novamente o Uvicorn. O sistema recarregará as tarefas e memórias com sucesso.

---

## 4. Manutenção e Expurgos Periódicos

### Expurgo de Tarefas Antigas (>30 Dias)
Tarefas concluídas há mais de 30 dias podem ser expurgadas diretamente pela interface visual em **Gerenciador de Tarefas** $\rightarrow$ botão **"Expurgar Antigas (>30d)"** ou via chamada de API:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/v1/tasks/purge" -Method Post
```

### Otimização e Desfragmentação do Arquivo (`VACUUM`)
A cada 90 dias, execute uma reorganização das páginas físicas do disco:
```powershell
.venv\Scripts\python.exe -c "import sqlite3; conn = sqlite3.connect('data/jarvis.db'); conn.execute('VACUUM;'); conn.close(); print('Banco desfragmentado e otimizado!')"
```
