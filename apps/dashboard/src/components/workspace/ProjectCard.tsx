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


import { ProjectActionsModal } from './ProjectActionsModal';

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

  onOpenFile: (projectId: string, filePath: string) => void;

  onDeleteProject?: (projectId: string) => Promise<void> | void;

  onSelectForChat?: (projectId: string) => void;
  onOpenMemory?: (projectId: string) => void;

}

export const ProjectCard: React.FC<ProjectCardProps> = ({

  project,

  onOpenFile: _onOpenFile,

  onDeleteProject,

  onSelectForChat,

  onOpenMemory,

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

  let badgeColor = 'badge-info';

  let TechIcon = Globe;

  let iconColor = '#818cf8';

  let iconBg = 'rgba(99, 102, 241, 0.15)';

  if (pType === 'python' || fNames.some((f) => f.endsWith('.py') || f.includes('requirements.txt'))) {

    techLabel = 'Python 3.12 (FastAPI)';

    badgeColor = 'badge-purple';

    TechIcon = Terminal;

    iconColor = '#38bdf8';

    iconBg = 'rgba(56, 189, 248, 0.15)';

  } else if (pType === 'java' || fNames.some((f) => f.includes('pom.xml') || f.endsWith('.java'))) {

    techLabel = 'Java 21 (Maven)';

    badgeColor = 'badge-warning';

    TechIcon = Coffee;

    iconColor = '#f59e0b';

    iconBg = 'rgba(245, 158, 11, 0.15)';

  } else if (pType === 'csharp' || fNames.some((f) => f.endsWith('.csproj') || f.endsWith('.cs'))) {

    techLabel = '.NET 8 / C# 12';

    badgeColor = 'badge-purple';

    TechIcon = Code2;

    iconColor = '#a855f7';

    iconBg = 'rgba(168, 85, 247, 0.15)';

  } else if (pType === 'go' || fNames.some((f) => f.includes('go.mod') || f.endsWith('.go'))) {

    techLabel = 'Go (Golang 1.22)';

    badgeColor = 'badge-success';

    TechIcon = Zap;

    iconColor = '#06b6d4';

    iconBg = 'rgba(6, 182, 212, 0.15)';

  } else if (pType === 'kotlin' || fNames.some((f) => f.endsWith('.kt') || f.includes('gradle.kts'))) {

    techLabel = 'Kotlin 2.0 (Gradle)';

    badgeColor = 'badge-purple';

    TechIcon = Layers;

    iconColor = '#c084fc';

    iconBg = 'rgba(192, 132, 252, 0.15)';

  } else if (pType === 'flutter' || fNames.some((f) => f.includes('main.dart') || f.includes('pubspec.yaml'))) {

    techLabel = 'Flutter Mobile';

    badgeColor = 'badge-purple';

    TechIcon = Smartphone;

    iconColor = '#c084fc';

    iconBg = 'rgba(168, 85, 247, 0.15)';

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

  return (

    <div

      className="glass-card"

      style={{

        padding: '20px 22px',

        display: 'flex',

        flexDirection: 'column',

        gap: '14px',

        border: '1px solid var(--border-color)',

        borderRadius: '14px',

        transition: 'transform 0.2s, box-shadow 0.2s',

      }}

    >

      {/* Header do Card */}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

          <div

            style={{

              width: '44px',

              height: '44px',

              borderRadius: '12px',

              backgroundColor: iconBg,

              border: `1px solid ${iconColor}44`,

              display: 'flex',

              alignItems: 'center',

              justifyContent: 'center',

              color: iconColor,

              flexShrink: 0,

            }}

          >

            <TechIcon size={22} />

          </div>

          <div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>

              <h3 className="claude-serif-title" style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>

                {project.name || project.id}

              </h3>

              <span className={`badge ${badgeColor}`}>{techLabel}</span>

              {project.size_formatted && (

                <span className="badge badge-info" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>

                  {project.size_formatted}

                </span>

              )}

            </div>

            {/* Caminho Físico com Botão de Copiar */}

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>

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

                className="btn btn-ghost"

                style={{ padding: '2px 5px', fontSize: '0.7rem', color: copiedPath ? '#34d399' : 'var(--text-muted)' }}

                title="Copiar caminho da pasta"

              >

                {copiedPath ? <Check size={11} color="#34d399" /> : <Copy size={11} />}

              </button>

            </div>

          </div>

        </div>

      </div>

      {project.description && (

        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>

          {project.description}

        </p>

      )}

      {/* Barra de Ações: Abrir Pasta no Explorer, VS Code, Vincular ao Chat, Opções, Excluir */}
      <div
        style={{
          marginTop: 'auto',
          paddingTop: '14px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Ação Primária: Abrir Pasta no Explorer nativo */}
          <button
            type="button"
            onClick={handleOpenFolder}
            className="btn btn-primary"
            style={{
              fontSize: '0.78rem',
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: folderOpened ? '#10b981' : 'var(--accent-color)',
              color: '#ffffff',
              fontWeight: 500,
              boxShadow: '0 2px 8px rgba(217, 119, 87, 0.25)',
              transition: 'all 0.2s ease',
            }}
            title="Abrir a pasta com os arquivos reais deste projeto no Windows Explorer"
            disabled={openingFolder}
          >
            <FolderOpen size={14} />
            <span>{openingFolder ? 'Abrindo...' : folderOpened ? 'Pasta Aberta!' : 'Abrir Pasta'}</span>
          </button>

          {/* Ação: Abrir no VS Code */}
          <button
            type="button"
            onClick={handleOpenCode}
            className="btn btn-secondary"
            style={{
              fontSize: '0.78rem',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#38bdf8',
              borderColor: 'rgba(56, 189, 248, 0.3)',
              backgroundColor: 'rgba(56, 189, 248, 0.06)',
            }}
            title="Abrir o projeto completo no Visual Studio Code"
            disabled={openingCode}
          >
            <Code2 size={14} />
            <span>{openingCode ? 'Abrindo...' : 'VS Code'}</span>
          </button>

          {/* Ação Rápida: Visualizar no Navegador (se houver preview) */}
          {project.has_web_preview && (
            <a
              href={getProjectPreviewUrl(project.id)}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary"
              style={{
                fontSize: '0.76rem',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: '#34d399',
                borderColor: 'rgba(52, 211, 153, 0.3)',
                textDecoration: 'none',
              }}
              title="Visualizar a aplicação web em tempo real no navegador"
            >
              <Globe size={14} />
              <span>Visualizar</span>
            </a>
          )}

          {/* Ação Rápida: Conversar no Chat */}
          {onSelectForChat && (
            <button
              type="button"
              onClick={() => onSelectForChat(project.id)}
              className="btn btn-secondary"
              style={{ fontSize: '0.76rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Vincular este projeto ao Chat do JARVIS para modificar ou auditar código"
            >
              <MessageSquare size={14} color="#818cf8" />
              <span>Tratar no Chat</span>
            </button>
          )}

          {onOpenMemory && (
            <button
              type="button"
              onClick={() => onOpenMemory(project.id)}
              className="btn btn-secondary"
              style={{ fontSize: '0.76rem', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
              title="Consultar e editar as regras e decisões privadas deste projeto"
            >
              <BookOpen size={13} />
              <span>Memória</span>
            </button>
          )}

          {/* Modal com Ferramentas Avançadas (Git Rollback, Docker, ZIP, Inspecionar) */}
          <button
            type="button"
            onClick={() => setShowActionsModal(true)}
            className="btn btn-secondary"
            style={{
              fontSize: '0.76rem',
              padding: '6px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              color: 'var(--text-secondary)',
            }}
            title="Mais opções: Inspecionar arquivos, Git Rollback, Docker, Exportar ZIP"
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

              padding: '6px 10px',

              color: '#f87171',

              display: 'flex',

              alignItems: 'center',

              gap: '4px',

            }}

            title="Excluir permanentemente este workspace do computador"

            disabled={deleting}

          >

            <Trash2 size={13} color="#f87171" />

            <span>{deleting ? 'Excluindo...' : 'Excluir'}</span>

          </button>

        )}

      </div>

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

      {showConfirmDelete && (

        <div

          style={{

            position: 'fixed',

            top: 0,

            left: 0,

            right: 0,

            bottom: 0,

            backgroundColor: 'rgba(0, 0, 0, 0.75)',

            backdropFilter: 'blur(6px)',

            display: 'flex',

            alignItems: 'center',

            justifyContent: 'center',

            zIndex: 9999,

            padding: '20px',

          }}

          onClick={() => setShowConfirmDelete(false)}

        >

          <div

            style={{

              maxWidth: '440px',

              width: '100%',

              backgroundColor: '#0f172a',

              border: '1px solid rgba(248, 113, 113, 0.3)',

              borderRadius: '14px',

              padding: '24px',

              display: 'flex',

              flexDirection: 'column',

              gap: '16px',

              boxShadow: '0 20px 40px rgba(0,0,0,0.8)',

            }}

            onClick={(e) => e.stopPropagation()}

          >

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>

              <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(248, 113, 113, 0.15)', color: '#f87171' }}>

                <Trash2 size={20} />

              </div>

              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f87171' }}>

                Excluir Workspace Permanentemente?

              </h3>

            </div>

            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>

              Você está prestes a excluir todos os arquivos físicos do projeto <b>{project.name || project.id}</b> localizados em:

              <br />

              <code style={{ fontSize: '0.74rem', color: '#e2e8f0', wordBreak: 'break-all', display: 'block', marginTop: '6px' }}>

                {fullPath}

              </code>

            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>

              <button onClick={() => setShowConfirmDelete(false)} className="btn btn-secondary" style={{ fontSize: '0.80rem' }}>

                Cancelar

              </button>

              <button

                onClick={confirmDeleteAction}

                className="btn btn-danger"

                style={{ fontSize: '0.80rem', padding: '6px 14px', backgroundColor: '#dc2626', color: '#fff' }}

              >

                Confirmar Exclusão

              </button>

            </div>

          </div>

        </div>

      )}

    </div>

  );

};

