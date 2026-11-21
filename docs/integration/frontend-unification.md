# Plano de unificação do Frontend_JarvisHub

## Objetivo

Consolidar o repositório `AlexandreCalmonJr/Frontend_JarvisHub` como origem de evolução da interface React do JARVIS AI HUB, mantendo `AlexandreCalmonJr/JarvisHub_IA` como repositório canônico do produto e do backend.

A integração será incremental, validada por testes e sem substituir funcionalidades existentes de forma destrutiva.

## Estado confirmado na inspeção inicial

- `JarvisHub_IA` já contém um workspace npm na raiz e o dashboard em `apps/dashboard`.
- O dashboard canônico usa React 19, TypeScript, Vite 6 e possui testes Node e Playwright.
- `apps/api/main.py` já monta o build do dashboard em `apps/dashboard/dist` e encaminha rotas SPA.
- O backend canônico é FastAPI, com routers de domínio em `apps/api/routers`, autenticação central, serviços e persistência próprios.
- `Frontend_JarvisHub` também usa React 19, TypeScript e Vite 6, mas contém um servidor Express em `server.ts`, além de serviços e estado de backend próprios.
- Os dois projetos não devem ter seus servidores fundidos por cópia de arquivos: isso criaria duas fontes de verdade para autenticação, sessão, persistência e regras de negócio.

## Decisão arquitetural

1. Manter `JarvisHub_IA` como repositório canônico e backend principal.
2. Manter React + TypeScript + Vite como stack oficial do dashboard.
3. Aproveitar componentes, telas, estilos e funcionalidades úteis do Frontend_JarvisHub por migrações seletivas.
4. Integrar o dashboard exclusivamente aos contratos HTTP/SSE/WebSocket publicados pelo FastAPI.
5. Não transportar o servidor Express, seus dados em memória, contas seed ou credenciais padrão para o backend canônico.
6. Preservar rotas e contratos existentes sempre que possível; alterações incompatíveis exigem adaptador e testes de contrato.
7. Preservar a identidade visual e as funcionalidades atuais até que a substituição tenha paridade comprovada.

## Etapas incrementais

### Etapa 0 — Isolamento e baseline

- Trabalhar na branch `integration/frontend-unification`.
- Não alterar `main` diretamente.
- Registrar o estado atual dos testes de backend e dashboard antes da primeira migração.
- Identificar diferenças de dependências, rotas, autenticação, armazenamento e componentes entre os dois dashboards.

### Etapa 1 — Contratos e compatibilidade

- Inventariar chamadas API do Frontend_JarvisHub.
- Mapear cada chamada para um endpoint FastAPI existente.
- Marcar endpoints ausentes, divergentes ou que exigem adaptador.
- Criar testes de contrato para autenticação, sessão, perfil, permissões, chat/streaming e módulos prioritários.
- Não alterar a API pública apenas para acomodar chamadas antigas sem avaliar compatibilidade.

### Etapa 2 — Fundação visual e navegação

- Comparar árvore de componentes, rotas, layout, sidebar e tokens CSS.
- Migrar componentes isolados, sem substituir o App inteiro.
- Executar typecheck, testes de roteador e testes de renderização a cada lote.
- Garantir que todas as rotas tenham página, permissão e estado de erro/carregamento.

### Etapa 3 — Integração por domínio

Migrar um domínio de cada vez, nesta ordem inicial:
1. autenticação, sessão e perfil;
2. visão geral e saúde do sistema;
3. chat e streaming;
4. agentes e tarefas;
5. workspace e coding;
6. modelos e provedores;
7. aprovações e segurança;
8. conhecimento, skills e demais estúdios.

Cada domínio só será considerado integrado quando os testes de contrato, unidade e fluxo E2E relevantes passarem.

### Etapa 4 — Remoção controlada de duplicações

- Remover código legado somente após comprovar que não há consumidores.
- Não copiar dados em memória nem credenciais seed do servidor Express.
- Documentar qualquer migração de dados necessária e manter backup/rollback.
- Manter o frontend standalone antigo disponível até a homologação do dashboard unificado.

### Etapa 5 — Homologação

- Build de produção do dashboard.
- Testes completos do backend e frontend.
- Testes E2E de login, navegação, permissões, atualização de página em rotas profundas e fluxos críticos.
- Testes de isolamento entre contas e persistência após reinício.
- Abrir PR para revisão; não fazer merge automático.

## Critérios de aceite

- O backend FastAPI continua sendo a única fonte de verdade para autenticação, autorização e dados.
- O dashboard é servido pelo backend conforme a configuração existente.
- Nenhuma credencial padrão ou segredo é introduzido no código.
- Rotas e permissões permanecem consistentes.
- Testes relevantes passam antes e depois de cada migração.
- Não há regressão funcional conhecida sem registro e plano de correção.
- `main` permanece intacta até aprovação do PR.

## Regra operacional

Cada lote deve conter: escopo pequeno, testes antes/depois, resumo dos arquivos alterados, riscos conhecidos e procedimento de rollback. Nenhuma reescrita ampla ou remoção de módulo será feita como parte de uma migração incremental.
