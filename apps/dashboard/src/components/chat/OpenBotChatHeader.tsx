import React, { useState } from 'react';
import {
  PanelLeft,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Cpu,
  FolderGit2,
  Download,
  Check,
  ChevronDown,
} from 'lucide-react';

export interface ChatTabItem {
  id: string;
  title: string;
}

interface OpenBotChatHeaderProps {
  tabs: ChatTabItem[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  onToggleRail: () => void;
  isRailOpen: boolean;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  activeProjectId?: string | null;
  activeProjectName?: string | null;
  onDetachProject?: () => void;
  onOpenProjectModal?: () => void;
  onExportChat?: () => void;
}

const AVAILABLE_MODELS = [
  { id: 'ollama/qwen2.5-coder:7b', label: 'ollama/qwen2.5-coder:7b', provider: 'Local Ollama', badge: 'Recomendado' },
  { id: 'ollama/llama3.3:70b', label: 'ollama/llama3.3:70b', provider: 'Local Ollama', badge: 'Pesado' },
  { id: 'claude-3-5-sonnet', label: 'claude-3-5-sonnet', provider: 'Anthropic Cloud', badge: 'Cloud' },
  { id: 'gemini-1.5-pro', label: 'gemini-1.5-pro', provider: 'Google Cloud', badge: 'Cloud' },
  { id: 'gpt-4o', label: 'gpt-4o', provider: 'OpenAI Cloud', badge: 'Cloud' },
];

export const OpenBotChatHeader: React.FC<OpenBotChatHeaderProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onToggleRail,
  isRailOpen,
  selectedModel,
  onSelectModel,
  activeProjectId,
  activeProjectName,
  onDetachProject,
  onOpenProjectModal,
  onExportChat,
}) => {
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  return (
    <header
      style={{
        height: '46px',
        padding: '0 14px',
        backgroundColor: '#161616',
        borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: '12px',
        zIndex: 20,
        position: 'relative',
      }}
    >
      {/* Lado Esquerdo: Toggle da Gaveta, < >, Abas de Conversas */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        {/* Toggle da Barra Lateral / Gaveta do Chat [◫] */}
        <button
          type="button"
          onClick={onToggleRail}
          className="btn btn-ghost"
          style={{
            padding: '5px',
            borderRadius: '6px',
            color: isRailOpen ? '#ffffff' : '#888888',
            backgroundColor: isRailOpen ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
          title={isRailOpen ? 'Ocultar canais' : 'Mostrar canais'}
        >
          <PanelLeft size={16} />
        </button>

        {/* Navegação Histórico < > */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="btn btn-ghost"
            style={{ padding: '4px 5px', borderRadius: '4px', color: '#888888' }}
            title="Voltar"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => window.history.forward()}
            className="btn btn-ghost"
            style={{ padding: '4px 5px', borderRadius: '4px', color: '#888888' }}
            title="Avançar"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Separador vertical sutil */}
        <div style={{ width: '1px', height: '18px', backgroundColor: 'rgba(255, 255, 255, 0.08)', margin: '0 4px' }} />

        {/* Abas de Conversas Abertas (Estilo OpenBot Tabs) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', maxWidth: '400px' }}>
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`openbot-tab-pill ${isActive ? 'is-active' : ''}`}
              >
                {/* Ícone Coral de Mensagem */}
                <div
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: isActive ? '#f87171' : '#737373',
                  }}
                />
                <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tab.title}
                </span>

                {tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '1px',
                      color: '#a3a3a3',
                      display: 'flex',
                    }}
                    title="Fechar aba"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            );
          })}

          {/* Botão + Adicionar Nova Aba */}
          <button
            type="button"
            onClick={onNewTab}
            className="btn btn-ghost"
            style={{ padding: '4px 6px', borderRadius: '6px', color: '#a3a3a3' }}
            title="Nova aba de chat (+)"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* Lado Direito: Seletor de Modelo, Anexar Projeto e Ações */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {/* Anexo de Projeto (se houver) */}
        {activeProjectId ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(217, 119, 87, 0.12)',
              border: '1px solid rgba(217, 119, 87, 0.3)',
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              color: '#f5f5f5',
            }}
          >
            <FolderGit2 size={12} color="#d97757" />
            <span style={{ fontWeight: 600 }}>{activeProjectName || activeProjectId}</span>
            {onDetachProject && (
              <button
                type="button"
                onClick={onDetachProject}
                style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0 }}
                title="Desvincular"
              >
                <X size={11} />
              </button>
            )}
          </div>
        ) : onOpenProjectModal ? (
          <button
            type="button"
            onClick={onOpenProjectModal}
            className="btn btn-ghost hide-mobile"
            style={{ fontSize: '0.74rem', padding: '4px 8px', borderRadius: '6px', color: '#a3a3a3' }}
          >
            <span>+ Projeto</span>
          </button>
        ) : null}

        {/* Dropdown do Seletor de Modelo Integrado (Estilo OpenBot [💻 ollama/qwen2.5-coder:7b v]) */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setModelDropdownOpen((prev) => !prev)}
            className="openbot-model-pill"
            title="Trocar modelo de inteligência artificial"
          >
            <Cpu size={12} color="#38bdf8" />
            <span style={{ fontWeight: 500 }}>{selectedModel}</span>
            <ChevronDown size={11} color="#737373" />
          </button>

          {modelDropdownOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: '32px',
                right: 0,
                width: '260px',
                backgroundColor: '#1b1b1b',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '10px',
                boxShadow: '0 12px 36px rgba(0, 0, 0, 0.7)',
                padding: '6px',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <div style={{ padding: '6px 8px', fontSize: '0.68rem', color: '#737373', fontWeight: 600, textTransform: 'uppercase' }}>
                Modelos Conectados
              </div>

              {AVAILABLE_MODELS.map((m) => {
                const isSelected = selectedModel === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onSelectModel(m.id);
                      setModelDropdownOpen(false);
                    }}
                    className="btn btn-ghost"
                    style={{
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      fontSize: '0.78rem',
                      borderRadius: '6px',
                      backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                      color: isSelected ? '#38bdf8' : '#d4d4d4',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{m.label}</span>
                      <span style={{ fontSize: '0.66rem', color: '#737373' }}>{m.provider}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '0.62rem',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(255, 255, 255, 0.06)',
                          color: '#a3a3a3',
                        }}
                      >
                        {m.badge}
                      </span>
                      {isSelected && <Check size={13} color="#38bdf8" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Botão Exportar Chat */}
        {onExportChat && (
          <button
            type="button"
            onClick={onExportChat}
            className="btn btn-ghost"
            style={{ padding: '5px 7px', borderRadius: '6px', color: '#a3a3a3' }}
            title="Exportar conversa em Markdown (.md)"
          >
            <Download size={14} />
          </button>
        )}
      </div>
    </header>
  );
};
