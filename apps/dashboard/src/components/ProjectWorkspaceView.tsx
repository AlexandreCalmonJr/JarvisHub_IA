import React, { useState, useEffect, useMemo } from 'react';
import {
  FolderGit2,
  RefreshCw,
  Search,
  FolderPlus,
  LayoutGrid,
  List,
  Folder,
  FileCode,
  Clock,
  ChevronLeft,
  ChevronRight,
  Bot,
  Layers,
  ExternalLink,
  Trash2,
  MessageSquare,
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
  const [activeCategory, setActiveCategory] = useState<'all' | 'recent' | 'unorganized' | 'agents'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
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
        // Exibe projetos atualizados recentemente
        return true;
      }
      if (activeCategory === 'agents') {
        return (p.name && p.name.toLowerCase().includes('agent')) || (p.description && p.description.toLowerCase().includes('agent'));
      }
      return true;
    });
  }, [projects, searchFilter, activeCategory]);

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        minHeight: 'calc(100vh - 60px)',
        backgroundColor: '#0c0c0e',
        color: '#f4f4f5',
        overflow: 'hidden',
      }}
    >
      {/* Sub-Menu Lateral Retrátil (Gaveta de Contexto OpenBot Library - 240px) */}
      <aside
        style={{
          width: '240px',
          backgroundColor: '#121215',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 8px' }}>
          <FolderGit2 size={18} color="#38bdf8" />
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#f5f5f5' }}>Biblioteca</span>
        </div>

        {/* Categorias da Biblioteca (Estilo OpenBot Image 1 & 6) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className="btn btn-ghost"
            style={{
              width: '100%',
              justifyContent: 'flex-start',
              gap: '10px',
              fontSize: '13px',
              padding: '8px 12px',
              borderRadius: '8px',
              backgroundColor: activeCategory === 'all' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: activeCategory === 'all' ? '#ffffff' : '#9ca3af',
              fontWeight: activeCategory === 'all' ? 600 : 400,
            }}
          >
            <Folder size={15} color="#38bdf8" />
            <span>Todos os arquivos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveCategory('recent')}
            className="btn btn-ghost"
            style={{
              width: '100%',
              justifyContent: 'flex-start',
              gap: '10px',
              fontSize: '13px',
              padding: '8px 12px',
              borderRadius: '8px',
              backgroundColor: activeCategory === 'recent' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: activeCategory === 'recent' ? '#ffffff' : '#9ca3af',
              fontWeight: activeCategory === 'recent' ? 600 : 400,
            }}
          >
            <Clock size={15} color="#c084fc" />
            <span>Recentes</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveCategory('unorganized')}
            className="btn btn-ghost"
            style={{
              width: '100%',
              justifyContent: 'flex-start',
              gap: '10px',
              fontSize: '13px',
              padding: '8px 12px',
              borderRadius: '8px',
              backgroundColor: activeCategory === 'unorganized' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: activeCategory === 'unorganized' ? '#ffffff' : '#9ca3af',
              fontWeight: activeCategory === 'unorganized' ? 600 : 400,
            }}
          >
            <FileCode size={15} color="#fbbf24" />
            <span>Fora de pastas</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveCategory('agents')}
            className="btn btn-ghost"
            style={{
              width: '100%',
              justifyContent: 'flex-start',
              gap: '10px',
              fontSize: '13px',
              padding: '8px 12px',
              borderRadius: '8px',
              backgroundColor: activeCategory === 'agents' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: activeCategory === 'agents' ? '#ffffff' : '#9ca3af',
              fontWeight: activeCategory === 'agents' ? 600 : 400,
            }}
          >
            <Bot size={15} color="#f472b6" />
            <span>Agentes (26 Especialistas)</span>
          </button>
        </div>

        {/* Ações Rápidas na Gaveta */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <button
            type="button"
            onClick={handleOpenRootFolder}
            disabled={openingRoot}
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'flex-start', gap: '8px', fontSize: '12px', padding: '8px 10px', color: '#9ca3af' }}
          >
            <ExternalLink size={14} />
            <span>{openingRoot ? 'Abrindo Explorer...' : 'Abrir no Explorer'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowWebhooksModal(true)}
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'flex-start', gap: '8px', fontSize: '12px', padding: '8px 10px', color: '#9ca3af' }}
          >
            <Layers size={14} />
            <span>Webhooks de Notificação</span>
          </button>
        </div>
      </aside>

      {/* Conteúdo Central da Biblioteca */}
      <main
        style={{
          flex: 1,
          padding: '24px 28px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* Top Header com Busca e Controles (OpenBot Style) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <button
                type="button"
                onClick={() => window.history.back()}
                className="btn btn-ghost"
                style={{ padding: '4px 6px', color: '#9ca3af' }}
                title="Voltar"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => window.history.forward()}
                className="btn btn-ghost"
                style={{ padding: '4px 6px', color: '#9ca3af' }}
                title="Avançar"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div>
              <h1 className="claude-serif-title" style={{ fontSize: '1.45rem', fontWeight: 600, margin: 0, color: '#f5f5f5' }}>
                {activeCategory === 'all'
                  ? 'Todos os arquivos'
                  : activeCategory === 'recent'
                  ? 'Arquivos Recentes'
                  : activeCategory === 'unorganized'
                  ? 'Arquivos Fora de Pastas'
                  : 'Projetos e Agentes'}
              </h1>
              <p style={{ fontSize: '0.80rem', color: '#888888', marginTop: '2px' }}>
                {projects.length} workspace(s) físicos encontrados no diretório local.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Campo de Busca */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#18181b',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '6px 12px',
                borderRadius: '8px',
                width: '220px',
              }}
            >
              <Search size={14} color="#71717a" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Pesquisar na biblioteca..."
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#f4f4f5',
                  fontSize: '12px',
                  width: '100%',
                }}
              />
            </div>

            {/* Alternância de Visualização Grade / Lista */}
            <div style={{ display: 'flex', backgroundColor: '#18181b', padding: '2px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className="btn btn-ghost"
                style={{
                  padding: '5px',
                  borderRadius: '6px',
                  backgroundColor: viewMode === 'grid' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                  color: viewMode === 'grid' ? '#38bdf8' : '#71717a',
                }}
                title="Visualização em Grade"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className="btn btn-ghost"
                style={{
                  padding: '5px',
                  borderRadius: '6px',
                  backgroundColor: viewMode === 'table' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                  color: viewMode === 'table' ? '#38bdf8' : '#71717a',
                }}
                title="Visualização em Lista"
              >
                <List size={15} />
              </button>
            </div>

            {/* Botão Anexar / Importar Pasta */}
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="btn btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#38bdf8',
                color: '#09090b',
                fontWeight: 600,
                fontSize: '12px',
                padding: '6px 12px',
                borderRadius: '8px',
              }}
            >
              <FolderPlus size={15} />
              <span>Anexar Pasta</span>
            </button>

            {/* Atualizar */}
            <button
              type="button"
              onClick={loadProjects}
              disabled={loading}
              className="btn btn-ghost"
              style={{ padding: '6px', borderRadius: '8px', color: '#a1a1aa' }}
              title="Atualizar arquivos"
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {loadError && (
          <div role="alert" className="glass-card" style={{ padding: '12px 16px', border: '1px solid rgba(248, 113, 113, 0.35)', borderRadius: '10px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
            Não foi possível carregar os projetos: {loadError}
          </div>
        )}

        {/* Estado Vazio Refinado (OpenBot Exact Empty State) */}
        {filteredProjects.length === 0 && !loading ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '360px',
              textAlign: 'center',
              padding: '40px 20px',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              <FolderGit2 size={28} color="#71717a" />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#f4f4f5', margin: 0 }}>
              Nenhum arquivo ainda
            </h3>
            <p style={{ fontSize: '0.86rem', color: '#71717a', maxWidth: '380px', marginTop: '6px' }}>
              Os arquivos que você anexa e que os agentes criam aparecem aqui.
            </p>
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="btn btn-secondary"
              style={{ marginTop: '16px', fontSize: '13px', padding: '6px 14px' }}
            >
              Anexar pasta local agora
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          /* Visualização em Grade de Cards */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '16px',
            }}
          >
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpenFile={handleOpenFile}
                onSelectForChat={onSelectForChat}
                onDeleteProject={handleDeleteProject}
                onOpenMemory={(projId) => setMemoryProjectId(projId)}
              />
            ))}
          </div>
        ) : (
          /* Visualização em Tabela / Lista */
          <div
            style={{
              backgroundColor: '#141417',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#71717a' }}>
                  <th style={{ padding: '10px 16px' }}>Nome</th>
                  <th style={{ padding: '10px 16px' }}>Tecnologia</th>
                  <th style={{ padding: '10px 16px' }}>Caminho Físico</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((proj) => (
                  <tr
                    key={proj.id}
                    style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', color: '#d4d4d4' }}
                  >
                    <td style={{ padding: '10px 16px', fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Folder size={15} color="#38bdf8" />
                        <span>{proj.name || proj.id}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#9ca3af' }}>{proj.project_type || 'Geral'}</td>
                    <td style={{ padding: '10px 16px', color: '#71717a', fontSize: '11px', fontFamily: 'monospace' }}>
                      {proj.path || `workspace/${proj.id}`}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        {onSelectForChat && (
                          <button
                            type="button"
                            onClick={() => onSelectForChat(proj.id)}
                            className="btn btn-ghost"
                            style={{ padding: '4px 8px', fontSize: '11px', color: '#38bdf8' }}
                            title="Conversar com este workspace no chat"
                          >
                            <MessageSquare size={13} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteProject(proj.id)}
                          className="btn btn-ghost"
                          style={{ padding: '4px 8px', fontSize: '11px', color: '#ef4444' }}
                          title="Remover workspace"
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
      </main>

      {/* Modais de Arquivo, Importação, Memória e Webhook */}
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
