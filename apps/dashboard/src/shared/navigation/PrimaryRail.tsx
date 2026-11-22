import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  Workflow,
  ListTodo,
  TrendingUp,
  FolderKanban,
  Store,
  HelpCircle,
  Settings,
  MoreHorizontal,
  Pin,
  Layers,
  Cpu,
  Sparkles,
  Check,
  Server,
  Smartphone,
  Users,
  LogOut,
  Building2,
  Code2,
  Bot,
  Database,
  ShieldCheck,
  CheckSquare,
  Palette,
  Terminal,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  FileBarChart2,
  Wrench,
  BookOpen,
  SlidersHorizontal,
  Wand2,
  AppWindow,
  GitBranch,
} from 'lucide-react';
import { useAssistantIdentity } from '../../context/AssistantIdentityContext';
import { getAssistantInitial } from '../../services/assistantIdentity';

export interface NavRailItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; className?: string }>;
  isPinned: boolean;
  badge?: number;
}

interface PrimaryRailProps {
  activeTab: string;
  onNavigate: (tabId: string) => void;
  collapsed?: boolean;
  mobileOpen?: boolean;
  onToggleCollapse?: () => void;
  onOpenSettings?: () => void;
  onOpenHelp?: () => void;
  onOpenProfile?: () => void;
  pendingApprovalsCount?: number;
}

interface NavGroup {
  title: string;
  items: {
    id: string;
    label: string;
    icon: React.ComponentType<{ size?: number; color?: string; className?: string }>;
    badge?: number;
  }[];
}

export const PrimaryRail: React.FC<PrimaryRailProps> = ({
  activeTab,
  onNavigate,
  collapsed = false,
  mobileOpen = false,
  onToggleCollapse,
  onOpenSettings,
  onOpenHelp,
  onOpenProfile,
  pendingApprovalsCount = 0,
}) => {
  const { assistantName, experienceMode, setExperienceMode } = useAssistantIdentity();
  const isSimpleMode = experienceMode === 'simple';
  const assistantInitial = getAssistantInitial(assistantName);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [serverMenuOpen, setServerMenuOpen] = useState(false);
  const [activeBrainLabel, setActiveBrainLabel] = useState<string>('Esta Máquina · Local');
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onBrainSwitched = (e: Event) => {
      const detail = (e as CustomEvent<{ name?: string }>).detail;
      if (detail?.name) {
        setActiveBrainLabel(detail.name);
      }
    };
    window.addEventListener('jarvis:brain-switched', onBrainSwitched);
    return () => window.removeEventListener('jarvis:brain-switched', onBrainSwitched);
  }, []);

  const [pinnedItems, setPinnedItems] = useState<Record<string, boolean>>({
    overview: true,
    chat: true,
    tasks: true,
    workflows: true,
    workspace: true,
    coding: true,
    agents: true,
    usage: true,
    approvals: true,
    models: true,
    knowledge: false,
    backend_studio: false,
    quality: false,
    design: false,
    office: true,
    skills: false,
    security: true,
    companion: true,
    creative_studio: true,
    app_builder: true,
    github_import: true,
    android_app: true,
    brain_server: true,
    executive_report: false,
    advisor: false,
    server_logs: false,
  });

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
        setServerMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const togglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('jarvis_sidebar_expanded_groups');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}
    return {
      'Engenharia & IA': false,
      'Estúdios & Governança': false,
    };
  });

  const toggleGroup = (title: string) => {
    setExpandedGroups((prev) => {
      const next = { ...prev, [title]: !prev[title] };
      try {
        localStorage.setItem('jarvis_sidebar_expanded_groups', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const navGroups: (NavGroup & { collapsible?: boolean })[] = [
    {
      title: 'Principal',
      collapsible: false,
      items: [
        { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
        { id: 'chat', label: 'Conversas', icon: MessageSquare },
        { id: 'creative_studio', label: 'Estúdio Criativo', icon: Wand2 },
        { id: 'app_builder', label: 'Construtor de Apps', icon: AppWindow },
        { id: 'office', label: 'Escritório Vivo', icon: Building2 },
        { id: 'tasks', label: 'Tarefas', icon: ListTodo },
        { id: 'workflows', label: 'Fluxos', icon: Workflow },
        { id: 'workspace', label: 'Projetos', icon: FolderKanban },
        { id: 'coding', label: 'IDE & Código', icon: Code2 },
        { id: 'security', label: 'Sentinela & Segurança', icon: ShieldCheck },
        { id: 'android_app', label: 'App Mobile Android', icon: Smartphone },
        { id: 'brain_server', label: 'Cérebros & Servidor', icon: Server },
        { id: 'companion', label: 'Voz & Companion', icon: Smartphone },
      ],
    },
    {
      title: 'Engenharia & IA',
      collapsible: true,
      items: [
        { id: 'agents', label: 'Agentes', icon: Bot },
        { id: 'models', label: 'Modelos & Chaves', icon: Cpu },
        { id: 'knowledge', label: 'Conhecimento', icon: Database },
        { id: 'skills', label: 'Habilidades', icon: Layers },
        { id: 'github_import', label: 'Importar GitHub', icon: GitBranch },
      ],
    },
    {
      title: 'Estúdios & Governança',
      collapsible: true,
      items: [
        { id: 'approvals', label: 'Aprovações', icon: CheckSquare, badge: pendingApprovalsCount },
        { id: 'usage', label: 'Uso & Custos', icon: TrendingUp },
        { id: 'backend_studio', label: 'Backend Studio', icon: Wrench },
        { id: 'quality', label: 'Qualidade QA', icon: CheckSquare },
        { id: 'design', label: 'Design Studio', icon: Palette },
        { id: 'executive_report', label: 'Relatório ROI', icon: FileBarChart2 },
        { id: 'advisor', label: 'Hardware', icon: Sparkles },
        { id: 'server_logs', label: 'Logs do Servidor', icon: Terminal },
      ],
    },
  ];

  const simpleNavGroups: (NavGroup & { collapsible?: boolean })[] = [
    {
      title: 'Meu Espaço',
      collapsible: false,
      items: [
        { id: 'overview', label: 'Início', icon: LayoutDashboard },
        { id: 'chat', label: `Conversar com ${assistantName}`, icon: MessageSquare },
        { id: 'creative_studio', label: 'Planilhas, Imagens & Vídeos', icon: Wand2 },
        { id: 'app_builder', label: 'Criar Apps (Android/PC)', icon: AppWindow },
        { id: 'android_app', label: 'App Android (QR & APK)', icon: Smartphone },
        { id: 'brain_server', label: 'Cérebros (Local / Docker)', icon: Server },
        { id: 'companion', label: 'Voz & Celular (PWA)', icon: Smartphone },
        { id: 'agents', label: 'Meus Agentes', icon: Bot },
        { id: 'github_import', label: 'Importar do GitHub', icon: GitBranch },
        { id: 'workflows', label: 'Meus Fluxos', icon: Workflow },
        { id: 'tasks', label: 'Tarefas', icon: ListTodo },
        { id: 'knowledge', label: 'Cadernos & Memória', icon: BookOpen },
      ],
    },
  ];

  const activeNavGroups = isSimpleMode ? simpleNavGroups : navGroups;

  // Auto-expande o grupo caso o usuário navegue diretamente para uma tela dentro dele
  useEffect(() => {
    const ownerGroup = activeNavGroups.find(
      (g) =>
        g.collapsible &&
        g.items.some((item) => item.id === activeTab || (item.id === 'skills' && activeTab === 'store'))
    );
    if (ownerGroup && !expandedGroups[ownerGroup.title]) {
      setExpandedGroups((prev) => ({ ...prev, [ownerGroup.title]: true }));
    }
  }, [activeTab]);

  const allItems = activeNavGroups.flatMap((g) => g.items);
  const compactPinnedItems = isSimpleMode
    ? allItems
    : allItems.filter((item) => pinnedItems[item.id]);

  return (
    <nav
      ref={navRef}
      className={`jarvis-sidebar openbot-primary-rail ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}
      aria-label="Navegação Principal"
    >
      {/* Brand Header */}
      <div
        style={{
          height: 'var(--topbar-height)',
          padding: collapsed ? '0 12px' : '0 14px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: '10px',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => onNavigate('overview')}
          aria-label="Ir para Visão Geral"
          className={collapsed ? 'btn btn-ghost btn-icon' : 'btn btn-ghost btn-sm btn-start'}
          title={`${assistantName} AI Hub`}
        >
          <div
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.88rem',
              letterSpacing: '-0.03em',
              flexShrink: 0,
            }}
          >
            {assistantInitial}
          </div>
          {!collapsed && (
            <div style={{ textAlign: 'left', overflow: 'hidden' }}>
              <div
                style={{
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.01em',
                  lineHeight: 1.15,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '132px',
                }}
              >
                {assistantName}
              </div>
              <div
                style={{
                  fontSize: '0.68rem',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  lineHeight: 1.2,
                }}
              >
                {isSimpleMode ? 'Modo Simples' : 'AI Hub · Completo'}
              </div>
            </div>
          )}
        </button>

        {!collapsed && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="btn btn-ghost btn-icon-sm"
            title="Recolher barra lateral (Ctrl+B)"
            aria-label="Recolher barra lateral"
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      {/* Main Scrollable Navigation */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: collapsed ? '12px 10px' : '12px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: collapsed ? '6px' : '16px',
        }}
      >
        {collapsed ? (
          <>
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="jarvis-sidebar-item"
                title="Expandir barra lateral (Ctrl+B)"
                aria-label="Expandir barra lateral"
              >
                <PanelLeftOpen size={18} />
              </button>
            )}
            {compactPinnedItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-label={item.label}
                  className={`jarvis-sidebar-item ${isActive ? 'is-active' : ''}`}
                  title={item.label}
                >
                  <Icon size={18} />
                  {item.badge && item.badge > 0 ? (
                    <span
                      style={{
                        position: 'absolute',
                        top: '5px',
                        right: '5px',
                        minWidth: '16px',
                        height: '16px',
                        padding: '0 4px',
                        borderRadius: '999px',
                        backgroundColor: 'var(--warning-color)',
                        color: '#0b0d12',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}

            {/* Overflow Menu in Collapsed Mode */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setMoreMenuOpen((prev) => !prev)}
                aria-label="Mais módulos"
                className={`jarvis-sidebar-item ${moreMenuOpen ? 'is-active' : ''}`}
                title="Todos os módulos"
              >
                <MoreHorizontal size={18} />
              </button>

              {moreMenuOpen && (
                <div
                  style={{
                    position: 'fixed',
                    left: '74px',
                    top: '76px',
                    width: '240px',
                    maxHeight: '72vh',
                    overflowY: 'auto',
                    backgroundColor: 'var(--bg-elevated)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border-color)',
                    padding: '8px',
                    boxShadow: 'var(--shadow-lg)',
                    zIndex: 200,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      padding: '4px 8px 6px',
                    }}
                  >
                    Módulos do Workspace
                  </div>
                  {allItems.map((item) => {
                    const Icon = item.icon;
                    const isPinned = !!pinnedItems[item.id];
                    const isActive = activeTab === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          onNavigate(item.id);
                          setMoreMenuOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '7px 9px',
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                          fontSize: '0.82rem',
                          backgroundColor: isActive ? 'var(--accent-soft)' : 'transparent',
                          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <Icon size={15} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.label}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => togglePin(item.id, e)}
                          className={`btn btn-ghost btn-icon-sm ${isPinned ? 'is-active' : ''}`}
                          title={isPinned ? 'Desafixar do trilho compacto' : 'Fixar no trilho compacto'}
                        >
                          <Pin size={13} style={{ transform: isPinned ? 'rotate(45deg)' : 'none' }} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          activeNavGroups.map((group) => {
            const isCollapsible = !!group.collapsible;
            const isExpanded = !isCollapsible || !!expandedGroups[group.title];
            const groupBadgeTotal = group.items.reduce((acc, item) => acc + (item.badge || 0), 0);

            return (
              <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {isCollapsible ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.title)}
                    aria-expanded={isExpanded}
                    className="jarvis-sidebar-group-toggle"
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {group.title}
                      </span>
                      {!isExpanded && groupBadgeTotal > 0 && (
                        <span
                          className="tabular-nums"
                          style={{
                            padding: '1px 5px',
                            borderRadius: '5px',
                            backgroundColor: 'var(--warning-soft)',
                            color: '#fbbf24',
                            fontSize: '0.66rem',
                            fontWeight: 700,
                          }}
                        >
                          {groupBadgeTotal}
                        </span>
                      )}
                    </span>
                    {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>
                ) : (
                  <div
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      padding: '2px 10px 6px',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {group.title}
                  </div>
                )}

                {isExpanded &&
                  group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id || (item.id === 'skills' && activeTab === 'store');
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onNavigate(item.id)}
                        className={`jarvis-sidebar-item ${isActive ? 'is-active' : ''}`}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <Icon size={16} />
                        <span
                          style={{
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.label}
                        </span>
                        {item.badge && item.badge > 0 ? (
                          <span
                            className="tabular-nums"
                            style={{
                              padding: '1px 6px',
                              borderRadius: '6px',
                              backgroundColor: 'var(--warning-soft)',
                              color: '#fbbf24',
                              border: '1px solid rgba(245, 158, 11, 0.25)',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                            }}
                          >
                            {item.badge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Utility Navigation + Mode Switch + Server / Account Popover */}
      <div
        style={{
          borderTop: '1px solid var(--border-color)',
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => void setExperienceMode(isSimpleMode ? 'engineering' : 'simple')}
          className="jarvis-sidebar-item"
          title={isSimpleMode ? 'Mudar para Modo Completo (Engenharia)' : 'Mudar para Modo Simples (Pessoal)'}
          aria-label={isSimpleMode ? 'Alternar para Modo Completo' : 'Alternar para Modo Simples'}
        >
          <SlidersHorizontal size={16} color="var(--accent-light)" />
          {!collapsed && (
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isSimpleMode ? 'Ativar Modo Completo' : 'Usar Modo Simples'}
            </span>
          )}
        </button>

        {!isSimpleMode && (
          <button
            type="button"
            onClick={() => onNavigate('store')}
            className={`jarvis-sidebar-item ${activeTab === 'store' ? 'is-active' : ''}`}
            title="Loja de Agentes, Habilidades & Apps"
          >
            <Store size={16} />
            {!collapsed && <span>Loja & Apps</span>}
          </button>
        )}

        <button
          type="button"
          onClick={onOpenHelp || (() => onNavigate('learning'))}
          className={`jarvis-sidebar-item ${activeTab === 'learning' ? 'is-active' : ''}`}
          title="Central de Ajuda & Guias"
        >
          <HelpCircle size={16} />
          {!collapsed && <span>Ajuda & Guias</span>}
        </button>

        <button
          type="button"
          onClick={onOpenSettings || (() => onNavigate('settings'))}
          className={`jarvis-sidebar-item ${activeTab === 'settings' ? 'is-active' : ''}`}
          title="Configurações"
        >
          <Settings size={16} />
          {!collapsed && <span>Configurações</span>}
        </button>

        {/* Server / Account Trigger */}
        <div style={{ position: 'relative', marginTop: '6px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
          <button
            type="button"
            onClick={() => setServerMenuOpen((prev) => !prev)}
            className={`jarvis-sidebar-item ${serverMenuOpen ? 'is-active' : ''}`}
            title={`Instância ${assistantName} e Conta`}
          >
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                background: 'var(--accent-soft)',
                border: '1px solid var(--border-accent)',
                color: 'var(--accent-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Server size={13} />
            </div>
            {!collapsed && (
              <>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {assistantName} Hub
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Sessão autenticada
                  </div>
                </div>
                <ChevronRight size={14} color="var(--text-muted)" />
              </>
            )}
          </button>

          {serverMenuOpen && (
            <div
              style={{
                position: 'fixed',
                left: collapsed ? '74px' : '252px',
                bottom: '14px',
                width: '248px',
                backgroundColor: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-color)',
                padding: '8px',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 200,
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', padding: '4px 8px 6px' }}>
                Instância ativa
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.82rem',
                  color: 'var(--text-primary)',
                  marginBottom: '4px',
                }}
              >
                <Check size={15} color="var(--success-color)" />
                <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeBrainLabel}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  onNavigate('brain_server');
                  setServerMenuOpen(false);
                }}
                className="btn btn-ghost btn-sm btn-block btn-start"
              >
                <Server size={15} color="var(--accent-light)" />
                <span>Trocar Cérebro / Docker</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('jarvis:open-android-pairing'));
                  setServerMenuOpen(false);
                }}
                className="btn btn-ghost btn-sm btn-block btn-start"
              >
                <Smartphone size={15} color="var(--accent-light)" />
                <span>Conectar app Android</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('jarvis:open-access-management'));
                  setServerMenuOpen(false);
                }}
                className="btn btn-ghost btn-sm btn-block btn-start"
              >
                <Users size={15} color="var(--text-secondary)" />
                <span>Gerir acessos da equipe</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onOpenProfile) onOpenProfile();
                  setServerMenuOpen(false);
                }}
                className="btn btn-ghost btn-sm btn-block btn-start"
              >
                <Settings size={15} color="var(--text-secondary)" />
                <span>Perfil e configurações</span>
              </button>

              <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />

              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('jarvis:logout'));
                  setServerMenuOpen(false);
                }}
                className="btn btn-danger-ghost btn-sm btn-block btn-start"
              >
                <LogOut size={15} />
                <span>Sair da conta</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};
