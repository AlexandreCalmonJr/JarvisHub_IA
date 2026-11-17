import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  BookOpen,
  Compass,
  HelpCircle,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Search,
  Bot,
  Zap,
  ShieldCheck,
  Layers,
  Cpu,
  Command,
  Key,
  CloudUpload,
  CloudDownload,
  Store,
  Server,
  ArrowRight,
  Radio,
} from 'lucide-react';
import { getAccountStorageKey } from '../services/accountScope';
import { API_BASE } from '../services/api/client';
import { ALL_26_AGENTS, CatalogAgent } from '../data/agentsCatalog';

type Lesson = {
  id: string;
  title: string;
  description: string;
  duration: string;
  category: string;
  steps: string[];
  modules: string[];
};

const LESSONS: Lesson[] = [
  {
    id: 'overview',
    title: 'Visão Geral e estado do ambiente',
    description: 'Interprete os indicadores e identifique serviços indisponíveis.',
    duration: '4 min',
    category: 'Primeiros passos',
    modules: ['overview'],
    steps: [
      'Abra Visão Geral pela barra lateral.',
      'Leia o estado dos serviços e diferencie disponível, degradado e indisponível.',
      'Use os atalhos para abrir o módulo que apresenta o detalhe.',
    ],
  },
  {
    id: 'chat',
    title: 'Chat JARVIS e Maestro',
    description: 'Envie pedidos e acompanhe a execução real das etapas.',
    duration: '6 min',
    category: 'Primeiros passos',
    modules: ['chat'],
    steps: [
      'Abra Chat JARVIS.',
      'Mantenha Automático (Maestro) quando quiser que o servidor escolha o modelo.',
      'Descreva objetivo, contexto e resultado esperado.',
      'Confira etapas concluídas, bloqueios e aprovações antes de considerar a tarefa terminada.',
    ],
  },
  {
    id: 'agents',
    title: 'Centro de Agentes',
    description: 'Consulte capacidades, permissões e estado dos agentes registados.',
    duration: '5 min',
    category: 'Agentes',
    modules: ['agents'],
    steps: [
      'Abra Centro de Agentes.',
      'Selecione um agente e leia a sua descrição e capacidades.',
      'Use apenas ações habilitadas para o seu perfil.',
      'Confirme o resultado na tarefa correspondente; a seleção não significa execução.',
    ],
  },
  {
    id: 'office',
    title: 'Escritório Virtual',
    description: 'Entenda a visualização do ambiente de agentes.',
    duration: '4 min',
    category: 'Agentes',
    modules: ['office'],
    steps: [
      'Abra Escritório Virtual.',
      'Observe os agentes e as informações de estado apresentadas.',
      'Use a navegação para abrir detalhes e tarefas.',
      'Considere a tarefa e o seu histórico como fonte de verdade da execução.',
    ],
  },
  {
    id: 'tasks',
    title: 'Gestão de Tarefas',
    description: 'Acompanhe estados, histórico e bloqueios das tarefas.',
    duration: '5 min',
    category: 'Agentes',
    modules: ['tasks'],
    steps: [
      'Abra Gestão de Tarefas.',
      'Filtre ou selecione uma tarefa para consultar os detalhes.',
      'Diferencie pendente, em execução, concluída, falha e bloqueada.',
      'Quando existir aprovação pendente, abra a Central de Aprovações.',
    ],
  },
  {
    id: 'workspace',
    title: 'Workspace e projetos',
    description: 'Organize projetos e artefactos com isolamento por conta.',
    duration: '5 min',
    category: 'Projetos',
    modules: ['workspace'],
    steps: [
      'Abra Workspace.',
      'Crie ou selecione um projeto autorizado à sua conta.',
      'Associe artefactos ao projeto correto.',
      'Use Abrir pasta apenas quando a sua sessão e as permissões permitirem.',
    ],
  },
  {
    id: 'coding',
    title: 'Coding Agent',
    description: 'Utilize recursos de desenvolvimento com controlo de execução.',
    duration: '6 min',
    category: 'Desenvolvimento',
    modules: ['coding'],
    steps: [
      'Abra Coding Agent.',
      'Informe o contexto do projeto e o objetivo da alteração.',
      'Revise o plano e os ficheiros afetados.',
      'Execute apenas ações autorizadas e trate pedidos de aprovação de forma explícita.',
    ],
  },
  {
    id: 'models',
    title: 'Modelos e providers',
    description: 'Consulte modelos disponíveis e configure credenciais no cofre.',
    duration: '7 min',
    category: 'Configuração',
    modules: ['models'],
    steps: [
      'Abra Modelos & Cofre.',
      'Consulte a disponibilidade real de modelos e providers.',
      'Guarde credenciais apenas no cofre protegido.',
      'Não cole chaves em conversas, relatórios ou documentos.',
    ],
  },
  {
    id: 'skills',
    title: 'Gestor de Skills',
    description: 'Consulte e administre capacidades reutilizáveis.',
    duration: '5 min',
    category: 'Configuração',
    modules: ['skills'],
    steps: [
      'Abra Gestor de Skills.',
      'Leia a descrição e os requisitos de cada capacidade.',
      'Instale ou altere apenas quando a ação estiver disponível e autorizada.',
      'Revise as permissões antes de disponibilizar uma skill a agentes.',
    ],
  },
  {
    id: 'knowledge',
    title: 'Base de Conhecimento',
    description: 'Adicione documentos autorizados e valide as fontes recuperadas.',
    duration: '5 min',
    category: 'Conhecimento',
    modules: ['knowledge'],
    steps: [
      'Abra Base de Conhecimento.',
      'Adicione apenas documentos que tem autorização para tratar.',
      'Aguarde a indexação e pesquise termos específicos.',
      'Confira a origem e o contexto dos trechos antes de reutilizá-los.',
    ],
  },
  {
    id: 'approvals',
    title: 'Central de Aprovações',
    description: 'Mantenha controlo humano sobre ações sensíveis.',
    duration: '4 min',
    category: 'Segurança',
    modules: ['approvals'],
    steps: [
      'Abra Central de Aprovações.',
      'Leia o solicitante, o escopo e os recursos afetados.',
      'Aprove apenas pedidos que reconhece e compreende.',
      'Rejeite ou deixe pendente quando faltarem informações.',
    ],
  },
  {
    id: 'security',
    title: 'Centro de Segurança',
    description: 'Consulte auditoria, políticas e controlos de segurança.',
    duration: '6 min',
    category: 'Segurança',
    modules: ['security'],
    steps: [
      'Abra Centro de Segurança.',
      'Consulte eventos e alertas apresentados para o seu perfil.',
      'Revise as políticas antes de aplicar alterações.',
      'Ações críticas podem exigir privilégios administrativos e aprovação.',
    ],
  },
  {
    id: 'backend_studio',
    title: 'Backend Studio',
    description: 'Explore ferramentas e diagnósticos do backend.',
    duration: '5 min',
    category: 'Engenharia',
    modules: ['backend_studio'],
    steps: [
      'Abra Backend Studio.',
      'Escolha a área de diagnóstico ou consulta disponível.',
      'Em consultas SQL, confirme se a operação é somente leitura.',
      'Não execute alterações de dados sem autorização e cópia de segurança.',
    ],
  },
  {
    id: 'quality',
    title: 'Quality Studio',
    description: 'Acompanhe os recursos e resultados de qualidade.',
    duration: '4 min',
    category: 'Engenharia',
    modules: ['quality'],
    steps: [
      'Abra Quality Studio.',
      'Selecione o projeto ou recurso que pretende analisar.',
      'Leia o resultado e as limitações da verificação.',
      'Não trate uma análise não executada como aprovação.',
    ],
  },
  {
    id: 'design',
    title: 'Design Studio',
    description: 'Utilize as ferramentas de design e os artefactos do módulo.',
    duration: '4 min',
    category: 'Engenharia',
    modules: ['design'],
    steps: [
      'Abra Design Studio.',
      'Selecione o contexto de projeto disponível.',
      'Revise os artefactos gerados antes de os reutilizar.',
      'Mantenha versões e decisões associadas ao projeto.',
    ],
  },
  {
    id: 'executive_report',
    title: 'Relatórios Executivos',
    description: 'Interprete indicadores e relatórios com o respetivo âmbito.',
    duration: '5 min',
    category: 'Gestão',
    modules: ['executive_report'],
    steps: [
      'Abra Relatórios Executivos.',
      'Selecione o projeto quando o relatório permitir.',
      'Verifique o período e a origem dos indicadores.',
      'Diferencie estimativas de valores financeiros reais.',
    ],
  },
  {
    id: 'advisor',
    title: 'Hardware Advisor',
    description: 'Consulte o perfil de hardware e opções de otimização.',
    duration: '5 min',
    category: 'Sistema',
    modules: ['advisor'],
    steps: [
      'Abra Hardware Advisor.',
      'Leia os dados de hardware efetivamente detetados.',
      'Compare recomendações com a configuração atual.',
      'Aplique otimizações somente após confirmar impacto e permissões.',
    ],
  },
  {
    id: 'server_logs',
    title: 'Logs do Servidor',
    description: 'Consulte registos operacionais dentro do seu nível de acesso.',
    duration: '4 min',
    category: 'Sistema',
    modules: ['server_logs'],
    steps: [
      'Abra Logs do Servidor.',
      'Use filtros de nível e pesquisa quando disponíveis.',
      'Evite partilhar registos que possam conter dados operacionais sensíveis.',
      'A limpeza do buffer é uma ação administrativa e deve ser confirmada.',
    ],
  },
  {
    id: 'profile',
    title: 'Perfil e preferências',
    description: 'Configure preferências sem guardar segredos no navegador.',
    duration: '3 min',
    category: 'Conta',
    modules: ['profile'],
    steps: [
      'Abra Perfil e Configurações pelo avatar.',
      'Atualize os dados pessoais e as preferências disponíveis.',
      'Use o Cofre de Chaves para credenciais.',
      'A preferência de estilo não altera automaticamente as permissões da conta.',
    ],
  },
  {
    id: 'onboarding',
    title: 'Configuração inicial e segurança',
    description: 'Entenda as etapas do assistente de primeira utilização.',
    duration: '5 min',
    category: 'Primeiros passos',
    modules: ['overview'],
    steps: [
      'Confirme que a conta administrativa utiliza uma palavra-passe pessoal.',
      'Revise os indicadores do banco, modelo local e cofre.',
      'Configure providers apenas no cofre e segundo as permissões.',
      'Conclua o assistente após rever o estado do ambiente.',
    ],
  },
  {
    id: 'mcp',
    title: 'Integrações e ferramentas',
    description: 'Entenda como integrações e ferramentas são disponibilizadas.',
    duration: '4 min',
    category: 'Integrações',
    modules: ['models', 'agents'],
    steps: [
      'Consulte o estado das integrações nas áreas disponíveis.',
      'Verifique quais ferramentas estão habilitadas para a sua conta.',
      'Não partilhe tokens de integração em prompts.',
      'A execução continua sujeita às políticas, permissões e aprovações do Hub.',
    ],
  },
];

interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    id: 'privacy',
    category: 'Privacidade & Dados',
    question: 'O JARVIS envia meus prompts ou códigos para a nuvem?',
    answer:
      'Não por padrão. Quando você usa o motor local Ollama (ex: qwen2.5-coder ou llama3.3), todo o processamento de raciocínio, leitura de arquivos e execução de comandos ocorre 100% no seu computador, sem sair da sua máquina. Caso configure uma chave de terceiros (Anthropic, OpenAI ou Google Cloud), o JARVIS comunica-se diretamente com o endpoint oficial do provedor através do cofre seguro criptografado com AES-256.',
  },
  {
    id: 'agents_delegation',
    category: 'Agentes & Orquestração',
    question: 'Como o Maestro sabe qual dos 26 especialistas deve ser chamado?',
    answer:
      'O JARVIS Maestro utiliza a arquitetura ReAct (Reasoning + Action). Ele lê sua solicitação, avalia a taxonomia de competências dos 26 agentes cadastrados e gera um plano com sub-etapas. Se você pedir para auditar segurança, ele delega ao Security Auditor; para refatorar banco de dados, ao Database Admin; para testes de ponta a ponta, ao QA Tester.',
  },
  {
    id: 'ponytail',
    category: 'Segurança & Governança',
    question: 'O que é o modo Ponytail e como funcionam as aprovações humanas?',
    answer:
      'O Ponytail é a camada de segurança que regula a autonomia dos agentes. No Nível 1 (Monitorado), toda e qualquer ferramenta precisa de aprovação humana. No Nível 2 (Semi-autônomo), leitura e buscas são automáticas, mas comandos de terminal, alterações de arquivos e requisições HTTP externas exigem aprovação explícita na Central de Aprovações. No Nível 3 (Autônomo), tarefas restritas ao workspace autorizado são executadas sem pausas.',
  },
  {
    id: 'ollama_offline',
    category: 'Modelos & IA',
    question: 'Como configurar o Ollama para funcionar offline?',
    answer:
      'Instale o Ollama do site oficial (ollama.ai). No terminal, execute `ollama run qwen2.5-coder:7b` e `ollama pull nomic-embed-text`. Em seguida, acerte o endpoint http://localhost:11434 na aba Configurações > Configurações do Servidor e clique em "Testar Conexão". O JARVIS passará a usá-lo como provedor primário local.',
  },
  {
    id: 'android_pair',
    category: 'Conectividade',
    question: 'Como parear meu smartphone Android com o JARVIS?',
    answer:
      'Acesse Configurações > Conectar Celular. Um código QR exclusivo e um PIN efêmero de pareamento serão gerados. Abra o aplicativo Android do JARVIS Hub, aponte a câmera e confirme a autenticação. Seu celular poderá enviar comandos de voz, receber notificações de aprovações pendentes e monitorar execuções em tempo real.',
  },
  {
    id: 'sqlite_backup',
    category: 'Banco de Dados',
    question: 'Como funciona o banco de dados e como fazer backup?',
    answer:
      'O JARVIS Hub utiliza SQLite nativo configurado com WAL (Write-Ahead Logging) em data/jarvis.db. Isso garante leitura concorrente sem bloqueios de escrita e alta durabilidade. Em Configurações > Configurações do Servidor, você pode acionar a otimização VACUUM e gerar uma cópia física do banco para backup.',
  },
  {
    id: 'custom_skills',
    category: 'Habilidades & Extensões',
    question: 'Posso adicionar minhas próprias Habilidades (Skills)?',
    answer:
      'Sim! Na Loja de Habilidades (`Loja > Habilidades`), clique no botão "+ Adicionar Personalizado" ou "+ Nova Habilidade". Você pode escrever scripts em Python/Node ou importar pastas no formato padrão SKILL.md. Os agentes autorizados passarão a enxergar suas novas ferramentas imediatamente.',
  },
];

interface ShortcutItem {
  id: string;
  keys: string[];
  description: string;
  category: 'Navegação' | 'Chat & Mensagens' | 'Desenvolvimento';
}

const SHORTCUTS: ShortcutItem[] = [
  {
    id: 's1',
    keys: ['Ctrl', 'K'],
    description: 'Abrir paleta de comandos e busca rápida global',
    category: 'Navegação',
  },
  {
    id: 's2',
    keys: ['Ctrl', '/'],
    description: 'Abrir Central de Novidades & Ajuda',
    category: 'Navegação',
  },
  {
    id: 's3',
    keys: ['Esc'],
    description: 'Fechar modais, gavetas laterais e menus abertos',
    category: 'Navegação',
  },
  {
    id: 's4',
    keys: ['Enter'],
    description: 'Enviar mensagem no chat (configurável para Ctrl+Enter)',
    category: 'Chat & Mensagens',
  },
  {
    id: 's5',
    keys: ['Shift', 'Enter'],
    description: 'Inserir quebra de linha sem enviar a mensagem',
    category: 'Chat & Mensagens',
  },
  {
    id: 's6',
    keys: ['↑', '↓'],
    description: 'Navegar pelo histórico de comandos e prompts recentes no input',
    category: 'Chat & Mensagens',
  },
  {
    id: 's7',
    keys: ['Ctrl', 'S'],
    description: 'Salvar alterações no editor de código do Coding Agent',
    category: 'Desenvolvimento',
  },
  {
    id: 's8',
    keys: ['Ctrl', 'Shift', 'F'],
    description: 'Localizar termos e referências em todos os arquivos do projeto',
    category: 'Desenvolvimento',
  },
];

interface Props {
  activeTab?: string;
  initialSubTab?: string;
  onNavigate: (tab: string) => void;
  onStartTour?: () => void;
  onOpenProfile?: () => void;
}

export const LearningCenterView: React.FC<Props> = ({
  activeTab,
  initialSubTab = 'news',
  onNavigate,
  onStartTour,
  onOpenProfile,
}) => {
  const [currentSubTab, setCurrentSubTab] = useState<
    'news' | 'changelog' | 'agents_guide' | 'react_architecture' | 'ollama_local' | 'faq' | 'shortcuts' | 'lessons'
  >(initialSubTab as any);

  const [query, setQuery] = useState('');
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null);
  const [completed, setCompleted] = useState<string[]>([]);
  const [lessonCategoryFilter, setLessonCategoryFilter] = useState('all');
  const [agentCategoryFilter, setAgentCategoryFilter] = useState('all');
  const [faqCategoryFilter, setFaqCategoryFilter] = useState('all');
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>('privacy');

  const [syncState, setSyncState] = useState<'loading' | 'synced' | 'offline'>('loading');
  const [syncError, setSyncError] = useState('');
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    const localLoad = () => {
      try {
        const raw = localStorage.getItem(getAccountStorageKey('jarvis_learning_progress_v1'));
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((id) => LESSONS.some((l) => l.id === id)) : [];
      } catch {
        return [];
      }
    };

    setCompleted(localLoad());

    fetch(API_BASE + '/learning/progress', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Sincronização indisponível');
        return response.json();
      })
      .then(async (data) => {
        if (cancelled) return;
        const remote = Array.isArray(data.completed_ids)
          ? data.completed_ids.filter((id: string) => LESSONS.some((l) => l.id === id))
          : [];
        const local = localLoad();
        const merged = Array.from(new Set([...remote, ...local]));
        setCompleted(merged);
        try {
          localStorage.setItem(getAccountStorageKey('jarvis_learning_progress_v1'), JSON.stringify(merged));
        } catch {}
        if (merged.length !== remote.length) {
          const save = await fetch(API_BASE + '/learning/progress', {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed_ids: merged }),
          });
          if (!save.ok) throw new Error('Não foi possível enviar o progresso offline.');
        }
        setSyncState('synced');
        setSyncError('');
      })
      .catch(() => {
        if (!cancelled) {
          setSyncState('offline');
          setSyncError('O progresso está temporariamente apenas neste navegador. Será possível sincronizar quando o servidor responder.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleLesson = (id: string) => {
    const next = completed.includes(id) ? completed.filter((x) => x !== id) : [...completed, id];
    setCompleted(next);
    try {
      localStorage.setItem(getAccountStorageKey('jarvis_learning_progress_v1'), JSON.stringify(next));
    } catch {}
    setSyncState('loading');
    setSyncError('');
    saveQueue.current = saveQueue.current
      .then(async () => {
        const response = await fetch(API_BASE + '/learning/progress', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed_ids: next }),
        });
        if (!response.ok) throw new Error('O servidor não confirmou a sincronização.');
      })
      .then(() => {
        setSyncState('synced');
        setSyncError('');
      })
      .catch(() => {
        setSyncState('offline');
        setSyncError('Não foi possível sincronizar agora. O progresso permanece guardado localmente.');
      });
  };

  const contextualLessons = useMemo(() => {
    return LESSONS.filter((l) => l.modules.includes(activeTab || ''));
  }, [activeTab]);

  const filteredLessons = useMemo(() => {
    return LESSONS.filter((l) => {
      const matchesSearch = [l.title, l.description, l.category, ...l.steps].join(' ').toLowerCase().includes(query.toLowerCase());
      const matchesCategory = lessonCategoryFilter === 'all' || l.category === lessonCategoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [query, lessonCategoryFilter]);

  const filteredAgents = useMemo(() => {
    return ALL_26_AGENTS.filter((a) => {
      const matchesSearch = [a.name, a.mission, a.categoryLabel, a.role].join(' ').toLowerCase().includes(query.toLowerCase());
      const matchesCategory = agentCategoryFilter === 'all' || a.category === agentCategoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [query, agentCategoryFilter]);

  const filteredFaqs = useMemo(() => {
    return FAQS.filter((f) => {
      const matchesSearch = [f.question, f.answer, f.category].join(' ').toLowerCase().includes(query.toLowerCase());
      const matchesCategory = faqCategoryFilter === 'all' || f.category === faqCategoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [query, faqCategoryFilter]);

  const filteredShortcuts = useMemo(() => {
    return SHORTCUTS.filter((s) => {
      return [s.description, s.category, ...s.keys].join(' ').toLowerCase().includes(query.toLowerCase());
    });
  }, [query]);

  const activeLesson = LESSONS.find((l) => l.id === selectedLesson);

  const startChatWithAgent = (agent: CatalogAgent) => {
    try {
      localStorage.setItem(
        'jarvis_active_chat_prompt',
        `Olá @${agent.name}, gostaria de acionar sua especialidade em ${agent.categoryLabel}. A sua missão é: ${agent.mission}`
      );
    } catch {}
    onNavigate('chat');
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        backgroundColor: '#0a0a0c',
        color: '#f3f4f6',
        overflow: 'hidden',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Sub-Sidebar Lateral Esquerda 240px (Estilo Obsidian Dark OpenBot) */}
      <aside
        style={{
          width: '240px',
          minWidth: '240px',
          backgroundColor: '#0d0d0f',
          borderRight: '1px solid #1a1a1f',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px 12px',
          gap: '16px',
          overflowY: 'auto',
        }}
      >
        {/* Cabeçalho da Barra */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 6px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(249, 115, 22, 0.2))',
              border: '1px solid rgba(249, 115, 22, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f97316',
            }}
          >
            <HelpCircle size={16} />
          </div>
          <div>
            <h2 style={{ fontSize: '0.92rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
              Novidades & Ajuda
            </h2>
            <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Central do Usuário · v3.0.1</span>
          </div>
        </div>

        {/* Input de Busca Rápida */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#16161a',
            border: '1px solid #26262e',
            borderRadius: '8px',
            padding: '7px 10px',
          }}
        >
          <Search size={14} color="#6b7280" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar..."
            aria-label="Pesquisar ajuda e novidades"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f3f4f6',
              fontSize: '0.78rem',
            }}
          />
        </div>

        {/* Grupos de Navegação */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
          {/* Grupo 1: Novidades & Destaques */}
          <div>
            <div
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#6b7280',
                padding: '0 8px 6px',
              }}
            >
              Destaques
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <button
                type="button"
                onClick={() => {
                  setCurrentSubTab('news');
                  setSelectedLesson(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: currentSubTab === 'news' ? '#1f1f26' : 'transparent',
                  color: currentSubTab === 'news' ? '#ffffff' : '#9ca3af',
                  fontSize: '0.82rem',
                  fontWeight: currentSubTab === 'news' ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={15} color={currentSubTab === 'news' ? '#f97316' : '#9ca3af'} />
                  <span>Novidades (v3.0.1)</span>
                </div>
                <span
                  style={{
                    backgroundColor: 'rgba(249, 115, 22, 0.2)',
                    color: '#f97316',
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: '4px',
                  }}
                >
                  NOVO
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentSubTab('changelog');
                  setSelectedLesson(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: currentSubTab === 'changelog' ? '#1f1f26' : 'transparent',
                  color: currentSubTab === 'changelog' ? '#ffffff' : '#9ca3af',
                  fontSize: '0.82rem',
                  fontWeight: currentSubTab === 'changelog' ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Layers size={15} color={currentSubTab === 'changelog' ? '#38bdf8' : '#9ca3af'} />
                <span>Histórico de Versões</span>
              </button>
            </div>
          </div>

          {/* Grupo 2: Guias & Orquestração */}
          <div>
            <div
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#6b7280',
                padding: '0 8px 6px',
              }}
            >
              Guias de Agentes
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <button
                type="button"
                onClick={() => {
                  setCurrentSubTab('agents_guide');
                  setSelectedLesson(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: currentSubTab === 'agents_guide' ? '#1f1f26' : 'transparent',
                  color: currentSubTab === 'agents_guide' ? '#ffffff' : '#9ca3af',
                  fontSize: '0.82rem',
                  fontWeight: currentSubTab === 'agents_guide' ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Bot size={15} color={currentSubTab === 'agents_guide' ? '#a855f7' : '#9ca3af'} />
                <span>Guia dos 26 Agentes</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentSubTab('react_architecture');
                  setSelectedLesson(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: currentSubTab === 'react_architecture' ? '#1f1f26' : 'transparent',
                  color: currentSubTab === 'react_architecture' ? '#ffffff' : '#9ca3af',
                  fontSize: '0.82rem',
                  fontWeight: currentSubTab === 'react_architecture' ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <ShieldCheck size={15} color={currentSubTab === 'react_architecture' ? '#10b981' : '#9ca3af'} />
                <span>ReAct & Segurança Ponytail</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentSubTab('ollama_local');
                  setSelectedLesson(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: currentSubTab === 'ollama_local' ? '#1f1f26' : 'transparent',
                  color: currentSubTab === 'ollama_local' ? '#ffffff' : '#9ca3af',
                  fontSize: '0.82rem',
                  fontWeight: currentSubTab === 'ollama_local' ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Cpu size={15} color={currentSubTab === 'ollama_local' ? '#f59e0b' : '#9ca3af'} />
                <span>Guia Ollama Offline</span>
              </button>
            </div>
          </div>

          {/* Grupo 3: Suporte & Documentação */}
          <div>
            <div
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#6b7280',
                padding: '0 8px 6px',
              }}
            >
              Suporte & Referência
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <button
                type="button"
                onClick={() => {
                  setCurrentSubTab('faq');
                  setSelectedLesson(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: currentSubTab === 'faq' ? '#1f1f26' : 'transparent',
                  color: currentSubTab === 'faq' ? '#ffffff' : '#9ca3af',
                  fontSize: '0.82rem',
                  fontWeight: currentSubTab === 'faq' ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <HelpCircle size={15} color={currentSubTab === 'faq' ? '#eab308' : '#9ca3af'} />
                <span>Perguntas Frequentes (FAQ)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentSubTab('shortcuts');
                  setSelectedLesson(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: currentSubTab === 'shortcuts' ? '#1f1f26' : 'transparent',
                  color: currentSubTab === 'shortcuts' ? '#ffffff' : '#9ca3af',
                  fontSize: '0.82rem',
                  fontWeight: currentSubTab === 'shortcuts' ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Command size={15} color={currentSubTab === 'shortcuts' ? '#06b6d4' : '#9ca3af'} />
                <span>Atalhos de Teclado</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentSubTab('lessons');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: currentSubTab === 'lessons' ? '#1f1f26' : 'transparent',
                  color: currentSubTab === 'lessons' ? '#ffffff' : '#9ca3af',
                  fontSize: '0.82rem',
                  fontWeight: currentSubTab === 'lessons' ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BookOpen size={15} color={currentSubTab === 'lessons' ? '#10b981' : '#9ca3af'} />
                  <span>Tutoriais & Lições</span>
                </div>
                <span
                  style={{
                    backgroundColor: '#16161a',
                    border: '1px solid #26262e',
                    color: '#9ca3af',
                    fontSize: '0.64rem',
                    padding: '1px 5px',
                    borderRadius: '4px',
                  }}
                >
                  {completed.length}/{LESSONS.length}
                </span>
              </button>
            </div>
          </div>
        </nav>

        {/* Rodapé da Sidebar: Tour Guiado */}
        <div
          style={{
            backgroundColor: '#141418',
            border: '1px solid #22222a',
            borderRadius: '10px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Compass size={18} color="#f97316" />
            <strong style={{ fontSize: '0.78rem', color: '#ffffff' }}>Tour Interativo</strong>
          </div>
          <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0, lineHeight: 1.4 }}>
            Explore o JARVIS Hub através de um passo a passo pelas principais áreas.
          </p>
          <button
            type="button"
            onClick={onStartTour}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: '#f97316',
              color: '#ffffff',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: '4px',
            }}
          >
            <span>Iniciar Tour Guiado</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </aside>

      {/* Conteúdo Principal da Central de Ajuda */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 32px 48px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        {/* Aba 1: Novidades v3.0.1 */}
        {currentSubTab === 'news' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1000px' }}>
            {/* Banner Hero de Novidades */}
            <div
              style={{
                position: 'relative',
                background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.12) 0%, rgba(13, 13, 15, 0.8) 100%)',
                border: '1px solid rgba(249, 115, 22, 0.3)',
                borderRadius: '16px',
                padding: '28px 32px',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#34d399',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '20px',
                  }}
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: '#10b981',
                      display: 'inline-block',
                    }}
                  />
                  VERSÃO 3.0.1 INSTALADA
                </span>
                <span style={{ fontSize: '0.74rem', color: '#9ca3af' }}>Novembro de 2026</span>
              </div>

              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '8px 0 12px', color: '#ffffff' }}>
                O que há de novo no JARVIS AI Hub v3.0.1
              </h1>
              <p style={{ fontSize: '0.9rem', color: '#d1d5db', lineHeight: 1.6, margin: 0, maxWidth: '750px' }}>
                Conheça a maior evolução do JARVIS Hub: design Obsidian escuro OpenBot, ecossistema completo com 26 agentes
                especialistas, nova Loja de Aplicativos, Dynamic Island e gerenciamento de servidor integrado.
              </p>

              <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setCurrentSubTab('agents_guide')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    backgroundColor: '#f97316',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Bot size={16} />
                  <span>Explorar 26 Especialistas</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('skills')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    backgroundColor: '#1e1e24',
                    border: '1px solid #2e2e38',
                    color: '#f3f4f6',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '0.82rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <Store size={16} />
                  <span>Abrir Loja de Apps</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('settings')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    backgroundColor: '#1e1e24',
                    border: '1px solid #2e2e38',
                    color: '#f3f4f6',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '0.82rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <Server size={16} />
                  <span>Configurações do Servidor</span>
                </button>
              </div>
            </div>

            {/* Grid de Principais Destaques v3.0.1 */}
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', marginBottom: '16px' }}>
                Grandes Destaques do Lançamento
              </h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                  gap: '16px',
                }}
              >
                {/* Card 1: 26 Especialistas */}
                <div
                  style={{
                    backgroundColor: '#111115',
                    border: '1px solid #1f1f26',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(168, 85, 247, 0.15)',
                        border: '1px solid rgba(168, 85, 247, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#c084fc',
                      }}
                    >
                      <Bot size={20} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '0.92rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                        26 Especialistas de IA
                      </h3>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>ReAct + Maestro</span>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#9ca3af', lineHeight: 1.5, margin: 0, flex: 1 }}>
                    Catálogo completo de agentes cobrindo Arquitetura de Software, Testes QA, Auditoria de Segurança, DBA,
                    Redação Técnica, DevOps e Design UI/UX, operando em orquestração colaborativa.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCurrentSubTab('agents_guide')}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#a855f7',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    <span>Ver guia de agentes</span>
                    <ChevronRight size={14} />
                  </button>
                </div>

                {/* Card 2: OpenBot Store */}
                <div
                  style={{
                    backgroundColor: '#111115',
                    border: '1px solid #1f1f26',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(56, 189, 248, 0.15)',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#38bdf8',
                      }}
                    >
                      <Store size={20} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '0.92rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                        Nova Loja de Apps
                      </h3>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Conectores & Ferramentas</span>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#9ca3af', lineHeight: 1.5, margin: 0, flex: 1 }}>
                    Conectores nativos para Telegram, WhatsApp, Slack, GitHub, Canva, Vercel, Dropbox e cofres de senha
                    Bitwarden e 1Password para potencializar as ações dos seus agentes.
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('skills')}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#38bdf8',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    <span>Acessar Loja de Apps</span>
                    <ChevronRight size={14} />
                  </button>
                </div>

                {/* Card 3: Dynamic Island & Dock */}
                <div
                  style={{
                    backgroundColor: '#111115',
                    border: '1px solid #1f1f26',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(234, 179, 8, 0.15)',
                        border: '1px solid rgba(234, 179, 8, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#facc15',
                      }}
                    >
                      <Radio size={20} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '0.92rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                        Dynamic Island & Dock
                      </h3>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Telemetria & Voz</span>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#9ca3af', lineHeight: 1.5, margin: 0, flex: 1 }}>
                    Notch flutuante no topo com monitoramento em tempo real de hardware, onda de voz para entrada hands-free
                    e Dock lateral de agentes com avatares 3D customizáveis.
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('settings')}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#facc15',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    <span>Personalizar aparência</span>
                    <ChevronRight size={14} />
                  </button>
                </div>

                {/* Card 4: Configurações do Servidor */}
                <div
                  style={{
                    backgroundColor: '#111115',
                    border: '1px solid #1f1f26',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#f87171',
                      }}
                    >
                      <Server size={20} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '0.92rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                        Servidor & SQLite WAL
                      </h3>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>FastAPI & Otimização</span>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#9ca3af', lineHeight: 1.5, margin: 0, flex: 1 }}>
                    Gestão de acessos JWT, controle de bind de rede, teste de ping da API em tempo real, VACUUM e backup
                    físico de banco de dados SQLite diretamente pelo painel administrativo.
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('settings')}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#f87171',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    <span>Gerenciar servidor</span>
                    <ChevronRight size={14} />
                  </button>
                </div>

                {/* Card 5: Habilidades ECC */}
                <div
                  style={{
                    backgroundColor: '#111115',
                    border: '1px solid #1f1f26',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#34d399',
                      }}
                    >
                      <Zap size={20} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '0.92rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                        Habilidades ECC
                      </h3>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Automações Modulares</span>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#9ca3af', lineHeight: 1.5, margin: 0, flex: 1 }}>
                    Ecossistema modular de habilidades especializadas para Git, Docker, banco de dados, documentação e
                    testes, instaláveis com um único clique.
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('skills')}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#34d399',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    <span>Explorar catálogo de skills</span>
                    <ChevronRight size={14} />
                  </button>
                </div>

                {/* Card 6: Privacidade & Isolamento */}
                <div
                  style={{
                    backgroundColor: '#111115',
                    border: '1px solid #1f1f26',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(249, 115, 22, 0.15)',
                        border: '1px solid rgba(249, 115, 22, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fb923c',
                      }}
                    >
                      <Key size={20} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '0.92rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                        Cofre Local Criptografado
                      </h3>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>AES-256 GCM</span>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#9ca3af', lineHeight: 1.5, margin: 0, flex: 1 }}>
                    Suas chaves de provedores de IA são armazenadas criptografadas localmente por conta de usuário e nunca
                    são expostas a navegadores ou prompts desprotegidos.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCurrentSubTab('react_architecture')}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#fb923c',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    <span>Entenda a arquitetura</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Aba 2: Histórico de Versões (Changelog) */}
        {currentSubTab === 'changelog' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '850px' }}>
            <div>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                Histórico de Versões (Changelog)
              </h1>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: '6px 0 0' }}>
                Todas as melhorias, correções e novos recursos implementados no JARVIS AI Hub.
              </p>
            </div>

            {/* Release v3.0.1 */}
            <div
              style={{
                backgroundColor: '#111115',
                border: '1px solid #1f1f26',
                borderRadius: '12px',
                padding: '22px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      backgroundColor: 'rgba(249, 115, 22, 0.15)',
                      border: '1px solid rgba(249, 115, 22, 0.3)',
                      color: '#f97316',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      padding: '3px 9px',
                      borderRadius: '6px',
                    }}
                  >
                    v3.0.1
                  </span>
                  <strong style={{ fontSize: '0.98rem', color: '#ffffff' }}>Polimento OpenBot & Painel de Servidor</strong>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>17 de Novembro de 2026</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#d1d5db', fontSize: '0.82rem', lineHeight: 1.8 }}>
                <li>
                  <strong style={{ color: '#ffffff' }}>Configurações do Servidor Integradas:</strong> Gerenciamento completo de
                  endereço de bind, porta da API, banco SQLite WAL com VACUUM e endpoint Ollama local.
                </li>
                <li>
                  <strong style={{ color: '#ffffff' }}>Catálogo dos 26 Agentes:</strong> Integração completa dos 26 papéis de
                  especialistas ReAct na Loja e no Dock de Agentes.
                </li>
                <li>
                  <strong style={{ color: '#ffffff' }}>OpenBot Store:</strong> Nova interface com sub-sidebar, aplicativos de
                  produtividade (Telegram, WhatsApp, Slack, GitHub) e gerenciadores de senha.
                </li>
                <li>
                  <strong style={{ color: '#ffffff' }}>Central de Novidades & Ajuda:</strong> Redesenho completo com guias
                  visuais, atalhos de teclado e FAQs interativas.
                </li>
              </ul>
            </div>

            {/* Release v3.0.0 */}
            <div
              style={{
                backgroundColor: '#111115',
                border: '1px solid #1f1f26',
                borderRadius: '12px',
                padding: '22px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      backgroundColor: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      color: '#38bdf8',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      padding: '3px 9px',
                      borderRadius: '6px',
                    }}
                  >
                    v3.0.0
                  </span>
                  <strong style={{ fontSize: '0.98rem', color: '#ffffff' }}>A Nova Era OpenBot Dark Obsidian</strong>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>12 de Novembro de 2026</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#d1d5db', fontSize: '0.82rem', lineHeight: 1.8 }}>
                <li>Trilho lateral compacto de 64px com pins customizáveis e paleta Obsidian Dark.</li>
                <li>Dynamic Island no topo com telemetria em tempo real e ativador de voz.</li>
                <li>Isolamento estrito multi-tenant no SQLite por conta de usuário e cofre seguro AES-256.</li>
                <li>Arquitetura modular de Habilidades e Central de Aprovações humanas com 3 níveis Ponytail.</li>
              </ul>
            </div>
          </div>
        )}

        {/* Aba 3: Guia dos 26 Agentes */}
        {currentSubTab === 'agents_guide' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1100px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <h1 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                  Guia dos 26 Especialistas de IA
                </h1>
                <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: '6px 0 0' }}>
                  Cada agente possui persona, ferramentas dedicadas e prompt de raciocínio calibrado para colaboração multi-agente.
                </p>
              </div>

              {/* Filtros de Categoria */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: 'Todos (26)' },
                  { id: 'orchestration', label: 'Orquestração' },
                  { id: 'development', label: 'Desenvolvimento' },
                  { id: 'data', label: 'Dados & QA' },
                  { id: 'devops', label: 'DevOps & Infra' },
                  { id: 'security', label: 'Segurança' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setAgentCategoryFilter(f.id)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: agentCategoryFilter === f.id ? '#f97316' : '#26262e',
                      backgroundColor: agentCategoryFilter === f.id ? 'rgba(249, 115, 22, 0.15)' : '#141418',
                      color: agentCategoryFilter === f.id ? '#f97316' : '#9ca3af',
                      fontSize: '0.74rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid dos 26 Agentes */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '14px',
              }}
            >
              {filteredAgents.map((agent) => (
                <div
                  key={agent.id}
                  style={{
                    backgroundColor: '#111115',
                    border: '1px solid #1f1f26',
                    borderRadius: '12px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: agent.shape === 'round' ? '50%' : '10px',
                        backgroundColor: `${agent.color}22`,
                        border: `1.5px solid ${agent.color}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: agent.color,
                        fontWeight: 700,
                        fontSize: '0.9rem',
                      }}
                    >
                      <Bot size={20} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3
                        style={{
                          fontSize: '0.88rem',
                          fontWeight: 700,
                          margin: 0,
                          color: '#ffffff',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {agent.name}
                      </h3>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          color: agent.color,
                          display: 'inline-block',
                          marginTop: '2px',
                        }}
                      >
                        {agent.categoryLabel}
                      </span>
                    </div>
                  </div>

                  <p
                    style={{
                      fontSize: '0.78rem',
                      color: '#9ca3af',
                      lineHeight: 1.5,
                      margin: 0,
                      flex: 1,
                      minHeight: '48px',
                    }}
                  >
                    {agent.mission}
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid #1a1a20' }}>
                    <span style={{ fontSize: '0.68rem', color: '#6b7280', fontFamily: 'monospace' }}>
                      @{agent.role}
                    </span>
                    <button
                      type="button"
                      onClick={() => startChatWithAgent(agent)}
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        color: '#f3f4f6',
                        fontSize: '0.72rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span>Conversar</span>
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Aba 4: ReAct & Ponytail */}
        {currentSubTab === 'react_architecture' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '900px' }}>
            <div>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                Arquitetura ReAct & Governança Ponytail
              </h1>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: '6px 0 0' }}>
                Como o JARVIS pensa, executa ferramentas reais e submete ações sensíveis ao controle humano.
              </p>
            </div>

            {/* Ciclo ReAct */}
            <div
              style={{
                backgroundColor: '#111115',
                border: '1px solid #1f1f26',
                borderRadius: '12px',
                padding: '22px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                O Ciclo ReAct (Reasoning + Action)
              </h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px',
                  marginTop: '6px',
                }}
              >
                <div style={{ backgroundColor: '#16161c', padding: '14px', borderRadius: '8px', border: '1px solid #22222a' }}>
                  <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '0.78rem', marginBottom: '6px' }}>
                    1. PENSAMENTO (Reasoning)
                  </div>
                  <p style={{ fontSize: '0.76rem', color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>
                    O agente examina a solicitação, consulta o histórico e elabora um plano de resolução em etapas.
                  </p>
                </div>
                <div style={{ backgroundColor: '#16161c', padding: '14px', borderRadius: '8px', border: '1px solid #22222a' }}>
                  <div style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.78rem', marginBottom: '6px' }}>
                    2. AÇÃO (Action)
                  </div>
                  <p style={{ fontSize: '0.76rem', color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>
                    Invocação de uma ferramenta registrada (leitura de arquivo, execução de teste, consulta SQL).
                  </p>
                </div>
                <div style={{ backgroundColor: '#16161c', padding: '14px', borderRadius: '8px', border: '1px solid #22222a' }}>
                  <div style={{ color: '#10b981', fontWeight: 700, fontSize: '0.78rem', marginBottom: '6px' }}>
                    3. OBSERVAÇÃO (Observation)
                  </div>
                  <p style={{ fontSize: '0.76rem', color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>
                    O agente recebe o resultado da execução física e analisa se a etapa foi cumprida com êxito.
                  </p>
                </div>
                <div style={{ backgroundColor: '#16161c', padding: '14px', borderRadius: '8px', border: '1px solid #22222a' }}>
                  <div style={{ color: '#c084fc', fontWeight: 700, fontSize: '0.78rem', marginBottom: '6px' }}>
                    4. RESPOSTA OU REFINAMENTO
                  </div>
                  <p style={{ fontSize: '0.76rem', color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>
                    Apresentação da solução final ao usuário ou iteração de novas etapas até a meta estar concluída.
                  </p>
                </div>
              </div>
            </div>

            {/* Níveis Ponytail */}
            <div
              style={{
                backgroundColor: '#111115',
                border: '1px solid #1f1f26',
                borderRadius: '12px',
                padding: '22px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                Os 3 Níveis de Segurança Ponytail
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div
                  style={{
                    backgroundColor: '#16161c',
                    padding: '14px 16px',
                    borderRadius: '8px',
                    borderLeft: '4px solid #10b981',
                  }}
                >
                  <strong style={{ fontSize: '0.84rem', color: '#ffffff' }}>Nível 1 · Monitorado (Human-in-the-Loop Total)</strong>
                  <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '4px 0 0', lineHeight: 1.5 }}>
                    Qualquer execução de ferramenta ou chamada de API externa requer confirmação explícita na Central de
                    Aprovações antes de ser executada.
                  </p>
                </div>

                <div
                  style={{
                    backgroundColor: '#16161c',
                    padding: '14px 16px',
                    borderRadius: '8px',
                    borderLeft: '4px solid #f59e0b',
                  }}
                >
                  <strong style={{ fontSize: '0.84rem', color: '#ffffff' }}>Nível 2 · Semi-autônomo (Recomendado)</strong>
                  <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '4px 0 0', lineHeight: 1.5 }}>
                    Operações somente-leitura (pesquisa em arquivos, indexação) rodam de forma autônoma. Comandos de terminal,
                    alteração de arquivos ou requisições externas pedem aprovação humana.
                  </p>
                </div>

                <div
                  style={{
                    backgroundColor: '#16161c',
                    padding: '14px 16px',
                    borderRadius: '8px',
                    borderLeft: '4px solid #ef4444',
                  }}
                >
                  <strong style={{ fontSize: '0.84rem', color: '#ffffff' }}>Nível 3 · Autônomo com Guardrails</strong>
                  <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '4px 0 0', lineHeight: 1.5 }}>
                    O agente executa o plano completo dentro do workspace autorizado, apenas interrompendo se detectar risco de
                    segurança ou violação de políticas.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Aba 5: Guia Ollama Offline */}
        {currentSubTab === 'ollama_local' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '850px' }}>
            <div>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                Guia de Inferência Local com Ollama (100% Offline)
              </h1>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: '6px 0 0' }}>
                Rode modelos de ponta no seu hardware com privacidade absoluta e custo zero de tokens.
              </p>
            </div>

            <div
              style={{
                backgroundColor: '#111115',
                border: '1px solid #1f1f26',
                borderRadius: '12px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
              }}
            >
              {/* Etapa 1 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: '#f97316',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    1
                  </span>
                  <strong style={{ fontSize: '0.9rem', color: '#ffffff' }}>Instalar o Ollama</strong>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '0 0 8px 32px' }}>
                  Baixe e instale a versão compatível com seu sistema operacional (Windows, macOS ou Linux) em{' '}
                  <a href="https://ollama.ai" target="_blank" rel="noreferrer" style={{ color: '#f97316' }}>
                    ollama.ai
                  </a>
                  .
                </p>
              </div>

              {/* Etapa 2 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: '#f97316',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    2
                  </span>
                  <strong style={{ fontSize: '0.9rem', color: '#ffffff' }}>Baixar os Modelos Recomendados</strong>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '0 0 8px 32px' }}>
                  Abra o PowerShell ou Terminal e execute os comandos:
                </p>
                <div
                  style={{
                    marginLeft: '32px',
                    backgroundColor: '#0a0a0c',
                    border: '1px solid #22222a',
                    borderRadius: '8px',
                    padding: '12px',
                    fontFamily: 'monospace',
                    fontSize: '0.78rem',
                    color: '#34d399',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div>ollama pull qwen2.5-coder:7b</div>
                  <div>ollama pull nomic-embed-text</div>
                </div>
              </div>

              {/* Etapa 3 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: '#f97316',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    3
                  </span>
                  <strong style={{ fontSize: '0.9rem', color: '#ffffff' }}>Validar Conexão no JARVIS Hub</strong>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '0 0 12px 32px' }}>
                  O JARVIS Hub conecta-se automaticamente em http://localhost:11434. Você pode validar o status e alterar a
                  janela de contexto em Configurações do Servidor.
                </p>
                <div style={{ marginLeft: '32px' }}>
                  <button
                    type="button"
                    onClick={() => onNavigate('settings')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 14px',
                      borderRadius: '6px',
                      backgroundColor: '#1f1f26',
                      border: '1px solid #2e2e38',
                      color: '#ffffff',
                      fontSize: '0.78rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    <Server size={14} />
                    <span>Abrir Configurações do Servidor</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Aba 6: Perguntas Frequentes (FAQ) */}
        {currentSubTab === 'faq' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '850px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <h1 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                  Perguntas Frequentes (FAQ)
                </h1>
                <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: '6px 0 0' }}>
                  Tire dúvidas imediatas sobre o funcionamento, privacidade e governança do JARVIS Hub.
                </p>
              </div>

              {/* Filtros de Categoria FAQ */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {['all', 'Privacidade & Dados', 'Agentes & Orquestração', 'Segurança & Governança', 'Modelos & IA', 'Conectividade', 'Banco de Dados'].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFaqCategoryFilter(cat)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: faqCategoryFilter === cat ? '#f97316' : '#26262e',
                      backgroundColor: faqCategoryFilter === cat ? 'rgba(249, 115, 22, 0.15)' : '#141418',
                      color: faqCategoryFilter === cat ? '#f97316' : '#9ca3af',
                      fontSize: '0.74rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {cat === 'all' ? 'Todas' : cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Lista Acordeão de FAQs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredFaqs.map((faq) => {
                const isExpanded = expandedFaqId === faq.id;
                return (
                  <div
                    key={faq.id}
                    style={{
                      backgroundColor: '#111115',
                      border: '1px solid #1f1f26',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedFaqId(isExpanded ? null : faq.id)}
                      style={{
                        width: '100%',
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        border: 'none',
                        background: 'transparent',
                        color: '#ffffff',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        textAlign: 'left',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            color: '#f97316',
                            backgroundColor: 'rgba(249, 115, 22, 0.15)',
                            padding: '2px 7px',
                            borderRadius: '4px',
                          }}
                        >
                          {faq.category}
                        </span>
                        <span>{faq.question}</span>
                      </div>
                      {isExpanded ? <ChevronDown size={18} color="#9ca3af" /> : <ChevronRight size={18} color="#9ca3af" />}
                    </button>

                    {isExpanded && (
                      <div
                        style={{
                          padding: '0 20px 18px',
                          color: '#d1d5db',
                          fontSize: '0.82rem',
                          lineHeight: 1.65,
                          borderTop: '1px solid #191920',
                          paddingTop: '14px',
                        }}
                      >
                        {faq.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Aba 7: Atalhos de Teclado */}
        {currentSubTab === 'shortcuts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '850px' }}>
            <div>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                Atalhos de Teclado
              </h1>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: '6px 0 0' }}>
                Aumente sua produtividade navegando e executando tarefas rapidamente sem tirar as mãos do teclado.
              </p>
            </div>

            <div
              style={{
                backgroundColor: '#111115',
                border: '1px solid #1f1f26',
                borderRadius: '12px',
                overflow: 'hidden',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: '#141418', borderBottom: '1px solid #202028' }}>
                    <th style={{ padding: '12px 18px', fontSize: '0.74rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Atalho
                    </th>
                    <th style={{ padding: '12px 18px', fontSize: '0.74rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Ação
                    </th>
                    <th style={{ padding: '12px 18px', fontSize: '0.74rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Contexto
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredShortcuts.map((s, idx) => (
                    <tr
                      key={s.id}
                      style={{
                        borderBottom: idx === filteredShortcuts.length - 1 ? 'none' : '1px solid #1a1a22',
                        backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.015)',
                      }}
                    >
                      <td style={{ padding: '12px 18px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {s.keys.map((k) => (
                            <kbd
                              key={k}
                              style={{
                                backgroundColor: '#1e1e26',
                                border: '1px solid #32323e',
                                borderRadius: '5px',
                                padding: '3px 7px',
                                fontSize: '0.74rem',
                                color: '#ffffff',
                                fontFamily: 'monospace',
                                fontWeight: 600,
                                boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
                              }}
                            >
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '12px 18px', fontSize: '0.82rem', color: '#e5e7eb' }}>
                        {s.description}
                      </td>
                      <td style={{ padding: '12px 18px', fontSize: '0.74rem', color: '#9ca3af' }}>
                        <span
                          style={{
                            backgroundColor: '#181820',
                            border: '1px solid #262632',
                            padding: '3px 8px',
                            borderRadius: '4px',
                          }}
                        >
                          {s.category}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Aba 8: Tutoriais & Lições (21 Módulos com Progresso) */}
        {currentSubTab === 'lessons' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1000px' }}>
            {/* Header de Tutoriais */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h1 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                  Tutoriais & Módulos de Aprendizagem
                </h1>
                <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: '6px 0 0' }}>
                  Percurso estruturado de 21 lições práticas sobre cada funcionalidade do JARVIS Hub.
                </p>
              </div>

              {/* Card de Progresso Individual */}
              <div
                style={{
                  backgroundColor: '#111115',
                  border: '1px solid #1f1f26',
                  borderRadius: '10px',
                  padding: '12px 18px',
                  minWidth: '200px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Progresso da Conta</span>
                  <strong style={{ fontSize: '0.92rem', color: '#ffffff' }}>
                    {completed.length} de {LESSONS.length} ({Math.round((completed.length / LESSONS.length) * 100)}%)
                  </strong>
                </div>
                <div style={{ height: '6px', backgroundColor: '#1f1f26', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${(completed.length / LESSONS.length) * 100}%`,
                      backgroundColor: '#f97316',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.68rem', color: syncState === 'synced' ? '#34d399' : '#9ca3af' }}>
                  {syncState === 'synced' ? <CloudUpload size={12} /> : <CloudDownload size={12} />}
                  <span>{syncState === 'synced' ? 'Sincronizado com o servidor' : syncState === 'loading' ? 'Sincronizando...' : 'Modo local offline'}</span>
                </div>
              </div>
            </div>

            {/* Alerta de erro de sincronização */}
            {syncError && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  color: '#f87171',
                  fontSize: '0.78rem',
                }}
              >
                {syncError}
              </div>
            )}

            {/* Destaque contextual se o usuário veio de outro módulo */}
            {contextualLessons.length > 0 && !activeLesson && (
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'rgba(249, 115, 22, 0.08)',
                  border: '1px solid rgba(249, 115, 22, 0.25)',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} color="#f97316" />
                  <span style={{ fontSize: '0.8rem', color: '#f3f4f6' }}>
                    Recomendado para sua área recente (<strong>{activeTab}</strong>):{' '}
                    <span style={{ color: '#f97316' }}>{contextualLessons.map((l) => l.title).join(', ')}</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedLesson(contextualLessons[0].id)}
                  style={{
                    backgroundColor: '#f97316',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '5px 12px',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Abrir Tutorial
                </button>
              </div>
            )}

            {/* Filtros de Categoria de Lições */}
            {!activeLesson && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  'all',
                  'Primeiros passos',
                  'Agentes',
                  'Projetos',
                  'Desenvolvimento',
                  'Configuração',
                  'Conhecimento',
                  'Segurança',
                  'Engenharia',
                  'Gestão',
                  'Sistema',
                  'Conta',
                  'Integrações',
                ].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setLessonCategoryFilter(cat)}
                    style={{
                      padding: '4px 9px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: lessonCategoryFilter === cat ? '#f97316' : '#26262e',
                      backgroundColor: lessonCategoryFilter === cat ? 'rgba(249, 115, 22, 0.15)' : '#141418',
                      color: lessonCategoryFilter === cat ? '#f97316' : '#9ca3af',
                      fontSize: '0.72rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {cat === 'all' ? 'Todos os Módulos' : cat}
                  </button>
                ))}
              </div>
            )}

            {/* Detalhe da Lição Selecionada */}
            {activeLesson ? (
              <div
                style={{
                  backgroundColor: '#111115',
                  border: '1px solid #1f1f26',
                  borderRadius: '12px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedLesson(null)}
                  style={{
                    alignSelf: 'flex-start',
                    background: 'none',
                    border: 'none',
                    color: '#9ca3af',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  ← Voltar para todos os tutoriais
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      backgroundColor: 'rgba(249, 115, 22, 0.15)',
                      color: '#f97316',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    {activeLesson.category} · {activeLesson.duration}
                  </span>
                </div>

                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                  {activeLesson.title}
                </h2>
                <p style={{ fontSize: '0.86rem', color: '#9ca3af', lineHeight: 1.6, margin: 0 }}>
                  {activeLesson.description}
                </p>

                <div style={{ backgroundColor: '#141418', border: '1px solid #202028', borderRadius: '8px', padding: '16px' }}>
                  <h3 style={{ fontSize: '0.84rem', fontWeight: 700, color: '#ffffff', margin: '0 0 10px' }}>
                    Etapas do Tutorial:
                  </h3>
                  <ol style={{ margin: 0, paddingLeft: '20px', color: '#d1d5db', fontSize: '0.82rem', lineHeight: 1.8 }}>
                    {activeLesson.steps.map((st, i) => (
                      <li key={i}>{st}</li>
                    ))}
                  </ol>
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => toggleLesson(activeLesson.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: completed.includes(activeLesson.id) ? '#1f1f26' : '#f97316',
                      color: '#ffffff',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {completed.includes(activeLesson.id) ? (
                      <>
                        <CheckCircle2 size={16} color="#34d399" />
                        <span>Marcar como não concluído</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        <span>Concluir este tutorial</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (activeLesson.modules[0] === 'profile') {
                        onOpenProfile?.();
                      } else {
                        onNavigate(activeLesson.modules[0]);
                      }
                    }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: '1px solid #2a2a34',
                      backgroundColor: '#16161c',
                      color: '#f3f4f6',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Abrir módulo relacionado ({activeLesson.modules[0]})
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      try {
                        localStorage.setItem(
                          'jarvis_active_chat_prompt',
                          `Olá JARVIS, estou estudando o tutorial '${activeLesson.title}' no Centro de Aprendizagem e gostaria de tirar dúvidas sobre as etapas: ${activeLesson.steps.join('; ')}`
                        );
                      } catch {}
                      onNavigate('chat');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: '1px solid rgba(249, 115, 22, 0.4)',
                      backgroundColor: 'rgba(249, 115, 22, 0.1)',
                      color: '#f97316',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <Sparkles size={15} />
                    <span>Tirar dúvidas com o Tutor JARVIS</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Grid de Tutoriais */
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '14px',
                }}
              >
                {filteredLessons.map((lesson) => {
                  const isDone = completed.includes(lesson.id);
                  return (
                    <div
                      key={lesson.id}
                      style={{
                        backgroundColor: '#111115',
                        border: '1px solid #1f1f26',
                        borderRadius: '12px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            color: '#f97316',
                            backgroundColor: 'rgba(249, 115, 22, 0.15)',
                            padding: '2px 7px',
                            borderRadius: '4px',
                          }}
                        >
                          {lesson.category}
                        </span>
                        {isDone && <CheckCircle2 size={16} color="#34d399" />}
                      </div>

                      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                        {lesson.title}
                      </h3>
                      <p style={{ fontSize: '0.78rem', color: '#9ca3af', lineHeight: 1.5, margin: 0, flex: 1 }}>
                        {lesson.description}
                      </p>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid #1a1a20' }}>
                        <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>{lesson.duration}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedLesson(lesson.id)}
                          style={{
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: '#f97316',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span>Estudar</span>
                          <ChevronRight size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
