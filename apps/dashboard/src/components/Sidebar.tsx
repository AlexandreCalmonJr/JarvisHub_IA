import React, { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Trash2,
  Search,
  MessageSquare,
  FolderGit2,
  Building2,
  Bot,
  Terminal,
  ListTodo,
  Cpu,
  Server,
  CheckCircle2,
  Database,
  Activity,
  Settings,
  Key,
  Sparkles,
  ShieldAlert,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import { getLocalSessionsCatalog, removeSessionLocally, LocalSessionMeta } from './chat/ChatHistoryDrawer';
import { getUserProfile } from './common/UserProfileModal';

interface SidebarProps {
  permissions?: string[];
  role?: string;
  principalKind?: string;
  permissionsLoaded?: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  pendingApprovalsCount: number;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenProfile?: () => void;
  onSelectSession?: (sessionId: string) => void;
  onNewChat?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  permissions = [],
  role,
  principalKind,
  permissionsLoaded = false,
  activeTab,
  setActiveTab,
  pendingApprovalsCount,
  mobileOpen,
  setMobileOpen,
  isCollapsed = false,
  onToggleCollapse,
  onOpenCommandPalette,
  onOpenProfile,
  onSelectSession,
  onNewChat,
}) => {
  const [conversationsOpen, setConversationsOpen] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [engineeringOpen, setEngineeringOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessions, setSessions] = useState<LocalSessionMeta[]>([]);
  const userProfile = getUserProfile();
  const hasPermission = (permission: string) => permissionsLoaded && (permissions.includes('*') || permissions.includes(permission));
  const isAdmin = principalKind === 'human' && role === 'admin';

  const loadSessions = () => {
    const list = getLocalSessionsCatalog();
    setSessions(list);
  };

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleDeleteSession = (e: React.MouseEvent, sid: string) => {
    e.stopPropagation();
    removeSessionLocally(sid);
    loadSessions();
  };

  const handleSelectSession = (sid: string) => {
    if (onSelectSession) {
      onSelectSession(sid);
    }
    setActiveTab('chat');
    setMobileOpen(false);
  };

  const handleSelectTab = (tabId: string) => {
    setActiveTab(tabId);
    setMobileOpen(false);
  };

  const agentItems = [
    { id: 'agents', label: 'Centro de Agentes', permission: 'agents:read', icon: <Bot size={13} color="var(--accent-color)" /> },
    { id: 'coding', label: 'Coding Agent', permission: 'coding:read', icon: <Terminal size={13} color="var(--accent-color)" /> },
    { id: 'tasks', label: 'Fila de Tarefas', permission: 'tasks:read', icon: <ListTodo size={13} color="var(--accent-color)" /> },
  ].filter((item) => hasPermission(item.permission));

  const engineeringItems = [
    { id: 'backend_studio', label: 'Backend & APIs', permission: 'studios:read', icon: <Server size={13} color="var(--accent-color)" /> },
    { id: 'quality', label: 'Qualidade & QA', permission: 'studios:read', icon: <CheckCircle2 size={13} color="var(--accent-color)" /> },
    { id: 'knowledge', label: 'Base de Conhecimento', permission: 'knowledge:read', icon: <Database size={13} color="var(--accent-color)" /> },
    { id: 'overview', label: 'Visão Geral', permission: 'system:read', icon: <Activity size={13} color="var(--accent-color)" /> },
    { id: 'design', label: 'Design Studio', permission: 'studios:read', icon: <Sparkles size={13} color="var(--accent-color)" /> },
    { id: 'executive_report', label: 'Relatório Executivo', permission: 'studios:read', icon: <FileText size={13} color="var(--accent-color)" /> },
    { id: 'advisor', label: 'Hardware Advisor', adminOnly: true, icon: <Cpu size={13} color="var(--accent-color)" /> },
  ].filter((item) => item.adminOnly ? isAdmin : hasPermission(item.permission || ''));


  const settingsItems = [
    { id: 'models', label: 'Modelos & Cofre', permission: 'models:read', icon: <Key size={13} color="var(--accent-color)" /> },
    { id: 'skills', label: 'Habilidades (Skills)', permission: 'skills:read', icon: <Sparkles size={13} color="var(--accent-color)" /> },
    { id: 'security', label: 'Segurança', permission: 'security:read', icon: <ShieldAlert size={13} color="var(--danger-color)" /> },
    { id: 'approvals', label: 'Central de Aprovações', permission: 'approvals:read', icon: <AlertTriangle size={13} color="var(--warning-color)" />, badge: pendingApprovalsCount },
    { id: 'server_logs', label: 'Logs do Servidor', adminOnly: true, icon: <FileText size={13} color="var(--accent-color)" /> },
  ].filter((item) => item.adminOnly ? isAdmin : hasPermission(item.permission || ''));


  return (
    <>
      {/* Backdrop para telas móveis */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 998,
          }}
        />
      )}

      <aside
        className={mobileOpen ? 'jarvis-sidebar is-mobile-open' : 'jarvis-sidebar'}
        style={{
          width: isCollapsed ? '64px' : '260px',
          backgroundColor: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          flexShrink: 0,
          zIndex: 999,
          position: mobileOpen ? 'fixed' : 'relative',
          left: 0,
          top: 0,
          transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow: mobileOpen ? '8px 0 32px rgba(0,0,0,0.85)' : 'none',
          userSelect: 'none',
        }}
      >
        {/* Topo da Sidebar: Ações Principais (Procurar, Projetos, Artefatos, Personalização) */}
        <div
          style={{
            padding: isCollapsed ? '12px 6px' : '12px 14px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {/* Botão de Busca / Procurar (Ctrl + K) */}
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="btn btn-ghost"
            title="Procurar comandos, arquivos e telas (Ctrl+K)"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'space-between',
              padding: isCollapsed ? '9px 0' : '8px 10px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              fontSize: '0.82rem',
              width: '100%',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Search size={15} color="var(--text-secondary)" />
              {!isCollapsed && <span>Procurar</span>}
            </div>
            {!isCollapsed && (
              <kbd
                style={{
                  fontSize: '0.65rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  color: 'var(--text-muted)',
                }}
              >
                Ctrl K
              </kbd>
            )}
          </button>

          {/* 1. Chat JARVIS */}
          {hasPermission('chat:read') && <button
            type="button"
            onClick={() => handleSelectTab('chat')}
            className="btn btn-ghost"
            title="Chat JARVIS"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              padding: isCollapsed ? '9px 0' : '7px 10px',
              borderRadius: '8px',
              color: activeTab === 'chat' ? 'var(--text-primary)' : 'var(--text-secondary)',
              backgroundColor: activeTab === 'chat' ? 'rgba(217, 119, 87, 0.12)' : 'transparent',
              fontSize: '0.84rem',
              fontWeight: activeTab === 'chat' ? 600 : 400,
              width: '100%',
              gap: '9px',
            }}
          >
            <MessageSquare size={16} color="var(--accent-color)" />
            {!isCollapsed && <span>Chat JARVIS</span>}
          </button>}

          {/* 2. Projetos */}
          {hasPermission('workspace:read') && <button
            type="button"
            onClick={() => handleSelectTab('workspace')}
            className="btn btn-ghost"
            title="Projetos"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              padding: isCollapsed ? '9px 0' : '7px 10px',
              borderRadius: '8px',
              color: activeTab === 'workspace' ? 'var(--text-primary)' : 'var(--text-secondary)',
              backgroundColor: activeTab === 'workspace' ? 'var(--accent-glow)' : 'transparent',
              fontSize: '0.84rem',
              fontWeight: activeTab === 'workspace' ? 600 : 400,
              width: '100%',
              gap: '9px',
            }}
          >
            <FolderGit2 size={16} color="#38bdf8" />
            {!isCollapsed && <span>Projetos</span>}
          </button>}

          {/* 3. Escritório Virtual */}
          {hasPermission('agents:read') && <button
            type="button"
            onClick={() => handleSelectTab('office')}
            className="btn btn-ghost"
            title="Escritório Virtual"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'space-between',
              padding: isCollapsed ? '9px 0' : '7px 10px',
              borderRadius: '8px',
              color: activeTab === 'office' ? 'var(--text-primary)' : 'var(--text-secondary)',
              backgroundColor: activeTab === 'office' ? 'var(--accent-glow)' : 'transparent',
              fontSize: '0.84rem',
              fontWeight: activeTab === 'office' ? 600 : 400,
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <Building2 size={16} color="var(--accent-color)" />
              {!isCollapsed && <span>Escritório Virtual</span>}
            </div>
          </button>}

          {/* Submenu 1: Especialistas & IA */}
          {agentItems.length > 0 && <button
            type="button"
            onClick={() => {
              if (isCollapsed && onToggleCollapse) onToggleCollapse();
              setAgentsOpen((prev) => !prev);
            }}
            className="btn btn-ghost"
            title="Especialistas & IA"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'space-between',
              padding: isCollapsed ? '9px 0' : '7px 10px',
              borderRadius: '8px',
              color: agentsOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
              backgroundColor: agentsOpen ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
              fontSize: '0.82rem',
              width: '100%',
              marginTop: '4px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <Bot size={16} color="var(--accent-color)" />
              {!isCollapsed && <span>Especialistas & IA</span>}
            </div>
            {!isCollapsed && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {agentsOpen ? '−' : '+'}
              </span>
            )}
          </button>}

          {!isCollapsed && agentsOpen && agentItems.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                paddingLeft: '12px',
                paddingTop: '2px',
                borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
                marginLeft: '8px',
              }}
            >
              {agentItems.map((st) => {
                const isSelected = activeTab === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => handleSelectTab(st.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '5px 8px',
                      borderRadius: '6px',
                      backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                      color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontSize: '0.76rem',
                      fontWeight: isSelected ? 600 : 400,
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      {st.icon}
                      <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {st.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Submenu 2: Engenharia & Dados */}
          {engineeringItems.length > 0 && <button
            type="button"
            onClick={() => {
              if (isCollapsed && onToggleCollapse) onToggleCollapse();
              setEngineeringOpen((prev) => !prev);
            }}
            className="btn btn-ghost"
            title="Engenharia & Dados"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'space-between',
              padding: isCollapsed ? '9px 0' : '7px 10px',
              borderRadius: '8px',
              color: engineeringOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
              backgroundColor: engineeringOpen ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
              fontSize: '0.82rem',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <Cpu size={16} color="var(--accent-color)" />
              {!isCollapsed && <span>Engenharia & Dados</span>}
            </div>
            {!isCollapsed && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {engineeringOpen ? '−' : '+'}
              </span>
            )}
          </button>

          {!isCollapsed && engineeringOpen && engineeringItems.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                paddingLeft: '12px',
                paddingTop: '2px',
                borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
                marginLeft: '8px',
              }}
            >
              {engineeringItems.map((st) => {
                const isSelected = activeTab === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => handleSelectTab(st.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '5px 8px',
                      borderRadius: '6px',
                      backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                      color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontSize: '0.76rem',
                      fontWeight: isSelected ? 600 : 400,
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      {st.icon}
                      <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {st.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Submenu 3: Configurações & Governança */}
          {settingsItems.length > 0 && <button
            type="button"
            onClick={() => {
              if (isCollapsed && onToggleCollapse) onToggleCollapse();
              setSettingsOpen((prev) => !prev);
            }}
            className="btn btn-ghost"
            title="Configurações"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'space-between',
              padding: isCollapsed ? '9px 0' : '7px 10px',
              borderRadius: '8px',
              color: settingsOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
              backgroundColor: settingsOpen ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
              fontSize: '0.82rem',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <Settings size={16} color="#94a3b8" />
              {!isCollapsed && <span>Configurações</span>}
            </div>
            {!isCollapsed && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {settingsOpen ? '−' : '+'}
              </span>
            )}
          </button>

          {!isCollapsed && settingsOpen && settingsItems.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                paddingLeft: '12px',
                paddingTop: '2px',
                borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
                marginLeft: '8px',
              }}
            >
              {settingsItems.map((st) => {
                const isSelected = activeTab === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => handleSelectTab(st.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '5px 8px',
                      borderRadius: '6px',
                      backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                      color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontSize: '0.76rem',
                      fontWeight: isSelected ? 600 : 400,
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      {st.icon}
                      <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {st.label}
                      </span>
                    </div>
                    {Boolean(st.badge) && (
                      <span
                        className="badge"
                        style={{ fontSize: '0.62rem', padding: '0 5px', backgroundColor: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-primary)' }}
                      >
                        {st.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Seção Conversas Recentes (Claude Style) */}
        {!isCollapsed && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              paddingTop: '12px',
            }}
          >
            {/* Cabeçalho da seção com toggle */}
            <div
              onClick={() => setConversationsOpen((prev) => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 16px',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: '0.74rem',
                fontWeight: 600,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Conversas</span>
                {conversationsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onNewChat) {
                    onNewChat();
                  } else if (onSelectSession) {
                    onSelectSession('new_' + Date.now());
                  }
                  setActiveTab('chat');
                  setMobileOpen(false);
                }}
                className="btn btn-ghost"
                style={{ padding: '2px 6px', fontSize: '0.72rem', color: 'var(--accent-color)', fontWeight: 600 }}
                title="Iniciar Nova Conversa Limpa"
              >
                + Nova
              </button>
            </div>

            {/* Lista fluida de conversas */}
            {conversationsOpen && (
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '6px 8px 12px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1px',
                }}
              >
                {sessions.length === 0 ? (
                  <div
                    style={{
                      padding: '16px 12px',
                      fontSize: '0.76rem',
                      color: 'var(--text-muted)',
                      textAlign: 'center',
                      fontStyle: 'italic',
                    }}
                  >
                    Nenhuma conversa iniciada ainda
                  </div>
                ) : (
                  sessions.map((sess) => (
                    <div
                      key={sess.id}
                      onClick={() => handleSelectSession(sess.id)}
                      className="chat-session-row"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.80rem',
                        color: 'var(--text-secondary)',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.color = 'var(--text-primary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          overflow: 'hidden',
                          flex: 1,
                        }}
                      >
                        {/* Marcador sutil de bullet idêntico ao Claude Desktop */}
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1 }}>○</span>
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            lineHeight: 1.3,
                          }}
                        >
                          {sess.title || 'Conversa sem título'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleDeleteSession(e, sess.id)}
                        className="btn btn-ghost"
                        style={{
                          padding: '2px 4px',
                          opacity: 0.6,
                          borderRadius: '4px',
                          color: 'var(--text-muted)',
                        }}
                        title="Excluir conversa"
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Rodapé da Sidebar: Avatar do Usuário e Status Local */}
        <div
          style={{
            padding: isCollapsed ? '12px 6px' : '10px 14px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'space-between',
            backgroundColor: 'rgba(0, 0, 0, 0.15)',
          }}
        >
          {!isCollapsed ? (
            <button
              type="button"
              onClick={onOpenProfile}
              className="btn btn-ghost"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 6px',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
              title="Abrir perfil e configurações do assistente"
            >
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: '0.72rem',
                }}
              >
                {userProfile.avatarIcon || (userProfile.displayName ? userProfile.displayName.charAt(0).toUpperCase() : 'A')}
              </div>
              <span style={{ fontWeight: 500 }}>
                {userProfile.displayName || 'Utilizador'}
              </span>
              <span style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>· v3.0.0</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenProfile}
              className="btn btn-ghost"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '0.8rem',
              }}
              title="Perfil e Configurações"
            >
              {userProfile.avatarIcon || (userProfile.displayName ? userProfile.displayName.charAt(0).toUpperCase() : 'A')}
            </button>
          )}

          {/* Botão de retração da sidebar no canto inferior */}
          {!isCollapsed && onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="btn btn-ghost"
              style={{ padding: '6px', borderRadius: '6px', color: 'var(--text-muted)' }}
              title="Ocultar barra lateral (Ctrl+B)"
            >
              <ChevronLeft size={16} />
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
