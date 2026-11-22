export type OrchestrationMode =
  | 'single'
  | 'sequential'
  | 'parallel'
  | 'roundtable'
  | 'deep_research';

export type DeliverableKind = 'pptx' | 'pdf' | 'png' | null;

export interface OrchestratorAgentRef {
  role: string;
  name: string;
  proper_name?: string;
  handle?: string;
  category?: string;
  mission?: string;
}

export interface MultiAgentPlan {
  mode: OrchestrationMode;
  invoked_agents: OrchestratorAgentRef[];
  deliverable: DeliverableKind;
  steps: string[];
  enable_web_search: boolean;
  summary: string;
}

export interface GeneratedWorkflowNode {
  id: string;
  type: 'trigger' | 'agent' | 'condition' | 'action' | 'note';
  title: string;
  subtitle: string;
  iconName: 'zap' | 'bot' | 'clock' | 'webhook' | 'sparkles' | 'note';
  x: number;
  y: number;
  status: 'idle' | 'running' | 'success' | 'error';
  agentRole?: string;
  config?: Record<string, any>;
}

export interface GeneratedWorkflowConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
}

export interface GeneratedWorkflowDraft {
  title: string;
  description: string;
  schedule_cron: string;
  schedule_label: string;
  schedule_enabled: boolean;
  nodes: GeneratedWorkflowNode[];
  connections: GeneratedWorkflowConnection[];
}

function normalizeToken(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function detectDeliverableKind(prompt: string): DeliverableKind {
  const norm = normalizeToken(prompt);
  if (/\b(pptx|powerpoint|apresentacao|slides?|deck)\b/.test(norm)) {
    return 'pptx';
  }
  if (/\b(pdf|relatorio|documento|apostila|resumo executivo)\b/.test(norm)) {
    return 'pdf';
  }
  if (/\b(png|imagem|ilustracao|poster|banner|capa visual|arte visual)\b/.test(norm)) {
    return 'png';
  }
  return null;
}

export function detectInvokedAgents(
  prompt: string,
  catalog: OrchestratorAgentRef[]
): OrchestratorAgentRef[] {
  const normPrompt = normalizeToken(prompt);
  if (!normPrompt) return [];

  const matched: OrchestratorAgentRef[] = [];
  const seen = new Set<string>();

  const addAgent = (ag?: OrchestratorAgentRef) => {
    if (!ag || seen.has(ag.role)) return;
    seen.add(ag.role);
    matched.push(ag);
  };

  for (const agent of catalog) {
    if (agent.role === 'jarvis_master') continue;
    const handle = normalizeToken(agent.handle || '').replace(/^@/, '');
    const proper = normalizeToken(agent.proper_name || '');

    if (handle && new RegExp(`(?:^|[\\s,.;:!?@])${handle}(?:$|[\\s,.;:!?])`).test(normPrompt)) {
      addAgent(agent);
      continue;
    }
    if (proper && proper.length >= 3 && new RegExp(`(?:^|[\\s,.;:!?])${proper}(?:$|[\\s,.;:!?])`).test(normPrompt)) {
      addAgent(agent);
      continue;
    }
  }

  // Natural intent matching when user asks for slides/security/english/design without naming explicitly
  if (matched.length === 0) {
    if (/\b(pdf|veridico|phishing|seguranca|golpe|auditoria|owasp|senhas)\b/.test(normPrompt)) {
      addAgent(catalog.find((a) => a.role === 'sentinel_security' || a.role === 'cybersecurity_engineer'));
    }
    if (/\b(slides?|powerpoint|pptx|apresentacao)\b/.test(normPrompt)) {
      addAgent(catalog.find((a) => a.role === 'presentation_creator' || a.role === 'ux_ui_designer'));
    }
    if (/\b(ingles|english|pronuncia|vocabulario)\b/.test(normPrompt)) {
      addAgent(catalog.find((a) => a.role === 'english_tutor'));
    }
    if (/\b(pesquisa profunda|deep research|pesquise na web|fontes atualizadas)\b/.test(normPrompt)) {
      addAgent(catalog.find((a) => a.role === 'research_analyst'));
    }
  }

  return matched;
}

export function planMultiAgentExecution(
  prompt: string,
  catalog: OrchestratorAgentRef[],
  assistantName = 'JARVIS'
): MultiAgentPlan {
  const norm = normalizeToken(prompt);
  const deliverable = detectDeliverableKind(prompt);
  const isRoundtable = /\b(\/debate|mesa redonda|modo conselho|debatam|conselho de agentes|opinioes)\b/.test(norm);
  const isDeepResearch = /\b(deep research|pesquisa profunda|investigacao completa|pesquisar a fundo)\b/.test(norm);

  let invoked = detectInvokedAgents(prompt, catalog);

  if (isRoundtable && invoked.length < 2) {
    const defaults = [
      'software_architect',
      'sentinel_security',
      'ux_ui_designer',
      'research_analyst',
    ]
      .map((r) => catalog.find((a) => a.role === r))
      .filter((a): a is OrchestratorAgentRef => Boolean(a));
    for (const ag of defaults) {
      if (!invoked.some((i) => i.role === ag.role)) invoked.push(ag);
      if (invoked.length >= 3) break;
    }
  }

  if (isDeepResearch && invoked.length === 0) {
    const res = catalog.find((a) => a.role === 'research_analyst');
    if (res) invoked = [res];
  }

  if (invoked.length === 0) {
    const master = catalog.find((a) => a.role === 'jarvis_master') || {
      role: 'jarvis_master',
      name: `${assistantName} Maestro`,
      proper_name: assistantName,
      handle: `@${normalizeToken(assistantName) || 'jarvis'}`,
    };
    invoked = [master];
  }

  let mode: OrchestrationMode = 'single';
  if (isRoundtable) {
    mode = 'roundtable';
  } else if (isDeepResearch) {
    mode = 'deep_research';
  } else if (invoked.length >= 2) {
    mode = /\b(paralelo|simultaneo|ao mesmo tempo|enquanto)\b/.test(norm) ? 'parallel' : 'sequential';
  }

  const namesList = invoked.map((a) => a.proper_name || a.name).join(', ');
  const steps: string[] = [];

  if (mode === 'roundtable') {
    steps.push(`${assistantName} convocou Mesa Redonda com: ${namesList}`);
    invoked.forEach((ag, idx) => {
      steps.push(`Rodada ${idx + 1}: parecer especializado de ${ag.proper_name || ag.name}`);
    });
    steps.push(`Veredito consolidado por ${assistantName} e registro no Segundo Cérebro`);
  } else if (mode === 'deep_research') {
    steps.push(`Decomposição da pesquisa em 3 frentes investigativas`);
    steps.push(`Varredura web verificada com citações (${namesList})`);
    steps.push(`Síntese estruturada e destilação automática no Segundo Cérebro`);
  } else if (mode === 'sequential' || mode === 'parallel') {
    steps.push(
      mode === 'parallel'
        ? `Execução paralela acionada por ${assistantName}: ${namesList}`
        : `Encadeamento sequencial coordenado por ${assistantName}: ${namesList}`
    );
    invoked.forEach((ag, idx) => {
      steps.push(`Etapa ${idx + 1}: ${ag.proper_name || ag.name} (${ag.name})`);
    });
    if (deliverable) {
      steps.push(`Geração do entregável .${deliverable} no Painel de Artefatos`);
    }
  } else {
    steps.push(`Especialista ativo: ${namesList}`);
    if (deliverable) {
      steps.push(`Compilação de artefato .${deliverable} pronto para download`);
    }
  }

  return {
    mode,
    invoked_agents: invoked,
    deliverable,
    steps,
    enable_web_search:
      isDeepResearch ||
      invoked.some((a) => a.role === 'research_analyst') ||
      /\b(pesquise|internet|web|noticias|fontes|atualizado)\b/.test(norm),
    summary:
      mode === 'roundtable'
        ? `Mesa Redonda (${invoked.length} especialistas)`
        : mode === 'deep_research'
          ? 'Deep Research multi-etapas com fontes'
          : invoked.length > 1
            ? `Multi-Orquestração ${mode === 'parallel' ? 'Paralela' : 'Sequencial'} (${namesList})`
            : `Execução direta · ${namesList}`,
  };
}

export function validateCronSchedule(expr: string): boolean {
  const parts = (expr || '').trim().split(/\s+/);
  if (parts.length !== 5) return false;
  return parts.every((p) => /^(\*|\d+(-\d+)?(,\d+(-\d+)?)*)(\/\d+)?$/.test(p));
}

export function parseWorkflowPromptToGraph(prompt: string): GeneratedWorkflowDraft {
  const clean = (prompt || '').trim();
  const norm = normalizeToken(clean);

  // Detect schedule
  let scheduleCron = '0 8 * * *';
  let scheduleLabel = 'Todos os dias às 08:00';
  let scheduleEnabled = false;

  const hourMatch = norm.match(/(?:as|às|at)\s*(\d{1,2})(?:h|:(\d{2}))?/);
  const hour = hourMatch ? Math.min(23, Math.max(0, parseInt(hourMatch[1], 10))) : 8;
  const minute = hourMatch && hourMatch[2] ? Math.min(59, parseInt(hourMatch[2], 10)) : 0;

  if (/\b(todo dia|diario|diariamente|toda manha)\b/.test(norm)) {
    scheduleCron = `${minute} ${hour} * * *`;
    scheduleLabel = `Diariamente às ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    scheduleEnabled = true;
  } else if (/\b(toda semana|semanal|toda segunda|todo domingo|toda sexta)\b/.test(norm)) {
    const dow = norm.includes('domingo') ? '0' : norm.includes('sexta') ? '5' : '1';
    scheduleCron = `${minute} ${hour} * * ${dow}`;
    scheduleLabel = `Semanalmente às ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    scheduleEnabled = true;
  }

  // Detect primary specialist(s)
  const specialists: Array<{ role: string; title: string; subtitle: string }> = [];
  if (/\b(ingles|clara|idioma|vocabulario)\b/.test(norm)) {
    specialists.push({
      role: 'english_tutor',
      title: 'Clara · Professora de Inglês',
      subtitle: 'Prepara aula prática com tradução e pronúncia',
    });
  }
  if (/\b(seguranca|kira|pdf|golpe|auditoria|phishing)\b/.test(norm)) {
    specialists.push({
      role: 'sentinel_security',
      title: 'Kira · Segurança & Auditoria',
      subtitle: 'Verifica riscos, links suspeitos e integridade',
    });
  }
  if (/\b(pesquisa|web|noticias|atlas|mercado|tendencia)\b/.test(norm)) {
    specialists.push({
      role: 'research_analyst',
      title: 'Atlas · Deep Research',
      subtitle: 'Pesquisa web atualizada com fontes verificadas',
    });
  }
  if (/\b(slides?|powerpoint|pptx|dante|apresentacao)\b/.test(norm)) {
    specialists.push({
      role: 'presentation_creator',
      title: 'Dante · Slides & Apresentações',
      subtitle: 'Monta roteiro e gera deck .pptx editável',
    });
  }
  if (/\b(financas|orcamento|gastos|negocios|roi)\b/.test(norm)) {
    specialists.push({
      role: 'finance_advisor',
      title: 'Sofia · Finanças & Negócios',
      subtitle: 'Consolida indicadores, metas e alertas financeiros',
    });
  }
  if (specialists.length === 0) {
    specialists.push({
      role: 'jarvis_master',
      title: 'JARVIS Maestro',
      subtitle: 'Processa o pedido e sintetiza entregas',
    });
  }

  const wantsBrain = /\b(cerebro|memoria|casa|lembrar|salvar)\b/.test(norm) || true;
  const deliverable = detectDeliverableKind(clean);

  const nodes: GeneratedWorkflowNode[] = [
    {
      id: 'node-trigger',
      type: 'trigger',
      title: scheduleEnabled ? 'Agendamento Cron' : 'Gatilho Manual / Chat',
      subtitle: scheduleEnabled ? `${scheduleLabel} (${scheduleCron})` : 'Disparo sob demanda ou via comando',
      iconName: scheduleEnabled ? 'clock' : 'zap',
      x: 80,
      y: 190,
      status: 'idle',
      config: { cron: scheduleCron, enabled: scheduleEnabled },
    },
  ];

  const connections: GeneratedWorkflowConnection[] = [];
  let prevId = 'node-trigger';

  specialists.forEach((sp, idx) => {
    const id = `node-agent-${idx + 1}`;
    nodes.push({
      id,
      type: 'agent',
      title: sp.title,
      subtitle: sp.subtitle,
      iconName: 'bot',
      x: 380 + idx * 300,
      y: 190,
      status: 'idle',
      agentRole: sp.role,
      config: { prompt: clean },
    });
    connections.push({ id: `conn-${prevId}-${id}`, fromNodeId: prevId, toNodeId: id });
    prevId = id;
  });

  const actionId = 'node-action-finish';
  nodes.push({
    id: actionId,
    type: 'action',
    title: deliverable
      ? `Exportar .${deliverable.toUpperCase()} & Cérebro`
      : wantsBrain
        ? 'Salvar no Segundo Cérebro & Avisar'
        : 'Notificar Conclusão',
    subtitle: deliverable
      ? `Gera artefato .${deliverable} e registra memória vetorial`
      : 'Destila resultado na memória e envia aviso no Hub',
    iconName: 'sparkles',
    x: 380 + specialists.length * 300,
    y: 190,
    status: 'idle',
    config: { save_to_brain: wantsBrain, deliverable },
  });
  connections.push({ id: `conn-${prevId}-${actionId}`, fromNodeId: prevId, toNodeId: actionId });

  const shortTitle =
    clean.length > 52 ? `${clean.slice(0, 49)}...` : clean || 'Fluxo Criado com Flow Architect';

  return {
    title: shortTitle,
    description: clean || 'Rotina automatizada gerada pelo Agente Flow Architect.',
    schedule_cron: scheduleCron,
    schedule_label: scheduleLabel,
    schedule_enabled: scheduleEnabled,
    nodes,
    connections,
  };
}
