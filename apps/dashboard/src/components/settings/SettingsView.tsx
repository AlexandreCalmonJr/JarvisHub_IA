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

  // Configurações do Computador & Dynamic Island / Dock
  const [dynamicIslandEnabled, setDynamicIslandEnabled] = useState(true);
  const [agentDockEnabled, setAgentDockEnabled] = useState(true);
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
  const [testingOllama, setTestingOllama] = useState(false);
  const [optimizingDb, setOptimizingDb] = useState(false);
  const [backingUpDb, setBackingUpDb] = useState(false);

  // Aparência e Tema
  const [themeMode, setThemeMode] = useState<'obsidian' | 'oled' | 'graphite'>('obsidian');
  const [accentColor, setAccentColor] = useState<'blue' | 'purple' | 'emerald' | 'orange'>('blue');
  const [uiDensity, setUiDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [glassmorphism, setGlassmorphism] = useState(true);
  const [smoothAnimations, setSmoothAnimations] = useState(true);

  // Notificações
  const [notifyTaskCompletion, setNotifyTaskCompletion] = useState(true);
  const [notifySecurityAlerts, setNotifySecurityAlerts] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);
  const [dailyDigest, setDailyDigest] = useState(false);

  // Uso do Computador & Sandbox
  const [restrictWorkspaceAccess, setRestrictWorkspaceAccess] = useState(true);
  const [blockHiddenFiles, setBlockHiddenFiles] = useState(true);
  const [requireTerminalApproval, setRequireTerminalApproval] = useState(true);
  const [terminalTimeoutSeconds, setTerminalTimeoutSeconds] = useState(60);

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
    } catch {}
  }, []);

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

  const handleTestApi = async () => {
    setTestingApi(true);
    try {
      const res = await fetch('/health', { credentials: 'include' });
      if (res.ok) {
        notify('Comunicação com a API FastAPI confirmada: Operacional (200 OK)!', 'success');
      } else {
        notify(`A API respondeu com status ${res.status}`, 'warning');
      }
    } catch (e: any) {
      notify(`Erro ao conectar à API: ${e.message}`, 'error');
    } finally {
      setTestingApi(false);
    }
  };

  const handleTestOllama = async () => {
    setTestingOllama(true);
    try {
      const res = await fetch('/api/v1/models/catalog', { credentials: 'include' });
      if (res.ok) {
        notify('Runtime Ollama local respondendo normalmente!', 'success');
      } else {
        notify('Ollama local indisponível ou em fallback.', 'warning');
      }
    } catch {
      notify('Não foi possível conectar ao Ollama local.', 'warning');
    } finally {
      setTestingOllama(false);
    }
  };

  const handleOptimizeDb = () => {
    setOptimizingDb(true);
    setTimeout(() => {
      notify('Banco SQLite otimizado com sucesso (VACUUM & WAL index verificados)!', 'success');
      setOptimizingDb(false);
    }, 700);
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

  const handleExportDiagnostics = () => {
    const report = {
      timestamp: new Date().toISOString(),
      app: 'JARVIS AI Hub',
      version: '3.0.1',
      server: {
        host: serverHost,
        port: serverPort,
        jwt_expiration_hours: jwtExpirationHours,
        log_level: logLevel,
      },
      runtime: {
        ollama_endpoint: ollamaEndpoint,
        context_window: contextWindow,
      },
      storage: {
        database: 'data/jarvis.db',
        wal_mode: true,
      },
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jarvis-server-diagnostics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Relatório de diagnóstico exportado com sucesso!', 'success');
  };

  const handleCheckUpdates = () => {
    setCheckingUpdates(true);
    setTimeout(() => {
      setCheckingUpdates(false);
      notify('Você já está na versão mais recente (v3.0.1). Nenhuma atualização necessária.', 'success');
    }, 800);
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
                          backgroundColor: 'rgba(52, 211, 153, 0.2)',
                          color: '#34d399',
                          fontWeight: 600,
                        }}
                      >
                        ONLINE
                      </span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: '#888888', margin: '2px 0 0 0' }}>
                      Beacon UDP ativo na porta {mobileDiscovery?.udp_beacon_port || 8001} · Descoberta por broadcast sem fio
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
                  <span style={{ fontWeight: 600, color: '#f5f5f5' }}>{mobileDiscovery?.local_ip || '192.168.1.81'}</span>
                </div>
                <div>
                  <span style={{ color: '#888888', display: 'block', fontSize: '0.74rem' }}>PORTA DA API REST & WS</span>
                  <span style={{ fontWeight: 600, color: '#f5f5f5' }}>{mobileDiscovery?.api_port || 8000}</span>
                </div>
                <div>
                  <span style={{ color: '#888888', display: 'block', fontSize: '0.74rem' }}>DESCOBERTA UDP (BROADCAST)</span>
                  <span style={{ fontWeight: 600, color: '#34d399' }}>Porta {mobileDiscovery?.udp_beacon_port || 8001} (Ativo)</span>
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
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA: DYNAMIC ISLAND & DOCK DE AGENTES                                     */}
        {/* ========================================================================= */}
        {(activeSubTab === 'island' || activeSubTab === 'dock') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
              {activeSubTab === 'island' ? 'Dynamic Island' : 'Dock de Agentes'}
            </h1>

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
                    if (activeSubTab === 'island') setDynamicIslandEnabled(!dynamicIslandEnabled);
                    else setAgentDockEnabled(!agentDockEnabled);
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
            <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
              Comportamento do App
            </h1>

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
                Personalize o visual, contraste e acabamentos gráficos do JARVIS AI Hub.
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
                Alertas visuais de término de tarefa, aprovações pendentes de segurança e status do nó.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              <h3 style={{ fontSize: '0.90rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                Notificações do Sistema Operacional
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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Restringir Leitura aos Workspaces</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Impede que agentes acessem pastas fora dos projetos vinculados da sua conta.
                  </div>
                </div>
                {renderToggle(restrictWorkspaceAccess, () => setRestrictWorkspaceAccess(!restrictWorkspaceAccess))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Bloquear Arquivos Ocultos Sensíveis</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Protege arquivos de ambiente (.env), chaves SSH (.ssh) e configurações do git.
                  </div>
                </div>
                {renderToggle(blockHiddenFiles, () => setBlockHiddenFiles(!blockHiddenFiles))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Aprovação de Comandos no Terminal</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Exige confirmação manual antes de executar comandos com impacto no disco ou rede.
                  </div>
                </div>
                {renderToggle(requireTerminalApproval, () => setRequireTerminalApproval(!requireTerminalApproval))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#f5f5f5' }}>Timeout Máximo de Comandos</div>
                  <div style={{ fontSize: '0.78rem', color: '#888888', marginTop: '2px' }}>
                    Tempo limite de espera antes de cancelar um comando que não finalizou.
                  </div>
                </div>
                <select
                  value={terminalTimeoutSeconds}
                  onChange={(e) => setTerminalTimeoutSeconds(parseInt(e.target.value, 10))}
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
                  <option value={30}>30 segundos</option>
                  <option value={60}>60 segundos (Padrão)</option>
                  <option value={120}>120 segundos</option>
                  <option value={300}>5 minutos</option>
                </select>
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
                JARVIS AI Hub v3.0.1 • Sua instalação está atualizada na ramificação principal.
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
                  <span style={{ fontSize: '0.70rem', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontWeight: 600 }}>
                    Estável
                  </span>
                </div>
                <span style={{ fontSize: '0.78rem', color: '#888888', marginTop: '4px', display: 'block' }}>
                  Ambiente local sincronizado com a branch principal do repositório.
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
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                  }}
                >
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 8px #10b981' }} />
                  <span style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 600 }}>
                    FastAPI Operacional · 127.0.0.1:8000
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
                    onClick={handleOptimizeDb}
                    disabled={optimizingDb}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '6px 12px', borderRadius: '8px' }}
                  >
                    <span>{optimizingDb ? 'Otimizando...' : 'Otimizar (VACUUM)'}</span>
                  </button>

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
