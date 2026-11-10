# ADR 0003: Orquestração com LangGraph e Governança de Segurança com Autoridade Externa

- **Status**: Aceite
- **Data**: 2026-11-08
- **Autores**: Equipa JARVIS AI HUB
- **Contexto**: Arquitetura Multi-Agente & Governança de Acesso

---

## 1. Contexto e Problema

Sistemas baseados em agentes autônomos que realizam modificações em código correm riscos severos:
* Loops infinitos de auto-invocação entre agentes.
* Autoaprovação de permissões ou comandos perigosos pelo próprio LLM.
* Perda de rastreabilidade do estado intermediário de deliberação.
* Falta de controle determinístico sobre o encadeamento de especialistas.

Era necessário um modelo de orquestração estruturado, determinístico e auditável, onde a segurança seja imposta **externamente** ao modelo de linguagem.

---

## 2. Decisão

1. **Adoção do LangGraph (StateGraph)**:
   - A coordenação entre os agentes é modelada como um grafo direcionado acíclico (`services/orchestration/graph.py`).
   - O estado da tarefa (`TaskState`) é fortemente tipado em Pydantic e checkpointed por `thread_id` a cada transição de nó.
   - Nós de triagem, planejamento, deliberação e sumarização possuem entradas e saídas contratuais (`AgentOutputContract`).

2. **Invariante de Segurança: Autoridade Zero aos Agentes**:
   - Modelos de IA são tratados como funções de raciocínio não confiáveis (*untrusted execution*).
   - O componente `SecurityCore` atua como barreira externa: ele verifica se a ação solicitada é de leitura ou escrita.
   - Qualquer modificação no disco ou criação de branch suspende a execução do grafo (`approval_required = True`).

3. **Bloqueio Irrevogável de Autoaprovação**:
   - O `ApprovalEngine` exige que `decided_by` corresponda a um operador humano autenticado.
   - Qualquer tentativa de aprovação com papéis de agente (`role in AgentRole`) dispara imediatamente `UnauthorizedApprovalError` e registra evento de severidade `CRITICAL` no `AuditTrail`.

---

## 3. Consequências

### Positivas:
* Eliminação completa de *prompt injection* que tente conceder permissões elevadas aos agentes.
* Gravação auditável do histórico completo da deliberação antes e depois da aprovação.
* Suporte nativo a pausas assíncronas (Human-in-the-Loop) sem perda de contexto de memória.
