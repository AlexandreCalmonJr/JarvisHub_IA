export interface DomainOption {
  id: string;
  label: string;
  shortLabel: string;
  group: 'operations' | 'personal' | 'tech';
}

export interface SkillQuickTemplate {
  id: string;
  label: string;
  domain: string;
  desc: string;
  instructions: string;
}

export interface AgentQuickPreset {
  id: string;
  label: string;
  properName: string;
  handle: string;
  roleTitle: string;
  category: string;
  mission: string;
  systemPrompt: string;
  mascotId: 'scholar_fox' | 'sentinel_owl' | 'artisan_cat' | 'dev_robot' | 'finance_bear' | 'orchestrator_hawk';
  mascotColor: string;
}

export const CUSTOM_AREA_VALUE = '__custom__';

export const AGENT_CATEGORY_CATALOG: DomainOption[] = [
  { id: 'administration', label: 'Administração & Gestão', shortLabel: 'Administração', group: 'operations' },
  { id: 'business', label: 'Negócios & Finanças', shortLabel: 'Negócios', group: 'operations' },
  { id: 'logistics', label: 'Logística & Suprimentos', shortLabel: 'Logística', group: 'operations' },
  { id: 'sales_marketing', label: 'Vendas & Marketing', shortLabel: 'Vendas & Mkt', group: 'operations' },
  { id: 'legal', label: 'Jurídico & Documentos', shortLabel: 'Jurídico', group: 'operations' },
  { id: 'health', label: 'Saúde & Bem-Estar', shortLabel: 'Saúde', group: 'personal' },
  { id: 'studies', label: 'Idiomas, Estudos & Educação', shortLabel: 'Estudos & Idiomas', group: 'personal' },
  { id: 'home_routine', label: 'Casa & Rotina Pessoal', shortLabel: 'Casa & Rotina', group: 'personal' },
  { id: 'gastronomy', label: 'Gastronomia & Lifestyle', shortLabel: 'Gastronomia', group: 'personal' },
  { id: 'creative', label: 'Criativo, Slides & PDFs', shortLabel: 'Criativo & Docs', group: 'personal' },
  { id: 'iot', label: 'IoT & Automação', shortLabel: 'IoT', group: 'tech' },
  { id: 'security', label: 'Segurança & Auditoria', shortLabel: 'Segurança', group: 'tech' },
  { id: 'dev', label: 'Engenharia & Tecnologia', shortLabel: 'Tecnologia', group: 'tech' },
  { id: 'orchestration', label: 'Orquestração & Fluxos', shortLabel: 'Orquestração', group: 'tech' },
];

export const SKILL_DOMAIN_CATALOG: DomainOption[] = [
  { id: 'administration', label: 'Administração & Processos', shortLabel: 'Administração', group: 'operations' },
  { id: 'business', label: 'Negócios & Finanças', shortLabel: 'Negócios', group: 'operations' },
  { id: 'logistics', label: 'Logística & Estoque', shortLabel: 'Logística', group: 'operations' },
  { id: 'sales_marketing', label: 'Vendas & Marketing', shortLabel: 'Vendas & Mkt', group: 'operations' },
  { id: 'legal', label: 'Jurídico & Contratos', shortLabel: 'Jurídico', group: 'operations' },
  { id: 'health', label: 'Saúde & Bem-Estar', shortLabel: 'Saúde', group: 'personal' },
  { id: 'studies', label: 'Idiomas & Educação', shortLabel: 'Estudos & Idiomas', group: 'personal' },
  { id: 'home_routine', label: 'Casa & Rotina Pessoal', shortLabel: 'Casa & Rotina', group: 'personal' },
  { id: 'gastronomy', label: 'Gastronomia & Lifestyle', shortLabel: 'Gastronomia', group: 'personal' },
  { id: 'creative', label: 'Criativo & Conteúdo', shortLabel: 'Criativo', group: 'personal' },
  { id: 'iot', label: 'IoT, Sensores & Automação', shortLabel: 'IoT', group: 'tech' },
  { id: 'backend', label: 'Backend & APIs', shortLabel: 'Backend', group: 'tech' },
  { id: 'web', label: 'Web & Frontend', shortLabel: 'Web', group: 'tech' },
  { id: 'flutter', label: 'Flutter / Mobile', shortLabel: 'Flutter', group: 'tech' },
  { id: 'security', label: 'Segurança & OWASP', shortLabel: 'Segurança', group: 'tech' },
  { id: 'qa', label: 'QA & Testes', shortLabel: 'QA & Testes', group: 'tech' },
  { id: 'data', label: 'Dados & BI', shortLabel: 'Dados & BI', group: 'tech' },
  { id: 'ops', label: 'DevOps & Infra', shortLabel: 'DevOps', group: 'tech' },
];

export const SKILL_QUICK_TEMPLATES: SkillQuickTemplate[] = [
  {
    id: 'admin_okrs',
    label: 'Administração, SOPs & OKRs',
    domain: 'administration',
    desc: 'Padronização de processos administrativos, definição de metas OKR e atas executivas.',
    instructions:
      'Estruture planos administrativos com objetivos mensuráveis (OKRs), responsáveis claros, prazos realistas e indicadores semanais. Ao criar procedimentos (SOPs), divida em passos numerados, checklist de conferência e pontos de atenção.',
  },
  {
    id: 'business_dre',
    label: 'Negócios, Precificação & DRE',
    domain: 'business',
    desc: 'Análise de margem, fluxo de caixa, ponto de equilíbrio e decisões estratégicas comerciais.',
    instructions:
      'Avalie decisões de negócios considerando margem de contribuição, custos fixos e variáveis, payback e risco operacional. Sempre apresente cenários conservador, realista e otimista em tabelas objetivas.',
  },
  {
    id: 'logistics_supply',
    label: 'Logística, Estoque & Roteirização',
    domain: 'logistics',
    desc: 'Gestão de estoque mínimo (curva ABC), lead time de fornecedores, fretes e SLAs de entrega.',
    instructions:
      'Aplique classificação ABC de estoque, calcule ponto de reposição e estoque de segurança considerando lead time. Ao planejar entregas e expedição, priorize consolidação de cargas, redução de avarias e cumprimento de SLA.',
  },
  {
    id: 'iot_automation',
    label: 'IoT, MQTT & Automação Inteligente',
    domain: 'iot',
    desc: 'Arquitetura de sensores ESP32/MQTT, Home Assistant, telemetria e rotinas de automação.',
    instructions:
      'Projete soluções IoT priorizando baixo consumo energético, reconexão resiliente em queda de Wi-Fi, tópicos MQTT padronizados, autenticação segura no broker e alertas claros para anomalias de sensores.',
  },
  {
    id: 'health_wellness',
    label: 'Saúde, Treino & Rotina Saudável',
    domain: 'health',
    desc: 'Organização de hábitos, plano de treinos, hidratação e educação nutricional equilibrada.',
    instructions:
      'Monte recomendações práticas de bem-estar adaptadas à rotina real da pessoa, respeitando progressão gradual de carga, sono e descanso. Sempre lembre que orientações não substituem acompanhamento médico ou nutricional individual.',
  },
  {
    id: 'studies_languages',
    label: 'Estudos, Idiomas & Método Feynman',
    domain: 'studies',
    desc: 'Explicações passo a passo, revisão espaçada, prática de conversação e simulados.',
    instructions:
      'Explique conceitos difíceis usando analogias simples (Método Feynman), divida o conteúdo em blocos curtos, faça perguntas de verificação ativa e proponha revisões espaçadas em 1, 7 e 30 dias.',
  },
  {
    id: 'home_routine',
    label: 'Casa, Lista de Compras & Rotina',
    domain: 'home_routine',
    desc: 'Planejamento doméstico semanal, divisão de tarefas, manutenção preventiva e orçamento familiar.',
    instructions:
      'Organize tarefas domésticas por frequência (diária, semanal, mensal), gere listas de compras agrupadas por corredor de mercado e ajude a manter o orçamento familiar previsível e sem desperdícios.',
  },
  {
    id: 'legal_contracts',
    label: 'Revisão Jurídica & Contratos',
    domain: 'legal',
    desc: 'Leitura crítica de cláusulas, identificação de riscos, multas abusivas e resumo em português claro.',
    instructions:
      'Ao analisar contratos ou documentos jurídicos, destaque obrigações das partes, prazos de vigência, multas, cláusulas de rescisão e pontos de atenção em linguagem acessível. Sinalize quando for essencial validação por advogado inscrito na OAB.',
  },
  {
    id: 'sales_marketing',
    label: 'Vendas, Copywriting & Funil',
    domain: 'sales_marketing',
    desc: 'Scripts de abordagem consultiva, quebra de objeções, campanhas e posicionamento de marca.',
    instructions:
      'Escreva mensagens comerciais consultivas focadas na dor real do cliente, com proposta de valor clara, prova social e chamada para ação objetiva, evitando exageros ou promessas irreais.',
  },
  {
    id: 'gastronomy_menu',
    label: 'Gastronomia & Cardápio Semanal',
    domain: 'gastronomy',
    desc: 'Criação de receitas práticas, aproveitamento de ingredientes da geladeira e ficha técnica.',
    instructions:
      'Sugira receitas saborosas e viáveis com medidas claras, tempo de preparo real, substituições inteligentes para ingredientes disponíveis e dicas de pré-preparo (meal prep) para economizar tempo na semana.',
  },
  {
    id: 'clean_arch',
    label: 'Clean Architecture & SOLID',
    domain: 'backend',
    desc: 'Boas práticas de desacoplamento, Domain-Driven Design e injeção de dependência.',
    instructions:
      'Separe estritamente as camadas de Domínio (Entidades/Regras de Negócio), Aplicação (Casos de Uso), Infraestrutura (Banco/Gateways) e Apresentação (Controllers/APIs).',
  },
  {
    id: 'owasp_sec',
    label: 'OWASP Hardening & SAST',
    domain: 'security',
    desc: 'Blindagem contra SQL Injection, XSS, CSRF, SSRF e controle rígido de autorização.',
    instructions:
      'Valide todas as entradas contra schemas estritos, parametrize consultas SQL e valide o escopo do usuário autenticado antes de qualquer mutação de estado.',
  },
];

export const AGENT_QUICK_PRESETS: AgentQuickPreset[] = [
  {
    id: 'preset_admin',
    label: 'Gestor Administrativo',
    properName: 'Helena',
    handle: '@helena',
    roleTitle: 'Gestora Administrativa & Processos',
    category: 'administration',
    mission: 'Organizar rotinas administrativas, SOPs, indicadores OKR, reuniões e planos de ação executivos.',
    systemPrompt:
      'Você é Helena, especialista em Administração e Gestão Operacional. Transforme demandas desorganizadas em processos claros, checklists, cronogramas e metas OKR mensuráveis.',
    mascotId: 'orchestrator_hawk',
    mascotColor: '#f97316',
  },
  {
    id: 'preset_business',
    label: 'Consultor de Negócios',
    properName: 'Henrique',
    handle: '@henrique',
    roleTitle: 'Estrategista de Negócios & Finanças',
    category: 'business',
    mission: 'Analisar viabilidade, precificação, DRE, fluxo de caixa e oportunidades de crescimento.',
    systemPrompt:
      'Você é Henrique, consultor sênior de Negócios e Finanças. Ajude a tomar decisões comerciais embasadas em números, margem, caixa e posicionamento competitivo.',
    mascotId: 'finance_bear',
    mascotColor: '#eab308',
  },
  {
    id: 'preset_logistics',
    label: 'Especialista em Logística',
    properName: 'Carlos',
    handle: '@carlos',
    roleTitle: 'Coordenador de Logística & Suprimentos',
    category: 'logistics',
    mission: 'Otimizar estoque, compras, roteirização de entregas, controle de fretes e SLAs de fornecedores.',
    systemPrompt:
      'Você é Carlos, especialista em Logística e Supply Chain. Foque em curva ABC, estoque de segurança, lead time, redução de custos de frete e eficiência na expedição.',
    mascotId: 'orchestrator_hawk',
    mascotColor: '#0ea5e9',
  },
  {
    id: 'preset_iot',
    label: 'Especialista em IoT',
    properName: 'Tesla',
    handle: '@tesla',
    roleTitle: 'Arquiteto de IoT & Automação',
    category: 'iot',
    mission: 'Projetar automações residenciais e industriais com ESP32, MQTT, Home Assistant e sensores inteligentes.',
    systemPrompt:
      'Você é Tesla, especialista em Internet das Coisas (IoT) e Automação. Ajude com escolha de sensores, diagramas de ligação, protocolos MQTT/Zigbee/Matter, rotinas de automação e telemetria confiável.',
    mascotId: 'dev_robot',
    mascotColor: '#22c55e',
  },
  {
    id: 'preset_health',
    label: 'Saúde & Bem-Estar',
    properName: 'Maya',
    handle: '@maya',
    roleTitle: 'Coach de Saúde, Treino & Hábitos',
    category: 'health',
    mission: 'Apoiar rotinas saudáveis de treino, alimentação equilibrada, sono e constância semanal.',
    systemPrompt:
      'Você é Maya, especialista em Bem-Estar e Hábitos Saudáveis. Crie planos realistas de rotina, treino e organização alimentar com acolhimento e clareza.',
    mascotId: 'artisan_cat',
    mascotColor: '#10b981',
  },
  {
    id: 'preset_legal',
    label: 'Analista Jurídico',
    properName: 'Dr. Arthur',
    handle: '@arthur',
    roleTitle: 'Analista de Contratos & Documentos',
    category: 'legal',
    mission: 'Revisar contratos, explicar cláusulas em português claro e mapear riscos documentais.',
    systemPrompt:
      'Você é Dr. Arthur, especialista em leitura crítica de contratos e documentos. Resuma direitos, deveres, prazos e riscos com precisão e linguagem acessível.',
    mascotId: 'sentinel_owl',
    mascotColor: '#8b5cf6',
  },
  {
    id: 'preset_home',
    label: 'Casa & Rotina',
    properName: 'Bia',
    handle: '@bia',
    roleTitle: 'Organizadora da Casa & Rotina Familiar',
    category: 'home_routine',
    mission: 'Planejar compras, cardápios semanais, manutenção da casa e compromissos da família.',
    systemPrompt:
      'Você é Bia, assistente de Casa e Rotina Pessoal. Facilite o dia a dia doméstico com listas práticas, organização semanal e soluções simples.',
    mascotId: 'scholar_fox',
    mascotColor: '#ec4899',
  },
];

const AGENT_CATEGORY_MAP = new Map(AGENT_CATEGORY_CATALOG.map((item) => [item.id, item]));
const SKILL_DOMAIN_MAP = new Map(SKILL_DOMAIN_CATALOG.map((item) => [item.id, item]));

export function normalizeCustomAreaId(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return cleaned || 'personalizada';
}

export function formatAreaSlugToTitle(slug: string): string {
  return slug
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function resolveAgentCategoryLabel(categoryId?: string | null, short = false): string {
  const key = (categoryId || 'dev').trim().toLowerCase();
  const known = AGENT_CATEGORY_MAP.get(key);
  if (known) return short ? known.shortLabel : known.label;
  return formatAreaSlugToTitle(categoryId || 'Geral');
}

export function resolveSkillDomainLabel(domainId?: string | null): string {
  const key = (domainId || 'general').trim().toLowerCase();
  const known = SKILL_DOMAIN_MAP.get(key);
  if (known) return known.label;
  if (key === 'general') return 'Geral';
  if (key === 'frontend') return 'Web & Frontend';
  return formatAreaSlugToTitle(domainId || 'Geral');
}

export function isKnownAgentCategory(categoryId?: string | null): boolean {
  return AGENT_CATEGORY_MAP.has((categoryId || '').trim().toLowerCase());
}

export function isKnownSkillDomain(domainId?: string | null): boolean {
  return SKILL_DOMAIN_MAP.has((domainId || '').trim().toLowerCase());
}

export function classifySkillBroadGroup(domainId?: string | null): 'operations' | 'personal' | 'tech' {
  const key = (domainId || '').trim().toLowerCase();
  const known = SKILL_DOMAIN_MAP.get(key);
  if (known) return known.group;
  if (['cve', 'devsecops', 'auth', 'architecture', 'mobile', 'testing', 'test', 'tdd', 'frontend'].includes(key)) {
    return 'tech';
  }
  return 'operations';
}

export function buildAgentFilterTabs(
  agents: Array<{ category?: string | null }>
): Array<{ id: string; label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const ag of agents) {
    const key = (ag.category || 'dev').trim().toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const tabs: Array<{ id: string; label: string; count: number }> = [
    { id: 'all', label: `Todos (${agents.length})`, count: agents.length },
  ];

  // Always include any category that currently has at least 1 agent (in catalog order first)
  const added = new Set<string>();
  for (const opt of AGENT_CATEGORY_CATALOG) {
    const count = counts.get(opt.id) || 0;
    if (count > 0) {
      tabs.push({ id: opt.id, label: `${opt.shortLabel} (${count})`, count });
      added.add(opt.id);
    }
  }

  // Also include any custom user-created categories not in the default catalog
  for (const [key, count] of counts.entries()) {
    if (!added.has(key) && count > 0) {
      tabs.push({ id: key, label: `${formatAreaSlugToTitle(key)} (${count})`, count });
    }
  }

  return tabs;
}
