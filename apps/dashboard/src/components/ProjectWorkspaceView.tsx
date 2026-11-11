import React, { useState, useEffect } from 'react';
import {
  FolderGit2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { WebhooksModal } from './workspace/WebhooksModal';
import {
  fetchWorkspaceProjects,
  fetchProjectFile,
  deleteWorkspaceProject,
  openWorkspaceRoot,
} from '../api';
import { ProjectCard } from './workspace/ProjectCard';
import { FileViewerModal } from './workspace/FileViewerModal';
import { ProjectMemoryModal } from './workspace/ProjectMemoryModal';
import { ImportFolderModal } from './workspace/ImportFolderModal';
import { notify } from './common/Toast';

interface ProjectWorkspaceViewProps {
  onSelectForChat?: (projectId: string) => void;
}

export const ProjectWorkspaceView: React.FC<ProjectWorkspaceViewProps> = ({ onSelectForChat }) => {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [techFilter, setTechFilter] = useState('ALL');
  const [openingRoot, setOpeningRoot] = useState(false);

  // Modais de arquivo e memória
  const [fileModal, setFileModal] = useState<{
    projectId: string;
    filePath: string;
    content: string;
  } | null>(null);

  const [memoryProjectId, setMemoryProjectId] = useState<string | null>(null);

  // Modais auxiliares
  const [showImportModal, setShowImportModal] = useState(false);
  const [showWebhooksModal, setShowWebhooksModal] = useState(false);

  const handleOpenRootFolder = async () => {
    setOpeningRoot(true);
    notify('Abrindo diretório geral de workspace no Windows Explorer...', 'info');
    try {
      const res = await openWorkspaceRoot();
      notify(`Pasta geral aberta no Explorer: ${res?.path || 'workspace/'}`, 'success');
    } catch (e: any) {
      notify(`Erro ao abrir pasta de workspaces no Explorer: ${e.message}`, 'error');
    } finally {
      setTimeout(() => setOpeningRoot(false), 800);
    }
  };

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await fetchWorkspaceProjects();
      setProjects(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Falha ao listar projetos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleOpenFile = async (projectId: string, filePath: string) => {
    try {
      const content = await fetchProjectFile(projectId, filePath);
      setFileModal({ projectId, filePath, content });
    } catch (e: any) {
      notify(`Erro ao ler arquivo: ${e.message}`, 'error');
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      await deleteWorkspaceProject(projectId);
      await loadProjects();
    } catch (e: any) {
      notify(`Erro ao excluir workspace: ${e.message}`, 'error');
    }
  };

  const filteredProjects = projects.filter((p) => {
    const q = searchFilter.toLowerCase();
    const matchesSearch =
      p.id.toLowerCase().includes(q) ||
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.project_type && p.project_type.toLowerCase().includes(q));

    if (!matchesSearch) return false;
    if (techFilter !== 'ALL') {
      const pType = (p.project_type || '').toLowerCase();
      if (techFilter === 'PYTHON' && pType !== 'python') return false;
      if (techFilter === 'WEB' && pType !== 'web') return false;
      if (techFilter === 'JAVA' && pType !== 'java') return false;
      if (techFilter === 'GO' && pType !== 'go') return false;
      if (techFilter === 'FLUTTER' && pType !== 'flutter') return false;
      if (techFilter === 'CSHARP' && pType !== 'csharp') return false;
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '26px', maxWidth: '1360px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 className="claude-serif-title" style={{ fontSize: '1.6rem', fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>
            Project Workspace
          </h2>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
            Diretórios físicos no computador: Python, Java, C#, Go, Kotlin, Flutter e Web com controle local
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={handleOpenRootFolder}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '7px 12px' }}
            title="Abrir o diretório geral 'workspace/' no Windows Explorer do computador"
            disabled={openingRoot}
          >
            <span>{openingRoot ? 'Abrindo Explorer...' : 'Abrir Pasta Geral no Explorer'}</span>
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '7px 12px' }}
            title="Importar qualquer pasta de projeto existente no seu computador para o JARVIS"
          >
            <span>Anexar Pasta Local</span>
          </button>

          <button
            type="button"
            onClick={() => setShowWebhooksModal(true)}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '7px 12px' }}
            title="Configurar notificações em tempo real para Discord e Telegram"
          >
            <span>Webhooks</span>
          </button>

          <button onClick={loadProjects} className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '7px 12px' }}>
            <span>{loading ? 'Atualizando...' : 'Atualizar'}</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="glass-card" style={{ padding: '12px 16px', border: '1px solid rgba(248, 113, 113, 0.35)', borderRadius: '10px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
          Não foi possível carregar os projetos: {loadError}
        </div>
      )}

      {/* Barra de Busca e Filtros Rápidos por Stack */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div
          className="glass-panel"
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <Search size={18} color="var(--text-secondary)" />
          <input
            type="text"
            placeholder="Filtrar por nome de projeto, id, tecnologia (Python, Java, Go, etc.)..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '0.88rem',
            }}
          />
          {searchFilter && (
            <button
              onClick={() => setSearchFilter('')}
              className="btn btn-ghost"
              style={{ fontSize: '0.75rem', padding: '2px 8px' }}
            >
              Limpar
            </button>
          )}
        </div>

        {/* Chips de Filtro por Stack */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'ALL', label: 'Todos' },
            { id: 'PYTHON', label: 'Python (FastAPI)' },
            { id: 'WEB', label: 'Web (HTML/JS)' },
            { id: 'JAVA', label: 'Java (Maven)' },
            { id: 'GO', label: 'Go (Golang)' },
            { id: 'FLUTTER', label: 'Flutter Mobile' },
            { id: 'CSHARP', label: '.NET / C#' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setTechFilter(item.id)}
              style={{
                fontSize: '0.74rem',
                padding: '4px 10px',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: techFilter === item.id ? 'var(--accent-color)' : 'var(--border-color)',
                backgroundColor: techFilter === item.id ? 'rgba(217, 119, 87, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                color: techFilter === item.id ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: techFilter === item.id ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de Projetos Responsivo */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
          Escaneando workspace local do computador...
        </div>
      ) : loadError && projects.length === 0 ? (
        <div role="status" className="glass-panel" style={{ textAlign: 'center', padding: '36px 24px', color: 'var(--text-secondary)' }}>
          Os projetos não puderam ser carregados. Verifique a ligação ao servidor e tente atualizar.
        </div>
      ) : filteredProjects.length === 0 ? (
        <div
          className="glass-panel"
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            color: 'var(--text-secondary)',
          }}
        >
          <FolderGit2 size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Nenhum projeto encontrado
          </h3>
          <p style={{ fontSize: '0.84rem', marginTop: '6px' }}>
            Peça no chat ao <b>JARVIS Master</b>: <i>"Crie um projeto em Python com FastAPI"</i>, <i>"Crie um projeto Java"</i>, <i>"Crie um projeto em Go"</i> ou clique em <b>Anexar Pasta Local</b> acima.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))', gap: '20px' }}>
          {filteredProjects.map((proj) => (
            <ProjectCard
              key={proj.id}
              project={proj}
              onOpenFile={handleOpenFile}
              onDeleteProject={handleDeleteProject}
              onSelectForChat={onSelectForChat}
              onOpenMemory={(projectId) => setMemoryProjectId(projectId)}
            />
          ))}
        </div>
      )}

      {/* Modal de Importar / Anexar Pasta Local do PC */}
      <ImportFolderModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={loadProjects}
      />

      {/* Modal de Arquivo */}
      {fileModal && (
        <FileViewerModal
          isOpen={true}
          onClose={() => setFileModal(null)}
          projectId={fileModal.projectId}
          filePath={fileModal.filePath}
          content={fileModal.content}
        />
      )}

      {/* Modal de Memórias & Regras */}
      {memoryProjectId && (
        <ProjectMemoryModal
          isOpen={true}
          onClose={() => setMemoryProjectId(null)}
          projectId={memoryProjectId}
        />
      )}

      {/* Modal de Webhooks */}
      <WebhooksModal
        isOpen={showWebhooksModal}
        onClose={() => setShowWebhooksModal(false)}
      />
    </div>
  );
};
