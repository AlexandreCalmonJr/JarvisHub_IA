import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  MessageSquare,
  FolderOpen,
  CheckSquare,
  Bot,
  Zap,
  Database,
  Cpu,
  Activity,
  Shield,
  Code2,
  Terminal,
  Settings,
  Sparkles,
  ArrowRight,
  X,
  Server,
  BarChart3,
  Building2,
} from 'lucide-react';
import { openWorkspaceRoot, savePonytailLevel } from '../../api';
import { notify } from './Toast';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
  onOpenProfile?: () => void;
  permissions?: string[];
  role?: string;
  principalKind?: string;
  permissionsLoaded?: boolean;
}

interface CommandItem {
  id: string;
  category: 'Navegação' | 'Ações Rápidas' | 'Modo Ponytail' | 'Segurança';
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  iconColor: string;
  badge?: string;
  action: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenProfile,
  permissions = [],
  role,
  principalKind,
  permissionsLoaded = false,
}) => {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleOpenExplorer = async () => {
    try {
      notify('A solicitar a abertura da pasta geral no servidor JARVIS...', 'info');
      await openWorkspaceRoot();
      notify('Pasta geral do workspace aberta no computador do servidor.', 'success');
      onClose();
    } catch (e: any) {
      notify(`Não foi possível abrir a pasta do servidor: ${e.message}`, 'error');
    }
  };

  const handleSetPonytail = async (level: string) => {
    try {
      await savePonytailLevel(level);
      notify(`Modo Ponytail ajustado para '${level.toUpperCase()}'!`, 'success');
      onClose();
    } catch (e: any) {
      notify(`Erro ao alterar Modo Ponytail: ${e.message}`, 'error');
    }
  };

  const commands: CommandItem[] = [
    // 1. Navegação Principal Clean One
    {
      id: 'nav-chat',
      category: 'Navegação',
      title: 'Chat JARVIS Maestro',
      subtitle: 'Converse com o Maestro e utilize os agentes e ferramentas disponíveis',
      icon: MessageSquare,
      iconColor: 'var(--accent-color)',
      badge: 'Maestro',
      action: () => {
        onNavigate('chat');
        onClose();
      },
    },
    {
      id: 'nav-overview',
      category: 'Navegação',
      title: 'Visão Geral',
      subtitle: 'Resumo operacional e saúde do sistema',
      icon: Activity,
      iconColor: 'var(--accent-color)',
      action: () => { onNavigate('overview'); onClose(); },
    },
    {
      id: 'nav-approvals',
      category: 'Navegação',
      title: 'Central de Aprovações',
      subtitle: 'Revise operações que aguardam autorização',
      icon: CheckSquare,
      iconColor: '#fbbf24',
      action: () => { onNavigate('approvals'); onClose(); },
    },
    {
      id: 'nav-design',
      category: 'Navegação',
      title: 'Design Studio',
      subtitle: 'Criação e revisão de interfaces',
      icon: Sparkles,
      iconColor: 'var(--accent-color)',
      action: () => { onNavigate('design'); onClose(); },
    },
    {
      id: 'nav-office',
      category: 'Navegação',
      title: 'Escritório Virtual',
      subtitle: 'Visão 2.5D dos agentes e departamentos registados',
      icon: Building2,
      iconColor: '#eab308',
      action: () => {
        onNavigate('office');
        onClose();
      },
    },
    {
      id: 'nav-workspace',
      category: 'Navegação',
      title: 'Projetos (Workspace Físico)',
      subtitle: 'Gerencie pastas e códigos criados fisicamente no disco do seu PC',
      icon: FolderOpen,
      iconColor: '#34d399',
      action: () => {
        onNavigate('workspace');
        onClose();
      },
    },
    {
      id: 'nav-models',
      category: 'Navegação',
      title: 'Modelos & Cofre de Chaves (KeyVault)',
      subtitle: 'Cadastre múltiplas chaves (Groq, Gemini, DeepSeek, OpenAI) e gerencie modelos',
      icon: Cpu,
      iconColor: 'var(--accent-color)',
      badge: 'KeyVault',
      action: () => {
        onNavigate('models');
        onClose();
      },
    },
    {
      id: 'nav-coding',
      category: 'Navegação',
      title: 'Coding Agent (Terminal & Código)',
      subtitle: 'Agente autônomo com ferramentas de arquivo, busca e execução no terminal',
      icon: Code2,
      iconColor: '#22d3ee',
      badge: 'Terminal',
      action: () => {
        onNavigate('coding');
        onClose();
      },
    },
    {
      id: 'nav-agents',
      category: 'Navegação',
      title: 'Centro de Agentes Especialistas',
      subtitle: 'Catálogo dos perfis registados, diretrizes e permissões de ferramentas',
      icon: Bot,
      iconColor: '#f472b6',
      badge: 'Agentes',
      action: () => {
        onNavigate('agents');
        onClose();
      },
    },
    {
      id: 'nav-vault',
      category: 'Navegação',
      title: 'Base de Conhecimento & RAG',
      subtitle: 'Indexe manuais, PDFs e código com busca semântica local',
      icon: Database,
      iconColor: 'var(--accent-color)',
      badge: 'RAG',
      action: () => {
        onNavigate('knowledge');
        onClose();
      },
    },
    {
      id: 'nav-tasks',
      category: 'Navegação',
      title: 'Fila de Tarefas (Tasks)',
      subtitle: 'Fila autônoma de execução e acompanhamento de planos multi-etapas',
      icon: CheckSquare,
      iconColor: 'var(--accent-color)',
      action: () => {
        onNavigate('tasks');
        onClose();
      },
    },
    {
      id: 'nav-backend-studio',
      category: 'Navegação',
      title: 'Backend & APIs Mock',
      subtitle: 'Simulador de endpoints HTTP com latência e playground SQL',
      icon: Server,
      iconColor: 'var(--accent-color)',
      badge: 'Mock',
      action: () => {
        onNavigate('backend_studio');
        onClose();
      },
    },
    {
      id: 'nav-quality',
      category: 'Navegação',
      title: 'Qualidade & QA (Testes)',
      subtitle: 'Execução de testes em sandbox, asserções e prevenção de regressões',
      icon: CheckSquare,
      iconColor: '#34d399',
      badge: 'QA',
      action: () => {
        onNavigate('quality');
        onClose();
      },
    },
    {
      id: 'nav-skills',
      category: 'Navegação',
      title: 'Habilidades (Skills ECC)',
      subtitle: 'Gerenciador de capacidades e extensões para os agentes',
      icon: Zap,
      iconColor: '#fbbf24',
      badge: 'Skills',
      action: () => {
        onNavigate('skills');
        onClose();
      },
    },
    {
      id: 'nav-security',
      category: 'Navegação',
      title: 'Segurança & Kill Switch',
      subtitle: 'Isolamento local 127.0.0.1, políticas de acesso e auditoria OWASP',
      icon: Shield,
      iconColor: '#10b981',
      action: () => {
        onNavigate('security');
        onClose();
      },
    },
    {
      id: 'nav-advisor',
      category: 'Navegação',
      title: 'Hardware Advisor & Telemetria',
      subtitle: 'Monitoramento de recursos locais e diagnóstico de hardware',
      icon: Activity,
      iconColor: '#34d399',
      action: () => {
        onNavigate('advisor');
        onClose();
      },
    },
    {
      id: 'nav-logs',
      category: 'Navegação',
      title: 'Logs do Servidor',
      subtitle: 'Terminal de eventos do backend FastAPI em tempo real',
      icon: Terminal,
      iconColor: '#94a3b8',
      action: () => {
        onNavigate('server_logs');
        onClose();
      },
    },
    {
      id: 'nav-executive',
      category: 'Navegação',
      title: 'Relatório Executivo',
      subtitle: 'Relatório e análise do projeto selecionado; ROI global para administradores',
      icon: BarChart3,
      iconColor: '#fbbf24',
      badge: 'Métricas',
      action: () => {
        onNavigate('executive_report');
        onClose();
      },
    },

    // 2. Ações Rápidas
    {
      id: 'act-explorer',
      category: 'Ações Rápidas',
      title: 'Abrir Pasta Geral do Workspace',
      subtitle: 'Abre a pasta no computador que executa o servidor JARVIS',
      icon: FolderOpen,
      iconColor: '#34d399',
      action: handleOpenExplorer,
    },
    {
      id: 'act-debate',
      category: 'Ações Rápidas',
      title: 'Iniciar Mesa Redonda de Consenso',
      subtitle: 'Convoque os especialistas técnicos para deliberar uma arquitetura no chat',
      icon: Bot,
      iconColor: '#eab308',
      badge: 'Consenso',
      action: () => {
        onNavigate('chat');
        notify('Mesa Redonda: digite seu desafio no chat!', 'info');
        onClose();
      },
    },
    {
      id: 'act-settings',
      category: 'Ações Rápidas',
      title: 'Perfil e Preferências',
      subtitle: 'Consulte o perfil e ajuste as preferências locais disponíveis',
      icon: Settings,
      iconColor: 'var(--accent-color)',
      action: () => {
        if (onOpenProfile) onOpenProfile();
        onClose();
      },
    },

    // 3. Modo Ponytail
    {
      id: 'pt-senior',
      category: 'Modo Ponytail',
      title: 'Ativar Modo Ponytail Sênior (Padrão Recomendado)',
      subtitle: 'Aplica a Escada da Preguiça Técnica: YAGNI, DRY e bibliotecas nativas',
      icon: Sparkles,
      iconColor: '#34d399',
      badge: 'Sênior',
      action: () => handleSetPonytail('senior'),
    },
    {
      id: 'pt-ultra',
      category: 'Modo Ponytail',
      title: 'Ativar Modo Ponytail Ultra (Minimalista Radical)',
      subtitle: 'Zero dependências externas, menor boilerplate possível',
      icon: Code2,
      iconColor: '#10b981',
      badge: 'Ultra',
      action: () => handleSetPonytail('ultra'),
    },
    {
      id: 'pt-off',
      category: 'Modo Ponytail',
      title: 'Desativar Modo Ponytail (Criação Livre)',
      subtitle: 'Retorna ao comportamento padrão de código sem restrições estritas',
      icon: X,
      iconColor: '#f87171',
      badge: 'Off',
      action: () => handleSetPonytail('off'),
    },
  ];

  const hasPermission = (permission: string) =>
    permissionsLoaded && (permissions.includes('*') || permissions.includes(permission));
  const isAdmin = principalKind === 'human' && role === 'admin';
  const commandPermissions: Record<string, string> = {
    'nav-chat': 'chat:read', 'nav-overview': 'system:read', 'nav-approvals': 'approvals:read',
    'nav-design': 'studios:read', 'nav-office': 'agents:read', 'nav-workspace': 'workspace:read',
    'nav-models': 'models:read', 'nav-coding': 'coding:read', 'nav-agents': 'agents:read',
    'nav-vault': 'knowledge:read', 'nav-tasks': 'tasks:read', 'nav-backend-studio': 'studios:read',
    'nav-quality': 'studios:read', 'nav-skills': 'skills:read', 'nav-security': 'security:read',
    'nav-executive': 'studios:read', 'act-explorer': 'workspace:write', 'act-debate': 'chat:use',
    'act-settings': 'profile:read',
  };
  const adminOnlyCommands = new Set(['nav-advisor', 'nav-logs', 'pt-senior', 'pt-ultra', 'pt-off']);

  // Filtra comandos pela permissão efetiva e pela pesquisa.
  const filtered = commands.filter((cmd) => {
    if (!permissionsLoaded) return false;
    if (adminOnlyCommands.has(cmd.id) && !isAdmin) return false;
    const requiredPermission = commandPermissions[cmd.id];
    if (requiredPermission && !hasPermission(requiredPermission)) return false;
    const q = search.toLowerCase();
    return (
      cmd.title.toLowerCase().includes(q) ||
      (cmd.subtitle && cmd.subtitle.toLowerCase().includes(q)) ||
      cmd.category.toLowerCase().includes(q)
    );
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(12px)',
        zIndex: 99990,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '620px',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '75vh',
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Barra de Busca Superior Clean One */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-color)',
            gap: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <Search size={18} color="var(--accent-color)" style={{ flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Digite um comando, especialista ou tela (ex: escritório, chat, projetos, chaves)..."
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: '0.94rem',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
            }}
          />
          <kbd
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              padding: '2px 7px',
              borderRadius: '5px',
              fontSize: '0.70rem',
              border: '1px solid var(--border-color)',
              color: 'var(--text-muted)',
              fontFamily: 'monospace',
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Lista de Resultados */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: '0.88rem', margin: 0 }}>Nenhum comando encontrado para &quot;{search}&quot;</p>
              <p style={{ fontSize: '0.76rem', marginTop: '6px' }}>Tente termos como &quot;escritório&quot;, &quot;projetos&quot;, &quot;chat&quot; ou &quot;chaves&quot;.</p>
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              const Icon = cmd.icon;

              return (
                <div
                  key={cmd.id}
                  onClick={() => cmd.action()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.07)' : 'transparent',
                    border: isSelected ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    transition: 'all 0.1s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        backgroundColor: isSelected ? 'rgba(234, 179, 8, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                        border: isSelected ? '1px solid rgba(234, 179, 8, 0.3)' : '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isSelected ? '#eab308' : cmd.iconColor,
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={15} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {cmd.title}
                        </span>
                        {cmd.badge && (
                          <span
                            style={{
                              fontSize: '0.62rem',
                              padding: '1px 6px',
                              borderRadius: '8px',
                              backgroundColor: 'rgba(255, 255, 255, 0.06)',
                              color: 'var(--text-secondary)',
                              border: '1px solid var(--border-color)',
                              fontWeight: 500,
                            }}
                          >
                            {cmd.badge}
                          </span>
                        )}
                      </div>
                      {cmd.subtitle && (
                        <p
                          style={{
                            fontSize: '0.72rem',
                            color: 'var(--text-muted)',
                            margin: '2px 0 0',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {cmd.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {cmd.category}
                    </span>
                    {isSelected && <ArrowRight size={13} color="var(--accent-color)" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé Clean One com Dicas de Atalhos */}
        <div
          style={{
            padding: '8px 16px',
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.70rem',
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ display: 'flex', gap: '12px' }}>
            <span>↑↓ Navegar</span>
            <span>↵ Abrir</span>
            <span>ESC Fechar</span>
          </div>
          <span style={{ color: 'var(--text-muted)' }}>JARVIS Hub Spotlight</span>
        </div>
      </div>
    </div>
  );
};
