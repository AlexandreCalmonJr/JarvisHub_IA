import { GoogleGenAI, Type } from '@google/genai';

export interface SlideArtifactItem {
  title: string;
  subtitle?: string;
  bullets: string[];
  speakerNotes?: string;
  accent?: string;
}

export interface PdfArtifactSection {
  heading: string;
  body: string;
  highlights?: string[];
}

export interface StructuredArtifactPayload {
  id: string;
  kind: 'pptx' | 'pdf' | 'png';
  title: string;
  subtitle: string;
  author: string;
  created_at: string;
  slides?: SlideArtifactItem[];
  sections?: PdfArtifactSection[];
  svg_markup?: string;
  palette?: string[];
  model_used: string;
}

export interface RoundtableTurn {
  id: string;
  agent_role: string;
  agent_name: string;
  agent_proper_name: string;
  department: string;
  stance: string;
  key_point: string;
  recommendation: string;
  created_at: string;
}

export interface RoundtableSession {
  id: string;
  topic: string;
  assistant_name: string;
  status: 'running' | 'completed';
  participants: Array<{ role: string; name: string; proper_name: string; department: string }>;
  turns: RoundtableTurn[];
  verdict: string;
  action_items: string[];
  model_used: string;
  created_at: string;
}

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function withTimeout<T>(promise: Promise<T>, ms = 10000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function escapeXml(raw: string): string {
  return (raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildObsidianSvgPoster(title: string, subtitle: string, tags: string[]): string {
  const safeTitle = escapeXml(title.slice(0, 56));
  const safeSub = escapeXml(subtitle.slice(0, 110));
  const safeTags = tags.slice(0, 3).map((t) => escapeXml(t.slice(0, 26)));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0B0D12" />
      <stop offset="55%" stop-color="#12161F" />
      <stop offset="100%" stop-color="#1B1410" />
    </linearGradient>
    <radialGradient id="glow" cx="78%" cy="32%" r="48%">
      <stop offset="0%" stop-color="#F97316" stop-opacity="0.34" />
      <stop offset="60%" stop-color="#FB923C" stop-opacity="0.08" />
      <stop offset="100%" stop-color="#0B0D12" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#F97316" />
      <stop offset="100%" stop-color="#FB923C" />
    </linearGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#bg)" />
  <rect width="1200" height="675" fill="url(#glow)" />
  <g stroke="rgba(255,255,255,0.05)" stroke-width="1">
    <line x1="0" y1="135" x2="1200" y2="135" />
    <line x1="0" y1="270" x2="1200" y2="270" />
    <line x1="0" y1="405" x2="1200" y2="405" />
    <line x1="0" y1="540" x2="1200" y2="540" />
    <line x1="240" y1="0" x2="240" y2="675" />
    <line x1="480" y1="0" x2="480" y2="675" />
    <line x1="720" y1="0" x2="720" y2="675" />
    <line x1="960" y1="0" x2="960" y2="675" />
  </g>
  <!-- Geometric Obsidian Emblem -->
  <g transform="translate(930, 320)">
    <polygon points="0,-145 126,-72 126,72 0,145 -126,72 -126,-72" fill="#12161F" stroke="#F97316" stroke-width="2.5" opacity="0.95" />
    <polygon points="0,-98 85,-49 85,49 0,98 -85,49 -85,-49" fill="none" stroke="#FB923C" stroke-width="1.5" opacity="0.65" />
    <circle cx="0" cy="0" r="34" fill="url(#accent)" opacity="0.9" />
    <circle cx="0" cy="0" r="14" fill="#0B0D12" />
  </g>
  <rect x="76" y="88" width="76" height="5" rx="2.5" fill="url(#accent)" />
  <text x="76" y="138" fill="#FB923C" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="18" font-weight="600" letter-spacing="2">ARTEFATO VISUAL · ESTÚDIO OBSIDIAN</text>
  <text x="76" y="232" fill="#F3F4F6" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="46" font-weight="700">${safeTitle}</text>
  <text x="76" y="286" fill="#9CA3AF" font-family="DM Sans, Arial, sans-serif" font-size="22">${safeSub}</text>
  <g transform="translate(76, 420)">
    ${safeTags
      .map(
        (tag, i) => `
    <g transform="translate(0, ${i * 54})">
      <rect x="0" y="0" width="8" height="28" rx="4" fill="#F97316" />
      <text x="24" y="21" fill="#E5E7EB" font-family="DM Sans, Arial, sans-serif" font-size="20" font-weight="500">${tag}</text>
    </g>`
      )
      .join('')}
  </g>
  <line x1="76" y1="612" x2="1124" y2="612" stroke="rgba(255,255,255,0.1)" stroke-width="1" />
  <text x="76" y="644" fill="#6B7280" font-family="JetBrains Mono, monospace" font-size="14">EXPORTAÇÃO NATIVA PNG · 1200×675 PX</text>
</svg>`;
}

export async function generateStructuredArtifact(input: {
  kind: 'pptx' | 'pdf' | 'png';
  topic: string;
  context?: string;
  assistantName?: string;
}): Promise<StructuredArtifactPayload> {
  const topic = (input.topic || 'Projeto Estratégico').trim();
  const assistantName = (input.assistantName || 'JARVIS').trim();
  const id = `art_${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const ai = createGeminiClient();

  if (input.kind === 'pptx') {
    if (ai) {
      try {
        const res = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: `Crie uma apresentação PowerPoint executiva em português sobre: "${topic}". ${input.context ? `Contexto extra: ${input.context}` : ''} Gere exatamente 5 slides objetivos com título, subtítulo curto, 3-4 bullets práticos e notas do apresentador.`,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  subtitle: { type: Type.STRING },
                  slides: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        subtitle: { type: Type.STRING },
                        bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
                        speakerNotes: { type: Type.STRING },
                      },
                    },
                  },
                },
              },
            },
          }),
          10000
        );
        const parsed = JSON.parse((res.text || '{}').trim());
        if (Array.isArray(parsed.slides) && parsed.slides.length >= 2) {
          return {
            id,
            kind: 'pptx',
            title: parsed.title || topic,
            subtitle: parsed.subtitle || `Apresentação estruturada por ${assistantName}`,
            author: assistantName,
            created_at: now,
            slides: parsed.slides,
            model_used: 'gemini-3.1-flash-lite',
          };
        }
      } catch {
        // Fallback to structured template below
      }
    }

    return {
      id,
      kind: 'pptx',
      title: topic,
      subtitle: `Apresentação executiva gerada por ${assistantName} + Dante`,
      author: assistantName,
      created_at: now,
      model_used: 'estruturador-local',
      slides: [
        {
          title: topic,
          subtitle: 'Visão Geral & Contexto Estratégico',
          bullets: [
            'Objetivo central e resultados esperados no curto e médio prazo',
            'Alinhamento entre pessoas, processos e automação inteligente',
            'Indicadores claros para acompanhamento semanal',
          ],
          speakerNotes: 'Abra contextualizando o propósito central da apresentação e os ganhos imediatos.',
        },
        {
          title: 'Diagnóstico & Oportunidades',
          subtitle: 'Cenário atual mapeado pelos especialistas',
          bullets: [
            'Pontos fortes já consolidados na operação atual',
            'Gargalos repetitivos elegíveis para automação via fluxos',
            'Oportunidades de ganho rápido com baixo risco operacional',
          ],
          speakerNotes: 'Destaque os gargalos prioritários que motivam a proposta.',
        },
        {
          title: 'Arquitetura & Plano de Ação',
          subtitle: 'Execução faseada em marcos verificáveis',
          bullets: [
            'Fase 1: Fundação, governança e métricas de linha de base',
            'Fase 2: Automação de rotinas críticas e integração de contexto',
            'Fase 3: Escala assistida com revisões periódicas de qualidade',
          ],
          speakerNotes: 'Mostre como cada entrega é validada antes de avançar para o próximo ciclo.',
        },
        {
          title: 'Segurança, Qualidade & Governança',
          subtitle: 'Proteção de dados e critérios de aprovação',
          bullets: [
            'Isolamento de credenciais e dados sensíveis em cofre protegido',
            'Aprovação humana obrigatória para ações de alto impacto',
            'Auditoria contínua e histórico versionado de alterações',
          ],
          speakerNotes: 'Reforce a confiabilidade e a transparência das decisões.',
        },
        {
          title: 'Próximos Passos Imediatos',
          subtitle: 'Checklist para os próximos 7 dias',
          bullets: [
            'Validar responsáveis e prioridades da primeira entrega',
            'Ativar rotina proativa no Flow Architect para acompanhamento',
            'Revisar resultados na próxima Mesa Redonda da equipe',
          ],
          speakerNotes: 'Encerre convidando o público para alinhar o primeiro marco.',
        },
      ],
    };
  }

  if (input.kind === 'pdf') {
    if (ai) {
      try {
        const res = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: `Crie um relatório executivo bem diagramado em português para exportar em PDF sobre: "${topic}". ${input.context ? `Contexto extra: ${input.context}` : ''} Gere 4 seções detalhadas com título, parágrafo denso e 3 destaques objetivos cada.`,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  subtitle: { type: Type.STRING },
                  sections: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        heading: { type: Type.STRING },
                        body: { type: Type.STRING },
                        highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
                      },
                    },
                  },
                },
              },
            },
          }),
          10000
        );
        const parsed = JSON.parse((res.text || '{}').trim());
        if (Array.isArray(parsed.sections) && parsed.sections.length >= 2) {
          return {
            id,
            kind: 'pdf',
            title: parsed.title || topic,
            subtitle: parsed.subtitle || `Relatório diagramado por ${assistantName}`,
            author: assistantName,
            created_at: now,
            sections: parsed.sections,
            model_used: 'gemini-3.1-flash-lite',
          };
        }
      } catch {
        // Fallback below
      }
    }

    return {
      id,
      kind: 'pdf',
      title: topic,
      subtitle: `Relatório Técnico & Executivo · ${assistantName}`,
      author: assistantName,
      created_at: now,
      model_used: 'diagramador-local',
      sections: [
        {
          heading: '1. Resumo Executivo',
          body: `Este documento consolida a análise estruturada sobre "${topic}", reunindo recomendações práticas, critérios de qualidade e próximos passos verificáveis para execução segura.`,
          highlights: [
            'Escopo delimitado com critérios claros de sucesso',
            'Compatível com fluxos automatizados e memória compartilhada',
            'Pronto para revisão e distribuição em formato PDF',
          ],
        },
        {
          heading: '2. Análise & Pontos Críticos',
          body: 'A avaliação combinou perspectivas de estratégia, arquitetura, experiência do usuário e segurança preventiva para reduzir retrabalho e acelerar entregas de alto valor.',
          highlights: [
            'Priorização de tarefas de maior retorno imediato',
            'Mitigação antecipada de riscos de privacidade e dados',
            'Padronização visual e documentação viva no Segundo Cérebro',
          ],
        },
        {
          heading: '3. Plano Recomendado de Implementação',
          body: 'Recomenda-se executar em ciclos curtos com validação visual e métricas objetivas ao final de cada marco, mantendo checkpoints reversíveis e governança clara.',
          highlights: [
            'Semana 1: Validação de requisitos e configuração inicial',
            'Semana 2: Integração das fontes e testes automatizados',
            'Semana 3: Operação assistida e medição de resultados',
          ],
        },
      ],
    };
  }

  // kind === 'png' — High-res Obsidian/Orange vector-to-PNG artwork
  let visualTitle = topic;
  let visualSub = `Composição visual criada por ${assistantName} + Vega`;
  let visualTags = ['Identidade Obsidian & Laranja', 'Alta definição 1200×675', 'Pronto para download .PNG'];
  let modelUsed = 'estúdio-vetorial-obsidian';

  if (ai) {
    try {
      const res = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: `Crie um título impactante (máx 44 caracteres), um subtítulo (máx 90 caracteres) e 3 tópicos curtos (máx 24 caracteres cada) em português para um poster/banner visual sobre: "${topic}".`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                subtitle: { type: Type.STRING },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
            },
          },
        }),
        10000
      );
      const parsed = JSON.parse((res.text || '{}').trim());
      if (parsed.title) {
        visualTitle = parsed.title;
        visualSub = parsed.subtitle || visualSub;
        if (Array.isArray(parsed.tags) && parsed.tags.length) visualTags = parsed.tags;
        modelUsed = 'gemini-3.1-flash-lite';
      }
    } catch {
      // keep clean fallback
    }
  }

  return {
    id,
    kind: 'png',
    title: visualTitle,
    subtitle: visualSub,
    author: assistantName,
    created_at: now,
    svg_markup: buildObsidianSvgPoster(visualTitle, visualSub, visualTags),
    palette: ['#0B0D12', '#12161F', '#F97316', '#FB923C', '#F3F4F6'],
    model_used: modelUsed,
  };
}

export async function runRoundtableDeliberation(input: {
  topic: string;
  participants: Array<{ role: string; name: string; proper_name: string; department: string; mission?: string }>;
  assistantName: string;
}): Promise<RoundtableSession> {
  const topic = (input.topic || 'Estratégia do Projeto').trim();
  const assistantName = (input.assistantName || 'JARVIS').trim();
  const id = `rt_${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const ai = createGeminiClient();

  if (ai) {
    try {
      const roster = input.participants
        .map((p) => `- ${p.proper_name} (${p.name}, role=${p.role}, depto=${p.department})`)
        .join('\n');
      const res = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: `Simule uma Mesa Redonda técnica e prática em português conduzida por ${assistantName} sobre o tema: "${topic}".
Participantes:
${roster}

Para cada participante, entregue 1 contribuição curta e incisiva com posição (stance), ponto-chave (key_point) e recomendação concreta (recommendation). No final, entregue o veredito consolidado de ${assistantName} (verdict) e 3 próximos passos objetivos (action_items).`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                turns: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      agent_role: { type: Type.STRING },
                      stance: { type: Type.STRING },
                      key_point: { type: Type.STRING },
                      recommendation: { type: Type.STRING },
                    },
                  },
                },
                verdict: { type: Type.STRING },
                action_items: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
            },
          },
        }),
        10000
      );
      const parsed = JSON.parse((res.text || '{}').trim());
      if (Array.isArray(parsed.turns) && parsed.turns.length > 0 && parsed.verdict) {
        const turns: RoundtableTurn[] = input.participants.map((p, idx) => {
          const matched =
            parsed.turns.find((t: any) => t.agent_role === p.role) || parsed.turns[idx] || {};
          return {
            id: `${id}_t${idx + 1}`,
            agent_role: p.role,
            agent_name: p.name,
            agent_proper_name: p.proper_name,
            department: p.department,
            stance: matched.stance || 'Alinhado com ressalvas técnicas',
            key_point: matched.key_point || `Avaliação do impacto de "${topic}" sob a ótica de ${p.name}.`,
            recommendation: matched.recommendation || 'Executar em fases com validação mensurável.',
            created_at: now,
          };
        });
        return {
          id,
          topic,
          assistant_name: assistantName,
          status: 'completed',
          participants: input.participants,
          turns,
          verdict: parsed.verdict,
          action_items: Array.isArray(parsed.action_items) ? parsed.action_items : [],
          model_used: 'gemini-3.1-flash-lite',
          created_at: now,
        };
      }
    } catch {
      // fallback below
    }
  }

  const turns: RoundtableTurn[] = input.participants.map((p, idx) => {
    const isSec = p.department === 'security' || p.role.includes('security');
    const isDesign = p.department === 'design' || p.role.includes('design');
    const isData = p.department === 'data' || p.role.includes('research');
    return {
      id: `${id}_t${idx + 1}`,
      agent_role: p.role,
      agent_name: p.name,
      agent_proper_name: p.proper_name,
      department: p.department,
      stance: isSec
        ? 'Segurança & privacidade primeiro'
        : isDesign
          ? 'Clareza visual e simplicidade'
          : isData
            ? 'Decisão guiada por fontes e evidências'
            : 'Arquitetura escalável e pragmática',
      key_point: isSec
        ? `Garantir que "${topic}" proteja dados sensíveis com execução local quando houver segredos.`
        : isDesign
          ? `Reduzir atrito na jornada de "${topic}" com entregas visuais diretas e fáceis de revisar.`
          : isData
            ? `Cruzar referências atualizadas e salvar o aprendizado consolidado no Segundo Cérebro.`
            : `Dividir "${topic}" em etapas desacopladas com validação automática em cada entrega.`,
      recommendation: isSec
        ? 'Aplicar política de aprovação humana antes de ações críticas.'
        : isDesign
          ? 'Entregar protótipo/preview imediato no Painel de Artefatos.'
          : isData
            ? 'Anexar citações e métricas claras no resumo final.'
            : 'Iniciar pelo núcleo funcional e expandir por módulos testáveis.',
      created_at: now,
    };
  });

  return {
    id,
    topic,
    assistant_name: assistantName,
    status: 'completed',
    participants: input.participants,
    turns,
    verdict: `${assistantName} consolidou o consenso da Mesa Redonda sobre "${topic}": combinar execução híbrida segura (priorizando privacidade), experiência simples para revisão rápida e registro automático das decisões no Segundo Cérebro.`,
    action_items: [
      `Definir o primeiro entregável prático sobre "${topic}" (PDF, Slides ou Fluxo)`,
      'Manter dados sensíveis protegidos sob validação da Kira (Segurança)',
      'Automatizar o acompanhamento recorrente via Flow Architect',
    ],
    model_used: 'conselho-hibrido',
    created_at: now,
  };
}
