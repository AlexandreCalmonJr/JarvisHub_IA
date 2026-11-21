# Inventário definitivo e plano de migração incremental — Frontend_JarvisHub → JarvisHub_IA

- Repositório de destino/canônico: `AlexandreCalmonJr/JarvisHub_IA`
- Repositório de origem funcional: `AlexandreCalmonJr/Frontend_JarvisHub`
- Branch de trabalho: `integration/frontend-unification`
- Backend de destino: FastAPI em `apps/api`
- Frontend de destino: React + TypeScript + Vite em `apps/dashboard`
- Estado: plano de execução; não representa funcionalidades já migradas ou testes já aprovados.

## 1. Objetivo e regras inegociáveis

Migrar as capacidades úteis do frontend/servidor Express para o JarvisHub_IA por entregas pequenas, preservando os comportamentos válidos e usando o FastAPI como backend único.

1. O FastAPI é a única autoridade para autenticação, autorização, persistência e regras de negócio.
2. O Express permanece disponível apenas como referência de comportamento e rollback durante a migração. Não copiar o servidor inteiro, nem removê-lo antes da homologação.
3. Não transportar sessões em memória, mapas globais, contas seed, tokens, credenciais ou segredos do Express.
4. Dados persistentes devem pertencer ao usuário/conta autenticado. O proprietário é resolvido no servidor, nunca confiado a um `user_id` enviado pelo cliente.
5. Operações privilegiadas exigem autorização, auditoria, validação de entrada e, quando aplicável, aprovação explícita.
6. Não declarar paridade com base apenas na existência de uma rota. Confirmar método, schema, semântica, status HTTP, persistência, isolamento e comportamento de erro.
7. Não criar respostas simuladas que façam uma função ausente parecer operacional.
8. Preservar APIs internas e compatibilidade quando possível. Mudanças incompatíveis precisam de adaptador e teste de contrato.
9. Trabalhar exclusivamente na branch `integration/frontend-unification`; não alterar nem fazer merge em `main` sem autorização explícita.
10. Nesta fase, não reconstruir o aplicativo Flutter nem criar outro aplicativo Android. Aproveitar e integrar o Android já existente no projeto de origem.

## 2. Organização em oito frentes

A lista original contém dez nomes quando Brain e Brain Server e IDE e Sentinel são contados separadamente. Para manter oito frentes sem descartar capacidades, os domínios são agrupados assim:

| Frente | Escopo incluído | Principais componentes de origem | Situação inicial no FastAPI |
|---|---|---|---|
| 1. Agentes | Catálogo, agentes fixos/personalizados, configuração, skills, versões, rollback, memória, playground, ferramentas, tarefas e streaming | `agents.ts`, agentes e motores associados | Parcial: catálogo, detalhe, config, memória, playground, tools, routes, task/history/stream existem; criação, exclusão, skills por agente, versões e rollback não foram encontrados |
| 2. Modelos | Catálogo, runtimes, provedores, hardware, recomendações, arena, Hugging Face, gateway híbrido, vault e métricas | `models.ts`, `hybridAiEngine.ts` | Parcial: catálogo, estado, métricas, hybrid config/test, Hugging Face, recomendações e vault base existem; hardware CRUD, providers update, apply recommendation e arena precisam de confirmação/implementação |
| 3. Brain + Brain Server | Memórias, distilação, configurações, embeddings, workspaces, perfis, backup/export/import, bundles, Python lanes, MCP servers, federation/relay e compartilhamento de ativos | `brain.ts`, `brainServer.ts`, `secondBrain.ts`, `sqliteBrainStore.ts`, `brainRouter.ts` | Ausente como domínio FastAPI completo; memória e conhecimento existentes não equivalem automaticamente a todas as operações |
| 4. Integrações | Catálogo e configuração de providers, GitHub inspect/import, Figma sync, context sets, conectores e credenciais | `integrations.ts`, `integrationsEngine.ts`, GitHub importer | Parcial: MCP/skills e algumas capacidades GitHub existem em outros domínios; falta confirmar contratos completos, credenciais por conta e sincronização |
| 5. Workflows + Orquestração | CRUD, geração, grafo, agendamento, execução, delegação multiagente, Agent Office, roundtable e artefatos | `orchestration.ts`, `multiOrchestrator.ts`, `artifactEngine.ts` | Parcial/ausente: agentes, chat tasks e teammates existem; não substituem workflow persistente, grafo e roundtable |
| 6. IDE + Sentinel | IDE workspace, proposta/aplicação de mudanças, checkpoints/restore, terminal seguro, permissões, Sentinel, threat scan, incidentes e playbooks | `securityPhase5.ts`, `sentinelSecurity.ts`, coding/IDE services | Parcial: coding, workspace, approvals, audit, kill switch e algumas defesas existem; rotas IDE e capacidades Sentinel/matriz/playbooks precisam de paridade |
| 7. Companion | Estado, pareamento, heartbeat, comandos, decisões, scripts, briefing/conversa por voz, push config e notificações | `companionPhase6.ts`, `voiceCompanion.ts` | Parcial: voz/transcrição/síntese/comando e mobile pairing existem; ciclo completo de companion e push não foi encontrado |
| 8. Android | Pareamento/dispositivos, gestão de dispositivos, preview, geração/build/package de projetos Android e comunicação com Companion | `androidAppServer.ts`, Android Mobile Hub | Parcial: mobile pairing e gestão básica existem em security; preview/build/package e contratos equivalentes precisam de implementação/validação. O app Android existente deve ser reaproveitado |

### Capacidades adicionais que não podem desaparecer

Estas áreas foram identificadas no inventário anterior e devem permanecer no escopo global. Não serão artificialmente consideradas concluídas por pertencerem a outra frente:

- **Creative Media Studio**: geração e gestão de artefatos de imagem/vídeo; identificar motores, dependências, custos e limites.
- **Spreadsheet Studio**: criação, edição, processamento, importação/exportação e persistência de planilhas.
- **App Builder**: blueprint, geração de projeto, validação e exportação.
- **GitHub Importer**: inspeção e importação de repositórios/skills, sem exposição de tokens.
- **Learning Center / Guided Tours**: progresso e tutoriais persistidos e sincronizados por conta.
- **Dashboard/PWA e navegação**: páginas, rotas, sidebar, command palette, responsividade e identidade visual.
- **Workspace, Knowledge, Skills, Chat, Coding, Hardware, Studios existentes**: preservar e testar contratos já implementados; não reescrever sem necessidade.

A auditoria deve localizar o destino de cada capacidade e registrar explicitamente: migrada, já equivalente, adaptada, dependente de serviço externo/hardware, ou não migrar com justificativa aprovada.

## 3. Processo obrigatório para CADA frente

Nenhuma frente será considerada migrada apenas porque os arquivos foram copiados ou as rotas foram criadas. Repetir este ciclo em cada uma das oito frentes:

### Fase A — Baseline e descoberta
- Identificar todos os arquivos, funções, motores, dependências, rotas HTTP, SSE, WebSocket e chamadas indiretas no Express e frontend de origem.
- Ler os handlers reais e os motores importados; distinguir lógica funcional, mock, placeholder e estado em memória.
- Mapear os endpoints FastAPI atuais, schemas, dependências de autenticação, tabelas/coleções e serviços.
- Executar e registrar os testes existentes antes de alterar código.
- Produzir uma matriz endpoint-a-endpoint: equivalente, divergente, ausente, obsoleto ou não aplicável.

### Fase B — Contrato primeiro
- Definir schemas request/response, métodos, paths, códigos HTTP e eventos de streaming.
- Definir autenticação, autorização, propriedade dos dados, auditoria, limites e aprovações.
- Criar testes de contrato que falhem quando o comportamento esperado não existir.
- Para persistência, testar isolamento entre duas contas e sobrevivência a reinício.
- Não alterar o frontend para consumir um contrato ainda indefinido.

### Fase C — Implementação mínima
- Implementar apenas o menor conjunto de operações necessário para a funcionalidade da frente.
- Reutilizar serviços e padrões FastAPI existentes; não duplicar abstrações.
- Adicionar migração de banco de dados versionada quando necessário.
- Manter compatibilidade/adaptadores para contratos legados quando justificável.
- Não retornar sucesso se a gravação, execução ou operação real falhar.

### Fase D — Testes por camada
Executar os testes aplicáveis e anexar evidências:
1. unitários de regras e serviços;
2. contrato HTTP/SSE/WebSocket;
3. integração com banco, filesystem, providers ou workers;
4. autorização e permissões (401/403);
5. isolamento multiusuário/tenant;
6. persistência após reinício;
7. tratamento de falhas, timeout, retry e cancelamento;
8. segurança: segredos, validação, path traversal, execução de comandos e limites;
9. E2E do fluxo principal no dashboard/app Android quando a UI estiver conectada;
10. regressão dos módulos que já funcionavam.

### Fase E — Homologação e gate
Uma frente só passa quando:
- todos os testes obrigatórios passam;
- não há falha crítica ou regressão aberta;
- a matriz de contratos está atualizada;
- documentação de operação e rollback existe;
- logs e evidências registram comandos, resultados e limitações;
- não há dados/segredos globais ou vazamento entre contas;
- o fluxo real foi demonstrado, sem mock apresentado como produção.

Se falhar, corrigir dentro da mesma frente. Não iniciar a seguinte até obter aprovação explícita do gate da frente atual, salvo trabalho de documentação independente.

### Fase F — Entrega e rollback
Ao terminar cada frente, entregar:
- resumo funcional do que foi migrado;
- lista de arquivos e migrations alterados;
- endpoints e schemas implementados;
- testes executados com resultado individual;
- pendências e riscos conhecidos;
- procedimento de rollback;
- estado: concluído, parcial ou bloqueado.

O Express continua intacto como referência até a homologação global. A remoção será uma entrega separada, nunca parte da migração de um domínio.

## 4. Ordem de execução

| Ordem | Frente | Entrega verificável | Gate para avançar |
|---:|---|---|---|
| 0 | Baseline global | Testes iniciais, inventário de rotas e dependências, mapa de persistência e riscos | Baseline reproduzível e escopo congelado |
| 1 | Agentes | Paridade do catálogo e operações de gestão; memória/skills/tarefas/stream com isolamento | Contratos, testes de permissão e multi-conta aprovados |
| 2 | Modelos | Provedores, hardware, recomendações, arena, vault e roteamento híbrido | Segredos protegidos, orçamento/auditoria e testes de runtime aprovados |
| 3 | Brain + Brain Server | Memória, distilação, configurações, backup/import/export, bundles e lanes com isolamento | Persistência, recuperação, integridade e isolamento aprovados |
| 4 | Integrações | Conectores, GitHub/Figma, context sets e gestão de credenciais | OAuth/tokens, escopos, revogação, auditoria e falhas testados |
| 5 | Workflows + Orquestração | Grafo, CRUD, geração, execução, delegação, roundtable e artefatos | Execução determinística/observável, cancelamento, retry e persistência testados |
| 6 | IDE + Sentinel | Workspace, propose/apply, checkpoints, permissões, scans e playbooks | Sandbox, aprovação, trilha de auditoria e rollback aprovados |
| 7 | Companion | Voz, estado, pareamento, comandos, decisões, scripts e push | Autorização por dispositivo, consentimento, revogação e notificações testados |
| 8 | Android | Integração do app existente, dispositivos, preview e pipeline de build/package | Pareamento seguro, builds reproduzíveis e testes em dispositivo/emulador aprovados |
| 9 | Fechamento global | Creative Media, Spreadsheet Studio, App Builder, GitHub Importer, Learning Center, navegação e auditoria de paridade | Inventário integral fechado e homologação ponta a ponta |

A ordem é intencional: agentes e modelos formam a base de execução; Brain sustenta contexto e memória; integrações fornecem ferramentas; workflows coordenam a execução; IDE/Sentinel aplica controles; Companion e Android dependem de identidade, permissões e dispositivos já estabilizados.

## 5. Critérios transversais de qualidade e segurança

- **Tenant isolation:** toda consulta e mutação de dados privados deve filtrar pelo proprietário autenticado; testar tentativas de acesso cruzado.
- **Persistência:** não usar `Map`, arrays globais ou SQLite temporário do Express como armazenamento de produção; definir banco e ciclo de migrations no backend canônico.
- **Segredos:** credenciais de providers e integrações guardadas no vault existente, criptografadas e nunca retornadas em respostas/logs.
- **Execução:** terminal, scripts, builds, Python lanes, workers e ferramentas externas executados em sandbox/allowlist, com timeout, quotas e aprovação conforme risco.
- **Auditoria:** registrar ator, ação, recurso, resultado, timestamp e correlação, sem registrar segredos ou conteúdo sensível desnecessário.
- **Streaming:** validar autenticação, autorização, desconexão, cancelamento e eventos terminais em SSE/WebSocket.
- **Compatibilidade:** preservar nomes/formatos públicos quando possível; documentar e testar adaptadores quando não for possível.
- **Observabilidade:** logs estruturados, métricas e erros acionáveis; nenhuma falha silenciosa convertida em resposta de sucesso.
- **Frontend:** cada tela só será conectada depois de seu endpoint estar homologado; estados loading/empty/error/permission-denied devem ser cobertos.
- **Android:** reaproveitar o app existente; não introduzir Flutter nesta etapa.

## 6. Estado atual confirmado antes da execução deste plano

- A branch de trabalho é `integration/frontend-unification`; `main` não deve ser alterada.
- Existe documentação de unificação, inventário de funcionalidades e matriz inicial de compatibilidade.
- O transporte central `apiFetch` e a migração de serviços de chat, agents, models, workspace e AuthGate foram registrados na matriz anterior.
- A auditoria estática anterior identificou cobertura parcial de Agents e Models e ausência/parcialidade em Brain, Brain Server, Integrations, Orchestration/Workflows, IDE/Sentinel e Companion.
- A existência de routers FastAPI não foi tratada como prova de paridade.
- O CI anteriormente observado teve dashboard aprovado numa execução parcial; Python/Flutter ainda estavam em andamento naquela observação. Não declarar o pipeline completo aprovado com base nisso.
- Nenhuma funcionalidade listada neste plano é declarada como migrada por este documento.

## 7. Próxima execução autorizada pelo plano

Começar pela **Frente 1 — Agentes**, sem alterar outras frentes:
1. capturar baseline dos testes existentes;
2. inspecionar handlers Express de agentes e motores importados;
3. inspecionar router, serviços, modelos e persistência FastAPI;
4. escrever a matriz detalhada de contratos e identificar semântica global vs por conta;
5. criar testes de contrato primeiro;
6. implementar a primeira operação ausente em lote pequeno;
7. executar testes e apresentar relatório antes de avançar à operação seguinte.

Não fazer merge para `main`, não apagar Express, não iniciar migração Flutter e não executar refatoração ampla como parte desta etapa.
