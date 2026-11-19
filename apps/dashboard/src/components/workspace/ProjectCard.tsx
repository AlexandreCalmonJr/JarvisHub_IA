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

import { notify } from '../common/Toast';
import { ConfirmDialog } from '../common/ConfirmDialog';
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

  // Detecção de tipo de projeto e ícones dinâmicos

  const pType = (project.project_type || '').toLowerCase();

  const fNames = project.files.map((f) => f.toLowerCase());

  let techLabel = 'Web Application';
  let TechIcon = Globe;

  if (pType === 'python' || fNames.some((f) => f.endsWith('.py') || f.includes('requirements.txt'))) {
    techLabel = 'Python 3.12 (FastAPI)';
    TechIcon = Terminal;
  } else if (pType === 'java' || fNames.some((f) => f.includes('pom.xml') || f.endsWith('.java'))) {
    techLabel = 'Java 21 (Maven)';
    TechIcon = Coffee;
  } else if (pType === 'csharp' || fNames.some((f) => f.endsWith('.csproj') || f.endsWith('.cs'))) {
    techLabel = '.NET 8 / C# 12';
    TechIcon = Code2;
  } else if (pType === 'go' || fNames.some((f) => f.includes('go.mod') || f.endsWith('.go'))) {
    techLabel = 'Go (Golang 1.22)';
    TechIcon = Zap;
  } else if (pType === 'kotlin' || fNames.some((f) => f.endsWith('.kt') || f.includes('gradle.kts'))) {
    techLabel = 'Kotlin 2.0 (Gradle)';
    TechIcon = Layers;
  } else if (pType === 'flutter' || fNames.some((f) => f.includes('main.dart') || f.includes('pubspec.yaml'))) {
    techLabel = 'Flutter Mobile';
    TechIcon = Smartphone;
  }

  const handleOpenFolder = async () => {

    setOpeningFolder(true);

    notify(`Abrindo pasta de '${project.name || project.id}' no Windows Explorer...`, 'info');

    try {

      const res = await openWorkspaceFolder(project.id);

      setFolderOpened(true);

      notify(`Pasta aberta com sucesso no Explorer: ${res?.path || fullPath}`, 'success');

      setTimeout(() => setFolderOpened(false), 3000);

    } catch (e: any) {

      navigator.clipboard.writeText(fullPath);

      notify(`Não foi possível abrir a pasta no Explorer: ${e.message} (Caminho copiado para sua área de transferência)`, 'warning');

    } finally {

      setTimeout(() => setOpeningFolder(false), 600);

    }

  };

  const handleOpenCode = async () => {

    setOpeningCode(true);

    notify(`Abrindo projeto '${project.name || project.id}' no Visual Studio Code...`, 'info');

    try {

      await openProjectInCode(project.id);

      notify(`Projeto aberto no VS Code com sucesso!`, 'success');

    } catch (e: any) {

      navigator.clipboard.writeText(fullPath);

      notify(`Aviso do VS Code: ${e.message} (Caminho do projeto copiado para a área de transferência)`, 'warning');

    } finally {

      setTimeout(() => setOpeningCode(false), 800);

    }

  };

  const handleDockerize = async () => {

    setDockerizing(true);

    try {

      const res = await dockerizeWorkspaceProject(project.id);

      notify(res.message || 'Projeto dockerizado com sucesso! Dockerfile criado.', 'success');

    } catch (err: any) {

      notify(`Erro ao dockerizar projeto: ${err.message}`, 'error');

    } finally {

      setDockerizing(false);

    }

  };

  const handleRollback = async () => {

    setRollingBack(true);

    notify(`Desfazendo última alteração no projeto '${project.name || project.id}' via Git...`, 'info');

    try {

      const res = await rollbackWorkspaceProject(project.id);

      if (res.status === 'cannot_rollback') {

        notify(res.message || 'Projeto no commit inicial. Sem alterações anteriores para reverter.', 'info');

      } else {

        notify(res.message || 'Última alteração desfeita com sucesso no Git!', 'success');

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
      {/* Modal Central de Ações do Projeto */}
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

      {/* Modal Seguro de Confirmação de Exclusão */}
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
            Você está prestes a excluir todos os arquivos físicos do projeto <b>{project.name || project.id}</b> localizados em:
            <code style={{ fontSize: '0.74rem', color: 'var(--text-primary)', wordBreak: 'break-all', display: 'block', marginTop: '6px' }}>
              {fullPath}
            </code>
          </>
        }
      />
    </>
  );

  /* Layout em Linhas Abertas (Estilo Linear / GitHub / Vercel) */
  if (layoutMode === 'row') {
    return (
      <>
        <div
          className="workspace-project-row"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: '10px',
            gap: '16px',
            flexWrap: 'wrap',
            transition: 'background-color 0.15s ease, border-color 0.15s ease',
          }}
        >
          {/* Lado Esquerdo: Ícone + Título + Badges + Caminho/Descrição */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '260px', flex: 1 }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#d4d4d8',
                flexShrink: 0,
              }}
            >
              <TechIcon size={18} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f4f4f5' }}>
                  {project.name || humanizeLabel(project.id)}
                </span>
                <span
                  style={{
                    fontSize: '0.70rem',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    color: '#d4d4d8',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    fontWeight: 500,
                  }}
                >
                  {techLabel}
                </span>
                {project.size_formatted && (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      padding: '2px 6px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(255, 255, 255, 0.04)',
                      color: '#a1a1aa',
                    }}
                  >
                    {project.size_formatted}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '0.73rem',
                    color: '#71717a',
                    fontFamily: 'var(--font-mono, monospace)',
                    maxWidth: '360px',
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
                  className="btn btn-ghost"
                  style={{ padding: '2px 4px', color: copiedPath ? '#34d399' : '#71717a' }}
                  title="Copiar caminho da pasta"
                >
                  {copiedPath ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                </button>
                {project.description && (
                  <span
                    style={{
                      fontSize: '0.76rem',
                      color: '#a1a1aa',
                      maxWidth: '300px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    • {project.description}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Lado Direito: Barra de Ações em Linha (Estilo Linear / GitHub) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleOpenFolder}
              className="btn btn-secondary"
              style={{
                fontSize: '0.76rem',
                padding: '5px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                backgroundColor: folderOpened ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                border: folderOpened ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.12)',
                color: folderOpened ? '#34d399' : '#f4f4f5',
                fontWeight: 500,
                borderRadius: '6px',
              }}
              title="Abrir pasta no Windows Explorer"
              disabled={openingFolder}
            >
              <FolderOpen size={13} />
              <span>{openingFolder ? 'Abrindo...' : folderOpened ? 'Pasta Aberta!' : 'Abrir Pasta'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenCode}
              className="btn btn-ghost"
              style={{
                fontSize: '0.76rem',
                padding: '5px 9px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                color: '#d4d4d8',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '6px',
              }}
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
                className="btn btn-ghost"
                style={{
                  fontSize: '0.76rem',
                  padding: '5px 9px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  color: '#d4d4d8',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '6px',
                  textDecoration: 'none',
                }}
                title="Visualizar preview web"
              >
                <Globe size={13} />
                <span>Visualizar</span>
              </a>
            )}

            {onSelectForChat && (
              <button
                type="button"
                onClick={() => onSelectForChat(project.id)}
                className="btn btn-ghost"
                style={{
                  fontSize: '0.76rem',
                  padding: '5px 9px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  color: '#38bdf8',
                  backgroundColor: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  borderRadius: '6px',
                }}
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
                className="btn btn-ghost"
                style={{
                  fontSize: '0.76rem',
                  padding: '5px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: '#a1a1aa',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '6px',
                }}
                title="Consultar memória e regras do projeto"
              >
                <BookOpen size={13} />
                <span>Memória</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowActionsModal(true)}
              className="btn btn-ghost"
              style={{
                fontSize: '0.76rem',
                padding: '5px 8px',
                borderRadius: '6px',
                color: '#a1a1aa',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
              title="Mais opções (Git, Docker, ZIP)"
            >
              <Settings size={13} />
              <span>Opções</span>
            </button>

            {onDeleteProject && (
              <button
                type="button"
                onClick={() => setShowConfirmDelete(true)}
                className="btn btn-ghost"
                style={{
                  fontSize: '0.76rem',
                  padding: '5px 8px',
                  color: '#f87171',
                  borderRadius: '6px',
                }}
                title="Excluir workspace"
                disabled={deleting}
              >
                <Trash2 size={13} />
                <span>{deleting ? '...' : ''}</span>
              </button>
            )}
          </div>
        </div>
        {modals}
      </>
    );
  }

  /* Modo Grade Aberto e Refinado (sem fundo escuro pesado) */
  return (
    <>
      <div
        className="glass-card"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.07)',
          borderRadius: '12px',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          transition: 'border-color 0.15s ease, transform 0.15s ease',
        }}
      >
        {/* Header do Card */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '9px',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#d4d4d8',
                flexShrink: 0,
              }}
            >
              <TechIcon size={18} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '0.98rem', fontWeight: 600, color: '#f4f4f5', margin: 0, letterSpacing: '-0.01em' }}>
                  {project.name || humanizeLabel(project.id)}
                </h3>
                <span
                  style={{
                    fontSize: '0.70rem',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    color: '#d4d4d8',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    fontWeight: 500,
                  }}
                >
                  {techLabel}
                </span>
                {project.size_formatted && (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      padding: '2px 6px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(255, 255, 255, 0.04)',
                      color: '#a1a1aa',
                    }}
                  >
                    {project.size_formatted}
                  </span>
                )}
              </div>

              {/* Caminho Físico com Botão de Copiar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    fontSize: '0.73rem',
                    color: '#71717a',
                    fontFamily: 'var(--font-mono, monospace)',
                    maxWidth: '260px',
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
                  className="btn btn-ghost"
                  style={{ padding: '2px 4px', color: copiedPath ? '#34d399' : '#71717a' }}
                  title="Copiar caminho da pasta"
                >
                  {copiedPath ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {project.description && (
          <p style={{ fontSize: '0.82rem', color: '#a1a1aa', lineHeight: '1.4', margin: 0 }}>
            {project.description}
          </p>
        )}

        {/* Barra de Ações: Abrir Pasta no Explorer, VS Code, Vincular ao Chat, Opções, Excluir */}
        <div
          style={{
            marginTop: 'auto',
            paddingTop: '12px',
            borderTop: '1px solid rgba(255, 255, 255, 0.07)',
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
              className="btn btn-secondary"
              style={{
                fontSize: '0.76rem',
                padding: '5px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                backgroundColor: folderOpened ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                border: folderOpened ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.12)',
                color: folderOpened ? '#34d399' : '#f4f4f5',
                fontWeight: 500,
                borderRadius: '6px',
              }}
              title="Abrir pasta no Windows Explorer"
              disabled={openingFolder}
            >
              <FolderOpen size={13} />
              <span>{openingFolder ? 'Abrindo...' : folderOpened ? 'Pasta Aberta!' : 'Abrir Pasta'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenCode}
              className="btn btn-secondary"
              style={{
                fontSize: '0.76rem',
                padding: '5px 9px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                color: '#d4d4d8',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '6px',
              }}
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
                className="btn btn-secondary"
                style={{
                  fontSize: '0.76rem',
                  padding: '5px 9px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  color: '#d4d4d8',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  textDecoration: 'none',
                }}
                title="Visualizar preview web"
              >
                <Globe size={13} />
                <span>Visualizar</span>
              </a>
            )}

            {onSelectForChat && (
              <button
                type="button"
                onClick={() => onSelectForChat(project.id)}
                className="btn btn-secondary"
                style={{
                  fontSize: '0.76rem',
                  padding: '5px 9px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  color: '#38bdf8',
                  backgroundColor: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  borderRadius: '6px',
                }}
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
                className="btn btn-secondary"
                style={{
                  fontSize: '0.76rem',
                  padding: '5px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: '#a1a1aa',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '6px',
                }}
                title="Consultar memória e regras do projeto"
              >
                <BookOpen size={13} />
                <span>Memória</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowActionsModal(true)}
              className="btn btn-secondary"
              style={{
                fontSize: '0.76rem',
                padding: '5px 8px',
                borderRadius: '6px',
                color: '#a1a1aa',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
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
              className="btn btn-ghost"
              style={{
                fontSize: '0.74rem',
                padding: '5px 8px',
                color: '#f87171',
                borderRadius: '6px',
              }}
              title="Excluir workspace"
              disabled={deleting}
            >
              <Trash2 size={13} />
              <span>{deleting ? '...' : 'Excluir'}</span>
            </button>
          )}
        </div>
      </div>
      {modals}
    </>
  );
};

