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
} from 'lucide-react';
import { getUserProfile, saveUserProfile, UserProfileData } from '../common/UserProfileModal';
import { notify } from '../common/Toast';
import { getAccountStorageKey } from '../../services/accountScope';
import { KeyVaultManager } from '../models/KeyVaultManager';

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

  // Configurações Gerais (exatamente como na imagem anexada do OpenBot)
  const [sendShortcut, setSendShortcut] = useState<'enter' | 'ctrl_enter'>('enter');
  const [orderConversations, setOrderConversations] = useState<'unread_group' | 'recent' | 'manual'>('unread_group');
  const [showAgentSteps, setShowAgentSteps] = useState(false);
  const [compactMessageActions, setCompactMessageActions] = useState(true);
  const [openExternalLinksIn, setOpenExternalLinksIn] = useState<'default_browser' | 'embedded'>('default_browser');
  const [linkTelemetryToAccount, setLinkTelemetryToAccount] = useState(false);

  // Configurações de Voz (Tela 7 do plano)
  const [sttModel, setSttModel] = useState('Parakeet TDT 0.6B v3 (Local Rápido)');
  const [vadPauseSeconds, setVadPauseSeconds] = useState(1.5);
  const [ttsModel, setTtsModel] = useState('Supertonic 3 (Local)');
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState('female_1');
  const [speechSpeed, setSpeechSpeed] = useState<number>(1.0);
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);

  // Provedores de IA (Tela 8 do plano OpenBot)

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
    notify(`Dynamic Island ${nextVal ? 'ativada' : 'ocultada'}!`, 'info');
  };

  const handleToggleDock = () => {
    const nextVal = !agentDockEnabled;
    setAgentDockEnabled(nextVal);
    try {
      localStorage.setItem(getAccountStorageKey('jarvis_pref_agent_dock'), String(nextVal));
      window.dispatchEvent(new Event('jarvis_ui_preferences_changed'));
    } catch {}
    notify(`Dock de Agentes ${nextVal ? 'ativado' : 'ocultado'}!`, 'info');
  };
  const [launchOnStartup, setLaunchOnStartup] = useState(true);
  const [minimizeToTray, setMinimizeToTray] = useState(true);

  // Perfil da Conta
  const [profile, setProfile] = useState<UserProfileData>(getUserProfile);
  const [savingProfile, setSavingProfile] = useState(false);

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
  const [accentColor, setAccentColor] = useState<'blue' | 'purple' | 'emerald' | 'orange'>('blue');
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
        notify('QR Code de pareamento gerado!', 'success');
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
    notify(`Modo de especialistas definido para: ${mode === 'auto' ? 'Automático' : mode === 'always' ? 'Seção Separada' : 'Modo Limpo'}`, 'info');
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

  const handleSaveProfile = () => {
    setSavingProfile(true);
    try {
      saveUserProfile(profile);
      notify('Perfil e diretrizes de IA salvos com sucesso!', 'success');
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
        notify('Comunicação com a API FastAPI confirmada: Operacional (200 OK)!', 'success');
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
      // `GET /api/v1/models` devolve o runtime ativo e a lista de modelos locais.
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
      notify('Diagnóstico real do servidor exportado com sucesso!', 'success');
    } catch (e: any) {
      notify(`Não foi possível exportar o diagnóstico: ${e.message}`, 'error');
    }
  };

  const handleCheckUpdates = () => {
    setCheckingUpdates(false);
    notify(
      'A verificação de atualizações ainda não está disponível nesta instalação. Consulte o repositório para obter a versão mais recente.',
      'warning'
    );
  };

  const renderToggle = (checked: boolean, onToggle: () => void) => (
    <button
      type="button"
      onClick={onToggle}
      style={{
        width: '42px',
        height: '24px',
        borderRadius: '12px',
        backgroundColor: checked ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)',
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background-color 0.2s',
        padding: 0,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          backgroundColor: '#ffffff',
          position: 'absolute',
          top: '3px',
          left: checked ? '21px' : '3px',
          transition: 'left 0.2s',
        }}
      />
    </button>
  );

  const renderPolicyBadge = (label: string) => (
    <span
      style={{
        fontSize: '0.72rem',
        padding: '3px 10px',
        borderRadius: '999px',
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        border: '1px solid rgba(16, 185, 129, 0.28)',
        color: '#34d399',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );

  const MENU_SECTIONS = [
    {
      title: null,
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

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        backgroundColor: '#121212',
        overflow: 'hidden',
      }}
    >
      {/* Sub-painel Esquerdo: Menu de Configurações (OpenBot Style) */}
      <aside
        style={{
          width: '240px',
          backgroundColor: '#161616',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          flexShrink: 0,
        }}
      >
        <div style={{ padding: '16px 16px 10px 16px' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#f5f5f5', margin: '0 0 12px 0' }}>
            Suas configurações
          </h2>

          {/* Campo de Busca de Configurações */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '8px',
              padding: '6px 10px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <Search size={13} color="#888888" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar configurações..."
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#ededed',
                fontSize: '0.78rem',
                width: '100%',
              }}
            />
          </div>
        </div>

        {/* Lista de Seções e Menus */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {MENU_SECTIONS.map((sec, sIdx) => {
            const filteredItems = sec.items.filter((item) =>
              !searchTerm.trim() || item.label.toLowerCase().includes(searchTerm.toLowerCase())
            );
            if (filteredItems.length === 0) return null;

            return (
              <div key={sIdx} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {sec.title && (
                  <div style={{ fontSize: '0.70rem', color: '#737373', fontWeight: 600, padding: '4px 8px 4px 8px' }}>
                    {sec.title}
                  </div>
                )}

                {filteredItems.map((item) => {
                  const isActive = activeSubTab === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveSubTab(item.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '7px 10px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: isActive ? 'rgba(255, 255, 255, 0.09)' : 'transparent',
                        color: isActive ? '#ffffff' : '#a3a3a3',
                        fontSize: '0.82rem',
                        fontWeight: isActive ? 600 : 400,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <Icon size={15} color={isActive ? '#38bdf8' : '#888888'} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Rodapé: Configurações do Servidor com Marcador Laranja */}
        <div style={{ padding: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <button
            type="button"
            onClick={() => setActiveSubTab('server')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: activeSubTab === 'server' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: '#d4d4d4',
              fontSize: '0.80rem',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#f97316', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Configurações do servidor O...
              </span>
            </div>
            <ChevronRight size={13} color="#737373" />
          </button>
        </div>
      </aside>

      {/* Conteúdo Principal da Aba Selecionada */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '32px 48px',
          backgroundColor: '#121212',
          maxWidth: '900px',
        }}
      >
        {/* ========================================================================= */}
        {/* ABA: GERAL (Idêntica à captura do OpenBot)                                */}
        {/* ========================================================================= */}
        {activeSubTab === 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
              Geral
            </h1>

            {/* Grupo: Conversas */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              <h3 style={{ fontSize: '0.90rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                Conversas
              </h3>

              {/* 1. Atalho de envio */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Atalho de envio</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Escolha as teclas que enviam uma mensagem neste dispositivo e navegador.
                  </div>
                </div>

                <select
                  value={sendShortcut}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    setSendShortcut(val);
                    saveGeneralSettings({ sendShortcut: val });
                  }}
                  style={{
                    backgroundColor: '#1f1f1f',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    color: '#f5f5f5',
                    fontSize: '0.80rem',
                    cursor: 'pointer',
                    minWidth: '160px',
                  }}
                >
                  <option value="enter">Enter para enviar</option>
                  <option value="ctrl_enter">Ctrl + Enter para enviar</option>
                </select>
              </div>

              {/* 2. Ordenar conversas */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Ordenar conversas</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Escolha como a barra lateral ordena as conversas neste dispositivo. Manual e Atividade recente desativam o grupo Não lidas.
                  </div>
                </div>

                <select
                  value={orderConversations}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    setOrderConversations(val);
                    saveGeneralSettings({ orderConversations: val });
                  }}
                  style={{
                    backgroundColor: '#1f1f1f',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    color: '#f5f5f5',
                    fontSize: '0.80rem',
                    cursor: 'pointer',
                    minWidth: '160px',
                  }}
                >
                  <option value="unread_group">Não lidas em um grupo</option>
                  <option value="recent">Atividade recente</option>
                  <option value="manual">Manual</option>
                </select>
              </div>

              {/* 3. Mostrar etapas do agente */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Mostrar etapas do agente</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Abre por padrão o raciocínio, as etapas de ferramentas e as mudanças de memória de cada turno neste dispositivo e navegador.
                  </div>
                </div>

                {/* Switch iOS Style */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !showAgentSteps;
                    setShowAgentSteps(next);
                    saveGeneralSettings({ showAgentSteps: next });
                  }}
                  style={{
                    width: '42px',
                    height: '24px',
                    borderRadius: '12px',
                    backgroundColor: showAgentSteps ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)',
                    border: 'none',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background-color 0.2s',
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      backgroundColor: '#ffffff',
                      position: 'absolute',
                      top: '3px',
                      left: showAgentSteps ? '21px' : '3px',
                      transition: 'left 0.2s',
                    }}
                  />
                </button>
              </div>

              {/* 4. Ações de mensagem compactas */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Ações de mensagem compactas</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Mostra Reagir, Responder e Mais ao lado de uma mensagem, e a hora entre as mensagens. Desativado, todas as ações e a hora aparecem abaixo de cada mensagem.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const next = !compactMessageActions;
                    setCompactMessageActions(next);
                    saveGeneralSettings({ compactMessageActions: next });
                  }}
                  style={{
                    width: '42px',
                    height: '24px',
                    borderRadius: '12px',
                    backgroundColor: compactMessageActions ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)',
                    border: 'none',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background-color 0.2s',
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      backgroundColor: '#ffffff',
                      position: 'absolute',
                      top: '3px',
                      left: compactMessageActions ? '21px' : '3px',
                      transition: 'left 0.2s',
                    }}
                  />
                </button>
              </div>

              {/* 5. Abrir links externos em */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Abrir links externos em</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Links de chats, páginas de login e páginas de cobrança abrem aqui.
                  </div>
                </div>

                <select
                  value={openExternalLinksIn}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    setOpenExternalLinksIn(val);
                    saveGeneralSettings({ openExternalLinksIn: val });
                  }}
                  style={{
                    backgroundColor: '#1f1f1f',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    color: '#f5f5f5',
                    fontSize: '0.80rem',
                    cursor: 'pointer',
                    minWidth: '160px',
                  }}
                >
                  <option value="default_browser">Navegador padrão</option>
                  <option value="embedded">Navegador embutido</option>
                </select>
              </div>
            </div>

            {/* Separador */}
            <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />

            {/* Grupo: Permissões */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              <h3 style={{ fontSize: '0.90rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                Permissões
              </h3>

              {/* Vincular a análise à minha conta */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Vincular a análise à minha conta</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '4px', lineHeight: 1.5 }}>
                    Ativado: os metadados de uso e confiabilidade vão para o serviço de análise hospedado pelo próprio OpenBot com o ID e o e-mail da sua conta, junto com os sites que você e seus agentes visitam, o uso de ferramentas e um resumo diário da sua configuração. Desativado: só o uso básico, como turnos e contagens de tokens, vai com um ID de instalação aleatório.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const next = !linkTelemetryToAccount;
                    setLinkTelemetryToAccount(next);
                    saveGeneralSettings({ linkTelemetryToAccount: next });
                  }}
                  style={{
                    width: '42px',
                    height: '24px',
                    borderRadius: '12px',
                    backgroundColor: linkTelemetryToAccount ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)',
                    border: 'none',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background-color 0.2s',
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      backgroundColor: '#ffffff',
                      position: 'absolute',
                      top: '3px',
                      left: linkTelemetryToAccount ? '21px' : '3px',
                      transition: 'left 0.2s',
                    }}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA: PERFIL DA CONTA (Identidade & Instruções)                             */}
        {/* ========================================================================= */}
        {activeSubTab === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
                  Perfil e Identidade
                </h1>
                <p style={{ fontSize: '0.82rem', color: '#888888', marginTop: '4px' }}>
                  Personalize como os agentes chamam você e as diretrizes permanentes de código.
                </p>
              </div>

              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="btn btn-primary"
                style={{ fontSize: '0.82rem', padding: '7px 16px', backgroundColor: '#38bdf8', color: '#000000', fontWeight: 600 }}
              >
                <Save size={14} />
                <span>{savingProfile ? 'Salvando...' : 'Salvar Perfil'}</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.80rem', color: '#a3a3a3', fontWeight: 600 }}>Nome de exibição</label>
                <input
                  type="text"
                  value={profile.displayName}
                  onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                  style={{
                    width: '100%',
                    backgroundColor: '#1b1b1b',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#f5f5f5',
                    fontSize: '0.84rem',
                    marginTop: '4px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.80rem', color: '#a3a3a3', fontWeight: 600 }}>Cargo / Especialidade</label>
                <input
                  type="text"
                  value={profile.roleTitle}
                  onChange={(e) => setProfile({ ...profile, roleTitle: e.target.value })}
                  style={{
                    width: '100%',
                    backgroundColor: '#1b1b1b',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#f5f5f5',
                    fontSize: '0.84rem',
                    marginTop: '4px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.80rem', color: '#a3a3a3', fontWeight: 600 }}>Contexto profissional & Stack</label>
                <textarea
                  value={profile.userBackground}
                  onChange={(e) => setProfile({ ...profile, userBackground: e.target.value })}
                  rows={3}
                  style={{
                    width: '100%',
                    backgroundColor: '#1b1b1b',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#f5f5f5',
                    fontSize: '0.84rem',
                    marginTop: '4px',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.80rem', color: '#a3a3a3', fontWeight: 600 }}>Regras Mandatórias de Resposta</label>
                <textarea
                  value={profile.responseGuidelines}
                  onChange={(e) => setProfile({ ...profile, responseGuidelines: e.target.value })}
                  rows={3}
                  style={{
                    width: '100%',
                    backgroundColor: '#1b1b1b',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#f5f5f5',
                    fontSize: '0.84rem',
                    marginTop: '4px',
                    resize: 'vertical',
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA: CONECTAR CELULAR (Conexão Mobile Android)                            */}
        {/* ========================================================================= */}
        {activeSubTab === 'mobile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
                Conectar Celular & Dispositivos Móveis
              </h1>
              <p style={{ fontSize: '0.82rem', color: '#888888', marginTop: '4px' }}>
                Conecte seu smartphone Android via QR Code instantâneo ou por descoberta automática na rede local (LAN).
              </p>
            </div>

            {/* Status da Rede Local & Descoberta Automática */}
            <div
              style={{
                padding: '20px',
                borderRadius: '14px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      backgroundColor: 'rgba(52, 211, 153, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Wifi size={22} color="#34d399" />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ fontSize: '0.96rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                        Servidor JARVIS Hub na Rede Local
                      </h3>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          backgroundColor: mobileDiscovery?.server_url
                            ? 'rgba(52, 211, 153, 0.2)'
                            : 'rgba(248, 113, 113, 0.15)',
                          color: mobileDiscovery?.server_url ? '#34d399' : '#f87171',
                          fontWeight: 600,
                        }}
                      >
                        {mobileDiscovery?.server_url ? 'ONLINE' : 'INDISPONÍVEL'}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: '#888888', margin: '2px 0 0 0' }}>
                      {mobileDiscovery?.server_url
                        ? `Beacon UDP ativo na porta ${mobileDiscovery.udp_beacon_port} · Descoberta por broadcast sem fio`
                        : 'Descoberta automática indisponível. Use o pareamento por QR Code abaixo.'}
                    </p>
                  </div>
                </div>

                {mobileDiscovery?.server_url && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(mobileDiscovery.server_url);
                      notify('URL do servidor copiada!', 'success');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 14px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#e5e5e5',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    <Copy size={14} />
                    <span>Copiar URL: {mobileDiscovery.server_url}</span>
                  </button>
                )}
              </div>

              <div
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.25)',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  fontSize: '0.8rem',
                  color: '#cccccc',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '12px',
                }}
              >
                <div>
                  <span style={{ color: '#888888', display: 'block', fontSize: '0.74rem' }}>IP NA REDE LOCAL (LAN)</span>
                  <span style={{ fontWeight: 600, color: '#f5f5f5' }}>{mobileDiscovery?.local_ip || '—'}</span>
                </div>
                <div>
                  <span style={{ color: '#888888', display: 'block', fontSize: '0.74rem' }}>PORTA DA API REST & WS</span>
                  <span style={{ fontWeight: 600, color: '#f5f5f5' }}>{mobileDiscovery?.api_port ?? '—'}</span>
                </div>
                <div>
                  <span style={{ color: '#888888', display: 'block', fontSize: '0.74rem' }}>DESCOBERTA UDP (BROADCAST)</span>
                  <span style={{ fontWeight: 600, color: mobileDiscovery ? '#34d399' : '#f87171' }}>
                    {mobileDiscovery
                      ? `Porta ${mobileDiscovery.udp_beacon_port} (Ativo)`
                      : 'Indisponível'}
                  </span>
                </div>
              </div>
            </div>

            {/* Pareamento Instantâneo via QR Code */}
            <div
              style={{
                padding: '24px',
                borderRadius: '14px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <QrCode size={24} color="#38bdf8" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                    Pareamento por QR Code Instantâneo
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: '#888888', margin: '2px 0 0 0' }}>
                    Conecte o aplicativo do celular sem precisar digitar IP nem tokens longos manualmente.
                  </p>
                </div>
              </div>

              {!mobilePairQr ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ fontSize: '0.82rem', color: '#f5f5f5', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
                      Identificação do Smartphone
                    </label>
                    <input
                      type="text"
                      value={mobilePairDeviceName}
                      onChange={(e) => setMobilePairDeviceName(e.target.value)}
                      placeholder="Ex: Samsung Galaxy S24, Pixel 8..."
                      style={{
                        width: '100%',
                        maxWidth: '400px',
                        backgroundColor: '#1b1b1b',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '8px',
                        padding: '9px 14px',
                        color: '#f5f5f5',
                        fontSize: '0.84rem',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      type="button"
                      disabled={mobilePairLoading}
                      onClick={handleGenerateMobilePair}
                      className="btn btn-primary"
                      style={{
                        fontSize: '0.84rem',
                        padding: '10px 22px',
                        backgroundColor: '#38bdf8',
                        color: '#000000',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <QrCode size={16} />
                      {mobilePairLoading ? 'Gerando Pareamento...' : 'Gerar QR Code de Pareamento'}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '18px',
                    padding: '16px',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '12px',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ fontSize: '0.86rem', color: '#e5e5e5', maxWidth: '480px', margin: 0 }}>
                    Aponte o app JARVIS Mobile para a tela ou use a opção <strong>"Parear via QR Code"</strong> no celular para sincronizar instantaneamente.
                  </p>

                  <div
                    style={{
                      background: '#ffffff',
                      padding: '14px',
                      borderRadius: '16px',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
                      display: 'inline-block',
                    }}
                  >
                    <img
                      src={mobilePairQr}
                      alt="QR Code de Pareamento JARVIS"
                      style={{ width: '220px', height: '220px', display: 'block' }}
                    />
                  </div>

                  <div style={{ width: '100%', maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '0.78rem', color: '#aaaaaa' }}>Token de Pareamento Gerado (Cópia Manual):</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        readOnly
                        value={mobilePairToken}
                        style={{
                          flex: 1,
                          backgroundColor: '#161616',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          color: '#38bdf8',
                          fontSize: '0.8rem',
                          fontFamily: 'monospace',
                        }}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(mobilePairToken);
                          setMobilePairCopied(true);
                          notify('Token copiado para a área de transferência!', 'success');
                          setTimeout(() => setMobilePairCopied(false), 2000);
                        }}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          color: '#ffffff',
                          fontSize: '0.8rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                        }}
                      >
                        {mobilePairCopied ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
                        {mobilePairCopied ? 'Copiado!' : 'Copiar'}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setMobilePairQr('');
                      setMobilePairToken('');
                    }}
                    style={{
                      fontSize: '0.8rem',
                      color: '#888888',
                      backgroundColor: 'transparent',
                      border: 'none',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      marginTop: '4px',
                    }}
                  >
                    Gerar outro QR Code
                  </button>
                </div>
              )}

              <div
                style={{
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  paddingTop: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div style={{ fontSize: '0.78rem', color: '#888888' }}>
                  Precisa gerenciar dispositivos conectados à sua conta ou revogar tokens?
                </div>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('jarvis:open-android-pairing'))}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#e5e5e5',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  Abrir Modal Rápido de Dispositivo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA: VOZ & DITADO (Tela 7 do Plano OpenBot)                               */}
        {/* ========================================================================= */}
        {activeSubTab === 'voice' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
                Configurações de Voz
              </h1>
              <p style={{ fontSize: '0.82rem', color: '#888888', marginTop: '4px' }}>
                Ajuste os modelos de reconhecimento de fala (STT), síntese vocal (TTS) e sensibilidade VAD.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <label style={{ fontSize: '0.84rem', color: '#f5f5f5', fontWeight: 600 }}>Modelo de Ditado (STT)</label>
                <select
                  value={sttModel}
                  onChange={(e) => setSttModel(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#1f1f1f',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#f5f5f5',
                    fontSize: '0.82rem',
                    marginTop: '6px',
                  }}
                >
                  <option value="Parakeet TDT 0.6B v3 (Local Rápido)">Parakeet TDT 0.6B v3 (Local Rápido - 25 idiomas)</option>
                  <option value="Whisper Base (Local)">Whisper Base (Local - Baixo uso de memória)</option>
                  <option value="Whisper Medium (Alta Precisão)">Whisper Medium (Alta Precisão)</option>
                </select>
              </div>

              {/* Slider VAD de Pausa */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.84rem', color: '#f5f5f5', fontWeight: 600 }}>
                    Pausa antes de enviar: {vadPauseSeconds.toFixed(1)} s
                  </label>
                </div>
                <p style={{ fontSize: '0.78rem', color: '#888888', margin: '4px 0 8px 0' }}>
                  Em uma conversa por voz, o assistente envia suas palavras quando você para de falar por esse tempo.
                </p>
                <input
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
                  style={{ width: '100%', accentColor: '#38bdf8' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.84rem', color: '#f5f5f5', fontWeight: 600 }}>Modelo de Resposta Falada (TTS)</label>
                <select
                  value={ttsModel}
                  onChange={(e) => setTtsModel(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#1f1f1f',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#f5f5f5',
                    fontSize: '0.82rem',
                    marginTop: '6px',
                  }}
                >
                  <option value="Supertonic 3 (Local)">Supertonic 3 (Local - Leitura natural multilingue)</option>
                  <option value="Kokoro TTS (Local)">Kokoro TTS (Voz expressiva ultraleve)</option>
                  <option value="WebSpeech API (Navegador)">WebSpeech API Nativa do Navegador</option>
                </select>
              </div>

              {/* Ler respostas em voz alta */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Ler respostas em voz alta</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    O JARVIS reproduzirá a fala automaticamente ao término da resposta gerada.
                  </div>
                </div>
                {renderToggle(ttsEnabled, () => setTtsEnabled(!ttsEnabled))}
              </div>

              {/* Seletor de Voz & Preview */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <label style={{ fontSize: '0.84rem', color: '#f5f5f5', fontWeight: 600 }}>Voz do Assistente</label>
                  <select
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#1f1f1f',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      color: '#f5f5f5',
                      fontSize: '0.82rem',
                      marginTop: '6px',
                    }}
                  >
                    <option value="female_1">Voz feminina 1 (Suave)</option>
                    <option value="male_1">Voz masculina 1 (Grave)</option>
                    <option value="neutral_1">Voz neutra (Equilibrada)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if ('speechSynthesis' in window) {
                        window.speechSynthesis.cancel();
                        const utt = new SpeechSynthesisUtterance('Olá! Esta é uma demonstração da voz configurada no JARVIS.');
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
                    className="btn btn-secondary"
                    style={{ fontSize: '0.80rem', padding: '8px 14px', borderRadius: '8px' }}
                  >
                    <span>{isPlayingVoice ? 'Reproduzindo...' : '▷ Ouvir Demonstração'}</span>
                  </button>
                </div>
              </div>

              {/* Velocidade da Fala */}
              <div>
                <label style={{ fontSize: '0.84rem', color: '#f5f5f5', fontWeight: 600 }}>Velocidade da Fala</label>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  {[1.0, 1.25, 1.5].map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      onClick={() => setSpeechSpeed(speed)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: speechSpeed === speed ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)',
                        backgroundColor: speechSpeed === speed ? 'rgba(56, 189, 248, 0.15)' : '#18181b',
                        color: speechSpeed === speed ? '#38bdf8' : '#a1a1aa',
                        fontSize: '0.80rem',
                        fontWeight: speechSpeed === speed ? 600 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA: PROVEDORES DE IA (Tela 8 do Plano OpenBot)                           */}
        {/* ========================================================================= */}
        {activeSubTab === 'providers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
                Provedores de IA & Modelos
              </h1>
              <p style={{ fontSize: '0.82rem', color: '#888888', marginTop: '4px' }}>
                Gerencie os provedores conectados, modelos locais instalados e chaves de APIs na nuvem.
              </p>
            </div>

            {/* Provedor Padrão */}
            <div
              style={{
                backgroundColor: '#18181b',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f5f5f5' }}>Provedor Padrão de Inferência</div>
                <div style={{ fontSize: '0.78rem', color: '#71717a', marginTop: '2px' }}>
                  Utilizado para orquestração automática e conversas do chat.
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#0c0c0e',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  color: '#a1a1aa',
                  fontSize: '0.82rem',
                  maxWidth: '320px',
                }}
              >
                Configurado por conta em Modelos → Rotas de Agentes
              </div>
            </div>

            {/* Provedores Conectados */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#a1a1aa' }}>
                Provedores Conectados
              </div>

              <div
                style={{
                  backgroundColor: '#141417',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(56, 189, 248, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                    💻
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#f4f4f5' }}>OpenCode CLI</div>
                    <div style={{ fontSize: '0.76rem', color: '#71717a' }}>Disponível neste computador · Motor local integrado</div>
                  </div>
                </div>

                <span style={{ fontSize: '0.72rem', backgroundColor: 'rgba(52, 211, 153, 0.15)', color: '#34d399', fontWeight: 600, padding: '3px 10px', borderRadius: '999px' }}>
                  ✓ Conectado
                </span>
              </div>

              <div
                style={{
                  backgroundColor: '#141417',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(192, 132, 252, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                    🤖
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#f4f4f5' }}>Ollama Local Daemon</div>
                    <div style={{ fontSize: '0.76rem', color: '#71717a' }}>http://localhost:11434 · Modelos: qwen2.5-coder:7b</div>
                  </div>
                </div>

                <span style={{ fontSize: '0.72rem', backgroundColor: 'rgba(52, 211, 153, 0.15)', color: '#34d399', fontWeight: 600, padding: '3px 10px', borderRadius: '999px' }}>
                  ✓ Conectado
                </span>
              </div>
            </div>

            {/* Credenciais reais: KeyVault cifrado por conta */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#a1a1aa' }}>
                Chaves de Provedores (KeyVault)
              </div>
              <KeyVaultManager />
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA: DYNAMIC ISLAND & DOCK DE AGENTES                                     */}
        {/* ========================================================================= */}
        {(activeSubTab === 'island' || activeSubTab === 'dock') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
                {activeSubTab === 'island' ? 'Dynamic Island' : 'Dock de Agentes'}
              </h1>
              <p style={{ fontSize: '0.76rem', color: '#38bdf8', marginTop: '6px' }}>
                Preferência aplicada em tempo real e sincronizada com a interface do painel.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>
                    {activeSubTab === 'island' ? 'Ativar Dynamic Island' : 'Ativar Dock de Agentes'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    {activeSubTab === 'island'
                      ? 'Exibe o entalhe curvo flutuante no topo com o robô e telemetria de CPU/RAM.'
                      : 'Barra vertical flutuante na extremidade direita com os avatares 3D dos especialistas.'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (activeSubTab === 'island') handleToggleIsland();
                    else handleToggleDock();
                  }}
                  style={{
                    width: '42px',
                    height: '24px',
                    borderRadius: '12px',
                    backgroundColor: (activeSubTab === 'island' ? dynamicIslandEnabled : agentDockEnabled) ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)',
                    border: 'none',
                    cursor: 'pointer',
                    position: 'relative',
                    padding: 0,
                  }}
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      backgroundColor: '#ffffff',
                      position: 'absolute',
                      top: '3px',
                      left: (activeSubTab === 'island' ? dynamicIslandEnabled : agentDockEnabled) ? '21px' : '3px',
                      transition: 'left 0.2s',
                    }}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA: COMPORTAMENTO DO APP (Este Computador)                              */}
        {/* ========================================================================= */}
        {activeSubTab === 'behavior' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
                Comportamento do App
              </h1>
              <p style={{ fontSize: '0.76rem', color: '#fbbf24', marginTop: '6px' }}>
                Preferências do cliente desktop: o dashboard web não altera o arranque do sistema nem a bandeja.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>
                    Iniciar com o sistema
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Abre o JARVIS em segundo plano assim que o computador inicializar.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setLaunchOnStartup(!launchOnStartup)}
                  style={{
                    width: '42px',
                    height: '24px',
                    borderRadius: '12px',
                    backgroundColor: launchOnStartup ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)',
                    border: 'none',
                    cursor: 'pointer',
                    position: 'relative',
                    padding: 0,
                  }}
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      backgroundColor: '#ffffff',
                      position: 'absolute',
                      top: '3px',
                      left: launchOnStartup ? '21px' : '3px',
                      transition: 'left 0.2s',
                    }}
                  />
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>
                    Minimizar para a bandeja
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Ao fechar a janela, mantém o assistente e os nós em execução silenciosa.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setMinimizeToTray(!minimizeToTray)}
                  style={{
                    width: '42px',
                    height: '24px',
                    borderRadius: '12px',
                    backgroundColor: minimizeToTray ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)',
                    border: 'none',
                    cursor: 'pointer',
                    position: 'relative',
                    padding: 0,
                  }}
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      backgroundColor: '#ffffff',
                      position: 'absolute',
                      top: '3px',
                      left: minimizeToTray ? '21px' : '3px',
                      transition: 'left 0.2s',
                    }}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA: APARÊNCIA                                                            */}
        {/* ========================================================================= */}
        {activeSubTab === 'appearance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
                Aparência e Tema
              </h1>
              <p style={{ fontSize: '0.82rem', color: '#888888', marginTop: '4px' }}>
                Pré-visualização local de tema e contraste.
              </p>
              <p style={{ fontSize: '0.76rem', color: '#fbbf24', marginTop: '6px' }}>
                Estas escolhas ainda não são aplicadas globalmente à interface nesta build.
              </p>
            </div>

            {/* Tema da Interface */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h3 style={{ fontSize: '0.90rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                Tema do Sistema
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                {[
                  { id: 'obsidian', name: 'Obsidian Dark (Padrão)', desc: 'Fundo fosco aveludado #121212 com alto contraste', bg: '#121212' },
                  { id: 'oled', name: 'OLED Puro', desc: 'Preto 100% puro para monitores OLED e economia de energia', bg: '#000000' },
                  { id: 'graphite', name: 'Cinza Grafite', desc: 'Tons de cinza neutro com transições suaves', bg: '#1e1e24' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setThemeMode(t.id as any)}
                    style={{
                      padding: '16px',
                      borderRadius: '12px',
                      backgroundColor: themeMode === t.id ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                      border: themeMode === t.id ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.86rem', fontWeight: 600, color: '#f5f5f5' }}>{t.name}</span>
                      <div style={{ width: '16px', height: '16px', borderRadius: '4px', backgroundColor: t.bg, border: '1px solid rgba(255,255,255,0.2)' }} />
                    </div>
                    <span style={{ fontSize: '0.74rem', color: '#888888', lineHeight: 1.4 }}>{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />

            {/* Cor de Destaque */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h3 style={{ fontSize: '0.90rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                Cor de Destaque (Accent Color)
              </h3>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {[
                  { id: 'blue', name: 'Azul OpenBot', hex: '#38bdf8' },
                  { id: 'purple', name: 'Púrpura IA', hex: '#a855f7' },
                  { id: 'emerald', name: 'Esmeralda', hex: '#10b981' },
                  { id: 'orange', name: 'Laranja Servidor', hex: '#f97316' },
                ].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setAccentColor(c.id as any)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      backgroundColor: accentColor === c.id ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                      border: accentColor === c.id ? `1px solid ${c.hex}` : '1px solid rgba(255, 255, 255, 0.08)',
                      color: '#f5f5f5',
                      fontSize: '0.80rem',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: c.hex }} />
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />

            {/* Efeitos Visuais & Densidade */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h3 style={{ fontSize: '0.90rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                Efeitos & Densidade
              </h3>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Desfoque Glassmorphism</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Aplica transparência com desfoque de fundo nas janelas modais, dock e barra lateral.
                  </div>
                </div>
                {renderToggle(glassmorphism, () => setGlassmorphism(!glassmorphism))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Animações Suaves</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Habilita transições fluidas de tela, expansão da Dynamic Island e micro-interações.
                  </div>
                </div>
                {renderToggle(smoothAnimations, () => setSmoothAnimations(!smoothAnimations))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Exibir Dynamic Island</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Entalhe curvo superior com o robô e telemetria de CPU/RAM.
                  </div>
                </div>
                {renderToggle(dynamicIslandEnabled, handleToggleIsland)}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Exibir Dock de Agentes</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Barra vertical flutuante na direita com os avatares dos especialistas.
                  </div>
                </div>
                {renderToggle(agentDockEnabled, handleToggleDock)}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Densidade da Interface</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Controla o espaçamento entre cards, botões e mensagens do chat.
                  </div>
                </div>
                <select
                  value={uiDensity}
                  onChange={(e) => setUiDensity(e.target.value as any)}
                  style={{
                    backgroundColor: '#1f1f1f',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    color: '#f5f5f5',
                    fontSize: '0.80rem',
                    cursor: 'pointer',
                    minWidth: '150px',
                  }}
                >
                  <option value="comfortable">Confortável (Padrão)</option>
                  <option value="compact">Compacta (Alta Densidade)</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Especialistas na Barra Lateral</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Escolha como os atalhos de especialistas (QA, Bug Fixer, Security, Copy, Design) aparecem no histórico.
                  </div>
                </div>
                <select
                  value={railAgentsMode}
                  onChange={(e) => handleRailAgentsModeChange(e.target.value as any)}
                  style={{
                    backgroundColor: '#1f1f1f',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    color: '#f5f5f5',
                    fontSize: '0.80rem',
                    cursor: 'pointer',
                    minWidth: '220px',
                  }}
                >
                  <option value="auto">Automático (Ocultar ao ter conversas)</option>
                  <option value="always">Seção Separada (Abaixo de conversas)</option>
                  <option value="never">Modo Limpo (Não exibir especialistas)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA: NOTIFICAÇÕES                                                         */}
        {/* ========================================================================= */}
        {activeSubTab === 'notifications' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
                Notificações
              </h1>
              <p style={{ fontSize: '0.82rem', color: '#888888', marginTop: '4px' }}>
                Preferências locais de alertas visuais e sonoros.
              </p>
              <p style={{ fontSize: '0.76rem', color: '#fbbf24', marginTop: '6px' }}>
                Estas opções ainda não estão ligadas ao sistema de notificações do sistema operacional;
                ficam guardadas apenas nesta sessão da interface.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              <h3 style={{ fontSize: '0.90rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                Preferências de Notificação
              </h3>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Conclusão de Tarefas Longas</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Emite notificação desktop quando um especialista concluir a geração de código ou auditoria.
                  </div>
                </div>
                {renderToggle(notifyTaskCompletion, () => setNotifyTaskCompletion(!notifyTaskCompletion))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Alertas de Segurança & Aprovações</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Alerta imediatamente quando uma ferramenta exigir aprovação humana (Approval Center).
                  </div>
                </div>
                {renderToggle(notifySecurityAlerts, () => setNotifySecurityAlerts(!notifySecurityAlerts))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Efeitos Sonoros Sutis</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Reproduz áudio discreto ao receber mensagens ou alertas do sistema.
                  </div>
                </div>
                {renderToggle(soundEffects, () => setSoundEffects(!soundEffects))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Resumo Diário de Atividades</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Apresenta ao final do dia um resumo de tokens processados e tarefas executadas.
                  </div>
                </div>
                {renderToggle(dailyDigest, () => setDailyDigest(!dailyDigest))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA: COBRANÇA                                                             */}
        {/* ========================================================================= */}
        {activeSubTab === 'billing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
                Cobrança & Quotas
              </h1>
              <p style={{ fontSize: '0.82rem', color: '#888888', marginTop: '4px' }}>
                JARVIS AI Hub é 100% de código aberto e auto-hospedado. Use seus modelos Ollama locais ou configure chaves de API próprias no cofre sem cobranças da plataforma.
              </p>
            </div>

            <div
              style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong style={{ fontSize: '0.96rem', color: '#ffffff' }}>Plano da Instância: Community Edition</strong>
                  <span style={{ fontSize: '0.70rem', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontWeight: 600 }}>
                    Gratuito Vitalício
                  </span>
                </div>
                <p style={{ fontSize: '0.80rem', color: '#a1a1aa', margin: '4px 0 0 0' }}>
                  Sua instalação é local, independente e sem limites arbitrários de mensagens ou de especialistas.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f5f5f5' }}>R$ 0,00</span>
                <span style={{ fontSize: '0.76rem', color: '#71717a' }}>/mês</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '0.90rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                Monitor de Consumo de Tokens
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <span style={{ fontSize: '0.76rem', color: '#888888', display: 'block' }}>Inferências Locais (Ollama)</span>
                  <strong style={{ fontSize: '1.25rem', color: '#10b981', display: 'block', marginTop: '4px' }}>Ilimitadas</strong>
                  <span style={{ fontSize: '0.72rem', color: '#71717a' }}>Custo: Zero (Processamento local na GPU/CPU)</span>
                </div>

                <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <span style={{ fontSize: '0.76rem', color: '#888888', display: 'block' }}>Chaves de Provedores em Nuvem</span>
                  <strong style={{ fontSize: '1.25rem', color: '#38bdf8', display: 'block', marginTop: '4px' }}>BYOK Ativo</strong>
                  <span style={{ fontSize: '0.72rem', color: '#71717a' }}>Cobrado diretamente pela OpenAI, Anthropic ou Google</span>
                </div>
              </div>

              {onNavigate && (
                <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => onNavigate('models')}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.80rem', padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <CreditCard size={14} />
                    <span>Gerenciar Provedores & Chaves Privadas</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA: USO DO COMPUTADOR & ATUALIZAÇÕES                                     */}
        {/* ========================================================================= */}
        {activeSubTab === 'computer' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
                Uso do Computador
              </h1>
              <p style={{ fontSize: '0.82rem', color: '#888888', marginTop: '4px' }}>
                Permissões concedidas aos agentes para executar scripts, testes e ações locais no sistema de arquivos.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              <h3 style={{ fontSize: '0.90rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                Segurança e Permissões do Sistema de Arquivos
              </h3>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Leitura Restrita ao Workspace</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Caminhos absolutos e travessias para fora do projeto ativo são bloqueados pelo executor.
                  </div>
                </div>
                {renderPolicyBadge('Aplicado pelo backend')}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Redação de Segredos</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Chaves e tokens conhecidos são removidos das saídas e dos registos de auditoria.
                  </div>
                </div>
                {renderPolicyBadge('Ativa')}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Aprovação de Comandos no Terminal</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Escritas e execuções exigem aprovação humana no modo ASK e continuam protegidas no modo AUTO.
                  </div>
                </div>
                {renderPolicyBadge('Obrigatória')}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Timeout de Comandos</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Definido por chamada da ferramenta e limitado pelo backend; não é configurável nesta página.
                  </div>
                </div>
                {renderPolicyBadge('Por chamada')}
              </div>
            </div>

            {onNavigate && (
              <div style={{ paddingTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => onNavigate('advisor')}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.80rem', padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Cpu size={14} />
                  <span>Ver Métricas do Host no Hardware Advisor</span>
                </button>
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'updates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
                Atualizações do Sistema
              </h1>
              <p style={{ fontSize: '0.82rem', color: '#888888', marginTop: '4px' }}>
                JARVIS AI Hub v3.0.1 • O estado de atualização não é verificado automaticamente nesta instalação.
              </p>
            </div>

            <div
              style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={16} color="#10b981" />
                  <strong style={{ fontSize: '0.94rem', color: '#ffffff' }}>Versão Instalada: v3.0.1</strong>
                  <span style={{ fontSize: '0.70rem', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'rgba(113, 113, 122, 0.2)', color: '#a1a1aa', fontWeight: 600 }}>
                    Não verificado
                  </span>
                </div>
                <span style={{ fontSize: '0.78rem', color: '#888888', marginTop: '4px', display: 'block' }}>
                  A verificação de releases ainda não está ligada ao backend. Consulte o repositório para confirmar atualizações.
                </span>
              </div>

              <button
                type="button"
                onClick={handleCheckUpdates}
                disabled={checkingUpdates}
                className="btn btn-secondary"
                style={{ fontSize: '0.80rem', padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <RefreshCw size={13} className={checkingUpdates ? 'spin' : ''} />
                <span>{checkingUpdates ? 'Verificando...' : 'Verificar Atualizações'}</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h3 style={{ fontSize: '0.90rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                Canal de Distribuição
              </h3>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Canal de Atualização</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Escolha a frequência de recebimento de novos recursos.
                  </div>
                </div>
                <select
                  value={updateChannel}
                  onChange={(e) => setUpdateChannel(e.target.value as any)}
                  style={{
                    backgroundColor: '#1f1f1f',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    color: '#f5f5f5',
                    fontSize: '0.80rem',
                    cursor: 'pointer',
                    minWidth: '160px',
                  }}
                >
                  <option value="stable">Estável (Recomendado)</option>
                  <option value="beta">Beta (Acesso Antecipado)</option>
                  <option value="dev">Desenvolvedor (Canary)</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Verificar Automaticamente ao Iniciar</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Busca releases no GitHub em segundo plano e notifica sobre novas versões.
                  </div>
                </div>
                {renderToggle(autoCheckUpdates, () => setAutoCheckUpdates(!autoCheckUpdates))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA: CONFIGURAÇÕES DO SERVIDOR (Botão Laranja)                           */}
        {/* ========================================================================= */}
        {activeSubTab === 'server' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {/* Cabeçalho com Status */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
                  Configurações do Servidor
                </h1>
                <p style={{ fontSize: '0.82rem', color: '#888888', marginTop: '4px' }}>
                  Instância local do JARVIS Hub executando em FastAPI e SQLite.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    backgroundColor:
                      apiHealthy === false
                        ? 'rgba(248, 113, 113, 0.12)'
                        : 'rgba(16, 185, 129, 0.12)',
                    border:
                      apiHealthy === false
                        ? '1px solid rgba(248, 113, 113, 0.3)'
                        : '1px solid rgba(16, 185, 129, 0.3)',
                  }}
                >
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: apiHealthy === false ? '#f87171' : '#10b981',
                      boxShadow: apiHealthy === false ? '0 0 8px #f87171' : '0 0 8px #10b981',
                    }}
                  />
                  <span
                    style={{
                      fontSize: '0.78rem',
                      color: apiHealthy === false ? '#f87171' : '#34d399',
                      fontWeight: 600,
                    }}
                  >
                    {apiHealthy === null
                      ? 'FastAPI: a verificar...'
                      : apiHealthy
                        ? 'FastAPI Operacional'
                        : 'FastAPI indisponível'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleTestApi}
                  disabled={testingApi}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.80rem', padding: '6px 12px', borderRadius: '8px' }}
                >
                  <RefreshCw size={13} className={testingApi ? 'spin' : ''} />
                  <span>{testingApi ? 'Testando...' : 'Testar Conexão'}</span>
                </button>
              </div>
            </div>

            <div
              role="note"
              style={{
                padding: '12px 16px',
                borderRadius: '10px',
                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.28)',
                fontSize: '0.78rem',
                color: '#fbbf24',
                lineHeight: 1.5,
              }}
            >
              Configuração apenas de leitura: bind, porta, expiração de sessão, runtime e nível de
              logs são definidos no arranque do backend por variáveis de ambiente ou ficheiro de
              configuração. Alterações aqui não são aplicadas; reinicie o servidor com os valores
              pretendidos.
            </div>

            {/* SEÇÃO 1: ACESSOS E USUÁRIOS (Exatamente o card da imagem do usuário) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h3 style={{ fontSize: '0.90rem', fontWeight: 600, color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={15} color="#f97316" />
                <span>Gestão de Acessos & Credenciais</span>
              </h3>

              <div
                style={{
                  padding: '20px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <strong style={{ fontSize: '0.90rem', color: '#ffffff', display: 'block' }}>Gestão de Acessos & Usuários</strong>
                  <span style={{ fontSize: '0.78rem', color: '#888888' }}>
                    Crie novas contas, redefina senhas de administrador e controle os tokens de acesso da instância.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('jarvis:open-access-management'))}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.80rem', padding: '7px 16px' }}
                >
                  Gerir Acessos
                </button>
              </div>

              {/* Duração da Sessão JWT */}
              <div
                style={{
                  padding: '16px 20px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 500, color: '#f5f5f5' }}>
                    Expiração de Sessão & Tokens JWT
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#888888', marginTop: '2px' }}>
                    Tempo de validade do cookie de autenticação segura antes de solicitar novo login.
                  </div>
                </div>

                <select
                  value={jwtExpirationHours}
                  onChange={(e) => setJwtExpirationHours(parseInt(e.target.value, 10))}
                  disabled
                  title="Definido no arranque do backend; não editável no dashboard."
                  style={{
                    backgroundColor: '#1f1f1f',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    color: '#f5f5f5',
                    fontSize: '0.80rem',
                    cursor: 'pointer',
                    minWidth: '150px',
                  }}
                >
                  <option value={8}>8 horas</option>
                  <option value={24}>24 horas (Padrão)</option>
                  <option value={168}>7 dias</option>
                  <option value={720}>30 dias</option>
                </select>
              </div>
            </div>

            {/* SEÇÃO 2: REDE, HOST & PORTAS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h3 style={{ fontSize: '0.90rem', fontWeight: 600, color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Network size={15} color="#38bdf8" />
                <span>Conectividade, Portas & Rede</span>
              </h3>

              <div
                style={{
                  padding: '18px 20px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 500, color: '#f5f5f5' }}>Endereço de Bind da Instância</div>
                    <div style={{ fontSize: '0.76rem', color: '#888888', marginTop: '2px' }}>
                      127.0.0.1 aceita apenas conexões deste computador. 0.0.0.0 permite acesso de outros dispositivos na mesma rede Wi-Fi (como o app Android).
                    </div>
                  </div>

                  <select
                    value={serverHost}
                    onChange={(e) => setServerHost(e.target.value as any)}
                    disabled
                    title="Definido no arranque do backend; não editável no dashboard."
                    style={{
                      backgroundColor: '#1f1f1f',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      color: '#f5f5f5',
                      fontSize: '0.80rem',
                      cursor: 'pointer',
                      minWidth: '180px',
                    }}
                  >
                    <option value="127.0.0.1">127.0.0.1 (Somente Local)</option>
                    <option value="0.0.0.0">0.0.0.0 (Rede Local / Android)</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                  <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.72rem', color: '#888888' }}>Porta da API FastAPI</span>
                    <input
                      type="number"
                      value={serverPort}
                      onChange={(e) => setServerPort(parseInt(e.target.value, 10) || 8000)}
                      readOnly
                      title="Definido no arranque do backend; não editável no dashboard."
                      style={{
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        fontSize: '0.90rem',
                        fontWeight: 600,
                        color: '#ffffff',
                        fontFamily: 'monospace',
                        width: '100%',
                      }}
                    />
                  </div>
                  <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.72rem', color: '#888888' }}>Porta do Dashboard Web</span>
                    <div style={{ fontSize: '0.90rem', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace' }}>5173</div>
                  </div>
                  <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.72rem', color: '#888888' }}>WebSocket de Eventos</span>
                    <div style={{ fontSize: '0.90rem', fontWeight: 600, color: '#10b981', fontFamily: 'monospace' }}>/ws/events (Ativo)</div>
                  </div>
                </div>
              </div>
            </div>

            {/* SEÇÃO 3: BANCO DE DADOS & ARMAZENAMENTO */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h3 style={{ fontSize: '0.90rem', fontWeight: 600, color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Database size={15} color="#10b981" />
                <span>Banco de Dados SQLite & Armazenamento</span>
              </h3>

              <div
                style={{
                  padding: '18px 20px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '14px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ fontSize: '0.88rem', color: '#ffffff' }}>data/jarvis.db</strong>
                    <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontWeight: 600 }}>
                      WAL Mode Ativo
                    </span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#888888', marginTop: '2px' }}>
                    Banco relacional com transações isoladas por conta, suporte a concorrência assíncrona e migrações automáticas.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleBackupDb}
                    disabled={backingUpDb}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '6px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Download size={13} />
                    <span>{backingUpDb ? 'Gerando...' : 'Backup Físico'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* SEÇÃO 4: RUNTIME DE MODELOS LOCAIS (OLLAMA) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h3 style={{ fontSize: '0.90rem', fontWeight: 600, color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Cpu size={15} color="#a855f7" />
                <span>Runtime de Inferência Local (Ollama)</span>
              </h3>

              <div
                style={{
                  padding: '18px 20px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 500, color: '#f5f5f5' }}>Endpoint do Servidor Ollama</div>
                    <div style={{ fontSize: '0.76rem', color: '#888888', marginTop: '2px' }}>
                      URL do daemon Ollama local onde os modelos GGUF (Qwen 2.5, Llama 3.3) estão carregados.
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="text"
                      value={ollamaEndpoint}
                      onChange={(e) => setOllamaEndpoint(e.target.value)}
                      readOnly
                      title="Configurado pelo backend; use Testar Ollama para verificar o runtime ativo."
                      style={{
                        backgroundColor: '#1f1f1f',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        color: '#f5f5f5',
                        fontSize: '0.80rem',
                        fontFamily: 'monospace',
                        width: '200px',
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleTestOllama}
                      disabled={testingOllama}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '6px 12px', borderRadius: '8px' }}
                    >
                      <span>{testingOllama ? 'Verificando...' : 'Testar Ollama'}</span>
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 500, color: '#f5f5f5' }}>Janela de Contexto Padrão (Tokens)</div>
                    <div style={{ fontSize: '0.76rem', color: '#888888', marginTop: '2px' }}>
                      Capacidade de memória e histórico que cada especialista mantém na sessão de raciocínio.
                    </div>
                  </div>

                  <select
                    value={contextWindow}
                    onChange={(e) => setContextWindow(e.target.value)}
                    disabled
                    title="Configurado pelo backend; não editável no dashboard."
                    style={{
                      backgroundColor: '#1f1f1f',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      color: '#f5f5f5',
                      fontSize: '0.80rem',
                      cursor: 'pointer',
                      minWidth: '160px',
                    }}
                  >
                    <option value="8192">8.192 tokens (Padrão)</option>
                    <option value="16384">16.384 tokens (Médio)</option>
                    <option value="32768">32.768 tokens (Longo)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* SEÇÃO 5: LOGS E DIAGNÓSTICO DO SERVIDOR */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h3 style={{ fontSize: '0.90rem', fontWeight: 600, color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Terminal size={15} color="#f59e0b" />
                <span>Logs do Servidor & Diagnóstico</span>
              </h3>

              <div
                style={{
                  padding: '18px 20px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '14px',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 500, color: '#f5f5f5' }}>
                    Nível de Detalhe dos Logs (Verbosity)
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#888888', marginTop: '2px' }}>
                    Controle o nível de detalhe dos registros da API FastAPI no console e em disco.
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <select
                    value={logLevel}
                    onChange={(e) => setLogLevel(e.target.value as any)}
                    disabled
                    title="Definido no arranque do backend; não editável no dashboard."
                    style={{
                      backgroundColor: '#1f1f1f',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      color: '#f5f5f5',
                      fontSize: '0.80rem',
                      cursor: 'pointer',
                      minWidth: '110px',
                    }}
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
                      className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '6px 12px', borderRadius: '8px' }}
                    >
                      <span>Ver Logs ao Vivo</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleExportDiagnostics}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '6px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Download size={13} />
                    <span>Exportar Diagnóstico</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
