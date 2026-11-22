import React, { useState, useEffect, useRef } from 'react';
import {
  PanelLeft,
  Plus,
  X,
  Cpu,
  FolderGit2,
  Download,
  Check,
  ChevronDown,
  Globe,
  Sparkles,
} from 'lucide-react';
import { FormattedChatModel } from '../../services/chatModels';

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
  availableModels?: FormattedChatModel[];
  activeProjectId?: string | null;
  activeProjectName?: string | null;
  onDetachProject?: () => void;
  onOpenProjectModal?: () => void;
  onExportChat?: () => void;
  webSearchEnabled?: boolean;
  onToggleWebSearch?: () => void;
  onOpenArtifactStudio?: () => void;
}

const AVAILABLE_MODELS = [
  { id: 'gemini-4-hydrogen', label: 'gemini-4-hydrogen', provider: 'Gemini Online', badge: 'Online + Web' },
  { id: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite', provider: 'Gemini Online', badge: 'Rápido' },
  { id: 'qwen2.5-coder:7b', label: 'qwen2.5-coder:7b', provider: 'Local Ollama', badge: 'Local Código' },
  { id: 'qwen2.5:7b', label: 'qwen2.5:7b', provider: 'Local Ollama', badge: 'Local Geral' },
  { id: 'llama3.2:3b', label: 'llama3.2:3b', provider: 'Local Ollama', badge: 'Local Leve' },
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
  availableModels,
  activeProjectId,
  activeProjectName,
  onDetachProject,
  onOpenProjectModal,
  onExportChat,
  webSearchEnabled = false,
  onToggleWebSearch,
  onOpenArtifactStudio,
}) => {
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const modelList =
    availableModels && availableModels.length > 0
      ? availableModels.map((m) => ({
          id: m.id,
          label: m.label,
          provider: m.provider,
          badge: m.effort,
        }))
      : AVAILABLE_MODELS;

  const activeModelObj = modelList.find((m) => m.id === selectedModel);

  return (
    <header
      style={{
        height: 'var(--topbar-height)',
        padding: '0 16px',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: '12px',
        zIndex: 20,
        position: 'relative',
      }}
    >
      {/* Esquerda: Toggle Gaveta + Abas de Conversa */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
        <button
          type="button"
          onClick={onToggleRail}
          className={`btn btn-ghost btn-icon-sm ${isRailOpen ? 'is-active' : ''}`}
          title={isRailOpen ? 'Ocultar lista de conversas' : 'Mostrar lista de conversas'}
          aria-label="Alternar lista de conversas"
        >
          <PanelLeft size={16} />
        </button>

        <div style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-color)' }} />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            overflowX: 'auto',
            minWidth: 0,
          }}
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`openbot-tab-pill ${isActive ? 'is-active' : ''}`}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: isActive ? 'var(--accent-light)' : 'var(--text-muted)',
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    maxWidth: '140px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab.title}
                </span>

                {tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    className="btn btn-ghost btn-icon-sm"
                    title="Fechar aba"
                    aria-label={`Fechar aba ${tab.title}`}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={onNewTab}
            className="btn btn-ghost btn-icon-sm"
            title="Nova aba de conversa"
            aria-label="Nova aba de conversa"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Direita: Projeto, Seletor de Modelo e Exportação */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {activeProjectId ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--accent-soft)',
              border: '1px solid var(--border-accent)',
              padding: '4px 10px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.76rem',
              color: 'var(--text-primary)',
            }}
          >
            <FolderGit2 size={13} color="var(--accent-light)" />
            <span style={{ fontWeight: 600 }}>{activeProjectName || activeProjectId}</span>
            {onDetachProject && (
              <button
                type="button"
                onClick={onDetachProject}
                className="btn btn-ghost btn-icon-sm"
                title="Desvincular projeto"
                aria-label="Desvincular projeto"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ) : onOpenProjectModal ? (
          <button
            type="button"
            onClick={onOpenProjectModal}
            className="btn btn-secondary btn-sm hide-mobile"
          >
            <FolderGit2 size={13} />
            <span>Projeto</span>
          </button>
        ) : null}

        {onToggleWebSearch && (
          <button
            type="button"
            data-testid="toggle-web-search-btn"
            onClick={onToggleWebSearch}
            className={`btn btn-sm ${webSearchEnabled ? 'btn-primary' : 'btn-secondary'}`}
            title={webSearchEnabled ? 'Pesquisa Web ao vivo ativada' : 'Ativar Pesquisa Web ao vivo (Gemini)'}
          >
            <Globe size={13} />
            <span className="hide-mobile">{webSearchEnabled ? 'Web: ON' : 'Pesquisa Web'}</span>
          </button>
        )}

        {onOpenArtifactStudio && (
          <button
            type="button"
            data-testid="open-artifact-studio-btn"
            onClick={onOpenArtifactStudio}
            className="btn btn-secondary btn-sm"
            title="Abrir Estúdio de Artefatos (.PPTX, .PDF, .PNG)"
          >
            <Sparkles size={13} color="var(--accent-light)" />
            <span className="hide-mobile">Artefatos</span>
          </button>
        )}

        {/* Seletor de Modelo */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setModelDropdownOpen((prev) => !prev)}
            className="openbot-model-pill"
            title="Trocar modelo de inteligência artificial"
          >
            <Cpu size={13} color="var(--accent-light)" />
            <span style={{ fontWeight: 500, maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeModelObj ? activeModelObj.label : selectedModel}
            </span>
            <ChevronDown size={12} color="var(--text-muted)" />
          </button>

          {modelDropdownOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: '38px',
                right: 0,
                width: '310px',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg)',
                padding: '8px',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                gap: '3px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 8px 6px',
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                <span>Modelos conectados</span>
                <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  {modelList.length} ativos
                </span>
              </div>

              {modelList.map((m) => {
                const isSelected = selectedModel === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onSelectModel(m.id);
                      setModelDropdownOpen(false);
                    }}
                    className={`btn btn-ghost btn-sm btn-block btn-between ${isSelected ? 'is-active' : ''}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <Cpu size={14} color={isSelected ? 'var(--accent-light)' : 'var(--text-muted)'} style={{ flexShrink: 0 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontWeight: isSelected ? 600 : 500,
                            fontSize: '0.78rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {m.label}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{m.provider}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{m.badge}</span>
                      {isSelected && <Check size={14} color="var(--accent-light)" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {onExportChat && (
          <button
            type="button"
            onClick={onExportChat}
            className="btn btn-ghost btn-icon-sm"
            title="Exportar conversa em Markdown (.md)"
            aria-label="Exportar conversa"
          >
            <Download size={15} />
          </button>
        )}
      </div>
    </header>
  );
};
