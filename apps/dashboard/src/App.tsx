import React, { useState, useEffect, Suspense, lazy } from 'react';
import { AuthGate } from './features/auth/AuthGate';
import { PrimaryRail } from './shared/navigation/PrimaryRail';
import { AgentDock } from './shared/navigation/AgentDock';
import { DynamicIsland } from './shared/navigation/DynamicIsland';
import { SystemHealth, ApprovalRequestItem } from './types';
import { fetchHealth, fetchApprovals } from './api';
import { fetchResources, SystemResourceUsage } from './services/api/system';
import {
  ShieldAlert,
  Search,
  PanelLeft,
  PanelRight,
  CircleHelp,
  Plus,
  Mic,
  Radio,
  LayoutDashboard,
  MessageSquare,
  Smartphone,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useWakeWordListener } from './hooks/useWakeWordListener';
import { SetupWizardModal } from './shared/common/SetupWizardModal';
import { InitialPasswordChangeModal } from './shared/common/InitialPasswordChangeModal';
import { GuidedTour } from './shared/common/GuidedTour';
import { UserProfileModal, getUserProfile, UserProfileData } from './shared/common/UserProfileModal';
import { ToastContainer } from './shared/common/Toast';
import { ApprovalPromptHost } from './shared/common/ApprovalPromptHost';
import { CommandPalette } from './shared/common/CommandPalette';
import { OfflineIndicator, PWAInstallButton } from './shared/pwa/PWAInstallButton';
import { VoiceLiveHudModal } from './features/companion/VoiceLiveHudModal';
import { VoiceCalibrationModal } from './features/companion/VoiceCalibrationModal';
import { ErrorBanner } from './shared/layout/StateFeedback';
import { pathForTab, tabFromLocation } from './router';
import { API_BASE } from './services/api/client';
import { apiFetch } from './services/sessionTransport';
import { getAccountStorageKey } from './services/accountScope';
import {
  AssistantIdentityProvider,
  useAssistantIdentity,
} from './context/AssistantIdentityContext';

// Code splitting: cada tela é carregada sob demanda
const Overview = lazy(() =>
  import('./features/overview/Overview').then((m) => ({ default: m.Overview }))
);
const ChatMaster = lazy(() =>
  import('./features/chat/ChatMaster').then((m) => ({ default: m.ChatMaster }))
);
const ApprovalCenter = lazy(() =>
  import('./features/approvals/ApprovalCenter').then((m) => ({ default: m.ApprovalCenter }))
);
const ProjectWorkspaceView = lazy(() =>
  import('./features/workspace/ProjectWorkspaceView').then((m) => ({ default: m.ProjectWorkspaceView }))
);
const AgentCenterView = lazy(() =>
  import('./features/agents/AgentCenterView').then((m) => ({ default: m.AgentCenterView }))
);
const TaskManagerView = lazy(() =>
  import('./features/tasks/TaskManagerView').then((m) => ({ default: m.TaskManagerView }))
);
const ModelManagerView = lazy(() =>
  import('./features/models/ModelManagerView').then((m) => ({ default: m.ModelManagerView }))
);
const SkillsManagerView = lazy(() =>
  import('./features/skills/SkillsManagerView').then((m) => ({ default: m.SkillsManagerView }))
);
const SecurityCenterView = lazy(() =>
  import('./features/security/SecurityCenterView').then((m) => ({ default: m.SecurityCenterView }))
);
const ServerLogsView = lazy(() =>
  import('./features/logs/ServerLogsView').then((m) => ({ default: m.ServerLogsView }))
);
const HardwareAdvisorView = lazy(() =>
  import('./features/hardware/HardwareAdvisorView').then((m) => ({ default: m.HardwareAdvisorView }))
);
const KnowledgeVaultView = lazy(() =>
  import('./features/knowledge/KnowledgeVaultView').then((m) => ({ default: m.KnowledgeVaultView }))
);
const BackendStudioView = lazy(() =>
  import('./features/studios/BackendStudioView').then((m) => ({ default: m.BackendStudioView }))
);
const QualityStudioView = lazy(() =>
  import('./features/studios/QualityStudioView').then((m) => ({ default: m.QualityStudioView }))
);
const DesignStudioView = lazy(() =>
  import('./features/studios/DesignStudioView').then((m) => ({ default: m.DesignStudioView }))
);
const ExecutiveReportView = lazy(() =>
  import('./features/executive/ExecutiveReportView').then((m) => ({ default: m.ExecutiveReportView }))
);
const CodingAgentView = lazy(() =>
  import('./features/coding/CodingAgentView').then((m) => ({ default: m.CodingAgentView }))
);
const LearningCenterView = lazy(() =>
  import('./features/learning/LearningCenterView').then((m) => ({ default: m.LearningCenterView }))
);
const AgentOfficeView = lazy(() =>
  import('./features/office/AgentOfficeView').then((m) => ({ default: m.AgentOfficeView }))
);
const SettingsView = lazy(() =>
  import('./features/settings/SettingsView').then((m) => ({ default: m.SettingsView }))
);
const WorkflowCanvasView = lazy(() =>
  import('./features/workflows/WorkflowCanvasView').then((m) => ({ default: m.WorkflowCanvasView }))
);
const UsageAnalyticsView = lazy(() =>
  import('./features/usage/UsageAnalyticsView').then((m) => ({ default: m.UsageAnalyticsView }))
);
const CompanionHubView = lazy(() =>
  import('./features/companion/CompanionHubView').then((m) => ({ default: m.CompanionHubView }))
);
const CreativeMediaStudioView = lazy(() =>
  import('./features/studio/CreativeMediaStudioView').then((m) => ({
    default: m.CreativeMediaStudioView,
  }))
);
const AppBuilderView = lazy(() =>
  import('./features/studio/AppBuilderView').then((m) => ({
    default: m.AppBuilderView,
  }))
);
const GitHubImporterView = lazy(() =>
  import('./features/github/GitHubImporterView').then((m) => ({
    default: m.GitHubImporterView,
  }))
);
const AndroidMobileHubView = lazy(() =>
  import('./features/mobile/AndroidMobileHubView').then((m) => ({
    default: m.AndroidMobileHubView,
  }))
);
const BrainServerHubView = lazy(() =>
  import('./features/brain/BrainServerHubView').then((m) => ({
    default: m.BrainServerHubView,
  }))
);

/**
 * Telas que ocupam toda a área útil com layout e cabeçalho internos próprios.
 */
const FULLSCREEN_TABS = new Set(['chat', 'workflows', 'settings', 'learning', 'skills', 'store']);
const NO_HEADER_TABS = new Set(['chat', 'workflows']);

const TAB_LABELS: Record<string, { section: string; title: string }> = {
  overview: { section: 'Principal', title: 'Visão Geral' },
  chat: { section: 'Principal', title: 'Conversas' },
  tasks: { section: 'Principal', title: 'Gestor de Tarefas' },
  workflows: { section: 'Principal', title: 'Fluxos de Trabalho' },
  workspace: { section: 'Principal', title: 'Projetos & Biblioteca' },
  coding: { section: 'Engenharia', title: 'Coding Agent' },
  agents: { section: 'Engenharia', title: 'Centro de Agentes' },
  models: { section: 'Engenharia', title: 'Modelos & Provedores' },
  knowledge: { section: 'Engenharia', title: 'Base de Conhecimento' },
  skills: { section: 'Engenharia', title: 'Habilidades dos Agentes' },
  store: { section: 'Engenharia', title: 'Loja & Apps' },
  approvals: { section: 'Governança', title: 'Central de Aprovações' },
  usage: { section: 'Governança', title: 'Uso & Custos' },
  security: { section: 'Governança', title: 'Segurança & Auditoria' },
  backend_studio: { section: 'Estúdios', title: 'Backend Studio' },
  quality: { section: 'Estúdios', title: 'Qualidade & QA' },
  design: { section: 'Estúdios', title: 'Design Studio' },
  office: { section: 'Operações', title: 'Escritório de Agentes' },
  executive_report: { section: 'Governança', title: 'Relatório Executivo ROI' },
  advisor: { section: 'Sistema', title: 'Hardware Advisor' },
  server_logs: { section: 'Sistema', title: 'Logs do Servidor' },
  learning: { section: 'Suporte', title: 'Central de Ajuda' },
  settings: { section: 'Sistema', title: 'Configurações' },
  companion: { section: 'Ecossistema', title: 'Voz, PWA & Companion' },
  creative_studio: { section: 'Principal', title: 'Estúdio Criativo (Excel, Imagens & Vídeos)' },
  app_builder: { section: 'Principal', title: 'Construtor de Apps (Android & Windows)' },
  github_import: { section: 'Engenharia', title: 'Importar do GitHub' },
  android_app: { section: 'Ecossistema', title: 'App Mobile Android (.apk / .aab)' },
  brain_server: { section: 'Ecossistema', title: 'Cérebros & Servidor (Local / Docker)' },
  not_found: { section: 'JARVIS', title: 'Página não encontrada' },
};

const ViewFallback: React.FC = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '56px 16px',
      color: 'var(--text-secondary)',
      fontSize: '0.86rem',
    }}
  >
    Carregando módulo...
  </div>
);

class ModuleErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '24px' }}>
          <ErrorBanner
            message={`Não foi possível renderizar este módulo (${this.state.error.message}).`}
            onRetry={() => this.setState({ error: null })}
          />
        </div>
      );
    }
    return this.props.children;
  }
}

const NotFoundView: React.FC<{ onGoHome: () => void }> = ({ onGoHome }) => (
  <section
    role="status"
    aria-labelledby="not-found-title"
    style={{
      minHeight: '60vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      textAlign: 'center',
      color: 'var(--text-secondary)',
    }}
  >
    <div style={{ fontSize: '3rem', color: 'var(--accent-light)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
      404
    </div>
    <h1 id="not-found-title" style={{ color: 'var(--text-primary)', fontSize: '1.35rem' }}>
      Página não encontrada
    </h1>
    <p style={{ maxWidth: '420px', fontSize: '0.9rem' }}>
      Este endereço não corresponde a uma página disponível no JARVIS AI Hub.
    </p>
    <button type="button" className="btn btn-primary" onClick={onGoHome}>
      Ir para a Visão Geral
    </button>
  </section>
);

const DashboardApp: React.FC = () => {
  const { assistantName, experienceMode, profile: identityProfile, updateIdentityProfile } = useAssistantIdentity();
  const isSimpleMode = experienceMode === 'simple';
  const [authPermissions, setAuthPermissions] = useState<string[]>([]);
  const [authRole, setAuthRole] = useState<string | null>(null);
  const [authKind, setAuthKind] = useState<string | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [authMustChangePassword, setAuthMustChangePassword] = useState(false);
  const [guidedTourOpen, setGuidedTourOpen] = useState(false);
  const [learningContextTab, setLearningContextTab] = useState('overview');

  const hasPermission = (permission: string) =>
    authPermissions.includes('*') || authPermissions.includes(permission);

  const canAccessTab = (tab: string) => {
    if (tab === 'not_found') return true;
    if (tab === 'advisor' || tab === 'server_logs') return authKind === 'human' && authRole === 'admin';
    const required: Record<string, string> = {
      chat: 'chat:read',
      overview: 'system:read',
      approvals: 'approvals:read',
      design: 'studios:read',
      office: 'agents:read',
      workspace: 'workspace:read',
      models: 'models:read',
      coding: 'coding:read',
      agents: 'agents:read',
      knowledge: 'knowledge:read',
      tasks: 'tasks:read',
      backend_studio: 'studios:read',
      quality: 'studios:read',
      skills: 'skills:read',
      security: 'security:read',
      executive_report: 'studios:read',
      learning: 'profile:read',
      settings: 'profile:read',
      workflows: 'studios:read',
      usage: 'system:read',
      store: 'skills:read',
    };
    return !required[tab] || hasPermission(required[tab]);
  };

  const [activeTab, setActiveTab] = useState<string>(() =>
    tabFromLocation(window.location.pathname, window.location.search)
  );
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showVoiceHud, setShowVoiceHud] = useState(false);
  const [showVoiceCalibration, setShowVoiceCalibration] = useState(false);
  const [pendingVoiceCommand, setPendingVoiceCommand] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileData>(getUserProfile);

  const wakeWord = useWakeWordListener({
    assistantName,
    paused: showVoiceHud || showVoiceCalibration,
    onWakeDetected: ({ command }) => {
      setPendingVoiceCommand(command || null);
      setShowVoiceHud(true);
    },
  });

  useEffect(() => {
    setUserProfile(identityProfile);
  }, [identityProfile]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('jarvis_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [attachedProjectId, setAttachedProjectId] = useState<string | null>(null);
  const [targetChatSessionId, setTargetChatSessionId] = useState<string | null>(null);
  const [pendingChatPrompt, setPendingChatPrompt] = useState<string | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRequestItem[]>([]);
  const [healthLoading, setHealthLoading] = useState(true);
  const [approvalsLoading, setApprovalsLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [approvalsError, setApprovalsError] = useState<string | null>(null);
  const [systemResources, setSystemResources] = useState<SystemResourceUsage | null>(null);

  const [showDynamicIsland, setShowDynamicIsland] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(getAccountStorageKey('jarvis_pref_dynamic_island'));
      return v !== null ? v !== 'false' : true;
    } catch {
      return true;
    }
  });

  const [showAgentDock, setShowAgentDock] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(getAccountStorageKey('jarvis_pref_agent_dock'));
      return v !== null ? v !== 'false' : true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const syncPreferences = () => {
      try {
        const islandVal = localStorage.getItem(getAccountStorageKey('jarvis_pref_dynamic_island'));
        setShowDynamicIsland(islandVal !== null ? islandVal !== 'false' : true);
        const dockVal = localStorage.getItem(getAccountStorageKey('jarvis_pref_agent_dock'));
        setShowAgentDock(dockVal !== null ? dockVal !== 'false' : true);
      } catch {}
    };

    window.addEventListener('jarvis_ui_preferences_changed', syncPreferences);
    window.addEventListener('storage', syncPreferences);
    return () => {
      window.removeEventListener('jarvis_ui_preferences_changed', syncPreferences);
      window.removeEventListener('storage', syncPreferences);
    };
  }, []);

  const [chatLoaded, setChatLoaded] = useState(
    () => tabFromLocation(window.location.pathname, window.location.search) === 'chat'
  );

  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((principal) => {
        if (cancelled) return;
        setAuthPermissions(Array.isArray(principal?.permissions) ? principal.permissions : []);
        setAuthRole(typeof principal?.role === 'string' ? principal.role : null);
        setAuthKind(typeof principal?.kind === 'string' ? principal.kind : null);
        setAuthMustChangePassword(principal?.must_change_password === true);
        setAuthLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setAuthPermissions([]);
          setAuthRole(null);
          setAuthKind(null);
          setAuthMustChangePassword(false);
          setAuthLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authLoaded || authKind !== 'human' || authRole !== 'admin') return;
    let cancelled = false;
    apiFetch(`${API_BASE}/system/onboarding`, { credentials: 'include' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((status) => {
        if (!cancelled) setShowSetupWizard(status?.completed !== true);
      })
      .catch(() => {
        if (!cancelled) setShowSetupWizard(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoaded, authKind, authRole]);

  const navigate = (tab: string) => {
    if (tab === 'learning' && activeTab !== 'learning') setLearningContextTab(activeTab);
    const path = pathForTab(tab);
    if (path === '/404') return;
    setActiveTab(tab);
    setMobileNavOpen(false);
    if (tab === 'chat') setChatLoaded(true);
    if (window.location.pathname !== path) {
      window.history.pushState({ tab }, '', path);
    }
  };

  const handleToggleSidebar = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      setMobileNavOpen((prev) => !prev);
      return;
    }
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('jarvis_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const handleToggleAgentDock = () => {
    setShowAgentDock((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(getAccountStorageKey('jarvis_pref_agent_dock'), String(next));
      } catch {}
      return next;
    });
  };

  const handleStartChatFromOverview = (prompt?: string) => {
    if (prompt && prompt.trim()) {
      setTargetChatSessionId('new_' + Date.now());
      setPendingChatPrompt(prompt.trim());
    }
    navigate('chat');
  };

  useEffect(() => {
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

    const handleOpenAndroidPairing = () => {
      navigate('android_app');
    };

    const handleOpenBrainManager = () => {
      navigate('brain_server');
    };

    const handleOpenVoiceCalibration = () => {
      setShowVoiceCalibration(true);
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('jarvis:open-android-pairing', handleOpenAndroidPairing);
    window.addEventListener('jarvis:open-brain-manager', handleOpenBrainManager);
    window.addEventListener('jarvis:open-voice-calibration', handleOpenVoiceCalibration);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener('jarvis:open-android-pairing', handleOpenAndroidPairing);
      window.removeEventListener('jarvis:open-brain-manager', handleOpenBrainManager);
      window.removeEventListener('jarvis:open-voice-calibration', handleOpenVoiceCalibration);
    };
  }, []);

  const loadData = async (opts: { initial?: boolean } = {}) => {
    if (opts.initial) {
      setHealthLoading(true);
      setApprovalsLoading(true);
    }
    const [healthResult, approvalsResult, resourcesResult] = await Promise.allSettled([
      fetchHealth(),
      fetchApprovals(),
      fetchResources(),
    ]);
    if (healthResult.status === 'fulfilled') {
      setHealth(healthResult.value);
      setHealthError(null);
    } else {
      setHealthError(
        healthResult.reason instanceof Error
          ? healthResult.reason.message
          : 'Falha ao consultar a saúde do sistema.'
      );
    }
    setHealthLoading(false);
    if (approvalsResult.status === 'fulfilled') {
      setApprovals(approvalsResult.value);
      setApprovalsError(null);
    } else {
      setApprovalsError(
        approvalsResult.reason instanceof Error
          ? approvalsResult.reason.message
          : 'Falha ao consultar aprovações.'
      );
    }
    setApprovalsLoading(false);
    if (resourcesResult.status === 'fulfilled') {
      setSystemResources(resourcesResult.value);
    }
  };

  useEffect(() => {
    loadData({ initial: true });
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadData();
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const pendingApprovalsCount = approvals.filter((a) => a.status === 'pending').length;
  const activeMeta = TAB_LABELS[activeTab] || { section: 'JARVIS', title: 'Workspace' };
  const isFullscreenTab = FULLSCREEN_TABS.has(activeTab);

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
        position: 'relative',
      }}
    >
      {/* Backdrop móvel quando a gaveta estiver aberta */}
      {mobileNavOpen && (
        <div
          role="presentation"
          onClick={() => setMobileNavOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(5, 7, 12, 0.68)',
            backdropFilter: 'blur(2px)',
            zIndex: 90,
          }}
        />
      )}

      {/* Sidebar Colapsável (244px expandida / 68px compacta / gaveta no mobile) */}
      <PrimaryRail
        activeTab={activeTab}
        onNavigate={navigate}
        collapsed={isSidebarCollapsed}
        mobileOpen={mobileNavOpen}
        onToggleCollapse={handleToggleSidebar}
        pendingApprovalsCount={pendingApprovalsCount}
        onOpenSettings={() => navigate('settings')}
        onOpenHelp={() => navigate('learning')}
        onOpenProfile={() => setShowProfileModal(true)}
      />

      {/* Área Central */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100dvh',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-primary)',
        }}
      >
        {/* Top Bar Global (Contrato SaaS limpo, sem sobreposição) */}
        {!NO_HEADER_TABS.has(activeTab) && (
          <header className="jarvis-topbar">
            {/* Esquerda: Toggle Sidebar + Breadcrumb Contextual */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <button
                type="button"
                onClick={handleToggleSidebar}
                className="btn btn-ghost btn-icon"
                title="Alternar barra lateral (Ctrl+B)"
                aria-label="Alternar barra lateral"
              >
                <PanelLeft size={16} />
              </button>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.84rem',
                  minWidth: 0,
                }}
              >
                <span className="hide-mobile" style={{ color: 'var(--text-muted)' }}>
                  {activeMeta.section}
                </span>
                <span className="hide-mobile" style={{ color: 'var(--border-hover)' }}>
                  /
                </span>
                <span
                  style={{
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {activeMeta.title}
                </span>
              </div>
            </div>

            {/* Direita: Telemetria Inline (DynamicIsland), Comando Ctrl+K, Ação Principal, Perfil */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              {showDynamicIsland && !isSimpleMode && (
                <div className="hide-mobile">
                  <DynamicIsland
                    variant="inline"
                    activeAgentName={`${assistantName} AI Hub`}
                    systemStatus={{
                      cpu: systemResources?.cpu_percent ?? null,
                      memory: systemResources?.ram_percent ?? null,
                    }}
                    onOpenVoice={() => setShowVoiceHud(true)}
                  />
                </div>
              )}

              <PWAInstallButton compact />

              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setPendingVoiceCommand(null);
                    setShowVoiceHud(true);
                  }}
                  className="btn btn-secondary btn-sm"
                  title={`Clique para falar agora com ${assistantName}`}
                  aria-label={`Falar agora com ${assistantName}`}
                  style={{ borderColor: 'var(--border-accent)', color: 'var(--accent-light)' }}
                >
                  <Mic size={13} />
                  <span className="hide-mobile">Ei {assistantName}</span>
                </button>
                <button
                  type="button"
                  onClick={wakeWord.toggle}
                  aria-pressed={wakeWord.enabled}
                  className={`btn btn-icon-sm ${wakeWord.enabled ? 'btn-primary' : 'btn-ghost'}`}
                  title={
                    wakeWord.enabled
                      ? `Escuta mãos-livres ativa: diga "Ei ${assistantName}" sem clicar`
                      : `Ativar escuta contínua para chamar "Ei ${assistantName}" sem clicar`
                  }
                  aria-label={
                    wakeWord.enabled
                      ? `Pausar escuta contínua Ei ${assistantName}`
                      : `Ativar escuta contínua Ei ${assistantName}`
                  }
                >
                  <Radio size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowVoiceCalibration(true)}
                  className="btn btn-icon-sm btn-ghost"
                  title="Calibrar sua voz gravando 3 vezes (Setup de Wake Word)"
                  aria-label="Calibrar reconhecimento de voz"
                  style={{ color: '#f59e0b' }}
                >
                  <Sparkles size={14} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowCommandPalette(true)}
                className="btn btn-secondary btn-sm"
                title="Paleta de Comandos (Ctrl+K)"
              >
                <Search size={13} />
                <span className="hide-mobile">Buscar...</span>
                <kbd
                  className="hide-mobile"
                  style={{
                    marginLeft: '4px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    fontSize: '0.68rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  Ctrl K
                </kbd>
              </button>

              {pendingApprovalsCount > 0 && !isSimpleMode && (
                <button
                  type="button"
                  onClick={() => navigate('approvals')}
                  className="btn btn-sm badge-warning tabular-nums"
                  title="Aprovações pendentes"
                >
                  <ShieldAlert size={13} />
                  <span>{pendingApprovalsCount}</span>
                </button>
              )}

              <button
                type="button"
                className="btn btn-primary btn-sm hide-mobile"
                onClick={() => {
                  setTargetChatSessionId('new_' + Date.now());
                  navigate('chat');
                }}
              >
                <Plus size={14} />
                <span>Novo chat</span>
              </button>

              <button
                type="button"
                className={`btn btn-ghost btn-icon hide-tablet ${showAgentDock ? 'is-active' : ''}`}
                onClick={handleToggleAgentDock}
                title={showAgentDock ? 'Ocultar painel de especialistas' : 'Mostrar painel de especialistas'}
                aria-label={showAgentDock ? 'Ocultar painel de especialistas' : 'Mostrar painel de especialistas'}
                aria-pressed={showAgentDock}
              >
                <PanelRight size={16} />
              </button>

              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => navigate('learning')}
                title="Ajuda contextual e tutoriais"
                aria-label="Abrir ajuda contextual"
              >
                <CircleHelp size={16} />
              </button>

              <button
                type="button"
                onClick={() => setShowProfileModal(true)}
                aria-label="Perfil do usuário"
                className="btn btn-secondary btn-icon"
                title="Perfil e Configurações"
              >
                {userProfile.avatarIcon ||
                  (userProfile.displayName ? userProfile.displayName.charAt(0).toUpperCase() : 'A')}
              </button>
            </div>
          </header>
        )}

        {/* Viewport Principal das Telas */}
        <main
          style={{
            flex: 1,
            overflowY: isFullscreenTab || activeTab === 'coding' ? 'hidden' : 'auto',
            minWidth: 0,
            minHeight: 0,
            padding: FULLSCREEN_TABS.has(activeTab) ? '0' : activeTab === 'coding' ? 'clamp(12px, 1.8vw, 20px)' : 'clamp(16px, 2.4vw, 28px)',
            backgroundColor: 'var(--bg-primary)',
          }}
        >
          {!authLoaded ? (
            <ViewFallback />
          ) : !canAccessTab(activeTab) ? (
            <section
              role="alert"
              style={{
                minHeight: '55vh',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '12px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
              }}
            >
              <ShieldAlert size={30} color="var(--accent-light)" />
              <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.15rem' }}>
                Acesso não disponível
              </h2>
              <p style={{ maxWidth: '440px', margin: 0, fontSize: '0.88rem' }}>
                O seu perfil não possui a permissão necessária para abrir este módulo. Se precisar
                de acesso, contate o administrador da plataforma.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate(hasPermission('system:read') ? 'overview' : 'chat')}
              >
                Voltar
              </button>
            </section>
          ) : activeTab === 'not_found' ? (
            <NotFoundView onGoHome={() => navigate('overview')} />
          ) : (
            <div
              style={
                isFullscreenTab
                  ? { width: '100%', height: '100%', minHeight: 0 }
                  : activeTab === 'coding'
                    ? { width: '100%', maxWidth: '1380px', height: '100%', margin: '0 auto', minHeight: 0 }
                    : { width: '100%', maxWidth: '1380px', margin: '0 auto' }
              }
            >
              <ModuleErrorBoundary key={activeTab}>
                <Suspense fallback={<ViewFallback />}>
                  {activeTab === 'overview' && (
                    <Overview
                      health={health}
                      approvals={approvals}
                      healthLoading={healthLoading}
                      approvalsLoading={approvalsLoading}
                      healthError={healthError}
                      approvalsError={approvalsError}
                      onStartChat={handleStartChatFromOverview}
                      onNavigate={navigate}
                    />
                  )}
                  {activeTab === 'coding' && <CodingAgentView />}
                  {activeTab === 'workflows' && <WorkflowCanvasView />}
                  {activeTab === 'usage' && <UsageAnalyticsView />}
                  {activeTab === 'store' && (
                    <SkillsManagerView
                      initialTab="apps"
                      onOpenGitHubImport={() => navigate('github_import')}
                    />
                  )}
                  {activeTab === 'skills' && (
                    <SkillsManagerView
                      initialTab="skills"
                      onOpenGitHubImport={() => navigate('github_import')}
                    />
                  )}
                  {chatLoaded && (
                    <div style={{ display: activeTab === 'chat' ? 'block' : 'none', height: '100%' }}>
                      <ChatMaster
                        attachedProjectId={attachedProjectId}
                        onDetachProject={() => setAttachedProjectId(null)}
                        targetSessionId={targetChatSessionId}
                        initialPrompt={pendingChatPrompt}
                        onInitialPromptConsumed={() => setPendingChatPrompt(null)}
                      />
                    </div>
                  )}
                  {activeTab === 'approvals' && (
                    <ApprovalCenter
                      approvals={approvals}
                      onRefresh={loadData}
                      loading={approvalsLoading}
                      error={approvalsError}
                    />
                  )}
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
                  {activeTab === 'agents' && (
                    <AgentCenterView onOpenGitHubImport={() => navigate('github_import')} />
                  )}
                  {activeTab === 'tasks' && <TaskManagerView />}
                  {activeTab === 'backend_studio' && <BackendStudioView />}
                  {activeTab === 'quality' && <QualityStudioView />}
                  {activeTab === 'design' && <DesignStudioView />}
                  {activeTab === 'executive_report' && <ExecutiveReportView />}
                  {activeTab === 'models' && <ModelManagerView />}
                  {activeTab === 'knowledge' && <KnowledgeVaultView />}
                  {activeTab === 'security' && <SecurityCenterView onRefresh={loadData} />}
                  {activeTab === 'advisor' && <HardwareAdvisorView />}
                  {activeTab === 'server_logs' && <ServerLogsView />}
                  {activeTab === 'learning' && (
                    <LearningCenterView
                      activeTab={learningContextTab}
                      onNavigate={navigate}
                      onStartTour={() => setGuidedTourOpen(true)}
                      onOpenProfile={() => setShowProfileModal(true)}
                    />
                  )}
                  {activeTab === 'settings' && <SettingsView onNavigate={navigate} />}
                  {activeTab === 'companion' && (
                    <CompanionHubView
                      onOpenVoiceHud={() => setShowVoiceHud(true)}
                      onNavigate={navigate}
                    />
                  )}
                  {activeTab === 'creative_studio' && <CreativeMediaStudioView />}
                  {activeTab === 'app_builder' && <AppBuilderView />}
                  {activeTab === 'github_import' && <GitHubImporterView onNavigate={navigate} />}
                  {activeTab === 'android_app' && <AndroidMobileHubView />}
                  {activeTab === 'brain_server' && <BrainServerHubView />}
                </Suspense>
              </ModuleErrorBoundary>
            </div>
          )}
        </main>
      </div>

      {/* Rail Lateral Direito Não-Sobreposto de Agentes */}
      {showAgentDock && (
        <AgentDock
          activeAgentId={
            activeTab === 'chat' && targetChatSessionId?.startsWith('agent_')
              ? targetChatSessionId.slice(6)
              : undefined
          }
          onSelectAgent={(agentId) => {
            setTargetChatSessionId('agent_' + agentId);
            navigate('chat');
          }}
          onAddAgent={() => navigate('agents')}
          onHideDock={handleToggleAgentDock}
        />
      )}

      {/* Modais e Overlays Globais */}
      <InitialPasswordChangeModal
        isOpen={authLoaded && authMustChangePassword}
        onCompleted={() => {
          setAuthMustChangePassword(false);
          setShowSetupWizard(true);
        }}
      />

      <GuidedTour
        isOpen={guidedTourOpen}
        permissions={authPermissions}
        onNavigate={navigate}
        onClose={() => setGuidedTourOpen(false)}
      />

      <SetupWizardModal
        isOpen={
          showSetupWizard &&
          authLoaded &&
          !authMustChangePassword &&
          authKind === 'human' &&
          authRole === 'admin'
        }
        onClose={() => setShowSetupWizard(false)}
        onCompleted={loadData}
      />

      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onNavigate={navigate}
        onOpenSetupWizard={
          authKind === 'human' && authRole === 'admin'
            ? () => {
                setShowProfileModal(false);
                setShowSetupWizard(true);
              }
            : undefined
        }
        onProfileUpdated={(updated) => {
          setUserProfile(updated);
          void updateIdentityProfile(updated);
        }}
      />

      <CommandPalette
        isOpen={showCommandPalette}
        permissions={authPermissions}
        role={authRole || undefined}
        principalKind={authKind || undefined}
        permissionsLoaded={authLoaded}
        onClose={() => setShowCommandPalette(false)}
        onNavigate={(tab) => {
          navigate(tab);
          setShowCommandPalette(false);
        }}
        onOpenProfile={() => setShowProfileModal(true)}
      />

      <VoiceLiveHudModal
        isOpen={showVoiceHud}
        onClose={() => {
          setShowVoiceHud(false);
          setPendingVoiceCommand(null);
        }}
        autoListenOnOpen
        initialCommand={pendingVoiceCommand}
        onInitialCommandConsumed={() => setPendingVoiceCommand(null)}
        wakeWordEnabled={wakeWord.enabled}
        onToggleWakeWord={wakeWord.toggle}
      />

      <VoiceCalibrationModal
        isOpen={showVoiceCalibration}
        onClose={() => setShowVoiceCalibration(false)}
        assistantName={assistantName}
        onCalibrationComplete={() => {
          setShowVoiceCalibration(false);
          wakeWord.setEnabled(true);
        }}
      />

      {/* Navegação Inferior Mobile PWA (visível apenas abaixo de 768px) */}
      <nav className="jarvis-mobile-bottom-nav" aria-label="Navegação mobile rápida">
        <button
          type="button"
          onClick={() => navigate('overview')}
          className={`jarvis-mobile-bottom-nav__btn ${activeTab === 'overview' ? 'is-active' : ''}`}
        >
          <LayoutDashboard size={17} />
          <span>Início</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('chat')}
          className={`jarvis-mobile-bottom-nav__btn ${activeTab === 'chat' ? 'is-active' : ''}`}
        >
          <MessageSquare size={17} />
          <span>Chat</span>
        </button>
        <button
          type="button"
          onClick={() => setShowVoiceHud(true)}
          className="jarvis-mobile-bottom-nav__btn jarvis-mobile-bottom-nav__voice"
          aria-label={`Falar com ${assistantName}`}
        >
          <Mic size={18} />
          <span>Voz</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('companion')}
          className={`jarvis-mobile-bottom-nav__btn ${activeTab === 'companion' ? 'is-active' : ''}`}
        >
          <Smartphone size={17} />
          <span>PC/PWA</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('security')}
          className={`jarvis-mobile-bottom-nav__btn ${activeTab === 'security' ? 'is-active' : ''}`}
        >
          <ShieldCheck size={17} />
          <span>Sentinela</span>
        </button>
      </nav>

      <OfflineIndicator />
      <ApprovalPromptHost />
      <ToastContainer />
    </div>
  );
};

export const App: React.FC = () => (
  <AuthGate>
    <AssistantIdentityProvider>
      <DashboardApp />
    </AssistantIdentityProvider>
  </AuthGate>
);

export default App;
