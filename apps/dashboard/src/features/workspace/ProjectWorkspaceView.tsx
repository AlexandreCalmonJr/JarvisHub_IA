import React, { useState, useEffect, useMemo } from 'react';
import {
  FolderGit2,
  RefreshCw,
  Search,
  FolderPlus,
  LayoutGrid,
  List,
  TableProperties,
  Folder,
  FileCode,
  Clock,
  Bot,
  Layers,
  ExternalLink,
  Trash2,
  MessageSquare,
  X,
} from 'lucide-react';
import { WebhooksModal } from './WebhooksModal';
import {
  fetchWorkspaceProjects,
  fetchProjectFile,
  deleteWorkspaceProject,
  openWorkspaceRoot,
} from '../../api';
import { ProjectCard } from './ProjectCard';
import { FileViewerModal } from './FileViewerModal';
import { ProjectMemoryModal } from './ProjectMemoryModal';
import { ImportFolderModal } from './ImportFolderModal';
import { notify } from '../../shared/common/Toast';
import { PageHeader } from '../../shared/layout/PageHeader';

interface ProjectWorkspaceViewProps {
  onSelectForChat?: (projectId: string) => void;
}

export const ProjectWorkspaceView: React.FC<ProjectWorkspaceViewProps> = ({ onSelectForChat }) => {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'recent' | 'unorganized' | 'agents'>('all');
  const [viewMode, setViewMode] = useState<'rows' | 'grid' | 'table'>('rows');
  const [openingRoot, setOpeningRoot] = useState(false);

  const [fileModal, setFileModal] = useState<{
    projectId: string;
    filePath: string;
    content: string;
  } | null>(null);

  const [memoryProjectId, setMemoryProjectId] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showWebhooksModal, setShowWebhooksModal] = useState(false);

  const handleOpenRootFolder = async () => {
    setOpeningRoot(true);
    notify('Abrindo diretório geral de workspace no Explorer...', 'info');
    try {
      await openWorkspaceRoot();
      notify('Pasta geral do workspace aberta no computador.', 'success');
    } catch (e: any) {
      notify(`Erro ao abrir pasta no Explorer: ${e.message}`, 'error');
    } finally {
      setTimeout(() => setOpeningRoot(false), 800);
    }
  };

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await fetchWorkspaceProjects();
      setProjects(data || []);
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
      setProjects((current) => current.filter((project) => project.id !== projectId));
      await loadProjects();
    } catch (e: any) {
      notify(`Erro ao excluir workspace: ${e.message}`, 'error');
      throw e;
    }
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const q = searchFilter.toLowerCase();
      const matchesSearch =
        !q ||
        p.id.toLowerCase().includes(q) ||
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.project_type && p.project_type.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (activeCategory === 'recent') {
        return true;
      }
      if (activeCategory === 'agents') {
        return (
          (p.name && p.name.toLowerCase().includes('agent')) ||
          (p.description && p.description.toLowerCase().includes('agent'))
        );
      }
      return true;
    });
  }, [projects, searchFilter, activeCategory]);

  const pageTitle =
    activeCategory === 'all'
      ? 'Workspace de Projetos'
      : activeCategory === 'recent'
      ? 'Workspaces Recentes'
      : activeCategory === 'unorganized'
      ? 'Arquivos Fora de Pastas'
      : 'Projetos de Agentes';

  return (
    <div className="jarvis-page-shell">
      <PageHeader
        icon={<FolderGit2 size={18} />}
        title={pageTitle}
        subtitle="Gerencie repositórios locais, abra projetos no editor ou vincule diretamente ao chat."
        meta={[
          `${projects.length} workspace(s) físicos`,
          filteredProjects.length !== projects.length
            ? `${filteredProjects.length} exibido(s)`
            : 'Diretório local sincronizado',
        ]}
        actions={
          <>
            <button
              type="button"
              onClick={handleOpenRootFolder}
              disabled={openingRoot}
              className="btn btn-ghost btn-sm"
              title="Abrir pasta geral de workspaces no Explorer"
            >
              <ExternalLink size={14} />
              <span className="hide-mobile">{openingRoot ? 'Abrindo…' : 'Explorer'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowWebhooksModal(true)}
              className="btn btn-ghost btn-sm"
              title="Webhooks de Notificação"
            >
              <Layers size={14} />
              <span className="hide-mobile">Webhooks</span>
            </button>

            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="btn btn-primary btn-sm"
            >
              <FolderPlus size={14} />
              <span>Anexar Pasta</span>
            </button>

            <button
              type="button"
              onClick={loadProjects}
              disabled={loading}
              className="btn btn-secondary btn-icon-sm"
              title="Atualizar workspaces"
              aria-label="Atualizar workspaces"
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>
          </>
        }
      />

      {/* Barra Unificada de Filtros, Busca e Modo de Visualização */}
      <div className="jarvis-filter-bar">
        <div className="jarvis-search-box" style={{ flex: '1 1 240px', maxWidth: '340px' }}>
          <Search size={14} />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Pesquisar workspace, stack ou caminho..."
            aria-label="Pesquisar workspace"
            className="jarvis-search-box__input"
          />
          {searchFilter && (
            <button
              type="button"
              onClick={() => setSearchFilter('')}
              className="btn btn-ghost btn-icon-sm"
              aria-label="Limpar busca"
              style={{ width: '22px', height: '22px', padding: 0 }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div className="jarvis-segmented" role="tablist" aria-label="Categorias de workspace">
            {[
              { key: 'all', label: 'Todos', icon: Folder },
              { key: 'recent', label: 'Recentes', icon: Clock },
              { key: 'unorganized', label: 'Avulsos', icon: FileCode },
              { key: 'agents', label: 'Agentes', icon: Bot },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeCategory === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveCategory(tab.key as any)}
                  className={`jarvis-segmented-btn ${isActive ? 'is-active' : ''}`}
                >
                  <Icon size={13} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="jarvis-segmented" role="group" aria-label="Modo de visualização">
            <button
              type="button"
              onClick={() => setViewMode('rows')}
              className={`jarvis-segmented-btn ${viewMode === 'rows' ? 'is-active' : ''}`}
              title="Visualização em Linhas"
              aria-label="Visualização em Linhas"
              aria-pressed={viewMode === 'rows'}
            >
              <List size={14} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`jarvis-segmented-btn ${viewMode === 'grid' ? 'is-active' : ''}`}
              title="Visualização em Grade"
              aria-label="Visualização em Grade"
              aria-pressed={viewMode === 'grid'}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`jarvis-segmented-btn ${viewMode === 'table' ? 'is-active' : ''}`}
              title="Visualização em Tabela"
              aria-label="Visualização em Tabela"
              aria-pressed={viewMode === 'table'}
            >
              <TableProperties size={14} />
            </button>
          </div>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="jarvis-error-banner">
          <span>Não foi possível carregar os projetos: {loadError}</span>
        </div>
      )}

      {/* Conteúdo */}
      {filteredProjects.length === 0 && !loading ? (
        <div className="jarvis-empty-state" style={{ minHeight: '300px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
            }}
          >
            <FolderGit2 size={22} />
          </div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {searchFilter ? 'Nenhum workspace encontrado' : 'Nenhum projeto vinculado ainda'}
          </h3>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', maxWidth: '380px', margin: 0 }}>
            {searchFilter
              ? `Nenhum projeto corresponde à busca "${searchFilter}".`
              : 'Os projetos que você anexa do computador ou que os agentes geram aparecem listados aqui.'}
          </p>
          <button
            type="button"
            onClick={() => (searchFilter ? setSearchFilter('') : setShowImportModal(true))}
            className="btn btn-primary btn-sm"
            style={{ marginTop: '6px' }}
          >
            {searchFilter ? 'Limpar filtro' : 'Anexar pasta local'}
          </button>
        </div>
      ) : viewMode === 'rows' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              layoutMode="row"
              onOpenFile={handleOpenFile}
              onSelectForChat={onSelectForChat}
              onDeleteProject={handleDeleteProject}
              onOpenMemory={(projId) => setMemoryProjectId(projId)}
            />
          ))}
        </div>
      ) : viewMode === 'grid' ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
            gap: '14px',
          }}
        >
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              layoutMode="grid"
              onOpenFile={handleOpenFile}
              onSelectForChat={onSelectForChat}
              onDeleteProject={handleDeleteProject}
              onOpenMemory={(projId) => setMemoryProjectId(projId)}
            />
          ))}
        </div>
      ) : (
        <div className="jarvis-table-wrap">
          <table className="jarvis-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tecnologia</th>
                <th>Caminho Físico</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map((proj) => (
                <tr key={proj.id}>
                  <td style={{ fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Folder size={15} color="var(--accent-light)" />
                      <span>{proj.name || proj.id}</span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{proj.project_type || 'Geral'}</td>
                  <td
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: '0.78rem',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {proj.path || `workspace/${proj.id}`}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', justifyContent: 'flex-end', gap: '6px' }}>
                      {onSelectForChat && (
                        <button
                          type="button"
                          onClick={() => onSelectForChat(proj.id)}
                          className="btn btn-ghost btn-icon-sm"
                          title="Conversar com este workspace no chat"
                          aria-label="Conversar com este workspace no chat"
                        >
                          <MessageSquare size={13} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteProject(proj.id)}
                        className="btn btn-danger-ghost btn-icon-sm"
                        title="Remover workspace"
                        aria-label="Remover workspace"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {fileModal && (
        <FileViewerModal
          isOpen={Boolean(fileModal)}
          projectId={fileModal.projectId}
          filePath={fileModal.filePath}
          content={fileModal.content}
          onClose={() => setFileModal(null)}
        />
      )}

      {memoryProjectId && (
        <ProjectMemoryModal
          isOpen={Boolean(memoryProjectId)}
          projectId={memoryProjectId}
          onClose={() => setMemoryProjectId(null)}
        />
      )}

      {showImportModal && (
        <ImportFolderModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onSuccess={loadProjects}
        />
      )}

      {showWebhooksModal && (
        <WebhooksModal
          isOpen={showWebhooksModal}
          onClose={() => setShowWebhooksModal(false)}
        />
      )}
    </div>
  );
};
