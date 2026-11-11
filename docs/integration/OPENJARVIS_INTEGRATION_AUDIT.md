# Auditoria de integração — OpenJarvis + JARVIS AI Hub

**Branch de trabalho:** `integration/openjarvis-audit`  
**Branch-base:** `release/local-homologation`  
**Commit-base observado:** `df3416503dcb509f87666a464aaa5fb268a52680`  
**Data da auditoria inicial:** 2026-11-11  
**Escopo deste registro:** Fase 0 (proteção) e primeira passagem da Fase 1 (auditoria do OpenJarvis).  
**Regra:** este documento registra evidências do código e separa claramente implementação observada, documentação declarativa e pontos ainda não verificados.

---

## 1. Resumo executivo

A branch exclusiva `integration/openjarvis-audit` foi criada a partir de `release/local-homologation`. Nenhum arquivo funcional, dependência ou configuração de execução do Hub foi alterado nesta etapa. A auditoria inicial confirma que o OpenJarvis possui componentes concretos e potencialmente reaproveitáveis em cinco áreas prioritárias:

1. contratos e registries tipados para componentes substituíveis;
2. abstração de engines e descoberta de modelos disponíveis;
3. agentes com ciclos de ferramentas (Orchestrator/ReAct);
4. traces, telemetria e agregação de métricas;
5. memória híbrida e políticas de roteamento orientadas por resultados.

O Hub já possui bases equivalentes em vários desses domínios: ModelManager/adapters/HybridModelRouter, LangGraph/Maestro, AutonomousAgentRuntime/ReAct, ToolGateway, SecurityCore, memória persistente e contratos de agentes. Portanto, a estratégia correta é **adaptar padrões e componentes pontuais**, não importar um segundo framework inteiro nem substituir LangGraph, Maestro, SecurityCore ou ToolGateway.

Ainda não há decisão de copiar ou adicionar dependências. Essa decisão depende da matriz de compatibilidade e da auditoria detalhada do Hub.

## 2. Fase 0 — proteção dos repositórios

### 2.1 Estado Git observado

| Item | Evidência | Resultado |
|---|---|---|
| Branch de homologação | `release/local-homologation` existe | Confirmada |
| Branch exclusiva | `integration/openjarvis-audit` criada | Confirmada |
| Origem da nova branch | `release/local-homologation` | Confirmada |
| Commit de origem | `df3416503dcb509f87666a464aaa5fb268a52680` | Registrado |
| Branch `main` | Comparação com homologação indica divergência | Não foi modificada |
| Alterações funcionais nesta etapa | Nenhuma escrita em código de runtime | Confirmado |
| Dependências instaladas/atualizadas | Nenhuma | Confirmado |

Na comparação entre `main` e `release/local-homologation`, a homologação estava 11 commits à frente e 1 commit atrás da `main`. A nova branch foi criada a partir da homologação, não da `main`. Não realizar merge/rebase automático com a `main`.

**Limitação importante:** o acesso GitHub permite observar commits e arquivos remotos, mas não mostra alterações não commitadas que possam existir na cópia local do Windows. Antes de qualquer operação Git local, preservar e verificar o estado local com `git status`; não executar `reset`, `clean`, checkout destrutivo ou sobrescrita de arquivos.

### 2.2 Política de reversão

- Cada módulo será implementado em commits pequenos e identificáveis nesta branch.
- Não alterar `main` durante auditoria/homologação.
- Não remover nem substituir implementações existentes antes de testes comparativos.
- Para reverter um módulo, usar revert do commit específico após avaliar dependências posteriores; não apagar trabalho acumulado com reset.
- Mudanças de schema exigem migração reversível e teste de dados existentes.

## 3. Fase 1 — inventário técnico inicial do OpenJarvis

### 3.1 Identidade e arquitetura

O repositório consultado é `open-jarvis/OpenJarvis`, branch `main`. A documentação de arquitetura descreve um framework de pesquisa para IA on-device/local-first, organizado em abstrações para Intelligence, Engine, Agentic Logic, Memory e Learning. O código apresenta registries tipados e componentes Python, além de código Rust/PyO3 para partes do sistema.

**Observação de auditoria:** alguns caminhos da árvore descrita em documentação antiga não correspondem à organização atual do código. Por exemplo, os backends de memória observados estão em `src/openjarvis/tools/storage/`, e as políticas de roteamento estão em `src/openjarvis/learning/routing/`. A integração deve seguir o código atual, não copiar caminhos de diagramas/documentos possivelmente desatualizados.

### 3.2 Registry e contratos centrais

**Arquivos examinados**
- `src/openjarvis/core/registry.py`
- `src/openjarvis/core/types.py`
- `src/openjarvis/engine/_stubs.py`
- `src/openjarvis/agents/_stubs.py`
- `src/openjarvis/tools/_stubs.py`
- `src/openjarvis/tools/storage/_stubs.py`

**Implementação observada**
- `RegistryBase[T]` fornece registro, consulta e instanciação de classes por chave.
- Registries tipados separam Engine, Agent, Tool, Model, Memory e políticas.
- Engines e agentes seguem contratos abstratos comuns.
- O contrato de ferramenta contém especificação e execução, com um executor próprio.
- A separação reduz a necessidade de alterar factories centrais a cada novo adaptador.

**Oportunidade no Hub**
- Avaliar um catálogo/registry de providers e capacidades para complementar o ModelManager atual.
- Usar interfaces pequenas para adaptadores, sem criar uma segunda camada de DI ou um framework paralelo.
- Manter permissões e identidade do Hub como autoridade; registro de classe não pode conceder permissão de execução.

**Risco**
- Um registry global em processo não resolve isolamento multiusuário. Configuração, instâncias, credenciais e estado operacional devem continuar vinculados ao usuário/tenant quando aplicável.

### 3.3 Intelligence e engines de inferência

**Arquivos examinados**
- `src/openjarvis/intelligence/model_catalog.py`
- `src/openjarvis/engine/_stubs.py`
- `src/openjarvis/engine/_discovery.py`
- `src/openjarvis/core/config.py`
- Documentação `docs/architecture/overview.md`

**Implementação/documentação observada**
- Catálogo de modelos com metadados, incluindo capacidades e requisitos de hardware.
- Descoberta de engines e modelos disponíveis em runtime.
- Contrato uniforme de engine para geração, streaming, listagem de modelos e health check.
- Backends documentados incluem Ollama, vLLM, SGLang, llama.cpp e providers cloud compatíveis.
- Configuração de engine inclui preferência e cadeia de fallback.

**Oportunidade no Hub**
- Comparar o contrato `InferenceEngine` com `services/model_runtime/adapter.py`, `model_manager.py`, `hybrid_router.py` e `types.py`.
- Extrair apenas metadados/capabilities e descoberta que estejam ausentes.
- Criar testes de contrato que provem que adapters diferentes podem ser trocados sem alterar agentes.

**Não fazer agora**
- Não substituir o ModelManager/HybridModelRouter.
- Não introduzir engines adicionais até a auditoria de compatibilidade, dependências e hardware.

### 3.4 Agentes e autonomia

**Arquivos examinados**
- `src/openjarvis/agents/_stubs.py`
- `src/openjarvis/agents/native_react.py`
- `src/openjarvis/agents/orchestrator.py`
- `tests/agents/test_native_react.py`
- `src/openjarvis/sandbox/runner.py`

**Implementação observada**
- `BaseAgent` e `ToolUsingAgent` definem contratos reutilizáveis.
- `NativeReActAgent` implementa ciclo Thought/Action/Observation.
- `OrchestratorAgent` oferece loop multi-turn com function calling e modo estruturado.
- O sistema oferece wrapper de agente em container via Docker/Podman.
- Existe suíte de testes dedicada ao NativeReActAgent (arquivo examinado com 732 linhas).

**Oportunidade no Hub**
- Comparar limites de iteração, detecção de loops, timeout, cancelamento, tratamento de tool calls e evidências.
- Aproveitar padrões de ciclo de execução e testes de contrato no `AutonomousAgentRuntime`.
- Integrar com LangGraph como runtime especializado chamado pelo Maestro, se os contratos e a governança forem compatíveis.

**Risco**
- Não confiar em raciocínio do modelo para autorização. Toda chamada de ferramenta precisa continuar passando pelo ToolGateway, SecurityCore, RBAC e ApprovalEngine do Hub.
- O sandbox do OpenJarvis não substitui automaticamente o sandbox e as políticas existentes do Hub.

### 3.5 Memória e recuperação

**Arquivos examinados**
- `src/openjarvis/tools/storage/_stubs.py`
- `src/openjarvis/tools/storage/hybrid.py`
- `docs/architecture/overview.md`
- Busca de código para backends SQLite/FTS5, FAISS, ColBERT e BM25.

**Implementação/documentação observada**
- Contrato comum de backend de memória.
- Backend híbrido combina listas ranqueadas com Reciprocal Rank Fusion.
- A documentação descreve SQLite/FTS5, FAISS, ColBERTv2, BM25 e recuperação híbrida.
- Pipeline documentado inclui ingestão, chunking, embeddings, recuperação e atribuição de fontes.

**Oportunidade no Hub**
- Auditar `services/memory/` e o armazenamento atual para descobrir se falta busca lexical, vetorial ou fusão híbrida.
- Se necessário, implementar primeiro uma interface de recuperação e um adaptador híbrido pequeno.
- Preservar citações/origem dos trechos recuperados.

**Bloqueio de segurança**
- Os backends consultados não demonstram, por si só, isolamento por conta no padrão exigido pelo Hub. Não reutilizar banco/índice global sem particionamento e filtros de ownership garantidos no servidor.
- Memórias, embeddings, documentos e resultados de busca precisam ser segregados por owner/tenant, com testes de acesso cruzado.

### 3.6 Traces e observabilidade de execução

**Arquivos examinados**
- `src/openjarvis/traces/collector.py`
- `src/openjarvis/traces/store.py`
- `tests/traces/test_collector.py`

**Implementação observada**
- `TraceCollector` envolve um agente e captura eventos de inferência, ferramentas e memória.
- Traces são persistidos em SQLite.
- Há teste dedicado ao coletor (arquivo examinado com 419 linhas).
- O trace registra sequência de etapas, em vez de apenas o texto final.

**Oportunidade no Hub — prioridade alta**
- Criar/fortalecer um trace de execução unificado com task_id, session_id, owner_user_id, agente selecionado/executado, modelo, engine, ferramenta, duração, tentativas, erro, aprovação e resultado.
- Expor a diferença entre planejado, iniciado, concluído, falho e bloqueado.
- Alimentar a UI com evidências reais, sem declarar execução de agente que não ocorreu.

**Requisito**
- Persistência e consulta dos traces devem filtrar ownership em todas as operações; não aceitar owner enviado pelo cliente como fonte de autoridade.

### 3.7 Telemetria e métricas

**Arquivos examinados**
- `src/openjarvis/telemetry/wrapper.py`
- `src/openjarvis/telemetry/store.py`
- `src/openjarvis/telemetry/aggregator.py`

**Implementação observada**
- Wrapper instrumenta chamadas de inferência e publica registros de telemetria.
- Store SQLite recebe registros e agrega métricas por modelo/engine.
- Há separação entre captura e consulta agregada.

**Oportunidade no Hub — prioridade alta**
- Instrumentar ModelManager/adapters com duração, latência, tokens quando disponíveis, provider/engine, modelo, tentativas e status.
- Mostrar custo somente quando o provider retornar dados confiáveis; não estimar silenciosamente.
- Correlacionar métricas a task e owner, com filtros de privacidade.

**Não comprovado nesta etapa**
- Precisão/abrangência de métricas energéticas em todas as plataformas e engines.
- Custo real de providers sem dados de faturamento ou tokenização fornecidos pelo provider.

### 3.8 Learning e roteamento adaptativo

**Arquivos examinados**
- `src/openjarvis/learning/routing/learned_router.py`
- Documentação `docs/architecture/learning.md` e `overview.md`.

**Implementação/documentação observada**
- Existe política de roteamento aprendido baseada em dados de traces e classes de consulta.
- A documentação descreve políticas heurísticas e aprendidas e cita opções SFT/GRPO.
- O código de roteamento aprendido combina seleção em runtime e atualização a partir de histórico.

**Oportunidade no Hub**
- Começar por recomendação/roteamento determinístico baseado em métricas reais e avaliações explícitas.
- Fazer aprendizado por conta apenas com dados daquela conta, salvo consentimento e política de agregação anonimizadora explícita.
- Versionar políticas e permitir rollback para roteamento padrão.

**Limite**
- Não tratar a presença de uma configuração GRPO como evidência de treinamento RL pronto. A implementação, os testes, os datasets e os requisitos de execução precisam ser auditados separadamente antes de qualquer uso.

### 3.9 Ferramentas, MCP e segurança

**Arquivos examinados**
- `src/openjarvis/tools/_stubs.py`
- `src/openjarvis/mcp/server.py`
- `src/openjarvis/security/scanner.py`
- `src/openjarvis/security/guardrails.py`
- `src/openjarvis/security/audit.py`

**Implementação observada**
- Ferramentas possuem contrato, schema e executor.
- MCP expõe ferramentas registradas por meio de protocolo próprio.
- Guardrails envolvem engine e fazem varredura de segredos/PII.
- Há auditoria de eventos de segurança com persistência SQLite e cadeia hash descrita no código.

**Oportunidade no Hub**
- Comparar catálogo e schemas com ToolGateway; adotar somente ferramentas ou padrões realmente ausentes.
- Avaliar integração MCP atrás de um adaptador do ToolGateway, com allowlist por usuário e ferramenta.
- Reaproveitar scanners como camada complementar, após análise de falsos positivos, dependências e política de retenção.

**Risco crítico**
- MCP não pode contornar o SecurityCore. Credenciais nunca devem ser armazenadas em registries globais ou prompts.
- Scanners não substituem RBAC, validação de ownership, aprovação humana nem sandbox.

### 3.10 Scheduler e agentes persistentes

**Arquivos examinados**
- `src/openjarvis/scheduler/scheduler.py`
- `src/openjarvis/scheduler/store.py`
- `tests/scheduler/test_scheduler.py`

**Implementação observada**
- Scheduler com agendamento once/interval/cron, armazenamento SQLite e logs de execução.
- Testes específicos para o scheduler (arquivo examinado com 359 linhas).

**Oportunidade no Hub**
- Comparar com tarefas, automações e serviços em background já existentes antes de adicionar outro scheduler.
- Se houver lacuna, adaptar o mecanismo para o modelo de tarefas do Hub, com owner, timezone, limites de concorrência, heartbeat, cancelamento, retomada e trilha de auditoria.

**Bloqueio**
- Uma tabela global de tarefas não é suficiente para o Hub. Toda tarefa agendada precisa pertencer a uma conta e executar sob permissões revalidadas no momento da execução.

### 3.11 Licença, dependências e footprint

- O arquivo `LICENSE` do OpenJarvis declara Apache License 2.0.
- O `pyproject.toml` declara pacote Python e dependências/extra groups; há componentes Rust/PyO3 e dependências opcionais de desktop e outros recursos.
- A existência de licença Apache 2.0 não elimina a obrigação de preservar avisos, atribuição, cópia da licença e avisos de alterações nos arquivos reutilizados.
- Cada componente candidato exige inventário de dependências transitivas, compatibilidade com Python do Hub, licença das dependências, peso de instalação, suporte Windows e impacto no empacotamento.
- Não foi instalada nenhuma dependência nesta auditoria.

## 4. Matriz preliminar OpenJarvis → Hub

| Área | OpenJarvis observado | Hub observado nesta primeira leitura | Decisão preliminar |
|---|---|---|---|
| Engines | ABC, registries, discovery, catálogo | ModelManager, adapters, HybridModelRouter, InferenceQueue | Comparar contratos; complementar discovery/capabilities se faltar |
| Agentes | BaseAgent, Orchestrator, NativeReAct, sandbox | LangGraph/Maestro e AutonomousAgentRuntime/ReAct | Preservar; comparar ciclo, limites e testes |
| Memória | SQLite/FTS5, FAISS, ColBERT, BM25, Hybrid | DatabaseManager/LayeredMemoryManager e memória de projeto | Auditar lacunas e ownership antes de qualquer adaptação |
| Tools | BaseTool, executor, ToolRegistry, MCP | ToolGateway, registry, sandbox e SecurityCore | Preservar governança; avaliar adaptador MCP |
| Traces | Collector + SQLite store + analyzer | Estado LangGraph e eventos de chat; trace unificado ainda precisa ser confirmado | Candidato forte a aprimoramento |
| Telemetria | Wrapper + SQLite + agregador | Métricas operacionais existentes precisam ser mapeadas por código | Candidato forte a aprimoramento |
| Learning | Learned router orientado por traces; opções experimentais | HybridModelRouter e políticas atuais a auditar | Começar com roteamento por evidência, sem RL |
| Scheduler | Cron/interval/once com store | Serviços/tarefas existentes precisam ser inventariados | Não duplicar; adaptar somente se houver lacuna |
| Segurança | Scanners, guardrails, audit log, sandbox | SecurityCore, RBAC, ApprovalEngine, ToolGateway, sandbox | Complementar, nunca substituir |
| API/SDK | API FastAPI OpenAI-compatible e SDK | API FastAPI própria e streaming | Não importar servidor paralelo; mapear compatibilidade |
| UI | CLI, GUI/desktop e web conforme módulos | Dashboard web e app Flutter | Não importar UI; priorizar integração no dashboard existente |

**Status da matriz:** preliminar. “Hub observado” não significa que todas as rotas e casos de uso já passaram por teste. A auditoria detalhada do Hub ainda é a próxima etapa.

## 5. Recomendações técnicas iniciais

### P0 — provar a base antes de integrar
1. Auditar ModelManager, adapters e HybridModelRouter contra o contrato de engine.
2. Auditar o runtime ReAct e o ToolGateway juntos, incluindo falhas, loops, timeouts, cancelamento e aprovação.
3. Mapear ownership real em banco, memória, traces, tarefas e APIs.
4. Definir um contrato de trace de execução correlacionado com task/session/owner.

### P1 — incorporar capacidades com maior retorno
1. Telemetria uniforme em cada inferência e ferramenta.
2. Trace completo de ponta a ponta.
3. Catálogo de modelos com capabilities e descoberta de disponibilidade.
4. Recuperação híbrida, somente se a auditoria provar lacuna real.
5. Adaptador MCP governado pelo ToolGateway, se houver ferramentas que justifiquem.

### P2 — somente após dados confiáveis
1. Roteamento adaptativo por evidências.
2. Agentes persistentes e scheduler unificado.
3. Benchmarks de energia/eficiência.
4. Aprendizado SFT/RL ou otimização automática, depois de datasets, métricas e gates de segurança.

## 6. Critérios de aceite para qualquer componente importado/adaptado

- Contrato e testes de compatibilidade aprovados.
- Dependências e licenças revisadas.
- Execução Windows/local-first validada.
- Sem regressão em autenticação, RBAC, aprovação, sandbox ou ToolGateway.
- Isolamento por owner testado por chamadas diretas à API.
- Logs e traces não expõem segredos, prompts privados ou dados de outra conta.
- Falhas são explícitas; não há fallback que simule sucesso.
- UI diferencia selecionado, iniciado, concluído, falho e bloqueado.
- Rollback documentado.
- Testes executados e resultados registrados com commit e ambiente.

## 7. Pontos pendentes para fechar a Fase 1

1. Ler integralmente os módulos de discovery/model catalog e todos os adapters relevantes.
2. Auditar ingestão, chunking, embeddings, SQLite/FTS5, FAISS, BM25 e Hybrid, inclusive dependências nativas.
3. Auditar todas as políticas de learning, confirmando quais são implementadas, experimentais ou stubs.
4. Examinar limites reais de segurança do executor de ferramentas, sandbox, scanners e MCP.
5. Mapear testes por módulo e identificar testes que exigem engine, GPU, Docker, cloud ou credenciais.
6. Examinar scheduler em condições de concorrência, retomada, timezone e execução interrompida.
7. Fechar o inventário de dependências e licenças, incluindo Rust/PyO3 e extras opcionais.

## 8. Próxima etapa

Concluir a Fase 1 com a leitura dos módulos pendentes e, em seguida, executar a Fase 2: auditoria do Hub por backend, persistência, segurança, APIs, frontend e páginas/rotas. Só depois consolidar a matriz definitiva e desenhar os contratos de integração.

**Estado desta entrega:** branch criada e relatório inicial versionado. Nenhuma integração funcional foi aplicada e nenhum teste de runtime foi declarado como executado.


---

## 9. Primeira integração funcional — telemetria persistente de inferência

**Estado:** implementada na branch `integration/openjarvis-audit`; ainda pendente de execução local dos testes e validação funcional.

### 9.1 O que foi acrescentado

- Novo `SqliteTelemetryStore` em `services/observability/telemetry_store.py`.
- Banco separado `data/telemetry.db`, evitando migração destrutiva no banco principal.
- Registro de sucesso/falha, duração, provider, modelo, tokens, task_id e agent_role.
- Metadado `owner_user_id` no contrato `InferenceRequest`.
- O grafo LangGraph propaga o owner autenticado para as nove chamadas de inferência identificadas.
- `ModelManager.generate()` grava telemetria de sucesso e falha. Falhas de gravação da telemetria são registradas no log, mas não interrompem a inferência.
- Endpoint autenticado `GET /api/v1/system/inference-telemetry`, que deriva o owner de `Principal.subject_id`; o cliente não pode escolher a conta consultada.
- Testes unitários para isolamento por owner, exigência de identidade na consulta, ausência de campos de prompt/resposta/credencial no schema e gravação de sucesso/falha no ModelManager.

### 9.2 Proteções de privacidade

- Não são armazenados prompts, respostas, conteúdo de documentos ou chaves de API.
- Todas as consultas do store exigem owner e usam filtro SQL `WHERE owner_user_id = ?`.
- O endpoint usa exclusivamente a identidade autenticada do servidor.
- Registros sem owner, provenientes de chamadas internas não associadas a uma conta, não aparecem nas consultas privadas de qualquer utilizador.
- Não há endpoint administrativo para consultar globalmente a telemetria de todas as contas.

### 9.3 Limites conhecidos desta entrega

- O endpoint está disponível no backend; a interface visual ainda não foi ligada a ele.
- O streaming ainda não é instrumentado por este primeiro incremento.
- Chamadas fora do grafo que não preencham `owner_user_id` ficam sem associação a uma conta.
- Custo monetário e energia não são estimados. Só são expostos tokens e duração efetivamente fornecidos/medidos.
- As nove chamadas de inferência identificadas no grafo agora propagam owner_user_id e o papel real do especialista para a telemetria.

### 9.4 Validação

Foram adicionados testes em `tests/test_telemetry_store.py`. **Não foram executados neste ambiente**; a homologação local continua pendente. Nenhum resultado de teste ou build é declarado como aprovado.


## 10. Segunda etapa — avaliação de desempenho por modelo

**Estado:** implementada na branch `integration/openjarvis-audit`; validação local pendente.

### 10.1 Métricas agregadas

O store agora agrega, por conta autenticada, a combinação de modelo, provedor e papel do especialista:
- total de inferências, sucessos e falhas;
- taxa de sucesso;
- latência média apenas das inferências bem-sucedidas;
- média de tokens por inferência bem-sucedida;
- indicador de amostra suficiente;
- indicador de elegibilidade preliminar para futura avaliação de roteamento.

O endpoint `GET /api/v1/system/inference-telemetry` inclui o campo `model_performance`, sem expor dados de outras contas.

### 10.2 Guardrails para futuro roteamento adaptativo

- O padrão exige pelo menos cinco amostras por combinação modelo/provedor/especialista.
- A taxa de sucesso mínima preliminar é 95%.
- `routing_eligible` é somente um sinal de avaliação; não altera a seleção de modelos.
- Nenhum modelo é recomendado apenas por ser mais rápido: capacidade, qualidade, custo, privacidade, disponibilidade e permissões ainda precisam entrar na decisão.
- O nome do modelo efetivamente retornado pela inferência é usado na telemetria de sucesso, evitando atribuir métricas ao alias solicitado quando o roteador resolveu outro modelo.

### 10.3 Próxima decisão técnica

Antes de ligar seleção automática, precisamos validar a origem de `agent_role`, a identidade do provedor efetivamente utilizado em todos os caminhos híbridos e a qualidade das métricas de tokens/custo. Em seguida, implementar um avaliador de candidatos que respeite capabilities, políticas de dados, aprovação externa e orçamento. A telemetria isolada por owner não pode virar um canal de aprendizagem compartilhada entre contas.


## 11. Terceira etapa — seleção inteligente de modelos

**Estado:** implementação inicial concluída na branch `integration/openjarvis-audit`; testes e validação de runtime pendentes.

### 11.1 Seletor e contrato

- Novo `services/model_runtime/model_selector.py` com seleção determinística baseada no inventário real de modelos.
- A seleção automática é opt-in no contrato (`model_name="auto"` ou `model_name="auto_hybrid"`) e já foi ligada ao grafo Maestro: perfis com preferência automática delegam a escolha ao ModelManager. Preferências de modelo explicitamente personalizadas continuam respeitadas.
- `task_capability` permite informar `code`, `reasoning`, `vision` ou `general`; quando ausente, converte o papel do especialista em capacidade (por exemplo, developer → code; architect/security/QA → reasoning).
- A seleção considera adequação de capacidade, desempenho histórico por owner, latência e preferência local-first.
- Quando existe candidato com pelo menos cinco amostras e taxa de sucesso mínima de 95%, a comparação prioriza candidatos com histórico elegível.
- Sem histórico suficiente, não há bônus de latência/sucesso; a decisão inicial usa capacidade e preferência local-first.
- Para capacidade visual, o seletor não escolhe modelo sem indício de suporte no catálogo.

### 11.2 Segurança e execução

- Modelos externos só entram na lista quando o gateway está habilitado e disponível.
- Dados marcados como sensíveis excluem candidatos externos sem aprovação humana expressa.
- A decisão externa continua sujeita ao HybridModelRouter: aprovação, orçamento, auditoria e fallback local.
- `force_local` garante que uma escolha local não seja redirecionada silenciosamente ao gateway online.
- A seleção e seu motivo são persistidos em `model_selection_decisions`, com filtro obrigatório por owner.
- O endpoint privado de telemetria passa a incluir o histórico de decisões de seleção.

### 11.3 Limites desta versão

- O inventário online atual expõe o modelo padrão do gateway, não uma descoberta abrangente de todos os modelos de cada conta no KeyVault.
- A classificação de capacidades usa metadados e heurísticas de nomes/família; não é um benchmark semântico nem uma certificação de capabilities.
- Custos não participam ainda da pontuação do seletor. O HybridModelRouter continua aplicando reserva e limite de orçamento para qualquer execução externa.
- Os fluxos que recebem modelo explicitamente configurado não são substituídos. A seleção automática atua somente quando o contrato recebe `auto`/ `auto_hybrid`.
- A telemetria de streaming permanece incompleta, embora a seleção de modelo já seja aplicada antes do streaming.

### 11.4 Critérios para próxima iteração

Antes de habilitar seleção automática como padrão para todos os agentes, validar inventário local/online, capabilities reais, custo por provedor, modelos preferidos dos perfis, histórico por owner e comportamento em indisponibilidade. Não compartilhar dados de desempenho entre contas.


### 11.5 Ligação ao Maestro

A resolução inicial do modelo no grafo foi atualizada para não substituir `auto`/`auto_hybrid` por um modelo carregado arbitrariamente. Perfis que usam preferência automática agora passam pelo seletor central. Preferências personalizadas explícitas continuam fixas. As nove chamadas de inferência do grafo propagam owner e papel do especialista para que as decisões e o histórico permaneçam segregados por conta.

### 11.6 Estado de validação

Foram adicionados testes unitários para:
- adequação por capacidade e preferência local-first;
- exclusão de modelos externos em conteúdo sensível sem aprovação;
- inclusão de candidato externo apenas quando permitido pela política;
- recusa quando não existe candidato visual compatível;
- inferência de capacidade a partir do papel do especialista;
- seleção automática pelo ModelManager e persistência da decisão por owner;
- isolamento do histórico de decisões entre contas.

Os testes **não foram executados** nesta etapa. A consulta ao GitHub não retornou workflows de CI para os caminhos comuns verificados, nem execuções associadas ao commit de integração. A validação deve ocorrer no ambiente local/homologação antes de ativar esta estratégia em produção.


## 12. Quarta etapa — otimização de custo e aprendizagem operacional

**Estado:** implementação inicial no código concluída; testes e validação de runtime pendentes.

### 12.1 Estimativa e contabilização de custos

- O seletor recebe as tarifas por 1.000 tokens do provedor configurado no HybridModelRouter e estima o custo de cada candidato externo com base no tamanho aproximado da entrada e no limite de saída solicitado.
- A pontuação compara custos estimados entre candidatos elegíveis, aplicando penalidade relativa ao candidato mais caro. A estimativa é indicativa; o custo real depende do usage retornado pelo provedor.
- O HybridModelRouter continua a reservar orçamento antes da chamada e liquidar a reserva com tokens reportados pelo provedor.
- O custo real da inferência externa bem-sucedida passa a acompanhar a resposta e a telemetria.
- A tabela `inference_telemetry` recebe `cost_usd`; a migração adiciona a coluna às bases existentes sem apagar dados.
- O histórico de seleção guarda também `estimated_cost_usd`. O endpoint privado de telemetria já devolve o total por conta, por modelo e por decisão.
- Chamadas locais e chamadas sem custo confirmado ficam com custo zero; isso não significa que energia ou custo de hardware tenham sido medidos.

### 12.2 Política explícita local versus híbrida

- `model_name="auto"` significa seleção apenas entre modelos locais.
- `model_name="auto_hybrid"` permite incluir o modelo do gateway online quando este estiver habilitado.
- A seleção híbrida continua sujeita à contenção de dados sensíveis, aprovação humana, reserva de orçamento e fallback do HybridModelRouter.
- A escolha local define `force_local` para impedir redirecionamento silencioso ao gateway.

### 12.3 Aprendizagem operacional e limites

- O seletor utiliza histórico privado por owner de taxa de sucesso, latência e custo médio real. Quando não há tarifa configurada para um provedor, usa o custo médio observado da própria conta; sem histórico, não inventa preço.
- A telemetria agrega custos reais confirmados por modelo e owner, permitindo evolução posterior da política.
- Esta etapa **não implementa aprendizagem por qualidade semântica**: não há ainda avaliação explícita do usuário, score de qualidade validado nem treinamento/ajuste automático de pesos.
- Não há otimização de energia, custo de infraestrutura local ou preço por modelo individual quando o provedor não fornece uma tarifa específica.
- Falhas externas sem usage reportado podem ter custo real não conhecido pelo sistema; a telemetria não inventa esse valor.
- Tarifas são as configuradas no gateway ou presets existentes, não uma consulta dinâmica a preços atuais dos fornecedores.

### 12.4 Critérios de homologação

- Verificar migração de bancos SQLite antigos e novos.
- Confirmar que `auto` nunca envia inferência ao gateway e que `auto_hybrid` só o faz quando habilitado.
- Conferir custo estimado versus custo real reportado pelo provedor.
- Confirmar isolamento de totais, decisões e histórico por owner.
- Testar fallback local quando o orçamento não permite a chamada externa.
- Testar streaming separadamente: a contabilização de custo e telemetria de streaming ainda não foi completada nesta etapa.

Os testes adicionados/atualizados permanecem pendentes de execução no ambiente de homologação.


## 13. Quinta etapa — avaliação humana de qualidade e aprendizagem do Maestro

**Estado:** implementação inicial concluída; validação de testes e integração de interface pendentes.

### 13.1 Feedback associado à inferência

- Criada a tabela `inference_quality_feedback`, que guarda owner, ID da inferência, modelo, provedor, papel do agente, tarefa, nota e data.
- O endpoint `POST /api/v1/system/inference-feedback` recebe somente `inference_id` e nota de 1 a 5. Modelo, provedor, papel, tarefa e owner são recuperados no servidor a partir da telemetria.
- Só é possível avaliar inferências concluídas com sucesso e pertencentes à conta autenticada. IDs de outra conta, inexistentes ou com falha retornam não encontrado.
- Uma nova avaliação da mesma inferência atualiza a nota anterior, evitando duplicação de amostras.
- O endpoint exige a permissão `system:feedback`; a identidade nunca é recebida do cliente.
- A rota privada de telemetria inclui `model_quality`, agregado por modelo, provedor e papel, filtrado pelo owner.

### 13.2 Aprendizagem conservadora

- O seletor consulta as avaliações da própria conta e só considera o sinal após pelo menos três avaliações por modelo/provedor/papel.
- A média de 1 a 5 aplica ajuste limitado de -10 a +10 pontos na classificação. A justificativa da seleção informa a média e o número de avaliações.
- Sem amostra suficiente, a qualidade não influencia a seleção. A indisponibilidade da telemetria não impede inferências.
- O feedback não treina pesos automaticamente, não altera o catálogo de modelos e não muda permissões, privacidade, aprovação externa, orçamento ou kill switch.
- A avaliação é associada ao ID de uma inferência específica, não propagada indiscriminadamente a todos os especialistas de uma tarefa.

### 13.3 Contrato da API

Exemplo de corpo:
```json
{
  "inference_id": "ID retornado em records pela telemetria",
  "rating": 5
}
```

O ID é obtido em `GET /api/v1/system/inference-telemetry`, no campo `records[].id`. Não enviar nome de modelo, owner ou papel do agente no feedback.

### 13.4 Pendências de homologação

- Executar testes de isolamento, rejeição de inferência alheia/falhada, atualização de nota e mínimo de três avaliações.
- Validar autorização para contas humanas e dispositivos emparelhados com scope `system:feedback`.
- Criar interface de avaliação no dashboard e apresentar a nota associada à resposta correta. A API já existe, mas a interface ainda não foi implementada.
- Avaliar futuramente feedback explícito de tarefa completa e critérios objetivos de qualidade; não confundir avaliação de uma inferência com qualidade global de todo o fluxo multiagente.

Os testes desta etapa foram adicionados, mas ainda não foram executados.


### 13.5 Interface do Dashboard — feedback no chat e painel de qualidade

- Cada resposta do Maestro com `task_id` consulta as inferências bem-sucedidas daquela tarefa, sem buscar inferências de outras contas.
- O endpoint de telemetria aceita filtro opcional `task_id` e retorna `feedback_rating` junto a cada registro.
- O chat apresenta controles de nota de 1 a 5 por inferência/modelo/especialista. Após salvar, o estado visual mostra a nota persistida.
- O gestor de modelos ganhou a aba **Qualidade & Aprendizagem**, com média, número de avaliações e indicação de amostra suficiente.
- A aba consulta apenas o agregado da conta autenticada; não expõe prompts nem respostas.
- Inferências de fluxos conversacionais que não geram `task_id` no orquestrador não exibem avaliação nesta versão.

## 14. Auditoria incremental do frontend — navegação, perfil, chat e workspace

**Estado:** correções iniciais gravadas na branch de auditoria; testes de build, lint, integração e responsividade ainda não executados.

### 14.1 Navegação e identidade visual

- A entrada raiz e o alias legado de dashboard passam a abrir a Visão Geral, evitando iniciar automaticamente no chat.
- Foram registados os deep links de SPA `/logs`, `/backend-studio` e `/executive-report`.
- A autenticação foi alinhada aos tokens visuais do projeto; o acento laranja existente foi preservado.
- O assistente de setup, filtros de tarefas, navegação de modelos e estados ativos da sidebar passaram a reutilizar os tokens de acento.
- O shell do dashboard utiliza altura dinâmica e espaçamentos fluidos para reduzir overflow em ecrãs estreitos.

### 14.2 Perfil e preferências da conta

- A rota de perfil usa `get_principal` e deriva o owner no servidor; o cliente não escolhe o identificador da conta.
- A interface permite escolher o ícone do perfil e reflete a seleção no cabeçalho e na sidebar.
- O carregamento do perfil é cancelável ao fechar o modal; o botão de gravação indica estado e impede submissões duplicadas.
- O modo Essencial/Técnico/Avançado é uma preferência local por conta/navegador; não deve ser descrito como alteração global enquanto os módulos não aplicarem esse modo.
- O perfil não recolhe nem persiste tokens de providers. A gestão de credenciais é encaminhada para o Gestor de Modelos/Cofre de Chaves, conforme as permissões.
- O backup do banco é uma operação administrativa validada pela API; a interface não apresenta o caminho físico do servidor.
- Exportação e limpeza locais foram descritas com o respetivo âmbito. A limpeza percorre também caches locais de sessões, limitando-se ao sufixo da conta ativa.
- O formulário e as opções de avatar receberam comportamento responsivo e estados visuais do design system.

### 14.3 Chat e seleção de modelos

- A preferência de modelo foi movida para uma chave de armazenamento delimitada pela conta ativa.
- O seletor deixa de apresentar um catálogo estático de modelos não confirmados. Só apresenta modelos devolvidos pela API.
- Na ausência de seleção explícita, o chat usa a seleção automática do Maestro; não força um provider cloud como fallback visual.
- A saudação inicial deixou de afirmar uma quantidade fixa de especialistas e passou a descrever agentes/ferramentas disponíveis e sujeitos a permissões.
- O histórico, tarefas e sessões do chat continuam a usar owner derivado do principal autenticado nas rotas de backend.

### 14.4 Project Workspace e segurança

- Listagem, leitura, edição, abertura e remoção de projetos validam a propriedade da conta nas rotas correspondentes.
- O endpoint `POST /api/v1/workspace/open-root` passou a exigir principal humano autenticado.
- A notificação de abertura da pasta geral deixou de expor o caminho físico do servidor.

### 14.5 Pendências antes de homologação

- Auditar os restantes módulos e componentes partilhados, incluindo onboarding, aprendizagem, agentes, tarefas, aprovações, modelos, segurança, conhecimento, coding e relatórios.
- Confirmar todas as rotas do React Router, menu/sidebar e fallback SPA, incluindo aliases e páginas não encontradas.
- Integrar o estado de experiência nos módulos que vierem a suportá-lo; por enquanto é apenas uma preferência local.
- Verificar permissões de UI para operações administrativas, incluindo backup, sem depender apenas da mensagem de erro do backend.
- Concluir o onboarding real: criação inicial segura do administrador, configuração da chave mestra, diagnóstico de serviços e recuperação de fluxo interrompido.
- Executar build, lint, testes unitários, testes de integração, testes de isolamento por conta e verificação visual nos viewports acordados. Nenhum desses testes foi executado durante esta etapa.
