import React, { useState, useEffect, Suspense, lazy } from 'react';
import { AuthGate } from './components/AuthGate';
import { Sidebar } from './components/Sidebar';
import { SystemHealth, ApprovalRequestItem } from './types';
import { fetchHealth, fetchApprovals } from './api';
import {
  Menu,
  ShieldAlert,
  Search,
  ChevronLeft,
  ChevronRight,
  Square,
  MessageSquare,
  Code2,
  PanelLeft,
} from 'lucide-react';
import { SetupWizardModal } from './components/common/SetupWizardModal';
import { UserProfileModal, getUserProfile, UserProfileData } from './components/common/UserProfileModal';
import { ToastContainer } from './components/common/Toast';
import { ApprovalPromptHost } from './components/common/ApprovalPromptHost';
import { CommandPalette } from './components/common/CommandPalette';
import { pathForTab, tabFromLocation } from './router';
import { getAccountStorageKey } from './services/accountScope';

// Code splitting: cada tela é carregada sob demanda
const Overview = lazy(() =>
  import('./components/Overview').then((m) => ({ default: m.Overview }))
);
const ChatMaster = lazy(() =>
  import('./components/ChatMaster').then((m) => ({ default: m.ChatMaster }))
);
const ApprovalCenter = lazy(() =>
  import('./components/ApprovalCenter').then((m) => ({ default: m.ApprovalCenter }))
);
const ProjectWorkspaceView = lazy(() =>
  import('./components/ProjectWorkspaceView').then((m) => ({ default: m.ProjectWorkspaceView }))
);
const AgentCenterView = lazy(() =>
  import('./components/AgentCenterView').then((m) => ({ default: m.AgentCenterView }))
);
const TaskManagerView = lazy(() =>
  import('./components/TaskManagerView').then((m) => ({ default: m.TaskManagerView }))
);
const ModelManagerView = lazy(() =>
  import('./components/ModelManagerView').then((m) => ({ default: m.ModelManagerView }))
);
const SkillsManagerView = lazy(() =>
  import('./components/SkillsManagerView').then((m) => ({ default: m.SkillsManagerView }))
);
const SecurityCenterView = lazy(() =>
  import('./components/SecurityCenterView').then((m) => ({ default: m.SecurityCenterView }))
);
const ServerLogsView = lazy(() =>
  import('./components/ServerLogsView').then((m) => ({ default: m.ServerLogsView }))
);
const HardwareAdvisorView = lazy(() =>
  import('./components/HardwareAdvisorView').then((m) => ({ default: m.HardwareAdvisorView }))
);
const KnowledgeVaultView = lazy(() =>
  import('./components/KnowledgeVaultView').then((m) => ({ default: m.KnowledgeVaultView }))
);
const BackendStudioView = lazy(() =>
  import('./components/BackendStudioView').then((m) => ({ default: m.BackendStudioView }))
);
const QualityStudioView = lazy(() =>
  import('./components/QualityStudioView').then((m) => ({ default: m.QualityStudioView }))
);
const DesignStudioView = lazy(() =>
  import('./components/DesignStudioView').then((m) => ({ default: m.DesignStudioView }))
);
const ExecutiveReportView = lazy(() =>
  import('./components/ExecutiveReportView').then((m) => ({ default: m.ExecutiveReportView }))
);
const CodingAgentView = lazy(() =>
  import('./components/CodingAgentView').then((m) => ({ default: m.CodingAgentView }))
);
const AgentOfficeView = lazy(() =>
  import('./components/office/AgentOfficeView').then((m) => ({ default: m.AgentOfficeView }))
);

const ViewFallback: React.FC = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 16px',
      color: 'var(--text-secondary)',
      fontSize: '0.85rem',
    }}
  >
    Carregando módulo...
  </div>
);

const NotFoundView: React.FC<{ onGoHome: () => void }> = ({ onGoHome }) => (
  <section role="status" aria-labelledby="not-found-title" style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', textAlign: 'center', color: 'var(--text-secondary)' }}>
    <div style={{ fontSize: '3rem', color: 'var(--accent-color)', fontWeight: 700 }}>404</div>
    <h1 id="not-found-title" style={{ color: 'var(--text-primary)', fontSize: '1.35rem' }}>Página não encontrada</h1>
    <p style={{ maxWidth: '420px', fontSize: '0.9rem' }}>Este endereço não corresponde a uma página disponível no JARVIS AI Hub.</p>
    <button type="button" className="btn btn-primary" onClick={onGoHome}>Ir para a Visão Geral</button>
  </section>
);

const DashboardApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>(() =>
    tabFromLocation(window.location.pathname, window.location.search)
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfileData>(getUserProfile);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('jarvis_sidebar_collapsed') === 'true';
  });
  const [attachedProjectId, setAttachedProjectId] = useState<string | null>(null);
  const [targetChatSessionId, setTargetChatSessionId] = useState<string | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRequestItem[]>([]);
  const [healthLoading, setHealthLoading] = useState(true);
  const [approvalsLoading, setApprovalsLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [approvalsError, setApprovalsError] = useState<string | null>(null);
  const [chatLoaded, setChatLoaded] = useState(
    () => tabFromLocation(window.location.pathname, window.location.search) === 'chat'
  );


  const navigate = (tab: string) => {
    const path = pathForTab(tab);
    if (path === '/404') return;
    setActiveTab(tab);
    if (tab === 'chat') setChatLoaded(true);
    setDesktopMenuOpen(false);
    if (window.location.pathname !== path) {
      window.history.pushState({ tab }, '', path);
    }
  };

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('jarvis_sidebar_collapsed', String(next));
      return next;
    });
  };

  // Verificação de primeiro acesso (First-Run Onboarding), rota e atalhos de teclado
  useEffect(() => {
    const isCompleted = localStorage.getItem(getAccountStorageKey('jarvis_setup_completed'));
    if (isCompleted !== 'true') {
      setShowSetupWizard(true);
    }

    const initialTab = tabFromLocation(window.location.pathname, window.location.search);
    const initialPath = pathForTab(initialTab);
    if (initialTab !== 'not_found' && window.location.pathname !== initialPath) {
      window.history.replaceState({ tab: initialTab }, '', initialPath);
    }

    const handlePopState = () => {
      const tab = tabFromLocation(window.location.pathname, window.location.search);
      setActiveTab(tab);
      if (tab === 'chat') setChatLoaded(true);
    };

    // Atalhos globais de teclado: Ctrl + K (Comandos) e Ctrl + B (Sidebar)
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        handleToggleSidebar();
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  const loadData = async () => {
    setHealthLoading(true);
    setApprovalsLoading(true);
    const [healthResult, approvalsResult] = await Promise.allSettled([fetchHealth(), fetchApprovals()]);
    if (healthResult.status === 'fulfilled') {
      setHealth(healthResult.value);
      setHealthError(null);
    } else {
      setHealthError(healthResult.reason instanceof Error ? healthResult.reason.message : 'Falha ao consultar a saúde do sistema.');
    }
    setHealthLoading(false);
    if (approvalsResult.status === 'fulfilled') {
      setApprovals(approvalsResult.value);
      setApprovalsError(null);
    } else {
      setApprovalsError(approvalsResult.reason instanceof Error ? approvalsResult.reason.message : 'Falha ao consultar aprovações.');
    }
    setApprovalsLoading(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 8000);
    return () => clearInterval(interval);
  }, []);

  const pendingApprovalsCount = approvals.filter((a) => a.status === 'pending').length;

  return (
    <div
      style={{
        display: 'flex',
        height: '100dvh',
        width: '100%',
        minWidth: 0,
        overflow: 'hidden',
        backgroundColor: 'var(--bg-primary)',
        fontFamily: 'var(--font-sans)',
      }}
      onClick={() => {
        if (desktopMenuOpen) setDesktopMenuOpen(false);
      }}
    >
      <Sidebar
        activeTab={activeTab}
        setActiveTab={navigate}
        pendingApprovalsCount={pendingApprovalsCount}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
        onOpenCommandPalette={() => setShowCommandPalette(true)}
        onOpenProfile={() => setShowProfileModal(true)}
        onSelectSession={(sid) => {
          setTargetChatSessionId(sid);
          navigate('chat');
        }}
        onNewChat={() => {
          setTargetChatSessionId('new_' + Date.now());
          navigate('chat');
        }}
      />

      {/* Área Central / Conteúdo Principal */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100dvh',
          minWidth: 0,
          overflow: 'hidden',
          backgroundColor: 'var(--bg-primary)',
        }}
      >
        {/* Top Navbar Global Desktop (Claude Topbar Style) */}
        <header
          style={{
            height: '46px',
            padding: '0 16px',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            zIndex: 40,
            position: 'relative',
          }}
        >
          {/* Lado Esquerdo: ☰ Hambúrguer, ◫ Toggle Sidebar, < >, [ 💬 | </> ] */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Botão Hambúrguer ☰ com Dropdown Nativo Desktop */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.matchMedia('(max-width: 900px)').matches) {
                    setMobileOpen((prev) => !prev);
                    setDesktopMenuOpen(false);
                    return;
                  }
                  setDesktopMenuOpen((prev) => !prev);
                }}
                className="btn btn-ghost"
                style={{ padding: '6px 8px', borderRadius: '6px' }}
                title="Menu Principal"
              >
                <Menu size={18} />
              </button>

              {/* Menu de navegação e ações rápidas */}
              {desktopMenuOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    top: '36px',
                    left: 0,
                    width: '210px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    boxShadow: '0 12px 36px rgba(0, 0, 0, 0.65)',
                    padding: '6px',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setTargetChatSessionId('new_' + Date.now());
                      navigate('chat');
                    }}
                    className="btn btn-ghost"
                    style={{ justifyContent: 'space-between', padding: '6px 10px', fontSize: '0.80rem', width: '100%' }}
                  >
                    <span>Novo chat</span>
                    <ChevronRight size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCommandPalette(true)}
                    className="btn btn-ghost"
                    style={{ justifyContent: 'space-between', padding: '6px 10px', fontSize: '0.80rem', width: '100%' }}
                  >
                    <span>Comandos e ações</span>
                    <ChevronRight size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleSidebar}
                    className="btn btn-ghost"
                    style={{ justifyContent: 'space-between', padding: '6px 10px', fontSize: '0.80rem', width: '100%' }}
                  >
                    <span>Alternar barra lateral</span>
                    <ChevronRight size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('agents')}
                    className="btn btn-ghost"
                    style={{ justifyContent: 'space-between', padding: '6px 10px', fontSize: '0.80rem', width: '100%' }}
                  >
                    <span>Centro de Agentes</span>
                    <ChevronRight size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('advisor')}
                    className="btn btn-ghost"
                    style={{ justifyContent: 'space-between', padding: '6px 10px', fontSize: '0.80rem', width: '100%' }}
                  >
                    <span>Hardware Advisor</span>
                    <ChevronRight size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* Toggle da Barra Lateral (Ctrl + B) */}
            <button
              type="button"
              onClick={handleToggleSidebar}
              className="btn btn-ghost"
              style={{ padding: '6px', borderRadius: '6px' }}
              title="Mostrar / Ocultar barra lateral (Ctrl+B)"
            >
              <PanelLeft size={16} />
            </button>

            {/* Navegação Histórico < > */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }} className="hide-mobile">
              <button
                type="button"
                onClick={() => window.history.back()}
                className="btn btn-ghost"
                style={{ padding: '4px 6px', borderRadius: '4px' }}
                title="Voltar"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => window.history.forward()}
                className="btn btn-ghost"
                style={{ padding: '4px 6px', borderRadius: '4px' }}
                title="Avançar"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Alternador de Modo [ 💬 | </> ] */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                borderRadius: '8px',
                padding: '2px',
                border: '1px solid var(--border-color)',
                marginLeft: '4px',
              }}
              className="hide-mobile"
            >
              <button
                type="button"
                onClick={() => navigate('chat')}
                className="btn btn-ghost"
                style={{
                  padding: '3px 8px',
                  borderRadius: '6px',
                  backgroundColor: activeTab === 'chat' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                  color: activeTab === 'chat' ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
                title="Modo Chat Editorial"
              >
                <MessageSquare size={13} />
              </button>
              <button
                type="button"
                onClick={() => navigate('coding')}
                className="btn btn-ghost"
                style={{
                  padding: '3px 8px',
                  borderRadius: '6px',
                  backgroundColor: activeTab === 'coding' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                  color: activeTab === 'coding' ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
                title="Modo Coding Agent / Terminal"
              >
                <Code2 size={13} />
              </button>
            </div>
          </div>

          {/* Centro: Identificador Minimalista 3.0 */}
          <div
            style={{
              fontSize: '0.82rem',
              fontWeight: 500,
              letterSpacing: '0.05em',
              color: 'var(--text-secondary)',
              userSelect: 'none',
            }}
          >
            JARVIS <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>3.0</span>
          </div>

          {/* Lado Direito: Busca, Status de Blindagem, Avatar e Controles Desktop ─ □ ✕ */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Paleta de Comandos */}
            <button
              onClick={() => setShowCommandPalette(true)}
              className="btn btn-ghost"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 8px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-color)',
                fontSize: '0.74rem',
              }}
              title="Paleta de Comandos (Ctrl+K)"
            >
              <Search size={13} color="var(--text-secondary)" />
              <kbd
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontSize: '0.65rem',
                  color: 'var(--text-muted)',
                }}
                className="hide-mobile"
              >
                Ctrl K
              </kbd>
            </button>

            {/* Alerta de Aprovação Pendente */}
            {pendingApprovalsCount > 0 && (
              <button
                onClick={() => navigate('approvals')}
                className="btn badge-warning"
                style={{
                  fontSize: '0.72rem',
                  padding: '3px 8px',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                }}
              >
                <ShieldAlert size={12} />
                <span>{pendingApprovalsCount}</span>
              </button>
            )}

            {/* Avatar do Usuário Minimalista */}
            <button
              onClick={() => setShowProfileModal(true)}
              className="btn btn-ghost"
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                padding: 0,
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '0.74rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              title="Perfil e Configurações"
            >
              {userProfile.avatarIcon || (userProfile.displayName ? userProfile.displayName.charAt(0).toUpperCase() : 'A')}
            </button>

            {/* Controlo de ecrã inteiro disponível no navegador */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                marginLeft: '6px',
                paddingLeft: '6px',
                borderLeft: '1px solid var(--border-color)',
              }}
              className="hide-mobile"
            >
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '3px 6px', color: 'var(--text-muted)' }}
                title="Maximizar"
                onClick={() => {
                  if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(() => {});
                  } else {
                    document.exitFullscreen().catch(() => {});
                  }
                }}
              >
                <Square size={11} />
              </button>
            </div>
          </div>
        </header>

        {/* Viewport Principal das Telas */}
        <main
          style={{
            flex: 1,
            overflowY: activeTab === 'chat' || activeTab === 'coding' ? 'hidden' : 'auto',
            minWidth: 0,
            padding: activeTab === 'chat' ? '0' : activeTab === 'coding' ? 'clamp(12px, 2vw, 24px)' : 'clamp(16px, 3vw, 36px)',
            backgroundColor: 'var(--bg-primary)',
          }}
        >
          {activeTab === 'not_found' ? (
            <NotFoundView onGoHome={() => navigate('overview')} />
          ) : (
          <Suspense fallback={<ViewFallback />}>
            {activeTab === 'overview' && <Overview health={health} approvals={approvals} healthLoading={healthLoading} approvalsLoading={approvalsLoading} healthError={healthError} approvalsError={approvalsError} />}
            {activeTab === 'coding' && <CodingAgentView />}
            {chatLoaded && (
              <div style={{ display: activeTab === 'chat' ? 'block' : 'none', height: '100%' }}>
                <ChatMaster
                  attachedProjectId={attachedProjectId}
                  onDetachProject={() => setAttachedProjectId(null)}
                  targetSessionId={targetChatSessionId}
                />
              </div>
            )}
            {activeTab === 'approvals' && <ApprovalCenter approvals={approvals} onRefresh={loadData} loading={approvalsLoading} error={approvalsError} />}
            {activeTab === 'workspace' && (
              <ProjectWorkspaceView
                onSelectForChat={(id) => {
                  setAttachedProjectId(id);
                  navigate('chat');
                }}
              />
            )}
            {activeTab === 'office' && (
              <AgentOfficeView
                onSelectForChat={() => {
                  navigate('chat');
                }}
              />
            )}
            {activeTab === 'agents' && <AgentCenterView />}
            {activeTab === 'tasks' && <TaskManagerView />}
            {activeTab === 'backend_studio' && <BackendStudioView />}
            {activeTab === 'quality' && <QualityStudioView />}
            {activeTab === 'design' && <DesignStudioView />}
            {activeTab === 'executive_report' && <ExecutiveReportView />}
            {activeTab === 'models' && <ModelManagerView />}
            {activeTab === 'skills' && <SkillsManagerView />}
            {activeTab === 'knowledge' && <KnowledgeVaultView />}
            {activeTab === 'security' && <SecurityCenterView onRefresh={loadData} />}
            {activeTab === 'advisor' && <HardwareAdvisorView />}
            {activeTab === 'server_logs' && <ServerLogsView />}
          </Suspense>
          )}
        </main>
      </div>

      {/* Assistente de Configuração Inicial Global */}
      <SetupWizardModal
        isOpen={showSetupWizard}
        onClose={() => setShowSetupWizard(false)}
        onCompleted={loadData}
      />

      {/* Perfil do Usuário & Configurações */}
      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onOpenSetupWizard={() => {
          setShowProfileModal(false);
          setShowSetupWizard(true);
        }}
        onProfileUpdated={(updated) => setUserProfile(updated)}
      />

      {/* Paleta Global de Comandos (Ctrl + K) */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onNavigate={(tab) => {
          navigate(tab);
          setShowCommandPalette(false);
        }}
        onOpenProfile={() => setShowProfileModal(true)}
      />

      {/* Aprovação humana integrada para operações do Workspace */}
      <ApprovalPromptHost />

      {/* Notificações Toast Globais */}
      <ToastContainer />
    </div>
  );
};

export const App: React.FC = () => (
  <AuthGate>
    <DashboardApp />
  </AuthGate>
);

export default App;
