import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Settings,
  Palette,
  Bell,
  Mic,
  User,
  CreditCard,
  Smartphone,
  Power,
  Layers,
  Sparkles,
  Cpu,
  RefreshCw,
  Search,
  ChevronRight,
  Save,
  Database,
  Network,
  Terminal,
  CheckCircle2,
  Lock,
  Download,
  QrCode,
  Copy,
  Check,
  Wifi,
  Server,
  Volume2,
  X,
} from 'lucide-react';
import { getUserProfile, UserProfileData } from '../../shared/common/UserProfileModal';
import { notify } from '../../shared/common/Toast';
import { getAccountStorageKey } from '../../services/accountScope';
import { KeyVaultManager } from '../models/KeyVaultManager';
import { PageHeader } from '../../shared/layout/PageHeader';
import { useAssistantIdentity } from '../../context/AssistantIdentityContext';
import {
  ASSISTANT_NAME_PRESETS,
  DEFAULT_ASSISTANT_NAME,
  normalizeAssistantName,
} from '../../services/assistantIdentity';
import {
  getVoiceAutoSpeakPref,
  getWakeWordEnabledPref,
  setVoiceAutoSpeakPref,
  setWakeWordEnabledPref,
} from '../../hooks/useWakeWordListener';

interface SettingsViewProps {
  initialSubTab?: string;
  onNavigate?: (tab: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  initialSubTab = 'general',
  onNavigate,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<string>(initialSubTab);
  const [searchTerm, setSearchTerm] = useState('');

  // Configurações Gerais
  const [sendShortcut, setSendShortcut] = useState<'enter' | 'ctrl_enter'>('enter');
  const [orderConversations, setOrderConversations] = useState<'unread_group' | 'recent' | 'manual'>('unread_group');
  const [showAgentSteps, setShowAgentSteps] = useState(false);
  const [compactMessageActions, setCompactMessageActions] = useState(true);
  const [openExternalLinksIn, setOpenExternalLinksIn] = useState<'default_browser' | 'embedded'>('default_browser');
  const [linkTelemetryToAccount, setLinkTelemetryToAccount] = useState(false);

  // Configurações de Voz
  const [sttModel, setSttModel] = useState('Parakeet TDT 0.6B v3 (Local Rápido)');
  const [vadPauseSeconds, setVadPauseSeconds] = useState(1.5);
  const [ttsModel, setTtsModel] = useState('Supertonic 3 (Local)');
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState('female_1');
  const [speechSpeed, setSpeechSpeed] = useState<number>(1.0);
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);

  // Configurações do Computador & Dynamic Island / Dock (Persistidas por Conta)
  const [dynamicIslandEnabled, setDynamicIslandEnabled] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(getAccountStorageKey('jarvis_pref_dynamic_island'));
      return v !== null ? v !== 'false' : true;
    } catch {
      return true;
    }
  });
  const [agentDockEnabled, setAgentDockEnabled] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(getAccountStorageKey('jarvis_pref_agent_dock'));
      return v !== null ? v !== 'false' : true;
    } catch {
      return true;
    }
  });

  const handleToggleIsland = () => {
    const nextVal = !dynamicIslandEnabled;
    setDynamicIslandEnabled(nextVal);
    try {
      localStorage.setItem(getAccountStorageKey('jarvis_pref_dynamic_island'), String(nextVal));
      window.dispatchEvent(new Event('jarvis_ui_preferences_changed'));
    } catch {}
    notify(`Dynamic Island ${nextVal ? 'ativada' : 'ocultada'}.`, 'info');
  };

  const handleToggleDock = () => {
    const nextVal = !agentDockEnabled;
    setAgentDockEnabled(nextVal);
    try {
      localStorage.setItem(getAccountStorageKey('jarvis_pref_agent_dock'), String(nextVal));
      window.dispatchEvent(new Event('jarvis_ui_preferences_changed'));
    } catch {}
    notify(`Dock de Agentes ${nextVal ? 'ativado' : 'ocultado'}.`, 'info');
  };

  const [launchOnStartup, setLaunchOnStartup] = useState(true);
  const [minimizeToTray, setMinimizeToTray] = useState(true);

  // Perfil da Conta + Identidade Dinâmica do Assistente
  const identity = useAssistantIdentity();
  const [profile, setProfile] = useState<UserProfileData>(() => ({
    ...getUserProfile(),
    assistantName: identity.assistantName,
    experienceMode: identity.experienceMode,
  }));
  const [savingProfile, setSavingProfile] = useState(false);
  const [wakeWordEnabled, setWakeWordEnabled] = useState<boolean>(() => getWakeWordEnabledPref());
  const [autoSpeakEnabled, setAutoSpeakEnabled] = useState<boolean>(() => getVoiceAutoSpeakPref());

  useEffect(() => {
    const syncVoice = () => {
      setWakeWordEnabled(getWakeWordEnabledPref());
      setAutoSpeakEnabled(getVoiceAutoSpeakPref());
    };
    window.addEventListener('jarvis_voice_prefs_changed', syncVoice);
    return () => window.removeEventListener('jarvis_voice_prefs_changed', syncVoice);
  }, []);

  useEffect(() => {
    setProfile((prev) => ({
      ...prev,
      ...identity.profile,
      assistantName: identity.assistantName,
      experienceMode: identity.experienceMode,
    }));
  }, [identity.assistantName, identity.experienceMode, identity.profile]);

  // Configurações do Servidor (Instância FastAPI & SQLite)
  const [serverHost, setServerHost] = useState<'127.0.0.1' | '0.0.0.0'>('127.0.0.1');
  const [serverPort, setServerPort] = useState(8000);
  const [jwtExpirationHours, setJwtExpirationHours] = useState(24);
  const [ollamaEndpoint, setOllamaEndpoint] = useState('http://localhost:11434');
  const [contextWindow, setContextWindow] = useState('8192');
  const [logLevel, setLogLevel] = useState<'INFO' | 'DEBUG' | 'WARNING' | 'ERROR'>('INFO');
  const [testingApi, setTestingApi] = useState(false);
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);
  const [testingOllama, setTestingOllama] = useState(false);
  const [backingUpDb, setBackingUpDb] = useState(false);

  // Aparência e Tema
  const [themeMode, setThemeMode] = useState<'obsidian' | 'oled' | 'graphite'>('obsidian');
  const [accentColor, setAccentColor] = useState<'blue' | 'purple' | 'emerald' | 'orange'>('orange');
  const [uiDensity, setUiDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [glassmorphism, setGlassmorphism] = useState(true);
  const [smoothAnimations, setSmoothAnimations] = useState(true);
  const [railAgentsMode, setRailAgentsMode] = useState<'auto' | 'always' | 'never'>('auto');

  // Notificações
  const [notifyTaskCompletion, setNotifyTaskCompletion] = useState(true);
  const [notifySecurityAlerts, setNotifySecurityAlerts] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);
  const [dailyDigest, setDailyDigest] = useState(false);

  // Atualizações
  const [updateChannel, setUpdateChannel] = useState<'stable' | 'beta' | 'dev'>('stable');
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(true);
  const [checkingUpdates, setCheckingUpdates] = useState(false);

  // Mobile / Descoberta de Rede & QR Code
  const [mobileDiscovery, setMobileDiscovery] = useState<{
    server_url: string;
    local_ip: string;
    api_port: number;
    udp_beacon_port: number;
    status: string;
  } | null>(null);
  const [mobilePairDeviceName, setMobilePairDeviceName] = useState('Meu Celular Android');
  const [mobilePairToken, setMobilePairToken] = useState('');
  const [mobilePairQr, setMobilePairQr] = useState('');
  const [mobilePairLoading, setMobilePairLoading] = useState(false);
  const [mobilePairCopied, setMobilePairCopied] = useState(false);

  useEffect(() => {
    if (activeSubTab === 'mobile') {
      fetch('/api/v1/system/discovery')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.server_url) {
            setMobileDiscovery(data);
          }
        })
        .catch(() => {});
    }
  }, [activeSubTab]);

  const handleGenerateMobilePair = async () => {
    setMobilePairLoading(true);
    try {
      const response = await fetch('/api/v1/mobile/pair', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ device_name: mobilePairDeviceName.trim() || 'Android Device' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || 'Não foi possível gerar o pareamento.');
      }
      if (data.device_token) {
        setMobilePairToken(data.device_token);
        const qrPayload = data.pairing_payload || JSON.stringify({
          hub: 'jarvis-hub',
          v: '3.0.1',
          url: data.server_url || mobileDiscovery?.server_url || window.location.origin,
          token: data.device_token,
          device_name: mobilePairDeviceName.trim(),
        });
        const qrUrl = await QRCode.toDataURL(qrPayload, {
          width: 240,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        });
        setMobilePairQr(qrUrl);
        notify('QR Code de pareamento gerado.', 'success');
      }
    } catch (err: any) {
      notify(err.message || 'Falha ao emparelhar dispositivo', 'error');
    } finally {
      setMobilePairLoading(false);
    }
  };

  // Carrega configurações persistidas do localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(getAccountStorageKey('jarvis_openbot_general_settings'));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.sendShortcut) setSendShortcut(parsed.sendShortcut);
        if (parsed.orderConversations) setOrderConversations(parsed.orderConversations);
        if (typeof parsed.showAgentSteps === 'boolean') setShowAgentSteps(parsed.showAgentSteps);
        if (typeof parsed.compactMessageActions === 'boolean') setCompactMessageActions(parsed.compactMessageActions);
        if (parsed.openExternalLinksIn) setOpenExternalLinksIn(parsed.openExternalLinksIn);
        if (typeof parsed.linkTelemetryToAccount === 'boolean') setLinkTelemetryToAccount(parsed.linkTelemetryToAccount);
        if (typeof parsed.vadPauseSeconds === 'number') setVadPauseSeconds(parsed.vadPauseSeconds);
      }
      const savedRail = localStorage.getItem(getAccountStorageKey('jarvis_rail_agents_mode')) as any;
      if (savedRail && ['auto', 'always', 'never'].includes(savedRail)) {
        setRailAgentsMode(savedRail);
      }
    } catch {}
  }, []);

  const handleRailAgentsModeChange = (mode: 'auto' | 'always' | 'never') => {
    setRailAgentsMode(mode);
    try {
      localStorage.setItem(getAccountStorageKey('jarvis_rail_agents_mode'), mode);
      window.dispatchEvent(new Event('jarvis_rail_agents_mode_changed'));
    } catch {}
    notify(
      `Modo de especialistas definido para: ${
        mode === 'auto' ? 'Automático' : mode === 'always' ? 'Seção Separada' : 'Modo Limpo'
      }`,
      'info',
    );
  };

  const saveGeneralSettings = (updates: Record<string, any>) => {
    try {
      const current = {
        sendShortcut,
        orderConversations,
        showAgentSteps,
        compactMessageActions,
        openExternalLinksIn,
        linkTelemetryToAccount,
        vadPauseSeconds,
        ...updates,
      };
      localStorage.setItem(getAccountStorageKey('jarvis_openbot_general_settings'), JSON.stringify(current));
    } catch {}
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const cleanName = normalizeAssistantName(profile.assistantName);
      await identity.updateIdentityProfile({
        ...profile,
        assistantName: cleanName,
      });
      notify(`Perfil e identidade de ${cleanName} salvos com sucesso.`, 'success');
    } catch (e: any) {
      notify(`Erro ao salvar perfil: ${e.message}`, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch('/health', { credentials: 'include' })
      .then((res) => {
        if (!cancelled) setApiHealthy(res.ok);
      })
      .catch(() => {
        if (!cancelled) setApiHealthy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTestApi = async () => {
    setTestingApi(true);
    try {
      const res = await fetch('/health', { credentials: 'include' });
      setApiHealthy(res.ok);
      if (res.ok) {
        notify('Comunicação com a API FastAPI confirmada: Operacional (200 OK).', 'success');
      } else {
        notify(`A API respondeu com status ${res.status}`, 'warning');
      }
    } catch (e: any) {
      setApiHealthy(false);
      notify(`Erro ao conectar à API: ${e.message}`, 'error');
    } finally {
      setTestingApi(false);
    }
  };

  const handleTestOllama = async () => {
    setTestingOllama(true);
    try {
      const res = await fetch('/api/v1/models', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify(data.detail || 'Ollama local indisponível ou em fallback.', 'warning');
        return;
      }
      const installed = Array.isArray(data.models) ? data.models.length : 0;
      const gateway = data.hybrid_gateway || {};
      const route = gateway.enabled ? `${gateway.provider} · ${gateway.model}` : 'Ollama local';
      notify(
        installed > 0
          ? `Runtime local respondendo — ${installed} modelo(s) instalado(s). Rota ativa: ${route}.`
          : `Runtime local respondendo, mas nenhum modelo instalado. Rota ativa: ${route}.`,
        installed > 0 ? 'success' : 'warning',
      );
    } catch {
      notify('Não foi possível conectar ao Ollama local.', 'warning');
    } finally {
      setTestingOllama(false);
    }
  };

  const handleBackupDb = async () => {
    setBackingUpDb(true);
    try {
      const res = await fetch('/api/v1/system/backup', { method: 'POST', credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        notify(`Backup do banco SQLite gerado com sucesso: ${data.backup_path || 'data/backups'}`, 'success');
      } else {
        notify(data.detail || 'Não foi possível gerar backup.', 'error');
      }
    } catch (e: any) {
      notify(`Erro ao gerar backup: ${e.message}`, 'error');
    } finally {
      setBackingUpDb(false);
    }
  };

  const handleExportDiagnostics = async () => {
    try {
      const response = await fetch('/api/v1/system/health/details', { credentials: 'include' });
      const details = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(details.detail || `O servidor respondeu ${response.status}`);
      }
      const report = {
        timestamp: new Date().toISOString(),
        source: '/api/v1/system/health/details',
        health: details,
      };
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jarvis-server-diagnostics-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify('Diagnóstico real do servidor exportado com sucesso.', 'success');
    } catch (e: any) {
      notify(`Não foi possível exportar o diagnóstico: ${e.message}`, 'error');
    }
  };

  const handleCheckUpdates = () => {
    setCheckingUpdates(false);
    notify(
      'A verificação de atualizações ainda não está disponível nesta instalação. Consulte o repositório para obter a versão mais recente.',
      'warning',
    );
  };

  const renderToggle = (checked: boolean, onToggle: () => void, ariaLabel: string) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onToggle}
      className={`jarvis-switch ${checked ? 'is-checked' : ''}`}
    >
      <span className="jarvis-switch__thumb" />
    </button>
  );

  const renderPolicyStatus = (label: string) => (
    <span
      style={{
        fontSize: '0.76rem',
        fontWeight: 600,
        color: '#4ade80',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );

  const MENU_SECTIONS = [
    {
      title: 'Preferências',
      items: [
        { id: 'general', label: 'Geral', icon: Settings },
        { id: 'appearance', label: 'Aparência', icon: Palette },
        { id: 'notifications', label: 'Notificações', icon: Bell },
        { id: 'voice', label: 'Voz', icon: Mic },
      ],
    },
    {
      title: 'Conta',
      items: [
        { id: 'profile', label: 'Perfil', icon: User },
        { id: 'billing', label: 'Cobrança', icon: CreditCard },
        { id: 'mobile', label: 'Conectar celular', icon: Smartphone },
      ],
    },
    {
      title: 'Este computador',
      items: [
        { id: 'providers', label: 'Provedores de IA', icon: Cpu },
        { id: 'behavior', label: 'Comportamento do app', icon: Power },
        { id: 'island', label: 'Dynamic Island', icon: Layers },
        { id: 'dock', label: 'Dock de agentes', icon: Sparkles },
        { id: 'computer', label: 'Uso do computador', icon: Cpu },
        { id: 'updates', label: 'Atualizações', icon: RefreshCw },
      ],
    },
  ];

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleSections = MENU_SECTIONS.map((sec) => ({
    ...sec,
    items: sec.items.filter(
      (item) => !normalizedSearch || item.label.toLowerCase().includes(normalizedSearch),
    ),
  })).filter((sec) => sec.items.length > 0);

  return (
    <div className="jarvis-settings-layout">
      {/* Sub-painel Esquerdo: Navegação de Configurações */}
      <aside className="jarvis-settings-nav" aria-label="Menu de configurações">
        <div className="jarvis-settings-nav__header">
          <h2 className="jarvis-settings-nav__title">Configurações</h2>

          <div className="jarvis-search-box">
            <Search size={13} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar seções..."
              aria-label="Filtrar seções de configurações"
              className="jarvis-search-box__input"
              style={{ fontSize: '0.8rem', padding: '5px 0' }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="btn btn-ghost btn-icon-sm"
                aria-label="Limpar busca"
                style={{ width: '22px', height: '22px', padding: 0 }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        <nav className="jarvis-settings-nav__list">
          {visibleSections.length === 0 ? (
            <div style={{ padding: '12px 10px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Nenhuma seção encontrada para "{searchTerm}".
            </div>
          ) : (
            visibleSections.map((sec) => (
              <div key={sec.title} className="jarvis-settings-nav__group">
                <div className="jarvis-settings-nav__group-title">{sec.title}</div>
                {sec.items.map((item) => {
                  const isActive = activeSubTab === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveSubTab(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`jarvis-subnav-btn ${isActive ? 'is-active' : ''}`}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '9px' }}>
                        <Icon size={15} color={isActive ? 'var(--accent-light)' : 'var(--text-muted)'} />
                        <span>{item.label}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </nav>

        <div className="jarvis-settings-nav__footer">
          <button
            type="button"
            onClick={() => setActiveSubTab('server')}
            aria-current={activeSubTab === 'server' ? 'page' : undefined}
            className={`jarvis-subnav-btn ${activeSubTab === 'server' ? 'is-active' : ''}`}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
              <Server
                size={15}
                color={activeSubTab === 'server' ? 'var(--accent-light)' : 'var(--text-muted)'}
                style={{ flexShrink: 0 }}
              />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Servidor & Diagnóstico
              </span>
            </span>
            <ChevronRight size={13} color="var(--text-muted)" />
          </button>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <main className="jarvis-settings-content">
        <div className="jarvis-settings-container">
          {/* ================================================================= */}
          {/* ABA: GERAL                                                        */}
          {/* ================================================================= */}
          {activeSubTab === 'general' && (
            <>
              <PageHeader
                icon={<Settings size={18} />}
                title="Geral"
                subtitle="Comportamento padrão das conversas, atalhos de envio e privacidade neste dispositivo."
              />

              <section className="jarvis-settings-section">
                <h3 className="jarvis-settings-section__title">Conversas</h3>
                <div className="jarvis-settings-card">
                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Atalho de envio</div>
                      <div className="jarvis-setting-row__desc">
                        Escolha as teclas que enviam uma mensagem neste dispositivo e navegador.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      <select
                        aria-label="Atalho de envio"
                        value={sendShortcut}
                        onChange={(e) => {
                          const val = e.target.value as 'enter' | 'ctrl_enter';
                          setSendShortcut(val);
                          saveGeneralSettings({ sendShortcut: val });
                        }}
                        className="jarvis-select"
                        style={{ width: 'auto', minWidth: '190px' }}
                      >
                        <option value="enter">Enter para enviar</option>
                        <option value="ctrl_enter">Ctrl + Enter para enviar</option>
                      </select>
                    </div>
                  </div>

                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Ordenar conversas</div>
                      <div className="jarvis-setting-row__desc">
                        Define como a barra lateral ordena as conversas neste dispositivo. Manual e Atividade recente desativam o grupo Não lidas.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      <select
                        aria-label="Ordenar conversas"
                        value={orderConversations}
                        onChange={(e) => {
                          const val = e.target.value as 'unread_group' | 'recent' | 'manual';
                          setOrderConversations(val);
                          saveGeneralSettings({ orderConversations: val });
                        }}
                        className="jarvis-select"
                        style={{ width: 'auto', minWidth: '190px' }}
                      >
                        <option value="unread_group">Não lidas em um grupo</option>
                        <option value="recent">Atividade recente</option>
                        <option value="manual">Manual</option>
                      </select>
                    </div>
                  </div>

                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Mostrar etapas do agente</div>
                      <div className="jarvis-setting-row__desc">
                        Expande por padrão o raciocínio, as chamadas de ferramentas e as mudanças de memória de cada turno.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      {renderToggle(
                        showAgentSteps,
                        () => {
                          const next = !showAgentSteps;
                          setShowAgentSteps(next);
                          saveGeneralSettings({ showAgentSteps: next });
                        },
                        'Mostrar etapas do agente',
                      )}
                    </div>
                  </div>

                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Ações de mensagem compactas</div>
                      <div className="jarvis-setting-row__desc">
                        Mostra Reagir, Responder e Mais ao lado da mensagem, com horário condensado entre turnos.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      {renderToggle(
                        compactMessageActions,
                        () => {
                          const next = !compactMessageActions;
                          setCompactMessageActions(next);
                          saveGeneralSettings({ compactMessageActions: next });
                        },
                        'Ações de mensagem compactas',
                      )}
                    </div>
                  </div>

                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Abrir links externos em</div>
                      <div className="jarvis-setting-row__desc">
                        Define o destino padrão para links de chats, documentação e páginas externas.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      <select
                        aria-label="Abrir links externos em"
                        value={openExternalLinksIn}
                        onChange={(e) => {
                          const val = e.target.value as 'default_browser' | 'embedded';
                          setOpenExternalLinksIn(val);
                          saveGeneralSettings({ openExternalLinksIn: val });
                        }}
                        className="jarvis-select"
                        style={{ width: 'auto', minWidth: '190px' }}
                      >
                        <option value="default_browser">Navegador padrão</option>
                        <option value="embedded">Navegador embutido</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              <section className="jarvis-settings-section">
                <h3 className="jarvis-settings-section__title">Permissões & Privacidade</h3>
                <div className="jarvis-settings-card">
                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Vincular telemetria à minha conta</div>
                      <div className="jarvis-setting-row__desc">
                        Ativado: os metadados de uso e confiabilidade são associados à sua conta local no JARVIS AI Hub, incluindo ferramentas acionadas e resumo diário. Desativado: apenas métricas básicas de turnos e tokens são registradas de forma anônima.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      {renderToggle(
                        linkTelemetryToAccount,
                        () => {
                          const next = !linkTelemetryToAccount;
                          setLinkTelemetryToAccount(next);
                          saveGeneralSettings({ linkTelemetryToAccount: next });
                        },
                        'Vincular telemetria à minha conta',
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ================================================================= */}
          {/* ABA: PERFIL DA CONTA                                              */}
          {/* ================================================================= */}
          {activeSubTab === 'profile' && (
            <>
              <PageHeader
                icon={<User size={18} />}
                title="Perfil & Identidade do Assistente"
                subtitle="Personalize seu nome, como chamar o assistente por voz e o estilo ideal de resposta."
                actions={
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="btn btn-primary btn-sm"
                  >
                    <Save size={14} />
                    <span>{savingProfile ? 'Salvando…' : 'Salvar Perfil'}</span>
                  </button>
                }
              />

              {/* Cartão Resumo + Prévia de Voz */}
              <section
                className="jarvis-settings-card"
                style={{
                  background: 'linear-gradient(135deg, rgba(249,115,22,0.11) 0%, rgba(17,22,33,0.95) 68%)',
                  borderColor: 'var(--border-accent)',
                }}
              >
                <div className="jarvis-setting-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div
                      style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '14px',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.55rem',
                        flexShrink: 0,
                      }}
                    >
                      {profile.avatarIcon || '🙂'}
                    </div>
                    <div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {profile.displayName || 'Usuário'}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Assistente ativo:{' '}
                        <strong style={{ color: 'var(--accent-light)' }}>
                          {normalizeAssistantName(profile.assistantName)}
                        </strong>{' '}
                        · {identity.experienceMode === 'simple' ? 'Modo Dia a Dia' : 'Modo Avançado'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                        Comando de voz: &ldquo;Ei {normalizeAssistantName(profile.assistantName)}, como posso ajudar?&rdquo;
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const clean = normalizeAssistantName(profile.assistantName);
                      try {
                        if ('speechSynthesis' in window) {
                          window.speechSynthesis.cancel();
                          const utter = new SpeechSynthesisUtterance(`Oi! Aqui é ${clean}. Como posso ajudar você hoje?`);
                          utter.lang = 'pt-BR';
                          window.speechSynthesis.speak(utter);
                        } else {
                          notify(`Prévia: "Ei ${clean}, como posso ajudar?"`, 'info');
                        }
                      } catch {
                        notify(`Prévia: "Ei ${clean}, como posso ajudar?"`, 'info');
                      }
                    }}
                    className="btn btn-secondary btn-sm"
                  >
                    <Volume2 size={14} color="var(--accent-light)" />
                    <span>Ouvir saudação</span>
                  </button>
                </div>
              </section>

              <section className="jarvis-settings-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label className="user-profile-field-label" htmlFor="settings-assistant-name">
                    Nome do seu Assistente Principal
                  </label>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
                    Escolha o nome que você quer falar para chamar o assistente (ex.: JARVIS, Luna, Maria, João).
                  </p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    {ASSISTANT_NAME_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          setProfile((prev) => ({ ...prev, assistantName: preset.name }));
                          void identity.setAssistantName(preset.name);
                          notify(`Assistente renomeado para ${preset.name}.`, 'success');
                        }}
                        className={`btn btn-xs ${
                          normalizeAssistantName(profile.assistantName) === preset.name
                            ? 'btn-secondary is-active'
                            : 'btn-ghost'
                        }`}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <input
                      id="settings-assistant-name"
                      type="text"
                      maxLength={40}
                      value={profile.assistantName || DEFAULT_ASSISTANT_NAME}
                      onChange={(e) => setProfile({ ...profile, assistantName: e.target.value })}
                      className="jarvis-input"
                      style={{ flex: 1, minWidth: '200px' }}
                      placeholder="Ex: JARVIS, Luna, João, Maria..."
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const clean = normalizeAssistantName(profile.assistantName);
                        void identity.setAssistantName(clean);
                        notify(`Assistente renomeado para ${clean}.`, 'success');
                      }}
                      className="btn btn-secondary btn-sm"
                    >
                      Aplicar nome
                    </button>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
                  <label className="user-profile-field-label">Modo de Uso do Hub</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                    {[
                      {
                        id: 'simple' as const,
                        label: 'Modo Dia a Dia (Simples e Intuitivo)',
                        desc: 'Interface limpa com Início, Conversas, Meus Agentes, Fluxos, Tarefas e Cadernos.',
                      },
                      {
                        id: 'engineering' as const,
                        label: 'Modo Avançado (Engenharia & Segurança)',
                        desc: 'Acesso completo a Coding Agent, Estúdios, Governança e diagnósticos.',
                      },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        aria-pressed={identity.experienceMode === opt.id}
                        onClick={() => {
                          setProfile((prev) => ({ ...prev, experienceMode: opt.id }));
                          void identity.setExperienceMode(opt.id);
                          notify(
                            opt.id === 'simple'
                              ? 'Modo Dia a Dia (Simples) ativado.'
                              : 'Modo Avançado (Engenharia) ativado.',
                            'info',
                          );
                        }}
                        className={`jarvis-choice-card ${identity.experienceMode === opt.id ? 'is-active' : ''}`}
                      >
                        <div style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* Voz & Preferências de Resposta */}
              <section className="jarvis-settings-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="jarvis-setting-row">
                  <div className="jarvis-setting-row__info">
                    <div className="jarvis-setting-row__title">
                      Ouvir &ldquo;Ei {normalizeAssistantName(profile.assistantName)}&rdquo; automaticamente
                    </div>
                    <div className="jarvis-setting-row__desc">
                      Permite chamar seu assistente por voz sem precisar clicar no botão do microfone.
                    </div>
                  </div>
                  <div className="jarvis-setting-row__control">
                    {renderToggle(
                      wakeWordEnabled,
                      () => {
                        const next = !wakeWordEnabled;
                        setWakeWordEnabled(next);
                        setWakeWordEnabledPref(next);
                        notify(
                          next
                            ? `Escuta mãos-livres ativada para "Ei ${normalizeAssistantName(profile.assistantName)}".`
                            : 'Escuta mãos-livres pausada.',
                          'info',
                        );
                      },
                      'Ativar escuta contínua por nome',
                    )}
                  </div>
                </div>

                <div className="jarvis-setting-row" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                  <div className="jarvis-setting-row__info">
                    <div className="jarvis-setting-row__title">Responder falando em voz alta</div>
                    <div className="jarvis-setting-row__desc">
                      Reproduz as respostas em áudio automaticamente durante conversas por voz.
                    </div>
                  </div>
                  <div className="jarvis-setting-row__control">
                    {renderToggle(
                      autoSpeakEnabled,
                      () => {
                        const next = !autoSpeakEnabled;
                        setAutoSpeakEnabled(next);
                        setVoiceAutoSpeakPref(next);
                      },
                      'Ativar resposta falada automática',
                    )}
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                  <label className="user-profile-field-label">Estilo de resposta preferido</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '8px' }}>
                    {[
                      { id: 'concise' as const, label: 'Direto ao ponto', desc: 'Curto, claro e prático.' },
                      { id: 'educational' as const, label: 'Explicativo', desc: 'Didático com exemplos simples.' },
                      { id: 'detailed' as const, label: 'Passo a passo', desc: 'Completo e bem detalhado.' },
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        aria-pressed={profile.responseStyle === st.id}
                        onClick={() => setProfile((prev) => ({ ...prev, responseStyle: st.id }))}
                        className={`jarvis-choice-card ${profile.responseStyle === st.id ? 'is-active' : ''}`}
                      >
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{st.label}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{st.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* Seus Dados Pessoais & Contexto */}
              <section className="jarvis-settings-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="user-profile-grid">
                  <div>
                    <label className="user-profile-field-label" htmlFor="settings-display-name">
                      Seu nome
                    </label>
                    <input
                      id="settings-display-name"
                      type="text"
                      value={profile.displayName}
                      onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                      className="jarvis-input"
                      placeholder="Ex: Ana Souza"
                    />
                  </div>

                  <div>
                    <label className="user-profile-field-label" htmlFor="settings-role-title">
                      Seu foco principal (opcional)
                    </label>
                    <input
                      id="settings-role-title"
                      type="text"
                      value={profile.roleTitle}
                      onChange={(e) => setProfile({ ...profile, roleTitle: e.target.value })}
                      className="jarvis-input"
                      placeholder="Ex: Estudos, Negócios, Casa ou Tecnologia"
                    />
                  </div>
                </div>

                <div>
                  <label className="user-profile-field-label" htmlFor="settings-user-bg">
                    Sobre você e sua rotina (opcional)
                  </label>
                  <textarea
                    id="settings-user-bg"
                    value={profile.userBackground}
                    onChange={(e) => setProfile({ ...profile, userBackground: e.target.value })}
                    rows={2}
                    className="jarvis-textarea"
                    style={{ resize: 'vertical' }}
                    placeholder="Ex: Quero organizar finanças da casa, estudar inglês e criar planilhas rapidamente."
                  />
                </div>

                <div>
                  <label className="user-profile-field-label" htmlFor="settings-guidelines">
                    Preferências extras de resposta (opcional)
                  </label>
                  <textarea
                    id="settings-guidelines"
                    value={profile.responseGuidelines}
                    onChange={(e) => setProfile({ ...profile, responseGuidelines: e.target.value })}
                    rows={2}
                    className="jarvis-textarea"
                    style={{ resize: 'vertical' }}
                    placeholder="Ex: Evite termos complicados e destaque sempre os próximos passos."
                  />
                </div>
              </section>
            </>
          )}

          {/* ================================================================= */}
          {/* ABA: CONECTAR CELULAR                                             */}
          {/* ================================================================= */}
          {activeSubTab === 'mobile' && (
            <>
              <PageHeader
                icon={<Smartphone size={18} />}
                title="Conectar Celular & Dispositivos Móveis"
                subtitle="Conecte seu smartphone Android via QR Code instantâneo ou descoberta automática na rede local (LAN)."
              />

              {/* Status da Rede Local */}
              <section className="jarvis-settings-card">
                <div className="jarvis-setting-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '220px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: 'var(--radius-md)',
                        background: mobileDiscovery?.server_url ? 'var(--success-soft)' : 'var(--bg-tertiary)',
                        border: `1px solid ${
                          mobileDiscovery?.server_url ? 'rgba(34, 197, 94, 0.25)' : 'var(--border-color)'
                        }`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Wifi size={18} color={mobileDiscovery?.server_url ? '#4ade80' : 'var(--text-muted)'} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                          Servidor JARVIS Hub na Rede Local
                        </strong>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            color: mobileDiscovery?.server_url ? '#4ade80' : '#f87171',
                          }}
                        >
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: mobileDiscovery?.server_url ? '#22c55e' : '#ef4444',
                            }}
                          />
                          {mobileDiscovery?.server_url ? 'Online' : 'Indisponível'}
                        </span>
                      </div>
                      <div className="jarvis-setting-row__desc">
                        {mobileDiscovery?.server_url
                          ? `Beacon UDP ativo na porta ${mobileDiscovery.udp_beacon_port} · Descoberta por broadcast na LAN`
                          : 'Descoberta automática indisponível. Utilize o pareamento por QR Code abaixo.'}
                      </div>
                    </div>
                  </div>

                  {mobileDiscovery?.server_url && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(mobileDiscovery.server_url);
                        notify('URL do servidor copiada.', 'success');
                      }}
                      className="btn btn-secondary btn-sm"
                    >
                      <Copy size={14} />
                      <span>Copiar URL</span>
                    </button>
                  )}
                </div>

                <div
                  className="jarvis-tabular"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                    gap: '10px',
                  }}
                >
                  <div className="jarvis-settings-subcard">
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      IP na Rede Local (LAN)
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.84rem', marginTop: '3px', display: 'block' }}>
                      {mobileDiscovery?.local_ip || '—'}
                    </span>
                  </div>
                  <div className="jarvis-settings-subcard">
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Porta API REST & WS
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.84rem', marginTop: '3px', display: 'block' }}>
                      {mobileDiscovery?.api_port ?? '—'}
                    </span>
                  </div>
                  <div className="jarvis-settings-subcard">
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Descoberta UDP
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        color: mobileDiscovery ? '#4ade80' : '#f87171',
                        fontSize: '0.84rem',
                        marginTop: '3px',
                        display: 'block',
                      }}
                    >
                      {mobileDiscovery ? `Porta ${mobileDiscovery.udp_beacon_port} (Ativo)` : 'Indisponível'}
                    </span>
                  </div>
                </div>
              </section>

              {/* Pareamento Instantâneo via QR Code */}
              <section className="jarvis-settings-card" style={{ gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--accent-soft)',
                      border: '1px solid var(--border-accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <QrCode size={18} color="var(--accent-light)" />
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)', display: 'block' }}>
                      Pareamento por QR Code Instantâneo
                    </strong>
                    <span className="jarvis-setting-row__desc">
                      Conecte o aplicativo do celular sem precisar digitar IP nem tokens longos manualmente.
                    </span>
                  </div>
                </div>

                {!mobilePairQr ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ maxWidth: '400px' }}>
                      <label className="user-profile-field-label" htmlFor="mobile-device-name">
                        Identificação do Smartphone
                      </label>
                      <input
                        id="mobile-device-name"
                        type="text"
                        value={mobilePairDeviceName}
                        onChange={(e) => setMobilePairDeviceName(e.target.value)}
                        placeholder="Ex: Samsung Galaxy S24, Pixel 8..."
                        className="jarvis-input"
                      />
                    </div>

                    <div>
                      <button
                        type="button"
                        disabled={mobilePairLoading}
                        onClick={handleGenerateMobilePair}
                        className="btn btn-primary btn-sm"
                      >
                        <QrCode size={15} />
                        <span>{mobilePairLoading ? 'Gerando Pareamento…' : 'Gerar QR Code de Pareamento'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="jarvis-settings-subcard"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '16px',
                      padding: '20px',
                      textAlign: 'center',
                    }}
                  >
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', maxWidth: '480px', margin: 0 }}>
                      Aponte o app JARVIS Mobile para a tela ou use{' '}
                      <strong style={{ color: 'var(--text-primary)' }}>"Parear via QR Code"</strong> no celular.
                    </p>

                    <div
                      style={{
                        background: '#ffffff',
                        padding: '12px',
                        borderRadius: '12px',
                        display: 'inline-block',
                      }}
                    >
                      <img
                        src={mobilePairQr}
                        alt="QR Code de Pareamento JARVIS"
                        style={{ width: '210px', height: '210px', display: 'block' }}
                      />
                    </div>

                    <div style={{ width: '100%', maxWidth: '500px', textAlign: 'left' }}>
                      <label className="user-profile-field-label" htmlFor="mobile-pair-token">
                        Token de Pareamento Gerado (Cópia Manual)
                      </label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          id="mobile-pair-token"
                          readOnly
                          value={mobilePairToken}
                          className="jarvis-input"
                          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--accent-light)' }}
                          onFocus={(e) => e.currentTarget.select()}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(mobilePairToken);
                            setMobilePairCopied(true);
                            notify('Token copiado para a área de transferência.', 'success');
                            setTimeout(() => setMobilePairCopied(false), 2000);
                          }}
                          className={`btn btn-sm ${mobilePairCopied ? 'btn-success' : 'btn-secondary'}`}
                          style={{ flexShrink: 0 }}
                        >
                          {mobilePairCopied ? <Check size={14} /> : <Copy size={14} />}
                          <span>{mobilePairCopied ? 'Copiado' : 'Copiar'}</span>
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setMobilePairQr('');
                        setMobilePairToken('');
                      }}
                      className="btn btn-ghost btn-xs"
                    >
                      Gerar outro QR Code
                    </button>
                  </div>
                )}

                <div
                  className="jarvis-setting-row"
                  style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}
                >
                  <div className="jarvis-setting-row__desc" style={{ marginTop: 0 }}>
                    Precisa gerenciar dispositivos conectados à sua conta ou revogar tokens?
                  </div>
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('jarvis:open-android-pairing'))}
                    className="btn btn-secondary btn-sm"
                  >
                    Abrir Modal de Dispositivos
                  </button>
                </div>
              </section>
            </>
          )}

          {/* ================================================================= */}
          {/* ABA: VOZ & DITADO                                                 */}
          {/* ================================================================= */}
          {activeSubTab === 'voice' && (
            <>
              <PageHeader
                icon={<Mic size={18} />}
                title="Configurações de Voz"
                subtitle="Ajuste os modelos de reconhecimento de fala (STT), síntese vocal (TTS) e sensibilidade VAD."
              />

              <section className="jarvis-settings-card" style={{ gap: '18px' }}>
                <div>
                  <label className="user-profile-field-label" htmlFor="voice-stt-model">
                    Modelo de Ditado (STT)
                  </label>
                  <select
                    id="voice-stt-model"
                    value={sttModel}
                    onChange={(e) => setSttModel(e.target.value)}
                    className="jarvis-select"
                  >
                    <option value="Parakeet TDT 0.6B v3 (Local Rápido)">Parakeet TDT 0.6B v3 (Local Rápido - 25 idiomas)</option>
                    <option value="Whisper Base (Local)">Whisper Base (Local - Baixo uso de memória)</option>
                    <option value="Whisper Medium (Alta Precisão)">Whisper Medium (Alta Precisão)</option>
                  </select>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label
                      htmlFor="voice-vad-pause"
                      style={{ fontSize: '0.84rem', color: 'var(--text-primary)', fontWeight: 500 }}
                    >
                      Pausa antes de enviar
                    </label>
                    <span
                      className="jarvis-tabular"
                      style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-light)', fontWeight: 600 }}
                    >
                      {vadPauseSeconds.toFixed(1)} s
                    </span>
                  </div>
                  <p className="jarvis-setting-row__desc" style={{ margin: '0 0 8px 0' }}>
                    Em uma conversa por voz, o assistente envia suas palavras quando você para de falar por esse tempo.
                  </p>
                  <input
                    id="voice-vad-pause"
                    type="range"
                    min="0.5"
                    max="3.0"
                    step="0.1"
                    value={vadPauseSeconds}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setVadPauseSeconds(val);
                      saveGeneralSettings({ vadPauseSeconds: val });
                    }}
                    style={{ width: '100%', accentColor: 'var(--accent-color)' }}
                  />
                </div>

                <div>
                  <label className="user-profile-field-label" htmlFor="voice-tts-model">
                    Modelo de Resposta Falada (TTS)
                  </label>
                  <select
                    id="voice-tts-model"
                    value={ttsModel}
                    onChange={(e) => setTtsModel(e.target.value)}
                    className="jarvis-select"
                  >
                    <option value="Supertonic 3 (Local)">Supertonic 3 (Local - Leitura natural multilingue)</option>
                    <option value="Kokoro TTS (Local)">Kokoro TTS (Voz expressiva ultraleve)</option>
                    <option value="WebSpeech API (Navegador)">WebSpeech API Nativa do Navegador</option>
                  </select>
                </div>

                <div
                  className="jarvis-setting-row"
                  style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}
                >
                  <div className="jarvis-setting-row__info">
                    <div className="jarvis-setting-row__title">Ler respostas em voz alta</div>
                    <div className="jarvis-setting-row__desc">
                      O JARVIS reproduzirá a fala automaticamente ao término da resposta gerada.
                    </div>
                  </div>
                  <div className="jarvis-setting-row__control">
                    {renderToggle(ttsEnabled, () => setTtsEnabled(!ttsEnabled), 'Ler respostas em voz alta')}
                  </div>
                </div>

                <div className="jarvis-setting-row" style={{ alignItems: 'flex-end' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <label className="user-profile-field-label" htmlFor="voice-selector">
                      Voz do Assistente
                    </label>
                    <select
                      id="voice-selector"
                      value={selectedVoice}
                      onChange={(e) => setSelectedVoice(e.target.value)}
                      className="jarvis-select"
                    >
                      <option value="female_1">Voz feminina 1 (Suave)</option>
                      <option value="male_1">Voz masculina 1 (Grave)</option>
                      <option value="neutral_1">Voz neutra (Equilibrada)</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if ('speechSynthesis' in window) {
                        window.speechSynthesis.cancel();
                        const utt = new SpeechSynthesisUtterance(
                          'Olá! Esta é uma demonstração da voz configurada no JARVIS.',
                        );
                        utt.lang = 'pt-BR';
                        utt.rate = speechSpeed;
                        setIsPlayingVoice(true);
                        utt.onend = () => setIsPlayingVoice(false);
                        utt.onerror = () => setIsPlayingVoice(false);
                        window.speechSynthesis.speak(utt);
                      } else {
                        notify('Navegador não suporta síntese de áudio.', 'warning');
                      }
                    }}
                    disabled={isPlayingVoice}
                    className="btn btn-secondary btn-sm"
                  >
                    <Volume2 size={14} />
                    <span>{isPlayingVoice ? 'Reproduzindo…' : 'Ouvir Demonstração'}</span>
                  </button>
                </div>

                <div className="jarvis-setting-row">
                  <div className="jarvis-setting-row__info">
                    <div className="jarvis-setting-row__title">Velocidade da Fala</div>
                    <div className="jarvis-setting-row__desc">
                      Ajuste o ritmo de reprodução da síntese vocal nas respostas.
                    </div>
                  </div>
                  <div className="jarvis-segmented" role="group" aria-label="Velocidade da fala">
                    {[1.0, 1.25, 1.5].map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        onClick={() => setSpeechSpeed(speed)}
                        className={`jarvis-segmented-btn jarvis-tabular ${speechSpeed === speed ? 'is-active' : ''}`}
                        aria-pressed={speechSpeed === speed}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ================================================================= */}
          {/* ABA: PROVEDORES DE IA                                             */}
          {/* ================================================================= */}
          {activeSubTab === 'providers' && (
            <>
              <PageHeader
                icon={<Cpu size={18} />}
                title="Provedores de IA & Modelos"
                subtitle="Gerencie os provedores conectados, modelos locais instalados e chaves de APIs na nuvem."
                actions={
                  onNavigate ? (
                    <button
                      type="button"
                      onClick={() => onNavigate('models')}
                      className="btn btn-secondary btn-sm"
                    >
                      <span>Abrir Gestor de Modelos</span>
                    </button>
                  ) : undefined
                }
              />

              <section className="jarvis-settings-card">
                <div className="jarvis-setting-row">
                  <div className="jarvis-setting-row__info">
                    <div className="jarvis-setting-row__title">Provedor Padrão de Inferência</div>
                    <div className="jarvis-setting-row__desc">
                      Utilizado para orquestração automática e conversas do chat.
                    </div>
                  </div>
                  <div
                    className="jarvis-settings-subcard"
                    style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '8px 12px' }}
                  >
                    Configurado por conta em Modelos → Rotas de Agentes
                  </div>
                </div>
              </section>

              <section className="jarvis-settings-section">
                <h3 className="jarvis-settings-section__title">Runtimes Locais</h3>
                <div className="jarvis-settings-card">
                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">OpenCode CLI</div>
                      <div className="jarvis-setting-row__desc">
                        Disponível neste computador · Motor local integrado
                      </div>
                    </div>
                    <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#4ade80' }}>
                      Integrado
                    </span>
                  </div>

                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Ollama Local Daemon</div>
                      <div className="jarvis-setting-row__desc">
                        <code>http://localhost:11434</code> · Modelos locais configurados no Gestor de Modelos
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleTestOllama}
                      disabled={testingOllama}
                      className="btn btn-secondary btn-xs"
                    >
                      {testingOllama ? 'Verificando…' : 'Verificar Runtime'}
                    </button>
                  </div>
                </div>
              </section>

              <section className="jarvis-settings-section">
                <h3 className="jarvis-settings-section__title">Chaves de Provedores (KeyVault)</h3>
                <KeyVaultManager />
              </section>
            </>
          )}

          {/* ================================================================= */}
          {/* ABA: DYNAMIC ISLAND & DOCK DE AGENTES                             */}
          {/* ================================================================= */}
          {(activeSubTab === 'island' || activeSubTab === 'dock') && (
            <>
              <PageHeader
                icon={activeSubTab === 'island' ? <Layers size={18} /> : <Sparkles size={18} />}
                title={activeSubTab === 'island' ? 'Dynamic Island' : 'Dock de Agentes'}
                subtitle="Preferência aplicada em tempo real e sincronizada com a interface do painel."
              />

              <section className="jarvis-settings-card">
                <div className="jarvis-setting-row">
                  <div className="jarvis-setting-row__info">
                    <div className="jarvis-setting-row__title">
                      {activeSubTab === 'island' ? 'Ativar Dynamic Island' : 'Ativar Dock de Agentes'}
                    </div>
                    <div className="jarvis-setting-row__desc">
                      {activeSubTab === 'island'
                        ? 'Exibe a cápsula de status e telemetria rápida na barra superior do console.'
                        : 'Barra vertical lateral na extremidade direita com acesso rápido aos especialistas.'}
                    </div>
                  </div>
                  <div className="jarvis-setting-row__control">
                    {renderToggle(
                      activeSubTab === 'island' ? dynamicIslandEnabled : agentDockEnabled,
                      () => {
                        if (activeSubTab === 'island') handleToggleIsland();
                        else handleToggleDock();
                      },
                      activeSubTab === 'island' ? 'Ativar Dynamic Island' : 'Ativar Dock de Agentes',
                    )}
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ================================================================= */}
          {/* ABA: COMPORTAMENTO DO APP                                         */}
          {/* ================================================================= */}
          {activeSubTab === 'behavior' && (
            <>
              <PageHeader
                icon={<Power size={18} />}
                title="Comportamento do App"
                subtitle="Preferências do cliente desktop relacionadas ao arranque e execução em segundo plano."
              />

              <div className="jarvis-callout jarvis-callout--warning" role="note">
                Preferências do cliente desktop: o dashboard web não altera o arranque do sistema operacional nem o comportamento da bandeja.
              </div>

              <section className="jarvis-settings-card">
                <div className="jarvis-setting-row">
                  <div className="jarvis-setting-row__info">
                    <div className="jarvis-setting-row__title">Iniciar com o sistema</div>
                    <div className="jarvis-setting-row__desc">
                      Abre o JARVIS em segundo plano assim que o computador inicializar.
                    </div>
                  </div>
                  <div className="jarvis-setting-row__control">
                    {renderToggle(launchOnStartup, () => setLaunchOnStartup(!launchOnStartup), 'Iniciar com o sistema')}
                  </div>
                </div>

                <div className="jarvis-setting-row">
                  <div className="jarvis-setting-row__info">
                    <div className="jarvis-setting-row__title">Minimizar para a bandeja</div>
                    <div className="jarvis-setting-row__desc">
                      Ao fechar a janela, mantém o assistente e os nós em execução silenciosa.
                    </div>
                  </div>
                  <div className="jarvis-setting-row__control">
                    {renderToggle(minimizeToTray, () => setMinimizeToTray(!minimizeToTray), 'Minimizar para a bandeja')}
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ================================================================= */}
          {/* ABA: APARÊNCIA                                                    */}
          {/* ================================================================= */}
          {activeSubTab === 'appearance' && (
            <>
              <PageHeader
                icon={<Palette size={18} />}
                title="Aparência e Tema"
                subtitle="Controle elementos da interface em tempo real e pré-visualize paletas de tema."
              />

              <div className="jarvis-callout jarvis-callout--warning" role="note">
                Os controles de Dynamic Island, Dock de Agentes e Especialistas na Barra Lateral têm efeito imediato. Tema, cor de destaque e densidade são pré-visualizações locais nesta build.
              </div>

              <section className="jarvis-settings-section">
                <h3 className="jarvis-settings-section__title">Tema do Sistema</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
                  {[
                    { id: 'obsidian', name: 'Obsidian & Laranja JARVIS (Padrão)', desc: 'Fundo escuro fosco com alto contraste e acento laranja JARVIS', bg: '#0b0d12' },
                    { id: 'oled', name: 'OLED Puro', desc: 'Preto puro para monitores OLED e contraste máximo', bg: '#000000' },
                    { id: 'graphite', name: 'Cinza Grafite', desc: 'Tons de cinza neutro com transições suaves', bg: '#1e1e24' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setThemeMode(t.id as 'obsidian' | 'oled' | 'graphite')}
                      className={`jarvis-choice-card ${themeMode === t.id ? 'is-active' : ''}`}
                      aria-pressed={themeMode === t.id}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>{t.name}</span>
                        <span
                          style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '4px',
                            backgroundColor: t.bg,
                            border: '1px solid var(--border-hover)',
                            flexShrink: 0,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{t.desc}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="jarvis-settings-section">
                <h3 className="jarvis-settings-section__title">Cor de Destaque (Accent)</h3>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[
                    { id: 'orange', name: 'Laranja JARVIS', hex: '#f97316' },
                    { id: 'blue', name: 'Azul Cobalto', hex: '#3b82f6' },
                    { id: 'purple', name: 'Púrpura IA', hex: '#a855f7' },
                    { id: 'emerald', name: 'Esmeralda', hex: '#10b981' },
                  ].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setAccentColor(c.id as 'blue' | 'purple' | 'emerald' | 'orange')}
                      className={`btn btn-sm ${accentColor === c.id ? 'btn-secondary is-active' : 'btn-ghost'}`}
                      aria-pressed={accentColor === c.id}
                    >
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: c.hex,
                          flexShrink: 0,
                        }}
                      />
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="jarvis-settings-section">
                <h3 className="jarvis-settings-section__title">Superfície, Painéis & Densidade</h3>
                <div className="jarvis-settings-card">
                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Exibir Dynamic Island</div>
                      <div className="jarvis-setting-row__desc">
                        Cápsula superior com estado operacional e telemetria rápida.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      {renderToggle(dynamicIslandEnabled, handleToggleIsland, 'Exibir Dynamic Island')}
                    </div>
                  </div>

                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Exibir Dock de Agentes</div>
                      <div className="jarvis-setting-row__desc">
                        Rail lateral direito com atalho direto para os especialistas.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      {renderToggle(agentDockEnabled, handleToggleDock, 'Exibir Dock de Agentes')}
                    </div>
                  </div>

                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Especialistas na Barra Lateral do Chat</div>
                      <div className="jarvis-setting-row__desc">
                        Controla como os atalhos dos seus agentes ativos (incluindo os criados por você) aparecem na barra lateral do Chat.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      <select
                        aria-label="Especialistas na Barra Lateral do Chat"
                        value={railAgentsMode}
                        onChange={(e) => handleRailAgentsModeChange(e.target.value as 'auto' | 'always' | 'never')}
                        className="jarvis-select"
                        style={{ width: 'auto', minWidth: '230px' }}
                      >
                        <option value="auto">Automático (Ocultar ao ter conversas)</option>
                        <option value="always">Seção Separada (Abaixo de conversas)</option>
                        <option value="never">Modo Limpo (Não exibir especialistas)</option>
                      </select>
                    </div>
                  </div>

                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Desfoque Glassmorphism</div>
                      <div className="jarvis-setting-row__desc">
                        Aplica translucidez sutil em janelas modais e sobreposições.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      {renderToggle(glassmorphism, () => setGlassmorphism(!glassmorphism), 'Desfoque Glassmorphism')}
                    </div>
                  </div>

                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Animações Suaves</div>
                      <div className="jarvis-setting-row__desc">
                        Habilita transições sutis entre painéis e micro-interações.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      {renderToggle(smoothAnimations, () => setSmoothAnimations(!smoothAnimations), 'Animações Suaves')}
                    </div>
                  </div>

                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Densidade da Interface</div>
                      <div className="jarvis-setting-row__desc">
                        Controla o espaçamento entre cards, tabelas e mensagens do chat.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      <select
                        aria-label="Densidade da Interface"
                        value={uiDensity}
                        onChange={(e) => setUiDensity(e.target.value as 'comfortable' | 'compact')}
                        className="jarvis-select"
                        style={{ width: 'auto', minWidth: '185px' }}
                      >
                        <option value="comfortable">Confortável (Padrão)</option>
                        <option value="compact">Compacta (Alta Densidade)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ================================================================= */}
          {/* ABA: NOTIFICAÇÕES                                                 */}
          {/* ================================================================= */}
          {activeSubTab === 'notifications' && (
            <>
              <PageHeader
                icon={<Bell size={18} />}
                title="Notificações"
                subtitle="Preferências locais de alertas visuais e sonoros."
              />

              <div className="jarvis-callout jarvis-callout--warning" role="note">
                Estas opções ainda não estão ligadas ao sistema de notificações do sistema operacional; ficam guardadas apenas nesta sessão da interface.
              </div>

              <section className="jarvis-settings-section">
                <h3 className="jarvis-settings-section__title">Preferências de Alerta</h3>
                <div className="jarvis-settings-card">
                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Conclusão de Tarefas Longas</div>
                      <div className="jarvis-setting-row__desc">
                        Emite alerta quando um especialista concluir geração de código ou auditoria.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      {renderToggle(
                        notifyTaskCompletion,
                        () => setNotifyTaskCompletion(!notifyTaskCompletion),
                        'Conclusão de Tarefas Longas',
                      )}
                    </div>
                  </div>

                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Alertas de Segurança & Aprovações</div>
                      <div className="jarvis-setting-row__desc">
                        Alerta imediatamente quando uma ferramenta exigir aprovação humana (Approval Center).
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      {renderToggle(
                        notifySecurityAlerts,
                        () => setNotifySecurityAlerts(!notifySecurityAlerts),
                        'Alertas de Segurança e Aprovações',
                      )}
                    </div>
                  </div>

                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Efeitos Sonoros Sutis</div>
                      <div className="jarvis-setting-row__desc">
                        Reproduz áudio discreto ao receber mensagens ou alertas do sistema.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      {renderToggle(soundEffects, () => setSoundEffects(!soundEffects), 'Efeitos Sonoros Sutis')}
                    </div>
                  </div>

                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Resumo Diário de Atividades</div>
                      <div className="jarvis-setting-row__desc">
                        Apresenta ao final do dia um resumo de tokens processados e tarefas executadas.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      {renderToggle(dailyDigest, () => setDailyDigest(!dailyDigest), 'Resumo Diário de Atividades')}
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ================================================================= */}
          {/* ABA: COBRANÇA                                                     */}
          {/* ================================================================= */}
          {activeSubTab === 'billing' && (
            <>
              <PageHeader
                icon={<CreditCard size={18} />}
                title="Cobrança & Quotas"
                subtitle="JARVIS AI Hub é auto-hospedado: execute modelos locais no Ollama ou use chaves próprias no cofre sem cobranças da plataforma."
              />

              <div className="jarvis-callout jarvis-callout--info">
                <div className="jarvis-setting-row">
                  <div className="jarvis-setting-row__info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                        Plano da Instância: Community Edition
                      </strong>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4ade80' }}>
                        Gratuito Vitalício
                      </span>
                    </div>
                    <div className="jarvis-setting-row__desc">
                      Sua instalação é local, independente e sem limites arbitrários de mensagens ou de especialistas.
                    </div>
                  </div>
                  <div className="jarvis-tabular" style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '1.35rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      R$ 0,00
                    </span>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>/mês</span>
                  </div>
                </div>
              </div>

              <section className="jarvis-settings-section">
                <h3 className="jarvis-settings-section__title">Política de Consumo</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  <div className="jarvis-kpi-card">
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Inferências Locais (Ollama)</span>
                    <strong style={{ fontSize: '1.2rem', color: '#4ade80' }}>Ilimitadas</strong>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      Custo zero · processamento local em GPU/CPU
                    </span>
                  </div>

                  <div className="jarvis-kpi-card">
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Provedores em Nuvem</span>
                    <strong style={{ fontSize: '1.2rem', color: 'var(--accent-light)' }}>BYOK Ativo</strong>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      Cobrado diretamente pela OpenAI, Anthropic ou Google
                    </span>
                  </div>
                </div>

                {onNavigate && (
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
                    <button
                      type="button"
                      onClick={() => onNavigate('models')}
                      className="btn btn-secondary btn-sm"
                    >
                      <CreditCard size={14} />
                      <span>Gerenciar Provedores & Chaves Privadas</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('usage')}
                      className="btn btn-ghost btn-sm"
                    >
                      <span>Abrir Relatório de Uso & Custos</span>
                    </button>
                  </div>
                )}
              </section>
            </>
          )}

          {/* ================================================================= */}
          {/* ABA: USO DO COMPUTADOR                                            */}
          {/* ================================================================= */}
          {activeSubTab === 'computer' && (
            <>
              <PageHeader
                icon={<Cpu size={18} />}
                title="Uso do Computador"
                subtitle="Políticas de proteção aplicadas pelo backend quando agentes executam scripts, testes e ações no sistema de arquivos."
              />

              <section className="jarvis-settings-section">
                <h3 className="jarvis-settings-section__title">Segurança & Sandbox do Workspace</h3>
                <div className="jarvis-settings-card">
                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Leitura Restrita ao Workspace</div>
                      <div className="jarvis-setting-row__desc">
                        Caminhos absolutos e travessias para fora do projeto ativo são bloqueados pelo executor.
                      </div>
                    </div>
                    {renderPolicyStatus('Aplicado pelo backend')}
                  </div>

                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Redação de Segredos</div>
                      <div className="jarvis-setting-row__desc">
                        Chaves e tokens conhecidos são removidos das saídas e dos registos de auditoria.
                      </div>
                    </div>
                    {renderPolicyStatus('Ativa')}
                  </div>

                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Aprovação de Comandos no Terminal</div>
                      <div className="jarvis-setting-row__desc">
                        Escritas e execuções exigem aprovação humana no modo ASK e continuam protegidas no modo AUTO.
                      </div>
                    </div>
                    {renderPolicyStatus('Obrigatória')}
                  </div>

                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Timeout de Comandos</div>
                      <div className="jarvis-setting-row__desc">
                        Definido por chamada da ferramenta e limitado pelo backend; não é configurável nesta página.
                      </div>
                    </div>
                    {renderPolicyStatus('Por chamada')}
                  </div>
                </div>
              </section>

              {onNavigate && (
                <div>
                  <button
                    type="button"
                    onClick={() => onNavigate('advisor')}
                    className="btn btn-secondary btn-sm"
                  >
                    <Cpu size={14} />
                    <span>Ver Métricas do Host no Hardware Advisor</span>
                  </button>
                </div>
              )}
            </>
          )}

          {/* ================================================================= */}
          {/* ABA: ATUALIZAÇÕES                                                 */}
          {/* ================================================================= */}
          {activeSubTab === 'updates' && (
            <>
              <PageHeader
                icon={<RefreshCw size={18} />}
                title="Atualizações do Sistema"
                subtitle="JARVIS AI Hub v3.0.1 · O estado de atualização não é verificado automaticamente nesta instalação."
              />

              <section className="jarvis-settings-card">
                <div className="jarvis-setting-row">
                  <div className="jarvis-setting-row__info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <CheckCircle2 size={15} color="#4ade80" />
                      <strong className="jarvis-tabular" style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                        Versão Instalada: v3.0.1
                      </strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>· Não verificado</span>
                    </div>
                    <div className="jarvis-setting-row__desc">
                      A verificação de releases ainda não está ligada ao backend. Consulte o repositório para confirmar atualizações.
                    </div>
                  </div>
                  <div className="jarvis-setting-row__control">
                    <button
                      type="button"
                      onClick={handleCheckUpdates}
                      disabled={checkingUpdates}
                      className="btn btn-secondary btn-sm"
                    >
                      <RefreshCw size={13} className={checkingUpdates ? 'spin' : ''} />
                      <span>{checkingUpdates ? 'Verificando…' : 'Verificar Atualizações'}</span>
                    </button>
                  </div>
                </div>
              </section>

              <section className="jarvis-settings-section">
                <h3 className="jarvis-settings-section__title">Canal de Distribuição</h3>
                <div className="jarvis-settings-card">
                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Canal de Atualização</div>
                      <div className="jarvis-setting-row__desc">
                        Escolha a frequência de recebimento de novos recursos.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      <select
                        aria-label="Canal de Atualização"
                        value={updateChannel}
                        onChange={(e) => setUpdateChannel(e.target.value as 'stable' | 'beta' | 'dev')}
                        className="jarvis-select"
                        style={{ width: 'auto', minWidth: '190px' }}
                      >
                        <option value="stable">Estável (Recomendado)</option>
                        <option value="beta">Beta (Acesso Antecipado)</option>
                        <option value="dev">Desenvolvedor (Canary)</option>
                      </select>
                    </div>
                  </div>

                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Verificar Automaticamente ao Iniciar</div>
                      <div className="jarvis-setting-row__desc">
                        Busca releases no repositório em segundo plano e notifica sobre novas versões.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      {renderToggle(
                        autoCheckUpdates,
                        () => setAutoCheckUpdates(!autoCheckUpdates),
                        'Verificar Automaticamente ao Iniciar',
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ================================================================= */}
          {/* ABA: SERVIDOR & DIAGNÓSTICO                                       */}
          {/* ================================================================= */}
          {activeSubTab === 'server' && (
            <>
              <PageHeader
                icon={<Server size={18} />}
                title="Servidor & Diagnóstico"
                subtitle="Instância local do JARVIS Hub executando em FastAPI e SQLite."
                meta={[
                  <span
                    key="fastapi-status"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: apiHealthy === false ? '#f87171' : '#4ade80',
                      fontWeight: 500,
                    }}
                  >
                    <span
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        backgroundColor: apiHealthy === false ? '#ef4444' : '#22c55e',
                      }}
                    />
                    {apiHealthy === null
                      ? 'FastAPI: verificando…'
                      : apiHealthy
                        ? 'FastAPI Operacional'
                        : 'FastAPI Indisponível'}
                  </span>,
                ]}
                actions={
                  <button
                    type="button"
                    onClick={handleTestApi}
                    disabled={testingApi}
                    className="btn btn-secondary btn-sm"
                  >
                    <RefreshCw size={13} className={testingApi ? 'spin' : ''} />
                    <span>{testingApi ? 'Testando…' : 'Testar Conexão'}</span>
                  </button>
                }
              />

              <div className="jarvis-callout jarvis-callout--warning" role="note">
                Configuração somente leitura: bind, porta, expiração de sessão, runtime e nível de logs são definidos no arranque do backend por variáveis de ambiente ou arquivo de configuração. Reinicie o servidor para alterar esses parâmetros.
              </div>

              {/* SEÇÃO 1: ACESSOS E USUÁRIOS */}
              <section className="jarvis-settings-section">
                <h3 className="jarvis-settings-section__title">
                  <Lock size={14} color="var(--accent-light)" />
                  <span>Gestão de Acessos & Credenciais</span>
                </h3>

                <div className="jarvis-settings-card">
                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Gestão de Acessos & Usuários</div>
                      <div className="jarvis-setting-row__desc">
                        Crie novas contas, redefina senhas de administrador e controle os tokens de acesso da instância.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      <button
                        type="button"
                        onClick={() => window.dispatchEvent(new CustomEvent('jarvis:open-access-management'))}
                        className="btn btn-secondary btn-sm"
                      >
                        Gerir Acessos
                      </button>
                    </div>
                  </div>

                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Expiração de Sessão & Tokens JWT</div>
                      <div className="jarvis-setting-row__desc">
                        Tempo de validade do cookie de autenticação segura antes de solicitar novo login.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      <select
                        aria-label="Expiração de Sessão e Tokens JWT"
                        value={jwtExpirationHours}
                        onChange={(e) => setJwtExpirationHours(parseInt(e.target.value, 10))}
                        disabled
                        title="Definido no arranque do backend; não editável no dashboard."
                        className="jarvis-select"
                        style={{ width: 'auto', minWidth: '170px' }}
                      >
                        <option value={8}>8 horas</option>
                        <option value={24}>24 horas (Padrão)</option>
                        <option value={168}>7 dias</option>
                        <option value={720}>30 dias</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              {/* SEÇÃO 2: REDE, HOST & PORTAS */}
              <section className="jarvis-settings-section">
                <h3 className="jarvis-settings-section__title">
                  <Network size={14} color="var(--accent-light)" />
                  <span>Conectividade, Portas & Rede</span>
                </h3>

                <div className="jarvis-settings-card">
                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Endereço de Bind da Instância</div>
                      <div className="jarvis-setting-row__desc">
                        <code>127.0.0.1</code> aceita apenas conexões locais. <code>0.0.0.0</code> permite acesso de dispositivos na mesma rede Wi-Fi.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      <select
                        aria-label="Endereço de Bind da Instância"
                        value={serverHost}
                        onChange={(e) => setServerHost(e.target.value as '127.0.0.1' | '0.0.0.0')}
                        disabled
                        title="Definido no arranque do backend; não editável no dashboard."
                        className="jarvis-select"
                        style={{ width: 'auto', minWidth: '205px' }}
                      >
                        <option value="127.0.0.1">127.0.0.1 (Somente Local)</option>
                        <option value="0.0.0.0">0.0.0.0 (Rede Local / Android)</option>
                      </select>
                    </div>
                  </div>

                  <div
                    className="jarvis-tabular"
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}
                  >
                    <div className="jarvis-settings-subcard">
                      <label htmlFor="server-api-port" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                        Porta da API FastAPI
                      </label>
                      <input
                        id="server-api-port"
                        type="number"
                        value={serverPort}
                        onChange={(e) => setServerPort(parseInt(e.target.value, 10) || 8000)}
                        readOnly
                        title="Definido no arranque do backend; não editável no dashboard."
                        className="jarvis-input"
                        style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, minHeight: '32px', padding: '5px 8px' }}
                      />
                    </div>
                    <div className="jarvis-settings-subcard">
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                        Porta do Dashboard Web
                      </span>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                        5173
                      </div>
                    </div>
                    <div className="jarvis-settings-subcard">
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                        WebSocket de Eventos
                      </span>
                      <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#4ade80', fontFamily: 'var(--font-mono)' }}>
                        /ws/events (Ativo)
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* SEÇÃO 3: BANCO DE DADOS & ARMAZENAMENTO */}
              <section className="jarvis-settings-section">
                <h3 className="jarvis-settings-section__title">
                  <Database size={14} color="#4ade80" />
                  <span>Banco de Dados SQLite & Armazenamento</span>
                </h3>

                <div className="jarvis-settings-card">
                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <code style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          data/jarvis.db
                        </code>
                        <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#4ade80' }}>
                          WAL Mode Ativo
                        </span>
                      </div>
                      <div className="jarvis-setting-row__desc">
                        Banco relacional com transações isoladas por conta, suporte a concorrência assíncrona e migrações automáticas.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      <button
                        type="button"
                        onClick={handleBackupDb}
                        disabled={backingUpDb}
                        className="btn btn-secondary btn-sm"
                      >
                        <Download size={13} />
                        <span>{backingUpDb ? 'Gerando…' : 'Backup Físico'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* SEÇÃO 4: RUNTIME DE MODELOS LOCAIS (OLLAMA) */}
              <section className="jarvis-settings-section">
                <h3 className="jarvis-settings-section__title">
                  <Cpu size={14} color="var(--accent-light)" />
                  <span>Runtime de Inferência Local (Ollama)</span>
                </h3>

                <div className="jarvis-settings-card">
                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Endpoint do Servidor Ollama</div>
                      <div className="jarvis-setting-row__desc">
                        URL do daemon Ollama local onde os modelos GGUF estão carregados.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control" style={{ flexWrap: 'wrap' }}>
                      <input
                        aria-label="Endpoint do Servidor Ollama"
                        type="text"
                        value={ollamaEndpoint}
                        onChange={(e) => setOllamaEndpoint(e.target.value)}
                        readOnly
                        title="Configurado pelo backend; use Testar Ollama para verificar o runtime ativo."
                        className="jarvis-input"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', width: '210px' }}
                      />
                      <button
                        type="button"
                        onClick={handleTestOllama}
                        disabled={testingOllama}
                        className="btn btn-secondary btn-sm"
                      >
                        <span>{testingOllama ? 'Verificando…' : 'Testar Ollama'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Janela de Contexto Padrão (Tokens)</div>
                      <div className="jarvis-setting-row__desc">
                        Capacidade de memória e histórico que cada especialista mantém na sessão de raciocínio.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control">
                      <select
                        aria-label="Janela de Contexto Padrão"
                        value={contextWindow}
                        onChange={(e) => setContextWindow(e.target.value)}
                        disabled
                        title="Configurado pelo backend; não editável no dashboard."
                        className="jarvis-select"
                        style={{ width: 'auto', minWidth: '185px' }}
                      >
                        <option value="8192">8.192 tokens (Padrão)</option>
                        <option value="16384">16.384 tokens (Médio)</option>
                        <option value="32768">32.768 tokens (Longo)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              {/* SEÇÃO 5: LOGS E DIAGNÓSTICO DO SERVIDOR */}
              <section className="jarvis-settings-section">
                <h3 className="jarvis-settings-section__title">
                  <Terminal size={14} color="#fbbf24" />
                  <span>Logs do Servidor & Diagnóstico</span>
                </h3>

                <div className="jarvis-settings-card">
                  <div className="jarvis-setting-row">
                    <div className="jarvis-setting-row__info">
                      <div className="jarvis-setting-row__title">Nível de Detalhe dos Logs (Verbosity)</div>
                      <div className="jarvis-setting-row__desc">
                        Controle o nível de detalhe dos registros da API FastAPI no console e em disco.
                      </div>
                    </div>
                    <div className="jarvis-setting-row__control" style={{ flexWrap: 'wrap' }}>
                      <select
                        aria-label="Nível de Detalhe dos Logs"
                        value={logLevel}
                        onChange={(e) => setLogLevel(e.target.value as 'INFO' | 'DEBUG' | 'WARNING' | 'ERROR')}
                        disabled
                        title="Definido no arranque do backend; não editável no dashboard."
                        className="jarvis-select"
                        style={{ width: 'auto', minWidth: '115px' }}
                      >
                        <option value="DEBUG">DEBUG</option>
                        <option value="INFO">INFO</option>
                        <option value="WARNING">WARNING</option>
                        <option value="ERROR">ERROR</option>
                      </select>

                      {onNavigate && (
                        <button
                          type="button"
                          onClick={() => onNavigate('server_logs')}
                          className="btn btn-secondary btn-sm"
                        >
                          <span>Ver Logs ao Vivo</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={handleExportDiagnostics}
                        className="btn btn-secondary btn-sm"
                      >
                        <Download size={13} />
                        <span>Exportar Diagnóstico</span>
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
};
