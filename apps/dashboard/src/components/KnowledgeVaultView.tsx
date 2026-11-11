import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Plus,
} from 'lucide-react';
import {
  fetchKnowledgeDocuments,
  uploadKnowledgeDocument,
  indexKnowledgeFolder,
  indexKnowledgeText,
  searchKnowledge,
  deleteKnowledgeDocument,
} from '../api';
import { notify } from './common/Toast';
import { KnowledgeSearchBar } from './knowledge/KnowledgeSearchBar';
import { DocumentListGrid } from './knowledge/DocumentListGrid';
import { FolderIndexModal, TextSnippetModal } from './knowledge/DocumentModals';

export const KnowledgeVaultView: React.FC = () => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Modais de Entrada
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const [folderCategory, setFolderCategory] = useState('projeto');
  const [folderIndexing, setFolderIndexing] = useState(false);

  const [showTextModal, setShowTextModal] = useState(false);
  const [textDocName, setTextDocName] = useState('');
  const [textContent, setTextContent] = useState('');
  const [textCategory, setTextCategory] = useState('anotacoes');
  const [textIndexing, setTextIndexing] = useState(false);

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
    loadDocuments();
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
    const file = e.target.files?.[0];
    if (!file) return;

    notify(`Indexando '${file.name}' no Knowledge Vault...`, 'info');
    try {
      const res = await uploadKnowledgeDocument(file, 'manuais');
      notify(`Documento '${file.name}' processado em ${res.chunks_count} trechos semânticos!`, 'success');
      await loadDocuments();
    } catch (err: any) {
      notify(`Falha ao indexar arquivo: ${err.message}`, 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderPath.trim()) return;

    setFolderIndexing(true);
    notify(`Varrendo e indexando diretório no computador...`, 'info');
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

  const handleDelete = async (docName: string) => {
    if (!window.confirm(`Tem certeza que deseja remover '${docName}' da Base de Conhecimento?`)) {
      return;
    }
    try {
      const result = await deleteKnowledgeDocument(docName);
      if (result?.status !== 'deleted') {
        throw new Error('O documento não foi encontrado na sua conta.');
      }
      notify(`Documento '${docName}' removido com sucesso`, 'success');
      await loadDocuments();
      if (searchQuery) handleSearch();
    } catch (err: any) {
      notify(`Erro ao excluir documento: ${err.message}`, 'error');
    }
  };

  const totalChunks = documents.reduce((acc, d) => acc + (d.total_chunks || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2
            className="claude-serif-title"
            style={{
              fontSize: '1.6rem',
              fontWeight: 500,
              margin: 0,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
            }}
          >
            Base de Conhecimento & RAG Local
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
            {documents.length} documentos indexados ({totalChunks} trechos semânticos) com injeção contextual nos 26 especialistas.
          </p>
        </div>

        {/* Botões de Ação */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            style={{ display: 'none' }}
            accept=".pdf,.docx,.md,.txt,.json,.yaml,.yml,.py,.ts,.tsx,.java,.go,.cs,.sql"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-primary"
            style={{
              fontSize: '0.82rem',
              padding: '7px 14px',
              borderRadius: '8px',
            }}
          >
            <span>Upload de Arquivo</span>
          </button>

          <button
            onClick={() => setShowFolderModal(true)}
            className="btn btn-secondary"
            style={{ fontSize: '0.82rem', padding: '7px 14px', borderRadius: '8px' }}
          >
            <span>Indexar Pasta Local</span>
          </button>

          <button
            onClick={() => setShowTextModal(true)}
            className="btn btn-secondary"
            style={{ fontSize: '0.82rem', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px' }}
          >
            <Plus size={14} />
            <span>Adicionar Anotação</span>
          </button>

          <button
            onClick={loadDocuments}
            className="btn btn-ghost"
            style={{ padding: '8px 12px', color: 'var(--text-muted)', borderRadius: '8px' }}
            title="Atualizar lista"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Barra e Resultados de Pesquisa Semântica */}
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

      {/* Grade de Documentos */}
      <DocumentListGrid
        documents={documents}
        loading={loading}
        error={documentsError}
        onDelete={handleDelete}
        onSelectFileClick={() => fileInputRef.current?.click()}
      />

      {/* Modais */}
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
    </div>
  );
};
