import React from 'react';
import { FolderGit2, X } from 'lucide-react';
import { CanvasArtifact } from './ArtifactCanvas';

interface ChatHeaderProps {
  messagesCount: number;
  activeProjectId: string | null;
  activeProjectName?: string | null;
  onDetachProject: () => void;
  onOpenProjectModal: () => void;
  onOpenHistory?: () => void;
  onExportChat: () => void;
  activeArtifact: CanvasArtifact | null;
  onToggleCanvas: () => void;
  onNewChat: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  messagesCount,
  activeProjectId,
  activeProjectName,
  onDetachProject,
  onOpenProjectModal,
  onExportChat,
  activeArtifact,
  onToggleCanvas,
  onNewChat,
}) => {
  return (
    <div
      style={{
        padding: '10px 20px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'var(--bg-secondary)',
        gap: '12px',
        flexWrap: 'wrap',
      }}
    >
      {/* Informações do Assistente */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <h3 className="claude-serif-title" style={{ fontSize: '1.05rem', fontWeight: 500, margin: 0, color: 'var(--text-primary)' }}>
          JARVIS Maestro
        </h3>
        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
          · {messagesCount} {messagesCount === 1 ? 'mensagem' : 'mensagens'}
        </span>
      </div>

      {/* Ações e Vínculos */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {/* Pill de Projeto Vinculado */}
        {activeProjectId ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(217, 119, 87, 0.12)',
              border: '1px solid rgba(217, 119, 87, 0.3)',
              padding: '4px 10px',
              borderRadius: '8px',
              fontSize: '0.74rem',
              color: 'var(--text-primary)',
            }}
          >
            <FolderGit2 size={13} color="var(--accent-color)" />
            <span style={{ fontWeight: 600 }}>{activeProjectName || activeProjectId}</span>
            <button
              type="button"
              onClick={onDetachProject}
              className="btn btn-ghost"
              style={{ padding: '2px', marginLeft: '2px', color: '#f87171' }}
              title="Desvincular projeto do chat"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenProjectModal}
            className="btn btn-secondary"
            style={{ fontSize: '0.76rem', padding: '5px 12px' }}
            title="Vincular um projeto do workspace ao chat"
          >
            <span>Anexar Projeto</span>
          </button>
        )}

        {/* Exportar */}
        <button
          type="button"
          onClick={onExportChat}
          className="btn btn-secondary"
          style={{ fontSize: '0.76rem', padding: '5px 12px' }}
          title="Exportar conversa completa em Markdown (.md)"
        >
          <span>Exportar</span>
        </button>

        {/* Toggle Canvas */}
        {activeArtifact && (
          <button
            type="button"
            onClick={onToggleCanvas}
            className="btn btn-secondary"
            style={{ fontSize: '0.76rem', padding: '5px 12px' }}
          >
            <span>Ocultar Canvas</span>
          </button>
        )}

        {/* Nova Conversa */}
        <button
          type="button"
          onClick={onNewChat}
          className="btn btn-primary"
          style={{ fontSize: '0.76rem', padding: '5px 14px' }}
          title="Iniciar uma nova sessão limpa"
        >
          <span>Nova Conversa</span>
        </button>
      </div>
    </div>
  );
};
