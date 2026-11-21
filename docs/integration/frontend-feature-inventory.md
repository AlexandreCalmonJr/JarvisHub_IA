# Inventário de aproveitamento integral do Frontend Jarvis Hub

## Decisão de integração

O objetivo é preservar e incorporar o conjunto de funcionalidades do repositório `Frontend_JarvisHub` ao dashboard de `JarvisHub_IA`, mantendo o FastAPI de `JarvisHub_IA` como único servidor de aplicação e fonte de verdade.

- Repositório canônico: `AlexandreCalmonJr/JarvisHub_IA`.
- Origem das funcionalidades de interface: `AlexandreCalmonJr/Frontend_JarvisHub`.
- Branch de trabalho: `integration/frontend-unification`.
- Dashboard de destino: `apps/dashboard`.
- Backend oficial: `apps/api` (FastAPI).

Não transportar `server.ts`, o servidor Express, seus mapas/estados em memória, contas seed, tokens padrão ou armazenamento SQLite local como segundo backend. A lógica útil existente nesse servidor deve ser reimplementada/adaptada como serviços e rotas FastAPI, ou reutilizada no frontend quando for puramente de apresentação/execução local e segura.

## Inventário de funcionalidades a preservar

O inventário abaixo é baseado na árvore de arquivos e nos módulos de API identificados no Frontend_JarvisHub. "Mapeamento existente" significa que há um domínio/roteador no backend principal; não significa que todos os endpoints e payloads já sejam compatíveis. Cada contrato precisa ser comparado e testado antes da migração da tela.

| Área funcional do frontend de origem | Elementos identificados | Domínio de destino no FastAPI | Situação inicial |
|---|---|---|---|
| Autenticação e conta | AuthGate, sessão, troca inicial de senha, perfil e onboarding | `auth.py`, perfil em `system.py`/serviços de conta | Adaptar transporte e contrato; sessão por cookie HTTPOnly |
| Visão geral | Overview, gráficos de uso e indicadores | `system.py`, `models.py` | Comparar dados e métricas |
| Chat | ChatMaster, histórico, projetos, artefatos, streaming SSE | `chat.py` | Domínio existente; validar eventos SSE e payloads |
| Agentes | Catálogo, criação, detalhes, templates, playground, rotas, skills e versões | `agents.py`, `skills.py` | Domínio existente; validar cobertura de cada operação |
| Escritório/companheiros | Agent Office, Companion Hub, voz ao vivo, wake word | `voice.py`, `omnichannel.py`, agentes | Cobertura parcial a confirmar; recursos de dispositivo podem exigir adaptação |
| Tarefas e orquestração | Task Manager, delegação, execução multiagente | `chat.py`, `agents.py`, `workspace.py` e serviços | Mapear operações e persistência |
| Workspace | Projetos, arquivos, importação de pastas, memória de projeto e webhooks | `workspace.py` | Domínio existente; comparar endpoints e isolamento por usuário |
| Coding / IDE | Coding Agent, IDE Workspace, terminal e execução assistida | `coding.py`, `terminal.py`, `workspace.py` | Domínio existente; validar aprovações e limites de execução |
| Modelos e provedores | Model Manager, Hugging Face, arena, recomendações e gateway híbrido | `models.py`, roteamento híbrido/serviços | Domínio existente; conferir cofre e orçamento |
| Hardware | Advisor, especificações, perfis e desempenho Ollama | `hardware.py`, `models.py` | Domínio existente; comparar persistência e fontes reais |
| Conhecimento e memória | Knowledge Vault, Brain Map, memória e documentos | `knowledge.py`, serviços de memória | Domínio existente; validar armazenamento por conta |
| Skills e integrações | Skills Manager, catálogo e conectores | `skills.py`, `mcp.py` | Domínio existente; inventariar conectores individualmente |
| Segurança | Security Center, permissões, containment, Sentinel/SOC e auditoria | `security.py`, `auth.py` | Domínio existente; validar cada ação privilegiada |
| Aprovações | Approval Center e Approval Prompt Host | `security.py` e serviços de aprovação | Localizar contrato e confirmar fluxo completo |
| Logs e métricas | Server Logs, inference history, model metrics e terminal console | `system.py`, `terminal.py`, logs/auditoria | Cobertura parcial a confirmar |
| Workflows | Canvas, grafo de execução, agendamento e automação | `agents.py`/serviços de orquestração | Confirmar API persistente; não manter estado só no browser |
| Estúdios | Backend Studio, Quality Studio e Design Studio | `studios.py`, `coding.py` | Domínio existente; validar ferramentas e artefatos |
| App Builder | Geração de blueprint, projeto e exportação | `studios.py`/serviços de geração | Contrato/serviço a confirmar |
| Mídia criativa | Imagem e vídeo | `studios.py` ou novo serviço FastAPI | Verificar implementação e dependências |
| GitHub | Importação e inspeção de repositórios | `mcp.py`/integrações | Confirmar rotas e credenciais por usuário |
| Android Mobile Hub | Pareamento, preview e geração de projeto Android | `workspace.py`/serviço dedicado | Exige mapeamento; não presumir cobertura |
| Aprendizagem | Learning Center, Guided Tour e progresso | `learning.py` | Domínio existente; validar sincronização por usuário |
| Uso e custos | Usage Analytics e limites de orçamento | `models.py`, `system.py` | Validar fonte de métricas e persistência |
| PWA e navegação | Instalação PWA, Command Palette, Primary Rail, Dynamic Island, Agent Dock | Frontend, sem servidor próprio | Migrar UI e testar rotas/responsividade |
| Identidade visual e experiência | AssistantIdentityContext, mascote, temas, toasts e modais | Frontend + perfil FastAPI quando persistente | Preservar comportamento e preferências por conta |

## Módulos de API do frontend de origem identificados

Os serviços TypeScript de origem incluem:

- `chat`, `workspace`, `models`, `hardware`, `agents`, `skills`, `knowledge`;
- `security`, `studios`, `system`, `coding`, `profile`;
- `brain`, `brainServer`, `integrations`, `orchestration`;
- `securityPhase5`, `companionPhase6`;
- transporte de sessão em `sessionTransport.ts`.

Esses módulos serão usados como catálogo de operações a comparar com o OpenAPI/routers FastAPI. A existência de uma função no frontend não prova que a rota correspondente exista no servidor principal.

## Regras obrigatórias de arquitetura

1. FastAPI é a única autoridade para autenticação, autorização, usuários, sessões, dados e regras de negócio.
2. O navegador usa `/api/v1` no mesmo domínio e cookies de sessão HTTPOnly; não guardar token de sessão em `sessionStorage` nem depender de `X-Jarvis-Session` no fluxo normal de browser.
3. Toda informação persistente deve ser isolada por conta/usuário no backend. Nunca confiar em um `user_id` enviado pelo cliente para definir o proprietário.
4. Recursos em tempo real devem usar os mecanismos publicados pelo FastAPI (SSE/WebSocket) e autenticação/autorização equivalentes.
5. Funcionalidade sem endpoint compatível deve ser marcada como pendente; criar contrato FastAPI e teste antes de conectar a interface.
6. Segredos de provedores e integrações ficam no cofre do backend, nunca em estado global do Express ou armazenamento local do navegador.
7. Recursos que exigem processo local (por exemplo, Ollama, terminal, Android build) devem passar por serviços/worker controlados pelo backend, com permissões, aprovações e limites.
8. Manter o frontend original como referência/rollback até que cada domínio esteja migrado e homologado.

## Plano de execução por entregas

### Entrega 1 — Baseline e inventário de contratos
- Registrar scripts de teste e comandos de build dos dois repositórios.
- Extrair as operações HTTP, SSE e WebSocket realmente chamadas por cada módulo de API do frontend.
- Extrair rotas, métodos, modelos de request/response e dependências de autenticação do FastAPI.
- Gerar matriz endpoint-a-endpoint: compatível, adaptador necessário, ausente ou obsoleto.
- Criar testes de contrato sem alterar o comportamento de produção.

### Entrega 2 — Fundação visual
- Comparar App, layout, navegação, tokens CSS, componentes compartilhados e rotas.
- Migrar a fundação visual para `apps/dashboard` sem substituir o dashboard inteiro de uma vez.
- Testar navegação direta, refresh, voltar/avançar, permissões e estados de carregamento/erro.

### Entrega 3 — Sessão e perfil
- Adaptar AuthGate e fluxo de perfil ao login FastAPI, `/api/v1/auth/me`, logout e cookie HTTPOnly.
- Remover dependência de token de sessão no sessionStorage do browser.
- Validar troca obrigatória de senha, expiração, 401/403 e isolamento entre contas.

### Entrega 4 — Domínios funcionais
Migrar cada área do inventário em lotes pequenos. Cada lote inclui tela/componentes, adaptador API quando necessário, testes unitários/contrato e E2E do fluxo principal.

### Entrega 5 — Recursos sem cobertura
Criar no FastAPI somente os endpoints/serviços que faltarem, respeitando schemas, autorização, auditoria, isolamento por usuário, persistência e aprovações.

### Entrega 6 — Remoção do backend legado e homologação
Somente após paridade funcional, retirar dependências do Express e confirmar que nenhum módulo depende dele. Executar build, testes backend/frontend/E2E e testes multiusuário. Abrir PR para revisão; não fazer merge automático.

## Critérios de conclusão

- Todas as funcionalidades úteis identificadas no frontend de origem têm destino: migradas, adaptadas ou explicitamente justificadas como dependentes de hardware/serviço externo.
- Nenhuma tela aparenta estar integrada quando sua API ainda é simulada ou inexistente.
- Um único backend de aplicação: FastAPI.
- Sem credenciais padrão, sessões em armazenamento inseguro ou estado global compartilhado entre usuários.
- Testes de contrato e E2E cobrindo os fluxos críticos.
- Build de produção e inicialização documentados.
- O frontend antigo permanece disponível até homologação e rollback aprovado.

## Estado desta documentação

Este é o inventário inicial baseado na árvore de arquivos e em amostras dos serviços. Ainda não representa auditoria endpoint-a-endpoint nem execução de testes. Os próximos commits devem transformar a matriz em evidência verificável, sem presumir compatibilidade.


## Plano definitivo de migração

O inventário operacional e os gates de implementação/testes estão consolidados em [`definitive-migration-plan.md`](./definitive-migration-plan.md). Esse documento organiza o escopo em oito frentes: Agentes; Modelos; Brain + Brain Server; Integrações; Workflows + Orquestração; IDE + Sentinel; Companion; Android. Também mantém Creative Media Studio, Spreadsheet Studio, App Builder, GitHub Importer, Learning Center e navegação no fechamento global, para que nenhuma capacidade identificada seja perdida. Cada frente exige contrato primeiro, testes por camada, homologação e rollback antes de avançar.
