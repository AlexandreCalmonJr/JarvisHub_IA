# 🎭 Roteiro de Demonstração e Dados de Exemplo

> **Projeto**: JARVIS AI HUB  
> **Objetivo**: Fornecer um guia passo a passo estruturado e dados prontos para demonstrar o sistema a partes interessadas, clientes ou equipe técnica em ~15 minutos.

---

## 1. Preparação Prévia (Checklist do Apresentador)

1. Backend ativo em `http://127.0.0.1:8000` (ou na porta configurada).
2. Dashboard aberto em `http://127.0.0.1:3100` (ou porta 3000 em produção).
3. Ollama em execução local com os modelos essenciais baixados (`llama3.2:3b`, `qwen2.5-coder:7b`).
4. Dados de exemplo carregados ou prontos para importação rápida.

---

## 2. Roteiro Passo a Passo de Demonstração (15 Minutos)

### Bloco 1 — Autenticação, Interface e Chat Master (3 min)

* **Objetivo:** Mostrar segurança fail-closed, dark mode moderno e streaming token a token.
* **Passos:**
  1. Acessar `/chat`. Caso não esteja autenticado, fazer login via credenciais de admin ou token.
  2. Demonstrar o comando rápido de rigor arquitetural:
     ```text
     /ponytail senior
     ```
  3. Enviar prompt de teste conversacional:
     ```text
     Olá JARVIS! Pode me explicar de forma sucinta qual é a sua arquitetura de agentes e como funciona a governança de aprovação humana?
     ```
  4. **Pontos a destacar:**
     - Resposta transmitida em tempo real via Server-Sent Events (SSE).
     - Persistência imediata na gaveta lateral de sessões.
     - Respeito ao contrato de concisão (respostas objetivas e fundamentadas).

---

### Bloco 2 — Busca Online em Tempo Real com Citação de Fontes (3 min)

* **Objetivo:** Demonstrar recuperação de informação externa com allowlist e bloqueio seguro.
* **Passos:**
  1. No Chat Master, enviar pergunta que demande busca externa:
     ```text
     Quais foram as principais novidades anunciadas no lançamento da versão mais recente do Python?
     ```
  2. Observar a emissão do indicador visual de busca `[Buscando na web...]`.
  3. **Pontos a destacar:**
     - Fontes e datas são apresentadas de forma destacada abaixo da resposta.
     - A busca utiliza DuckDuckGo Lite sem rastreadores.
     - Leitura aprofundada de páginas via `web_read` com proteção contra SSRF e timeout estrito.
     - Se o isolamento de rede estiver ligado (`cyber_shield.network_isolated`), a busca recusa antes de abrir conexão HTTP (fail-closed).

---

### Bloco 3 — Scaffolding de Projetos e Banco de Dados SQLite (3 min)

* **Objetivo:** Mostrar a criação de projetos limpos e inspeção SQL em estúdio visual.
* **Passos:**
  1. Acessar **Workspace & Projetos** (`/workspace`).
  2. Criar ou importar um projeto de exemplo:
     - Nome: `gestao-pedidos`
     - Stack: Python / FastAPI
     - Opção de Banco de Dados: `sqlite`
  3. Acessar **Backend Studio** (`/backend-studio`) > aba **Playground SQL & Índices**.
  4. Selecionar o projeto `gestao-pedidos` e o arquivo `app.db`.
  5. Executar a consulta de exemplo:
     ```sql
     SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view');
     ```
  6. **Pontos a destacar:**
     - Zero necessidade de banco de dados externo ou containers pesados na máquina do desenvolvedor.
     - O SQL Playground opera em modo 100% read-only (`SELECT`/`WITH`/`EXPLAIN`), impedindo comandos `DROP`, `UPDATE` ou `COPY TO`.

---

### Bloco 4 — Coding Agent com Human-in-the-Loop (4 min)

* **Objetivo:** Demonstrar a execução autônoma de tarefas de código com controle humano rigoroso.
* **Passos:**
  1. Acessar **Coding Agent** (`/coding`).
  2. Selecionar o projeto aberto e colocar em modo **`ask`** (Human-in-the-Loop).
  3. Enviar a tarefa:
     ```text
     Crie um arquivo chamado 'config/app_settings.json' com as configurações padrão da aplicação (porta 8080, debug falso e versão 1.0.0).
     ```
  4. Observar a pausa do agente e a emissão do pedido de aprovação com visualização do diff unificado.
  5. Clicar em **Aprovar Operação**.
  6. **Pontos a destacar:**
     - O modelo **nunca** grava arquivos ou executa scripts no disco do usuário sem decisão explícita no modo `ask`.
     - Exibição de diff claro (adições em verde, remoções em vermelho).
     - Sandbox de subprocesso com bloqueio de comandos destrutivos (`rmdir /s`, `rm -rf`, `format`).

---

### Bloco 5 — Auditoria, Segurança e Relatório Executivo (2 min)

* **Objetivo:** Provar a conformidade, trilha de auditoria e métricas de ROI.
* **Passos:**
  1. Acessar **Approval Center** (`/approvals`) e **Security Center** (`/security`).
  2. Mostrar os registros da ação aprovada no Bloco 4:
     - Quem solicitou, timestamp, comando/diff exato e decisão do operador.
  3. Acessar **Relatório Executivo** (`/executive-report`).
  4. Mostrar o cálculo de economia em dólares em comparação ao envio de todos os tokens para APIs pagas na nuvem.
  5. Demonstrar o botão de exportar relatório em Markdown.

---

## 3. Dados de Exemplo para Testes Rápidos

### 3.1 Payload de Importação de Dados (`/api/v1/data/pipeline`)
```json
{
  "source_type": "csv",
  "target_format": "sqlite",
  "project_id": "gestao-pedidos",
  "data_content": "id,nome,preco,estoque\n1,Teclado Mecanico,250.00,15\n2,Mouse Optico,120.00,30\n3,Monitor 24pol,890.00,8",
  "table_name": "produtos"
}
```

### 3.2 Instruções SQL para Demonstração do Playground
```sql
-- Listar produtos com estoque abaixo de 20 unidades
SELECT id, nome, preco, estoque 
FROM produtos 
WHERE estoque < 20 
ORDER BY preco DESC;

-- Análise do plano de execução (Query Plan)
EXPLAIN QUERY PLAN 
SELECT * FROM produtos WHERE id = 2;
```

### 3.3 Prompt para Avaliação de Especialista (Centro de Agentes)
```text
[Papel: Security Auditor]
Analise o trecho a seguir e aponte eventuais riscos de segurança:
def get_user_data(user_id):
    query = f"SELECT * FROM users WHERE id = '{user_id}'"
    return db.execute(query).fetchall()
```
*(Demonstra a recusa a SQL injection e recomendação de parametrização imediata).*
