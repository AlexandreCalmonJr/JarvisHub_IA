import React, { useState } from 'react';
import {
  MessageSquare,
  Workflow,
  ListTodo,
  TrendingUp,
  Library,
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
} from 'lucide-react';

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
  onOpenSettings?: () => void;
  onOpenHelp?: () => void;
  onOpenProfile?: () => void;
  pendingApprovalsCount?: number;
}

export const PrimaryRail: React.FC<PrimaryRailProps> = ({
  activeTab,
  onNavigate,
  onOpenSettings,
  onOpenHelp,
  onOpenProfile,
  pendingApprovalsCount = 0,
}) => {
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [serverMenuOpen, setServerMenuOpen] = useState(false);

  // Itens configuráveis do trilho (com suporte a pin estilo OpenBot)
  const [pinnedItems, setPinnedItems] = useState<Record<string, boolean>>({
    chat: true,
    backend_studio: true, // Fluxos de trabalho
    tasks: true,          // Tarefas
    executive_report: true, // Uso / Métricas
    workspace: true,      // Biblioteca / Arquivos
    office: false,        // Escritório Virtual
    coding: false,        // Coding Agent
    agents: false,        // Especialistas
    approvals: false,     // Central de Aprovações
    knowledge: false,     // Base de Conhecimento
    models: false,        // Provedores
    skills: false,        // Habilidades
    security: false,      // Segurança
    quality: false,       // Qualidade QA
    design: false,        // Design Studio
    advisor: false,       // Hardware
    server_logs: false,   // Logs do Servidor
  });

  const togglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const navItems = [
    { id: 'chat', label: 'Conversas', icon: MessageSquare },
    { id: 'backend_studio', label: 'Fluxos de trabalho', icon: Workflow },
    { id: 'tasks', label: 'Tarefas', icon: ListTodo, badge: pendingApprovalsCount },
    { id: 'executive_report', label: 'Uso & Custos', icon: TrendingUp },
    { id: 'workspace', label: 'Biblioteca', icon: Library },
  ];

  const overflowItems = [
    { id: 'office', label: 'Escritório Virtual', icon: Building2 },
    { id: 'coding', label: 'Coding Agent', icon: Code2 },
    { id: 'agents', label: 'Centro de Agentes', icon: Bot },
    { id: 'approvals', label: 'Central de Aprovações', icon: CheckSquare, badge: pendingApprovalsCount },
    { id: 'knowledge', label: 'Base de Conhecimento', icon: Database },
    { id: 'models', label: 'Provedores & Chaves', icon: Cpu },
    { id: 'skills', label: 'Rotinas & Habilidades', icon: Layers },
    { id: 'security', label: 'Segurança & Auditoria', icon: ShieldCheck },
    { id: 'quality', label: 'Qualidade & QA', icon: CheckSquare },
    { id: 'design', label: 'Design Studio', icon: Palette },
    { id: 'advisor', label: 'Hardware Advisor', icon: Sparkles },
    { id: 'server_logs', label: 'Logs do Servidor', icon: Terminal },
  ];

  return (
    <nav
      className="openbot-primary-rail"
      aria-label="Navegação Principal"
      style={{
        width: '64px',
        height: '100dvh',
        backgroundColor: '#0c0c0e',
        borderRight: '1px solid rgba(255, 255, 255, 0.07)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px 0 16px',
        gap: '6px',
        flexShrink: 0,
        zIndex: 60,
        userSelect: 'none',
        position: 'relative',
      }}
    >
      {/* Bot Icon Avatar Lilás no Topo (OpenBot Logo) */}
      <button
        type="button"
        onClick={() => onNavigate('overview')}
        aria-label="Ir para Início"
        style={{
          width: '38px',
          height: '38px',
          borderRadius: '12px',
          backgroundColor: '#c084fc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(192, 132, 252, 0.35)',
          transition: 'transform 0.18s ease',
        }}
        title="JARVIS AI Hub"
      >
        <div style={{ display: 'flex', gap: '3.5px', alignItems: 'center' }}>
          <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#1e1b4b' }} />
          <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#1e1b4b' }} />
        </div>
      </button>

      {/* Ícones de Navegação Principais */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center', width: '100%' }}>
        {navItems
          .filter((item) => pinnedItems[item.id] !== false)
          .map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-label={item.label}
                className={`rail-nav-btn ${isActive ? 'is-active' : ''}`}
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  backgroundColor: isActive ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                  color: isActive ? '#ffffff' : '#9ca3af',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.18s ease',
                }}
                title={item.label}
              >
                <Icon size={20} color={isActive ? '#f3f4f6' : '#9ca3af'} />
                {item.badge && item.badge > 0 ? (
                  <span
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#f59e0b',
                      boxShadow: '0 0 6px #f59e0b',
                    }}
                  />
                ) : null}
              </button>
            );
          })}

        {/* Botão de Mais Opções (...) com Menu de Pins */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setMoreMenuOpen((prev) => !prev)}
            aria-label="Mais aplicações"
            className="rail-nav-btn"
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              backgroundColor: moreMenuOpen ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: '#9ca3af',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
            }}
            title="Mais aplicações"
          >
            <MoreHorizontal size={20} />
          </button>

          {/* Pop-up de Pins (Exatamente igual ao OpenBot - Image 7) */}
          {moreMenuOpen && (
            <div
              className="openbot-pin-popup"
              style={{
                position: 'absolute',
                left: '56px',
                top: '0',
                width: '220px',
                maxHeight: '440px',
                overflowY: 'auto',
                backgroundColor: '#18181b',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '8px',
                boxShadow: '0 12px 32px rgba(0, 0, 0, 0.7)',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              {[...navItems, ...overflowItems].map((item) => {
                const Icon = item.icon;
                const isPinned = pinnedItems[item.id] !== false;

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
                      padding: '8px 10px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: '#e4e4e7',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon size={16} color="#a1a1aa" />
                      <span>{item.label}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => togglePin(item.id, e)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: isPinned ? '#ffffff' : '#52525b',
                        cursor: 'pointer',
                        padding: '2px',
                        display: 'flex',
                      }}
                      title={isPinned ? 'Desafixar do trilho' : 'Fixar no trilho'}
                    >
                      <Pin size={14} style={{ transform: isPinned ? 'rotate(45deg)' : 'none' }} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Espaçador flexível central */}
      <div style={{ flex: 1 }} />

      {/* Ícones Inferiores (Loja, Ajuda, Configurações, Perfil) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center', width: '100%' }}>
        {/* Loja / Marketplace */}
        <button
          type="button"
          onClick={() => onNavigate('skills')}
          className={`rail-nav-btn ${activeTab === 'skills' ? 'is-active' : ''}`}
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            backgroundColor: activeTab === 'skills' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
            color: activeTab === 'skills' ? '#ffffff' : '#9ca3af',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          title="Loja de Apps & Conectores"
        >
          <Store size={20} />
        </button>

        {/* Ajuda / Novidades */}
        <button
          type="button"
          onClick={onOpenHelp || (() => onNavigate('learning'))}
          className={`rail-nav-btn ${activeTab === 'learning' ? 'is-active' : ''}`}
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            backgroundColor: activeTab === 'learning' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
            color: activeTab === 'learning' ? '#ffffff' : '#9ca3af',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          title="Novidades & Ajuda"
        >
          <HelpCircle size={20} />
        </button>

        {/* Configurações */}
        <button
          type="button"
          onClick={onOpenSettings || (() => onNavigate('settings'))}
          className={`rail-nav-btn ${activeTab === 'settings' ? 'is-active' : ''}`}
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            backgroundColor: activeTab === 'settings' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
            color: activeTab === 'settings' ? '#ffffff' : '#9ca3af',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          title="Configurações"
        >
          <Settings size={20} />
        </button>

        {/* Perfil / Seletor de Servidor (Avatar Quadrado Laranja - Image 12) */}
        <div style={{ position: 'relative', marginTop: '6px' }}>
          <button
            type="button"
            onClick={() => setServerMenuOpen((prev) => !prev)}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '9px',
              backgroundColor: '#f97316',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(249, 115, 22, 0.4)',
              outline: 'none',
            }}
            title="Servidor JARVIS / Perfil"
          >
            <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
              <span style={{ width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#431407' }} />
              <span style={{ width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#431407' }} />
            </div>
          </button>

          {/* Menu Dropdown de Servidor (Image 12) */}
          {serverMenuOpen && (
            <div
              style={{
                position: 'absolute',
                left: '48px',
                bottom: '0',
                width: '230px',
                backgroundColor: '#18181b',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '10px',
                boxShadow: '0 12px 32px rgba(0, 0, 0, 0.8)',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#71717a', padding: '4px 8px' }}>
                SERVIDORES
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  fontSize: '13px',
                  color: '#ffffff',
                }}
              >
                <Check size={16} color="#10b981" />
                <span style={{ width: '16px', height: '16px', borderRadius: '4px', backgroundColor: '#f97316' }} />
                <span style={{ fontWeight: 600 }}>JARVIS Hub Local</span>
              </div>
              <div
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('jarvis:open-android-pairing'));
                  setServerMenuOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  color: '#d4d4d8',
                  cursor: 'pointer',
                }}
              >
                <Smartphone size={15} color="#38bdf8" />
                <span>Conectar app Android</span>
              </div>
              <div
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('jarvis:open-access-management'));
                  setServerMenuOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  color: '#d4d4d8',
                  cursor: 'pointer',
                }}
              >
                <Users size={15} color="#c084fc" />
                <span>Gerir acessos da equipe</span>
              </div>
              <div
                onClick={() => {
                  if (onOpenProfile) onOpenProfile();
                  setServerMenuOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  color: '#d4d4d8',
                  cursor: 'pointer',
                }}
              >
                <Server size={15} color="#a1a1aa" />
                <span>Perfil e configurações</span>
              </div>
              <div
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('jarvis:logout'));
                  setServerMenuOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  color: '#f87171',
                  cursor: 'pointer',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  marginTop: '4px',
                }}
              >
                <LogOut size={15} color="#f87171" />
                <span>Sair da conta</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};
