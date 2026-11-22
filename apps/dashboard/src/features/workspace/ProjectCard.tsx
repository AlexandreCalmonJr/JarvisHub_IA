import React, { useState } from 'react';
import {
  Smartphone,
  Globe,
  Trash2,
  Terminal,
  Coffee,
  Code2,
  Zap,
  Layers,
  Copy,
  Check,
  MessageSquare,
  FolderOpen,
  Settings,
  BookOpen,
} from 'lucide-react';
import {
  openWorkspaceFolder,
  openProjectInCode,
  getProjectPreviewUrl,
  rollbackWorkspaceProject,
  getProjectExportZipUrl,
  dockerizeWorkspaceProject,
} from '../../api';
import { notify } from '../../shared/common/Toast';
import { ConfirmDialog } from '../../shared/common/ConfirmDialog';
import { ProjectActionsModal } from './ProjectActionsModal';
import { humanizeLabel } from '../../types';

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    description?: string;
    path?: string;
    root_path?: string;
    files: string[];
    project_type?: string;
    updated_at?: string;
    size_formatted?: string;
    has_web_preview?: boolean;
  };
  onOpenFile?: (projectId: string, filePath: string) => void;
  onDeleteProject?: (projectId: string) => Promise<void> | void;
  onSelectForChat?: (projectId: string) => void;
  onOpenMemory?: (projectId: string) => void;
  layoutMode?: 'row' | 'grid';
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onOpenFile: _onOpenFile,
  onDeleteProject,
  onSelectForChat,
  onOpenMemory,
  layoutMode = 'row',
}) => {
  const [openingFolder, setOpeningFolder] = useState(false);
  const [openingCode, setOpeningCode] = useState(false);
  const [folderOpened, setFolderOpened] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [dockerizing, setDockerizing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showActionsModal, setShowActionsModal] = useState(false);

  const fullPath = project.path || project.root_path || `workspace/${project.id}`;
  const pType = (project.project_type || '').toLowerCase();
  const fNames = (project.files || []).map((f) => f.toLowerCase());

  let techLabel = 'Web Application';
  let TechIcon = Globe;

  if (pType === 'python' || fNames.some((f) => f.endsWith('.py') || f.includes('requirements.txt'))) {
    techLabel = 'Python (FastAPI)';
    TechIcon = Terminal;
  } else if (pType === 'java' || fNames.some((f) => f.includes('pom.xml') || f.endsWith('.java'))) {
    techLabel = 'Java (Maven)';
    TechIcon = Coffee;
  } else if (pType === 'csharp' || fNames.some((f) => f.endsWith('.csproj') || f.endsWith('.cs'))) {
    techLabel = '.NET / C#';
    TechIcon = Code2;
  } else if (pType === 'go' || fNames.some((f) => f.includes('go.mod') || f.endsWith('.go'))) {
    techLabel = 'Go';
    TechIcon = Zap;
  } else if (pType === 'kotlin' || fNames.some((f) => f.endsWith('.kt') || f.includes('gradle.kts'))) {
    techLabel = 'Kotlin (Gradle)';
    TechIcon = Layers;
  } else if (pType === 'flutter' || fNames.some((f) => f.includes('main.dart') || f.includes('pubspec.yaml'))) {
    techLabel = 'Flutter Mobile';
    TechIcon = Smartphone;
  }

  const handleOpenFolder = async () => {
    setOpeningFolder(true);
    notify(`Abrindo pasta de '${project.name || project.id}' no Explorer...`, 'info');
    try {
      const res = await openWorkspaceFolder(project.id);
      setFolderOpened(true);
      notify(`Pasta aberta no Explorer: ${res?.path || fullPath}`, 'success');
      setTimeout(() => setFolderOpened(false), 3000);
    } catch (e: any) {
      navigator.clipboard.writeText(fullPath);
      notify(`Não foi possível abrir a pasta no Explorer: ${e.message} (Caminho copiado)`, 'warning');
    } finally {
      setTimeout(() => setOpeningFolder(false), 600);
    }
  };

  const handleOpenCode = async () => {
    setOpeningCode(true);
    notify(`Abrindo projeto '${project.name || project.id}' no Visual Studio Code...`, 'info');
    try {
      await openProjectInCode(project.id);
      notify('Projeto aberto no VS Code.', 'success');
    } catch (e: any) {
      navigator.clipboard.writeText(fullPath);
      notify(`Aviso do VS Code: ${e.message} (Caminho copiado)`, 'warning');
    } finally {
      setTimeout(() => setOpeningCode(false), 800);
    }
  };

  const handleDockerize = async () => {
    setDockerizing(true);
    try {
      const res = await dockerizeWorkspaceProject(project.id);
      notify(res.message || 'Projeto dockerizado com sucesso. Dockerfile criado.', 'success');
    } catch (err: any) {
      notify(`Erro ao dockerizar projeto: ${err.message}`, 'error');
    } finally {
      setDockerizing(false);
    }
  };

  const handleRollback = async () => {
    setRollingBack(true);
    notify(`Desfazendo última alteração em '${project.name || project.id}' via Git...`, 'info');
    try {
      const res = await rollbackWorkspaceProject(project.id);
      if (res.status === 'cannot_rollback') {
        notify(res.message || 'Projeto no commit inicial. Sem alterações anteriores para reverter.', 'info');
      } else {
        notify(res.message || 'Última alteração desfeita no Git.', 'success');
      }
    } catch (e: any) {
      notify(`Erro ao desfazer alteração: ${e.message}`, 'error');
    } finally {
      setTimeout(() => setRollingBack(false), 600);
    }
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText(fullPath);
    setCopiedPath(true);
    notify(`Caminho local copiado: ${fullPath}`, 'info');
    setTimeout(() => setCopiedPath(false), 2000);
  };

  const confirmDeleteAction = async () => {
    setDeleting(true);
    setShowConfirmDelete(false);
    try {
      await onDeleteProject?.(project.id);
    } catch {
      setDeleting(false);
    }
  };

  const modals = (
    <>
      {showActionsModal && (
        <ProjectActionsModal
          isOpen={showActionsModal}
          onClose={() => setShowActionsModal(false)}
          project={project}
          fullPath={fullPath}
          openingFolder={openingFolder}
          openingCode={openingCode}
          rollingBack={rollingBack}
          dockerizing={dockerizing}
          folderOpened={folderOpened}
          copiedPath={copiedPath}
          onOpenFolder={handleOpenFolder}
          onOpenCode={handleOpenCode}
          onRollback={handleRollback}
          onDockerize={handleDockerize}
          onCopyPath={handleCopyPath}
          onConfirmDelete={() => setShowConfirmDelete(true)}
          onSelectForChat={onSelectForChat}
          getProjectExportZipUrl={getProjectExportZipUrl}
          getProjectPreviewUrl={getProjectPreviewUrl}
        />
      )}

      <ConfirmDialog
        isOpen={showConfirmDelete}
        title="Excluir Workspace Permanentemente?"
        tone="danger"
        confirmLabel="Confirmar Exclusão"
        isLoading={deleting}
        onCancel={() => setShowConfirmDelete(false)}
        onConfirm={confirmDeleteAction}
        description={
          <>
            Você está prestes a excluir todos os arquivos físicos do projeto{' '}
            <strong>{project.name || project.id}</strong> localizados em:
            <code
              style={{
                fontSize: '0.74rem',
                color: 'var(--text-primary)',
                wordBreak: 'break-all',
                display: 'block',
                marginTop: '6px',
              }}
            >
              {fullPath}
            </code>
          </>
        }
      />
    </>
  );

  /* Visualização em Linhas */
  if (layoutMode === 'row') {
    return (
      <>
        <div
          className="openbot-task-row"
          style={{
            padding: '13px 16px',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '240px', flex: 1 }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-light)',
                flexShrink: 0,
              }}
            >
              <TechIcon size={17} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {project.name || humanizeLabel(project.id)}
                </span>
                <span className="meta-inline jarvis-tabular" style={{ fontSize: '0.75rem' }}>
                  <span>{techLabel}</span>
                  {project.size_formatted && <span>{project.size_formatted}</span>}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '0.74rem',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                    maxWidth: '340px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={fullPath}
                >
                  {fullPath}
                </span>
                <button
                  type="button"
                  onClick={handleCopyPath}
                  className={`btn btn-icon-sm ${copiedPath ? 'btn-success' : 'btn-ghost'}`}
                  title="Copiar caminho da pasta"
                  aria-label="Copiar caminho da pasta"
                  style={{ width: '24px', height: '24px' }}
                >
                  {copiedPath ? <Check size={11} /> : <Copy size={11} />}
                </button>
                {project.description && (
                  <span
                    style={{
                      fontSize: '0.76rem',
                      color: 'var(--text-secondary)',
                      maxWidth: '300px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    · {project.description}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleOpenFolder}
              className={`btn btn-xs ${folderOpened ? 'btn-success' : 'btn-secondary'}`}
              title="Abrir pasta no Explorer"
              disabled={openingFolder}
            >
              <FolderOpen size={13} />
              <span>{openingFolder ? 'Abrindo…' : folderOpened ? 'Aberta' : 'Pasta'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenCode}
              className="btn btn-ghost btn-xs"
              title="Abrir no Visual Studio Code"
              disabled={openingCode}
            >
              <Code2 size={13} />
              <span>VS Code</span>
            </button>

            {project.has_web_preview && (
              <a
                href={getProjectPreviewUrl(project.id)}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost btn-xs"
                title="Visualizar preview web"
              >
                <Globe size={13} />
                <span>Preview</span>
              </a>
            )}

            {onSelectForChat && (
              <button
                type="button"
                onClick={() => onSelectForChat(project.id)}
                className="btn btn-secondary btn-xs is-active"
                title="Conversar no Chat com este workspace"
              >
                <MessageSquare size={13} />
                <span>Chat</span>
              </button>
            )}

            {onOpenMemory && (
              <button
                type="button"
                onClick={() => onOpenMemory(project.id)}
                className="btn btn-ghost btn-xs"
                title="Consultar memória e regras do projeto"
              >
                <BookOpen size={13} />
                <span>Memória</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowActionsModal(true)}
              className="btn btn-ghost btn-xs"
              title="Mais opções (Git, Docker, ZIP)"
            >
              <Settings size={13} />
              <span>Opções</span>
            </button>

            {onDeleteProject && (
              <button
                type="button"
                onClick={() => setShowConfirmDelete(true)}
                className="btn btn-danger-ghost btn-icon-sm"
                title="Excluir workspace"
                aria-label="Excluir workspace"
                disabled={deleting}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
        {modals}
      </>
    );
  }

  /* Visualização em Grade */
  return (
    <>
      <div className="jarvis-settings-card" style={{ gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-light)',
              flexShrink: 0,
            }}
          >
            <TechIcon size={18} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1 }}>
            <h3 style={{ fontSize: '0.96rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {project.name || humanizeLabel(project.id)}
            </h3>

            <div className="meta-inline jarvis-tabular" style={{ fontSize: '0.75rem' }}>
              <span>{techLabel}</span>
              {project.size_formatted && <span>{project.size_formatted}</span>}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <span
                style={{
                  fontSize: '0.74rem',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  maxWidth: '240px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={fullPath}
              >
                {fullPath}
              </span>
              <button
                type="button"
                onClick={handleCopyPath}
                className={`btn btn-icon-sm ${copiedPath ? 'btn-success' : 'btn-ghost'}`}
                title="Copiar caminho da pasta"
                aria-label="Copiar caminho da pasta"
                style={{ width: '24px', height: '24px' }}
              >
                {copiedPath ? <Check size={11} /> : <Copy size={11} />}
              </button>
            </div>
          </div>
        </div>

        {project.description && (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45, margin: 0 }}>
            {project.description}
          </p>
        )}

        <div
          style={{
            marginTop: 'auto',
            paddingTop: '12px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleOpenFolder}
              className={`btn btn-xs ${folderOpened ? 'btn-success' : 'btn-secondary'}`}
              title="Abrir pasta no Explorer"
              disabled={openingFolder}
            >
              <FolderOpen size={13} />
              <span>{openingFolder ? 'Abrindo…' : folderOpened ? 'Aberta' : 'Pasta'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenCode}
              className="btn btn-ghost btn-xs"
              title="Abrir no Visual Studio Code"
              disabled={openingCode}
            >
              <Code2 size={13} />
              <span>VS Code</span>
            </button>

            {project.has_web_preview && (
              <a
                href={getProjectPreviewUrl(project.id)}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost btn-xs"
                title="Visualizar preview web"
              >
                <Globe size={13} />
                <span>Preview</span>
              </a>
            )}

            {onSelectForChat && (
              <button
                type="button"
                onClick={() => onSelectForChat(project.id)}
                className="btn btn-secondary btn-xs is-active"
                title="Conversar no Chat com este workspace"
              >
                <MessageSquare size={13} />
                <span>Chat</span>
              </button>
            )}

            {onOpenMemory && (
              <button
                type="button"
                onClick={() => onOpenMemory(project.id)}
                className="btn btn-ghost btn-xs"
                title="Consultar memória e regras do projeto"
              >
                <BookOpen size={13} />
                <span>Memória</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowActionsModal(true)}
              className="btn btn-ghost btn-xs"
              title="Mais opções (Git, Docker, ZIP)"
            >
              <Settings size={13} />
              <span>Opções</span>
            </button>
          </div>

          {onDeleteProject && (
            <button
              type="button"
              onClick={() => setShowConfirmDelete(true)}
              className="btn btn-danger-ghost btn-xs"
              title="Excluir workspace"
              disabled={deleting}
            >
              <Trash2 size={13} />
              <span>{deleting ? '…' : 'Excluir'}</span>
            </button>
          )}
        </div>
      </div>
      {modals}
    </>
  );
};
