import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Plus,
  Upload,
  FolderPlus,
  Brain,
  Users,
  FileText,
} from 'lucide-react';
import {
  fetchKnowledgeDocuments,
  uploadKnowledgeDocument,
  indexKnowledgeFolder,
  indexKnowledgeText,
  searchKnowledge,
  deleteKnowledgeDocument,
} from '../../api';
import { notify } from '../../shared/common/Toast';
import { ConfirmDialog } from '../../shared/common/ConfirmDialog';
import { PageHeader } from '../../shared/layout/PageHeader';
import { API_BASE } from '../../services/api/client';
import { apiFetch } from '../../services/sessionTransport';
import { KnowledgeSearchBar } from './KnowledgeSearchBar';
import { DocumentListGrid } from './DocumentListGrid';
import { FolderIndexModal, TextSnippetModal } from './DocumentModals';
import { BrainMapPanel } from './BrainMapPanel';
import { AssistantFederationPanel } from './AssistantFederationPanel';

type KnowledgeTabId = 'brain' | 'assistants' | 'documents';

export const KnowledgeVaultView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<KnowledgeTabId>('brain');
  const [documents, setDocuments] = useState<any[]>([]);
  const [canManageKnowledge, setCanManageKnowledge] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Modais de Entrada (Documentos & RAG)
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const [folderCategory, setFolderCategory] = useState('projeto');
  const [folderIndexing, setFolderIndexing] = useState(false);

  const [showTextModal, setShowTextModal] = useState(false);
  const [textDocName, setTextDocName] = useState('');
  const [textContent, setTextContent] = useState('');
  const [textCategory, setTextCategory] = useState('anotacoes');
  const [textIndexing, setTextIndexing] = useState(false);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState<string | null>(null);
  const [deletingDoc, setDeletingDoc] = useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const docs = await fetchKnowledgeDocuments();
      setDocuments(docs || []);
      setDocumentsError(null);
    } catch (e: any) {
      setDocumentsError(e instanceof Error ? e.message : 'Falha ao carregar documentos do Knowledge Vault.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API_BASE}/auth/me`)
      .then(async (response) => (response.ok ? response.json() : null))
      .then((principal) => {
        if (cancelled) return;
        setCanManageKnowledge(
          principal?.kind === 'human' &&
          (principal?.role === 'admin' || principal?.role === 'developer')
        );
        setRoleLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setCanManageKnowledge(false);
          setRoleLoaded(true);
        }
      });
    loadDocuments();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchKnowledge(searchQuery.trim(), 5);
      setSearchResults(results || []);
      if (!results || results.length === 0) {
        notify('Nenhum trecho relevante encontrado para esta consulta', 'info');
      }
    } catch (err: any) {
      notify(`Erro ao consultar Vault: ${err.message}`, 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManageKnowledge) return;
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      notify('O arquivo excede o limite de 25 MB.', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setUploadingFile(true);
    notify(`Indexando '${file.name}' no Knowledge Vault...`, 'info');
    try {
      const res = await uploadKnowledgeDocument(file, 'manuais');
      notify(`Documento '${file.name}' processado em ${res.chunks_count} trechos semânticos!`, 'success');
      await loadDocuments();
    } catch (err: any) {
      notify(`Falha ao indexar arquivo: ${err.message}`, 'error');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageKnowledge) return;
    if (!folderPath.trim()) return;

    setFolderIndexing(true);
    notify(`Varrendo e indexando diretório no servidor JARVIS...`, 'info');
    try {
      const res = await indexKnowledgeFolder(folderPath.trim(), folderCategory);
      notify(`Varredura concluída: ${res.indexed_count} arquivos indexados com sucesso!`, 'success');
      setShowFolderModal(false);
      setFolderPath('');
      await loadDocuments();
    } catch (err: any) {
      notify(`Erro ao indexar pasta: ${err.message}`, 'error');
    } finally {
      setFolderIndexing(false);
    }
  };

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageKnowledge) return;
    if (!textDocName.trim() || !textContent.trim()) return;

    setTextIndexing(true);
    try {
      const res = await indexKnowledgeText(textDocName.trim(), textContent.trim(), textCategory);
      notify(`Anotação '${textDocName}' indexada em ${res.chunks_count} blocos!`, 'success');
      setShowTextModal(false);
      setTextDocName('');
      setTextContent('');
      await loadDocuments();
    } catch (err: any) {
      notify(`Erro ao salvar anotação: ${err.message}`, 'error');
    } finally {
      setTextIndexing(false);
    }
  };

  const handleDelete = (docName: string) => {
    if (!canManageKnowledge) return;
    setPendingDeleteDoc(docName);
  };

  const confirmDeleteDoc = async () => {
    if (!canManageKnowledge || !pendingDeleteDoc) return;
    const docName = pendingDeleteDoc;
    setDeletingDoc(true);
    try {
      const result = await deleteKnowledgeDocument(docName);
      if (result?.status !== 'deleted') {
        throw new Error('O documento não foi encontrado na sua conta.');
      }
      notify(`Documento '${docName}' removido com sucesso`, 'success');
      setPendingDeleteDoc(null);
      await loadDocuments();
      if (searchQuery) handleSearch();
    } catch (err: any) {
      notify(`Erro ao excluir documento: ${err.message}`, 'error');
    } finally {
      setDeletingDoc(false);
    }
  };

  const totalChunks = documents.reduce((acc, d) => acc + (d.total_chunks || 0), 0);

  return (
    <div className="jarvis-page-shell">
      <PageHeader
        title="Segundo Cérebro & Conhecimento"
        subtitle="Memória viva em 3 camadas, comunicação entre assistentes da casa e cofre RAG de documentos."
        meta={[
          <span key="docs" className="jarvis-tabular">{documents.length} documento{documents.length === 1 ? '' : 's'}</span>,
          <span key="chunks" className="jarvis-tabular">{totalChunks} trechos RAG</span>,
        ]}
        actions={
          activeTab === 'documents' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {canManageKnowledge && (
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                  accept=".pdf,.docx,.md,.txt,.json,.yaml,.yml,.py,.ts,.tsx,.java,.go,.cs,.sql"
                  disabled={uploadingFile}
                />
              )}

              {canManageKnowledge && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile}
                  className="btn btn-primary btn-sm"
                >
                  <Upload size={14} />
                  <span>{uploadingFile ? 'Indexando…' : 'Upload de Arquivo'}</span>
                </button>
              )}

              {canManageKnowledge && (
                <button
                  type="button"
                  onClick={() => setShowFolderModal(true)}
                  className="btn btn-secondary btn-sm"
                >
                  <FolderPlus size={14} />
                  <span>Indexar Pasta</span>
                </button>
              )}

              {canManageKnowledge && (
                <button
                  type="button"
                  onClick={() => setShowTextModal(true)}
                  className="btn btn-secondary btn-sm"
                >
                  <Plus size={14} />
                  <span>Nova Anotação</span>
                </button>
              )}

              <button
                type="button"
                onClick={loadDocuments}
                className="btn btn-ghost btn-icon"
                title="Atualizar lista"
                aria-label="Atualizar lista"
              >
                <RefreshCw size={14} className={loading ? 'spin' : ''} />
              </button>
            </div>
          ) : undefined
        }
      />

      {/* Primary Section Tabs */}
      <div
        role="tablist"
        aria-label="Seções do Segundo Cérebro e Conhecimento"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '10px',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'brain'}
          onClick={() => setActiveTab('brain')}
          className={`btn btn-sm ${activeTab === 'brain' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ whiteSpace: 'nowrap' }}
        >
          <Brain size={14} />
          <span>Mapa do Cérebro</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'assistants'}
          onClick={() => setActiveTab('assistants')}
          className={`btn btn-sm ${activeTab === 'assistants' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ whiteSpace: 'nowrap' }}
        >
          <Users size={14} />
          <span>Assistentes Conectados</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'documents'}
          onClick={() => setActiveTab('documents')}
          className={`btn btn-sm ${activeTab === 'documents' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ whiteSpace: 'nowrap' }}
        >
          <FileText size={14} />
          <span>Documentos & RAG ({documents.length})</span>
        </button>
      </div>

      {activeTab === 'brain' && <BrainMapPanel />}

      {activeTab === 'assistants' && <AssistantFederationPanel />}

      {activeTab === 'documents' && (
        <>
          {!roleLoaded && (
            <div role="status" className="jarvis-callout jarvis-callout--info">
              Verificando permissões de gerenciamento do Knowledge Vault…
            </div>
          )}

          <KnowledgeSearchBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onSearch={handleSearch}
            isSearching={isSearching}
            searchResults={searchResults}
            onClear={() => {
              setSearchResults([]);
              setSearchQuery('');
            }}
          />

          <DocumentListGrid
            documents={documents}
            loading={loading}
            error={documentsError}
            onDelete={handleDelete}
            canManage={canManageKnowledge}
            onSelectFileClick={() => fileInputRef.current?.click()}
          />
        </>
      )}

      {canManageKnowledge && (
        <FolderIndexModal
          isOpen={showFolderModal}
          onClose={() => setShowFolderModal(false)}
          folderPath={folderPath}
          setFolderPath={setFolderPath}
          folderCategory={folderCategory}
          setFolderCategory={setFolderCategory}
          onSubmit={handleFolderSubmit}
          indexing={folderIndexing}
        />
      )}

      {canManageKnowledge && (
        <TextSnippetModal
          isOpen={showTextModal}
          onClose={() => setShowTextModal(false)}
          textDocName={textDocName}
          setTextDocName={setTextDocName}
          textContent={textContent}
          setTextContent={setTextContent}
          textCategory={textCategory}
          setTextCategory={setTextCategory}
          onSubmit={handleTextSubmit}
          indexing={textIndexing}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(pendingDeleteDoc)}
        title="Remover documento"
        description={
          pendingDeleteDoc ? (
            <>
              Tem certeza que deseja remover <strong>{pendingDeleteDoc}</strong> da Base de Conhecimento?
            </>
          ) : null
        }
        confirmLabel="Remover"
        tone="danger"
        isLoading={deletingDoc}
        onConfirm={confirmDeleteDoc}
        onCancel={() => setPendingDeleteDoc(null)}
      />
    </div>
  );
};
