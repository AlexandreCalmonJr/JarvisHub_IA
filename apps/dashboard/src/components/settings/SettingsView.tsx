import React, { useState, useEffect } from 'react';
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
  void onNavigate;
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
                Conectar Celular
              </h1>
              <p style={{ fontSize: '0.82rem', color: '#888888', marginTop: '4px' }}>
                Vincule seu smartphone Android para interagir por voz e receber respostas do JARVIS em qualquer lugar.
              </p>
            </div>

            <div
              style={{
                padding: '24px',
                borderRadius: '14px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
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
                  <Smartphone size={24} color="#38bdf8" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                    App JARVIS Android
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: '#888888', margin: '2px 0 0 0' }}>
                    Sincronização bidirecional por WebSocket seguro e reconhecimento de voz.
                  </p>
                </div>
              </div>

              <div style={{ fontSize: '0.82rem', color: '#cccccc', lineHeight: 1.6 }}>
                1. Instale o APK do JARVIS Hub no seu smartphone.<br />
                2. Clique no botão abaixo para gerar um token de autenticação pessoal.<br />
                3. No app Android, informe o IP do seu computador na rede Wi-Fi e cole o token.
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('jarvis:open-android-pairing'))}
                  className="btn btn-primary"
                  style={{ fontSize: '0.84rem', padding: '8px 18px', backgroundColor: '#38bdf8', color: '#000000', fontWeight: 600 }}
                >
                  Conectar Novo Dispositivo Android
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
              Aparência e Tema
            </h1>
            <p style={{ fontSize: '0.82rem', color: '#888888', marginTop: '4px' }}>
              Interface com tema Dark Obsidian nativo e design tokens unificados inspirados no OpenBot.
            </p>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA: NOTIFICAÇÕES                                                         */}
        {/* ========================================================================= */}
        {activeSubTab === 'notifications' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
              Notificações
            </h1>
            <p style={{ fontSize: '0.82rem', color: '#888888', marginTop: '4px' }}>
              Alertas visuais de término de tarefa, aprovações pendentes de segurança e status do nó.
            </p>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA: COBRANÇA                                                             */}
        {/* ========================================================================= */}
        {activeSubTab === 'billing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
              Cobrança & Quotas
            </h1>
            <p style={{ fontSize: '0.82rem', color: '#888888', marginTop: '4px' }}>
              JARVIS AI Hub é 100% de código aberto e auto-hospedado. Use seus modelos Ollama locais ou configure chaves de API próprias no cofre sem cobranças da plataforma.
            </p>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA: USO DO COMPUTADOR & ATUALIZAÇÕES                                     */}
        {/* ========================================================================= */}
        {activeSubTab === 'computer' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
              Uso do Computador
            </h1>
            <p style={{ fontSize: '0.82rem', color: '#888888', marginTop: '4px' }}>
              Permissões concedidas aos agentes para executar scripts, testes e ações locais no sistema de arquivos.
            </p>
          </div>
        )}

        {activeSubTab === 'updates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
              Atualizações do Sistema
            </h1>
            <p style={{ fontSize: '0.82rem', color: '#888888', marginTop: '4px' }}>
              JARVIS AI Hub v3.0.1 • Sua instalação está atualizada na ramificação principal.
            </p>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA: CONFIGURAÇÕES DO SERVIDOR (Botão Laranja)                           */}
        {/* ========================================================================= */}
        {activeSubTab === 'server' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
                Configurações do Servidor
              </h1>
              <p style={{ fontSize: '0.82rem', color: '#888888', marginTop: '4px' }}>
                Instância local do JARVIS Hub executando em FastAPI e SQLite.
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
          </div>
        )}
      </main>
    </div>
  );
};
