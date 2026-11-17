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
  CloudUpload,
  CloudDownload,
  Store,
  Server,
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
  { id: 'overview', title: 'Visão Geral e estado do ambiente', description: 'Interprete os indicadores e identifique serviços indisponíveis.', duration: '4 min', category: 'Primeiros passos', modules: ['overview'], steps: ['Abra Visão Geral pela barra lateral.', 'Leia o estado dos serviços e diferencie disponível, degradado e indisponível.', 'Use os atalhos para abrir o módulo que apresenta o detalhe.'] },
  { id: 'chat', title: 'Chat JARVIS e Maestro', description: 'Envie pedidos e acompanhe a execução real das etapas.', duration: '6 min', category: 'Primeiros passos', modules: ['chat'], steps: ['Abra Chat JARVIS.', 'Mantenha Automático (Maestro) quando quiser que o servidor escolha o modelo.', 'Descreva objetivo, contexto e resultado esperado.', 'Confira etapas concluídas, bloqueios e aprovações antes de considerar a tarefa terminada.'] },
  { id: 'agents', title: 'Centro de Agentes', description: 'Consulte capacidades, permissões e estado dos agentes registados.', duration: '5 min', category: 'Agentes', modules: ['agents'], steps: ['Abra Centro de Agentes.', 'Selecione um agente e leia a sua descrição e capacidades.', 'Use apenas ações habilitadas para o seu perfil.', 'Confirme o resultado na tarefa correspondente; a seleção não significa execução.'] },
  { id: 'office', title: 'Escritório Virtual', description: 'Entenda a visualização do ambiente de agentes.', duration: '4 min', category: 'Agentes', modules: ['office'], steps: ['Abra Escritório Virtual.', 'Observe os agentes e as informações de estado apresentadas.', 'Use a navegação para abrir detalhes e tarefas.', 'Considere a tarefa e o seu histórico como fonte de verdade da execução.'] },
  { id: 'tasks', title: 'Gestão de Tarefas', description: 'Acompanhe estados, histórico e bloqueios das tarefas.', duration: '5 min', category: 'Agentes', modules: ['tasks'], steps: ['Abra Gestão de Tarefas.', 'Filtre ou selecione uma tarefa para consultar os detalhes.', 'Diferencie pendente, em execução, concluída, falha e bloqueada.', 'Quando existir aprovação pendente, abra a Central de Aprovações.'] },
  { id: 'workspace', title: 'Workspace e projetos', description: 'Organize projetos e artefactos com isolamento por conta.', duration: '5 min', category: 'Projetos', modules: ['workspace'], steps: ['Abra Workspace.', 'Crie ou selecione um projeto autorizado à sua conta.', 'Associe artefactos ao projeto correto.', 'Use Abrir pasta apenas quando a sua sessão e as permissões permitirem.'] },
  { id: 'coding', title: 'Coding Agent', description: 'Utilize recursos de desenvolvimento com controlo de execução.', duration: '6 min', category: 'Desenvolvimento', modules: ['coding'], steps: ['Abra Coding Agent.', 'Informe o contexto do projeto e o objetivo da alteração.', 'Revise o plano e os ficheiros afetados.', 'Execute apenas ações autorizadas e trate pedidos de aprovação de forma explícita.'] },
  { id: 'models', title: 'Modelos e providers', description: 'Consulte modelos disponíveis e configure credenciais no cofre.', duration: '7 min', category: 'Configuração', modules: ['models'], steps: ['Abra Modelos & Cofre.', 'Consulte a disponibilidade real de modelos e providers.', 'Guarde credenciais apenas no cofre protegido.', 'Não cole chaves em conversas, relatórios ou documentos.'] },
  { id: 'skills', title: 'Gestor de Skills', description: 'Consulte e administre capacidades reutilizáveis.', duration: '5 min', category: 'Configuração', modules: ['skills'], steps: ['Abra Gestor de Skills.', 'Leia a descrição e os requisitos de cada capacidade.', 'Instale ou altere apenas quando a ação estiver disponível e autorizada.', 'Revise as permissões antes de disponibilizar uma skill a agentes.'] },
  { id: 'knowledge', title: 'Base de Conhecimento', description: 'Adicione documentos autorizados e valide as fontes recuperadas.', duration: '5 min', category: 'Conhecimento', modules: ['knowledge'], steps: ['Abra Base de Conhecimento.', 'Adicione apenas documentos que tem autorização para tratar.', 'Aguarde a indexação e pesquise termos específicos.', 'Confira a origem e o contexto dos trechos antes de reutilizá-los.'] },
  { id: 'approvals', title: 'Central de Aprovações', description: 'Mantenha controlo humano sobre ações sensíveis.', duration: '4 min', category: 'Segurança', modules: ['approvals'], steps: ['Abra Central de Aprovações.', 'Leia o solicitante, o escopo e os recursos afetados.', 'Aprove apenas pedidos que reconhece e compreende.', 'Rejeite ou deixe pendente quando faltarem informações.'] },
  { id: 'security', title: 'Centro de Segurança', description: 'Consulte auditoria, políticas e controlos de segurança.', duration: '6 min', category: 'Segurança', modules: ['security'], steps: ['Abra Centro de Segurança.', 'Consulte eventos e alertas apresentados para o seu perfil.', 'Revise as políticas antes de aplicar alterações.', 'Ações críticas podem exigir privilégios administrativos e aprovação.'] },
  { id: 'backend_studio', title: 'Backend Studio', description: 'Explore ferramentas e diagnósticos do backend.', duration: '5 min', category: 'Engenharia', modules: ['backend_studio'], steps: ['Abra Backend Studio.', 'Escolha a área de diagnóstico ou consulta disponível.', 'Em consultas SQL, confirme se a operação é somente leitura.', 'Não execute alterações de dados sem autorização e cópia de segurança.'] },
  { id: 'quality', title: 'Quality Studio', description: 'Acompanhe os recursos e resultados de qualidade.', duration: '4 min', category: 'Engenharia', modules: ['quality'], steps: ['Abra Quality Studio.', 'Selecione o projeto ou recurso que pretende analisar.', 'Leia o resultado e as limitações da verificação.', 'Não trate uma análise não executada como aprovação.'] },
  { id: 'design', title: 'Design Studio', description: 'Utilize as ferramentas de design e os artefactos do módulo.', duration: '4 min', category: 'Engenharia', modules: ['design'], steps: ['Abra Design Studio.', 'Selecione o contexto de projeto disponível.', 'Revise os artefactos gerados antes de os reutilizar.', 'Mantenha versões e decisões associadas ao projeto.'] },
  { id: 'executive_report', title: 'Relatórios Executivos', description: 'Interprete indicadores e relatórios com o respetivo âmbito.', duration: '5 min', category: 'Gestão', modules: ['executive_report'], steps: ['Abra Relatórios Executivos.', 'Selecione o projeto quando o relatório permitir.', 'Verifique o período e a origem dos indicadores.', 'Diferencie estimativas de valores financeiros reais.'] },
  { id: 'advisor', title: 'Hardware Advisor', description: 'Consulte o perfil de hardware e opções de otimização.', duration: '5 min', category: 'Sistema', modules: ['advisor'], steps: ['Abra Hardware Advisor.', 'Leia os dados de hardware efetivamente detetados.', 'Compare recomendações com a configuração atual.', 'Aplique otimizações somente após confirmar impacto e permissões.'] },
  { id: 'server_logs', title: 'Logs do Servidor', description: 'Consulte registos operacionais dentro do seu nível de acesso.', duration: '4 min', category: 'Sistema', modules: ['server_logs'], steps: ['Abra Logs do Servidor.', 'Use filtros de nível e pesquisa quando disponíveis.', 'Evite partilhar registos que possam conter dados operacionais sensíveis.', 'A limpeza do buffer é uma ação administrativa e deve ser confirmada.'] },
  { id: 'profile', title: 'Perfil e preferências', description: 'Configure preferências sem guardar segredos no navegador.', duration: '3 min', category: 'Conta', modules: ['profile'], steps: ['Abra Perfil e Configurações pelo avatar.', 'Atualize os dados pessoais e as preferências disponíveis.', 'Use o Cofre de Chaves para credenciais.', 'A preferência de estilo não altera automaticamente as permissões da conta.'] },
  { id: 'onboarding', title: 'Configuração inicial e segurança', description: 'Entenda as etapas do assistente de primeira utilização.', duration: '5 min', category: 'Primeiros passos', modules: ['overview'], steps: ['Confirme que a conta administrativa utiliza uma palavra-passe pessoal.', 'Revise os indicadores do banco, modelo local e cofre.', 'Configure providers apenas no cofre e segundo as permissões.', 'Conclua o assistente após rever o estado do ambiente.'] },
  { id: 'mcp', title: 'Integrações e ferramentas', description: 'Entenda como integrações e ferramentas são disponibilizadas.', duration: '4 min', category: 'Integrações', modules: ['models', 'agents'], steps: ['Consulte o estado das integrações nas áreas disponíveis.', 'Verifique quais ferramentas estão habilitadas para a sua conta.', 'Não partilhe tokens de integração em prompts.', 'A execução continua sujeita às políticas, permissões e aprovações do Hub.'] },
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
    category: 'Privacidade',
    question: 'O JARVIS envia dados para a nuvem?',
    answer: 'Não por padrão. Com o Ollama local, todo o raciocínio é 100% no seu computador. Para provedores externos, a comunicação é direta e criptografada via AES-256.',
  },
  {
    id: 'agents_delegation',
    category: 'Agentes',
    question: 'Como o Maestro delega para os 26 especialistas?',
    answer: 'Através da arquitetura ReAct (Reasoning + Action). Ele avalia a solicitação, define as sub-etapas e aciona os perfis especializados conforme a missão de cada um.',
  },
  {
    id: 'ponytail',
    category: 'Segurança',
    question: 'Como funciona o modo Ponytail?',
    answer: 'Controla a autonomia dos agentes. O Nível 1 exige aprovação prévia em tudo, o Nível 2 automatiza leituras e requer aprovação em escritas, e o Nível 3 executa tarefas autônomas no workspace.',
  },
  {
    id: 'ollama_offline',
    category: 'IA Local',
    question: 'Como configurar o Ollama offline?',
    answer: 'Instale o Ollama, execute `ollama run qwen2.5-coder:7b` e configure o endpoint http://localhost:11434 em Configurações > Servidor.',
  },
  {
    id: 'android_pair',
    category: 'Mobile',
    question: 'Como parear com o Android?',
    answer: 'Acesse Configurações > Conectar Celular e leia o QR Code gerado pelo app móvel do JARVIS Hub.',
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
          setSyncError('Progresso em modo local offline.');
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
        if (!response.ok) throw new Error('Falha ao sincronizar.');
      })
      .then(() => {
        setSyncState('synced');
        setSyncError('');
      })
      .catch(() => {
        setSyncState('offline');
        setSyncError('Progresso salvo localmente.');
      });
  };

  const contextualLessons = useMemo(() => {
    return LESSONS.filter((l) => l.modules.includes(activeTab || ''));
  }, [activeTab]);

  const filteredLessons = useMemo(() => {
    return LESSONS.filter((l) =>
      [l.title, l.description, l.category].join(' ').toLowerCase().includes(query.toLowerCase())
    );
  }, [query]);

  const filteredAgents = useMemo(() => {
    return ALL_26_AGENTS.filter((a) =>
      [a.name, a.mission, a.categoryLabel, a.role].join(' ').toLowerCase().includes(query.toLowerCase())
    );
  }, [query]);

  const activeLesson = LESSONS.find((l) => l.id === selectedLesson);

  const startChatWithAgent = (agent: CatalogAgent) => {
    try {
      localStorage.setItem(
        'jarvis_active_chat_prompt',
        `Olá @${agent.name}, gostaria de acionar sua especialidade em ${agent.categoryLabel}.`
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
      {/* Sub-Sidebar Minimalista (220px) */}
      <aside
        style={{
          width: '220px',
          minWidth: '220px',
          backgroundColor: '#0d0d10',
          borderRight: '1px solid #18181e',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px 10px',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 4px' }}>
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              backgroundColor: 'rgba(249, 115, 22, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f97316',
            }}
          >
            <HelpCircle size={15} />
          </div>
          <div>
            <h2 style={{ fontSize: '0.84rem', fontWeight: 600, margin: 0, color: '#ffffff' }}>
              Ajuda & Novidades
            </h2>
          </div>
        </div>

        {/* Input Minimalista de Busca */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: '#141418',
            border: '1px solid #202028',
            borderRadius: '6px',
            padding: '5px 8px',
          }}
        >
          <Search size={13} color="#6b7280" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar..."
            aria-label="Pesquisar ajuda"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f3f4f6',
              fontSize: '0.74rem',
            }}
          />
        </div>

        {/* Navegação Principal Reduzida */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
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
              padding: '7px 9px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: currentSubTab === 'news' || currentSubTab === 'changelog' ? '#1c1c22' : 'transparent',
              color: currentSubTab === 'news' || currentSubTab === 'changelog' ? '#ffffff' : '#9ca3af',
              fontSize: '0.78rem',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Sparkles size={14} color="#f97316" />
              <span>Novidades</span>
            </div>
            <span style={{ fontSize: '0.62rem', color: '#f97316', fontWeight: 700 }}>v3.0.1</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCurrentSubTab('agents_guide');
              setSelectedLesson(null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '7px 9px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: currentSubTab === 'agents_guide' || currentSubTab === 'react_architecture' ? '#1c1c22' : 'transparent',
              color: currentSubTab === 'agents_guide' || currentSubTab === 'react_architecture' ? '#ffffff' : '#9ca3af',
              fontSize: '0.78rem',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <Bot size={14} color="#a855f7" />
            <span>26 Especialistas</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCurrentSubTab('faq');
              setSelectedLesson(null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '7px 9px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: currentSubTab === 'faq' || currentSubTab === 'shortcuts' || currentSubTab === 'ollama_local' ? '#1c1c22' : 'transparent',
              color: currentSubTab === 'faq' || currentSubTab === 'shortcuts' || currentSubTab === 'ollama_local' ? '#ffffff' : '#9ca3af',
              fontSize: '0.78rem',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <HelpCircle size={14} color="#eab308" />
            <span>Ajuda & FAQ</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentSubTab('lessons')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 9px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: currentSubTab === 'lessons' ? '#1c1c22' : 'transparent',
              color: currentSubTab === 'lessons' ? '#ffffff' : '#9ca3af',
              fontSize: '0.78rem',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <BookOpen size={14} color="#10b981" />
              <span>Tutoriais</span>
            </div>
            <span style={{ fontSize: '0.62rem', color: '#6b7280' }}>
              {completed.length}/{LESSONS.length}
            </span>
          </button>
        </nav>

        {/* Botão Minimalista para Tour Guiado */}
        <button
          type="button"
          onClick={onStartTour}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '7px',
            borderRadius: '6px',
            border: '1px solid #202028',
            backgroundColor: '#121216',
            color: '#f97316',
            fontSize: '0.72rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <Compass size={13} />
          <span>Tour Guiado</span>
        </button>
      </aside>

      {/* Área Central Limpa & Espaçosa */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 32px 40px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          maxWidth: '920px',
        }}
      >
        {/* Sub-Aba: Novidades & Changelog (Clean & Minimal) */}
        {(currentSubTab === 'news' || currentSubTab === 'changelog') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header Conciso */}
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(249, 115, 22, 0.1)', color: '#f97316', fontSize: '0.7rem', fontWeight: 600, marginBottom: '6px' }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#f97316' }} />
                VERSÃO 3.0.1
              </div>
              <h1 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '2px 0 4px', color: '#ffffff' }}>
                Novidades do JARVIS AI Hub
              </h1>
              <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>
                Evolução para o layout OpenBot escuro, catálogo completo com 26 especialistas e controle total do servidor.
              </p>
            </div>

            {/* 3 Cards Resumidos e Minimalistas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
              <div style={{ backgroundColor: '#111114', border: '1px solid #1b1b22', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a855f7' }}>
                  <Bot size={16} />
                  <strong style={{ fontSize: '0.82rem', color: '#ffffff' }}>26 Especialistas de IA</strong>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0, lineHeight: 1.4 }}>
                  Orquestração ReAct multi-agente para arquitetura, código, testes QA, segurança e DevOps.
                </p>
              </div>

              <div style={{ backgroundColor: '#111114', border: '1px solid #1b1b22', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8' }}>
                  <Store size={16} />
                  <strong style={{ fontSize: '0.82rem', color: '#ffffff' }}>Loja de Aplicativos</strong>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0, lineHeight: 1.4 }}>
                  Conectores para Telegram, WhatsApp, Slack, GitHub, Canva e gerenciadores de senha.
                </p>
              </div>

              <div style={{ backgroundColor: '#111114', border: '1px solid #1b1b22', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981' }}>
                  <Server size={16} />
                  <strong style={{ fontSize: '0.82rem', color: '#ffffff' }}>Servidor & SQLite WAL</strong>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0, lineHeight: 1.4 }}>
                  Otimização de banco de dados, bind de rede, expiração de JWT e inferência local Ollama.
                </p>
              </div>
            </div>

            {/* Histórico Limpo de Versões */}
            <div style={{ backgroundColor: '#111114', border: '1px solid #1b1b22', borderRadius: '8px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <strong style={{ fontSize: '0.82rem', color: '#ffffff' }}>Histórico de Versões</strong>
                <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>v3.0.1 mais recente</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', color: '#9ca3af', fontSize: '0.76rem', lineHeight: 1.7 }}>
                <li><strong style={{ color: '#d1d5db' }}>v3.0.1:</strong> Painel de servidor FastAPI com teste de ping, catálogo dos 26 especialistas na loja e Central de Ajuda.</li>
                <li><strong style={{ color: '#d1d5db' }}>v3.0.0:</strong> Interface OpenBot Dark Obsidian, Dynamic Island no topo, AgentDock 3D e isolamento multi-tenant.</li>
                <li><strong style={{ color: '#d1d5db' }}>v2.9.0:</strong> Motor ReAct autônomo, suporte a Ollama offline e streaming de tokens.</li>
              </ul>
            </div>
          </div>
        )}

        {/* Sub-Aba: 26 Especialistas & ReAct (Clean & Searchable) */}
        {(currentSubTab === 'agents_guide' || currentSubTab === 'react_architecture') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h1 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0 0 4px', color: '#ffffff' }}>
                26 Especialistas de IA
              </h1>
              <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>
                Selecione qualquer agente para consultar sua função ou iniciar uma conversa direta.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
              {filteredAgents.map((agent) => (
                <div
                  key={agent.id}
                  style={{
                    backgroundColor: '#111114',
                    border: '1px solid #1b1b22',
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '6px',
                          backgroundColor: `${agent.color}22`,
                          border: `1px solid ${agent.color}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: agent.color,
                        }}
                      >
                        <Bot size={15} />
                      </div>
                      <div>
                        <strong style={{ fontSize: '0.8rem', color: '#ffffff', display: 'block' }}>{agent.name}</strong>
                        <span style={{ fontSize: '0.66rem', color: agent.color }}>{agent.categoryLabel}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => startChatWithAgent(agent)}
                      style={{
                        backgroundColor: '#1a1a20',
                        border: '1px solid #282832',
                        borderRadius: '4px',
                        padding: '3px 7px',
                        color: '#f3f4f6',
                        fontSize: '0.68rem',
                        cursor: 'pointer',
                      }}
                    >
                      Conversar
                    </button>
                  </div>
                  <p style={{ fontSize: '0.73rem', color: '#9ca3af', margin: 0, lineHeight: 1.4 }}>
                    {agent.mission}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sub-Aba: Ajuda, FAQ, Atalhos & Ollama Local */}
        {(currentSubTab === 'faq' || currentSubTab === 'shortcuts' || currentSubTab === 'ollama_local') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h1 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0 0 4px', color: '#ffffff' }}>
                Perguntas Frequentes & Suporte
              </h1>
              <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>
                Respostas rápidas e comandos essenciais do sistema.
              </p>
            </div>

            {/* Atalhos Rápidos */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', backgroundColor: '#111114', border: '1px solid #1b1b22', borderRadius: '8px', padding: '10px 14px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: '#9ca3af', marginRight: '4px' }}>Atalhos Rápidos:</span>
              <span style={{ fontSize: '0.7rem', color: '#ffffff', backgroundColor: '#181820', padding: '2px 6px', borderRadius: '4px', border: '1px solid #282832', fontFamily: 'monospace' }}>Ctrl + K (Busca)</span>
              <span style={{ fontSize: '0.7rem', color: '#ffffff', backgroundColor: '#181820', padding: '2px 6px', borderRadius: '4px', border: '1px solid #282832', fontFamily: 'monospace' }}>Enter (Enviar)</span>
              <span style={{ fontSize: '0.7rem', color: '#ffffff', backgroundColor: '#181820', padding: '2px 6px', borderRadius: '4px', border: '1px solid #282832', fontFamily: 'monospace' }}>Shift + Enter (Nova Linha)</span>
              <span style={{ fontSize: '0.7rem', color: '#ffffff', backgroundColor: '#181820', padding: '2px 6px', borderRadius: '4px', border: '1px solid #282832', fontFamily: 'monospace' }}>Esc (Fechar)</span>
            </div>

            {/* Acordeão de Perguntas */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {FAQS.map((faq) => {
                const isExpanded = expandedFaqId === faq.id;
                return (
                  <div key={faq.id} style={{ backgroundColor: '#111114', border: '1px solid #1b1b22', borderRadius: '8px', overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => setExpandedFaqId(isExpanded ? null : faq.id)}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        border: 'none',
                        background: 'transparent',
                        color: '#ffffff',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span>{faq.question}</span>
                      {isExpanded ? <ChevronDown size={15} color="#9ca3af" /> : <ChevronRight size={15} color="#9ca3af" />}
                    </button>
                    {isExpanded && (
                      <div style={{ padding: '0 14px 12px', color: '#9ca3af', fontSize: '0.75rem', lineHeight: 1.5, borderTop: '1px solid #181820', paddingTop: '10px' }}>
                        {faq.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sub-Aba: Tutoriais & Lições (Clean Checklist) */}
        {currentSubTab === 'lessons' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0 0 4px', color: '#ffffff' }}>
                  Tutoriais & Aprendizagem
                </h1>
                <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>
                  Lições práticas sobre os módulos do JARVIS Hub.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.74rem', color: '#9ca3af' }}>
                {syncState === 'synced' ? <CloudUpload size={13} color="#34d399" /> : <CloudDownload size={13} />}
                <span>{completed.length} de {LESSONS.length} concluídos</span>
                {syncError && <span style={{ color: '#ef4444', fontSize: '0.68rem' }}>({syncError})</span>}
              </div>
            </div>

            {contextualLessons.length > 0 && !activeLesson && (
              <div style={{ fontSize: '0.74rem', color: '#f97316', backgroundColor: 'rgba(249, 115, 22, 0.08)', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(249, 115, 22, 0.2)' }}>
                Módulo sugerido para {activeTab}: <strong>{contextualLessons[0].title}</strong>
              </div>
            )}

            {/* Detalhe da Lição */}
            {activeLesson ? (
              <div style={{ backgroundColor: '#111114', border: '1px solid #1b1b22', borderRadius: '8px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedLesson(null)}
                  style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: '#9ca3af', fontSize: '0.74rem', cursor: 'pointer', padding: 0 }}
                >
                  ← Todos os tutoriais
                </button>
                <div>
                  <span style={{ fontSize: '0.68rem', color: '#f97316', fontWeight: 600 }}>{activeLesson.category} · {activeLesson.duration}</span>
                  <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff', margin: '4px 0 6px' }}>{activeLesson.title}</h2>
                  <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>{activeLesson.description}</p>
                </div>
                <div style={{ backgroundColor: '#141418', borderRadius: '6px', padding: '12px' }}>
                  <ol style={{ margin: 0, paddingLeft: '18px', color: '#d1d5db', fontSize: '0.76rem', lineHeight: 1.7 }}>
                    {activeLesson.steps.map((st, i) => (
                      <li key={i}>{st}</li>
                    ))}
                  </ol>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => toggleLesson(activeLesson.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '5px',
                      border: 'none',
                      backgroundColor: completed.includes(activeLesson.id) ? '#1f1f26' : '#f97316',
                      color: '#ffffff',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {completed.includes(activeLesson.id) ? 'Concluído ✓' : 'Marcar como Concluído'}
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
                      padding: '6px 12px',
                      borderRadius: '5px',
                      border: '1px solid #282832',
                      backgroundColor: '#16161c',
                      color: '#f3f4f6',
                      fontSize: '0.74rem',
                      cursor: 'pointer',
                    }}
                  >
                    Abrir Módulo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        localStorage.setItem(
                          'jarvis_active_chat_prompt',
                          `Olá JARVIS, estou estudando o tutorial '${activeLesson.title}' e gostaria de tirar dúvidas.`
                        );
                      } catch {}
                      onNavigate('chat');
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '5px',
                      border: '1px solid rgba(249, 115, 22, 0.3)',
                      backgroundColor: 'rgba(249, 115, 22, 0.08)',
                      color: '#f97316',
                      fontSize: '0.74rem',
                      cursor: 'pointer',
                    }}
                  >
                    Tirar dúvidas com o Tutor
                  </button>
                </div>
              </div>
            ) : (
              /* Lista Limpa de Lições */
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
                {filteredLessons.map((lesson) => {
                  const isDone = completed.includes(lesson.id);
                  return (
                    <div
                      key={lesson.id}
                      style={{
                        backgroundColor: '#111114',
                        border: '1px solid #1b1b22',
                        borderRadius: '8px',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.66rem', color: '#f97316', fontWeight: 600 }}>{lesson.category}</span>
                        {isDone && <CheckCircle2 size={13} color="#34d399" />}
                      </div>
                      <strong style={{ fontSize: '0.8rem', color: '#ffffff' }}>{lesson.title}</strong>
                      <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0, lineHeight: 1.4, flex: 1 }}>{lesson.description}</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: '1px solid #181820' }}>
                        <span style={{ fontSize: '0.68rem', color: '#6b7280' }}>{lesson.duration}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedLesson(lesson.id)}
                          style={{ background: 'none', border: 'none', color: '#f97316', fontSize: '0.72rem', fontWeight: 500, cursor: 'pointer', padding: 0 }}
                        >
                          Estudar →
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
