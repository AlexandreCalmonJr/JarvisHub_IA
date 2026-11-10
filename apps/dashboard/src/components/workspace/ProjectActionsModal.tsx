import React from 'react';
import { Modal } from '../common/Modal';
import {
  FolderOpen,
  Code2,
  RotateCcw,
  Archive,
  Boxes,
  ExternalLink,
  MessageSquare,
  Trash2,
  Copy,
  Sparkles,
  Check,
} from 'lucide-react';

interface ProjectActionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: {
    id: string;
    name?: string;
    description?: string;
    project_type?: string;
    has_web_preview?: boolean;
    has_memory?: boolean;
  };
  fullPath: string;
  openingFolder: boolean;
  openingCode: boolean;
  rollingBack: boolean;
  dockerizing: boolean;
  folderOpened: boolean;
  copiedPath: boolean;
  onOpenFolder: () => void;
  onOpenCode: () => void;
  onRollback: () => void;
  onDockerize: () => void;
  onCopyPath: () => void;
  onConfirmDelete: () => void;
  onSelectForChat?: (projectId: string) => void;
  getProjectExportZipUrl: (projectId: string) => string;
  getProjectPreviewUrl: (projectId: string) => string;
}

export const ProjectActionsModal: React.FC<ProjectActionsModalProps> = ({
  isOpen,
  onClose,
  project,
  fullPath,
  openingFolder,
  openingCode,
  rollingBack,
  dockerizing,
  folderOpened,
  copiedPath,
  onOpenFolder,
  onOpenCode,
  onRollback,
  onDockerize,
  onCopyPath,
  onConfirmDelete,
  onSelectForChat,
  getProjectExportZipUrl,
  getProjectPreviewUrl,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Central de Ações — ${project.name || project.id}`}
      subtitle={`Gerenciamento integrado do workspace: ${project.id}`}
      icon={<Sparkles size={20} color="var(--accent-color)" />}
      maxWidth="lg"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Fechar
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Banner do Projeto */}
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {project.name || project.id}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px', wordBreak: 'break-all' }}>
              <code>{fullPath}</code>
            </div>
          </div>
          <button
            type="button"
            onClick={onCopyPath}
            className="btn btn-ghost"
            style={{ fontSize: '0.75rem', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            {copiedPath ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
            <span>{copiedPath ? 'Copiado!' : 'Copiar Caminho'}</span>
          </button>
        </div>

        {/* Grupo 1: Ambiente de Trabalho & IDE */}
        <div>
          <div style={{ fontSize: '0.80rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
            Ambiente Local & IDE
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
            <button
              type="button"
              onClick={onOpenCode}
              disabled={openingCode}
              className="btn btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '12px',
                textAlign: 'left',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'rgba(168, 85, 247, 0.05)',
              }}
            >
              <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', flexShrink: 0 }}>
                <Code2 size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {openingCode ? 'Iniciando VS Code...' : 'Visual Studio Code'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Abre o workspace configurado diretamente no VS Code
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={onOpenFolder}
              disabled={openingFolder}
              className="btn btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '12px',
                textAlign: 'left',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'rgba(56, 189, 248, 0.05)',
              }}
            >
              <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', flexShrink: 0 }}>
                <FolderOpen size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {openingFolder ? 'Abrindo...' : folderOpened ? 'Pasta Aberta ✓' : 'Windows Explorer'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Acessa a pasta física dos arquivos no sistema operacional
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Grupo 2: DevOps, Web & Exportação */}
        <div>
          <div style={{ fontSize: '0.80rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
            DevOps, Web & Exportação
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
            {project.has_web_preview && (
              <a
                href={getProjectPreviewUrl(project.id)}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px',
                  textAlign: 'left',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'rgba(56, 189, 248, 0.05)',
                  textDecoration: 'none',
                }}
              >
                <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', flexShrink: 0 }}>
                  <ExternalLink size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#38bdf8' }}>
                    Ver ao Vivo (Preview)
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Abre a pré-visualização web interativa no navegador
                  </div>
                </div>
              </a>
            )}

            <button
              type="button"
              onClick={onDockerize}
              disabled={dockerizing}
              className="btn btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '12px',
                textAlign: 'left',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'rgba(6, 182, 212, 0.05)',
              }}
            >
              <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4', flexShrink: 0 }}>
                <Boxes size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {dockerizing ? 'Dockerizando...' : 'Dockerizar Projeto'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Gera Dockerfile multi-stage e compose com 1 clique
                </div>
              </div>
            </button>

            <a
              href={getProjectExportZipUrl(project.id)}
              download
              className="btn btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '12px',
                textAlign: 'left',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'rgba(52, 211, 153, 0.05)',
                textDecoration: 'none',
              }}
            >
              <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(52, 211, 153, 0.15)', color: '#34d399', flexShrink: 0 }}>
                <Archive size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#34d399' }}>
                  Baixar Pacote ZIP
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Exporta pacote limpo (sem node_modules, .venv, .git)
                </div>
              </div>
            </a>
          </div>
        </div>

        {/* Grupo 3: Governança, IA & Versionamento */}
        <div>
          <div style={{ fontSize: '0.80rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
            Governança, Memória & IA
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
            {onSelectForChat && (
              <button
                type="button"
                onClick={() => {
                  onSelectForChat(project.id);
                  onClose();
                }}
                className="btn btn-secondary"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px',
                  textAlign: 'left',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'rgba(99, 102, 241, 0.05)',
                }}
              >
                <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', flexShrink: 0 }}>
                  <MessageSquare size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#818cf8' }}>
                    Discutir no Chat
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Vincula o projeto ao Chat com os 26 agentes do JARVIS
                  </div>
                </div>
              </button>
            )}

            <button
              type="button"
              onClick={onRollback}
              disabled={rollingBack}
              className="btn btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '12px',
                textAlign: 'left',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'rgba(245, 158, 11, 0.05)',
              }}
            >
              <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', flexShrink: 0 }}>
                <RotateCcw size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {rollingBack ? 'Revertendo...' : 'Desfazer Alteração (Git)'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Restaura o commit anterior no repositório Git local
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Grupo 4: Zona Crítica */}
        <div>
          <div style={{ fontSize: '0.80rem', fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
            Zona Crítica
          </div>
          <button
            type="button"
            onClick={() => {
              onConfirmDelete();
              onClose();
            }}
            className="btn btn-ghost"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px',
              textAlign: 'left',
              borderRadius: '8px',
              border: '1px solid rgba(248, 113, 113, 0.25)',
              backgroundColor: 'rgba(248, 113, 113, 0.05)',
              color: '#f87171',
            }}
          >
            <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(248, 113, 113, 0.15)', flexShrink: 0 }}>
              <Trash2 size={18} color="#f87171" />
            </div>
            <div>
              <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#f87171' }}>
                Excluir Workspace
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Remove permanentemente a pasta local e todos os arquivos deste projeto
              </div>
            </div>
          </button>
        </div>
      </div>
    </Modal>
  );
};
