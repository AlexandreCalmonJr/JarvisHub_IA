import React, { useEffect, useState } from 'react';
import {
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { notify } from '../../shared/common/Toast';
import {
  addMemoryEntryApi,
  deleteMemoryEntryApi,
  fetchMarkdownMemoryApi,
  fetchMemoryEntriesApi,
  hybridSearchMemoryApi,
  saveMarkdownMemoryApi,
  type AgentWorkspaceItem,
  type HybridSearchResponse,
  type MarkdownMemoryFileItem,
  type MemoryEntryItem,
  type MemoryFilename,
  type MemoryScope,
  type WorkspaceIndexStats,
} from '../../services/api/brainServer';

interface BrainMemoryPanelProps {
  onMutated?: () => void;
}

const WEIGHT_PRESETS = [
  { id: 'balanced', label: 'Equilibrado (50/50)', bm25: 0.5, vector: 0.5 },
  { id: 'fts', label: 'Exato FTS5 (75/25)', bm25: 0.75, vector: 0.25 },
  { id: 'vector', label: 'Vetorial (25/75)', bm25: 0.25, vector: 0.75 },
] as const;

export const BrainMemoryPanel: React.FC<BrainMemoryPanelProps> = ({ onMutated }) => {
  const [workspace, setWorkspace] = useState<AgentWorkspaceItem | null>(null);
  const [files, setFiles] = useState<MarkdownMemoryFileItem[]>([]);
  const [indexStats, setIndexStats] = useState<WorkspaceIndexStats | null>(null);
  const [selectedFile, setSelectedFile] = useState<MemoryFilename>('MEMORY.md');
  const [editorText, setEditorText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [savingMd, setSavingMd] = useState<boolean>(false);

  // Busca Híbrida FTS5 + Vetores (RRF)
  const [searchQuery, setSearchQuery] = useState<string>('SQLite WAL FTS5');
  const [weightPreset, setWeightPreset] = useState<'balanced' | 'fts' | 'vector'>('balanced');
  const [searching, setSearching] = useState<boolean>(false);
  const [searchResult, setSearchResult] = useState<HybridSearchResponse | null>(null);

  // Memória Hermes (memory vs user)
  const [entries, setEntries] = useState<MemoryEntryItem[]>([]);
  const [scopeFilter, setScopeFilter] = useState<'all' | MemoryScope>('all');
  const [factScope, setFactScope] = useState<MemoryScope>('memory');
  const [factTitle, setFactTitle] = useState<string>('');
  const [factContent, setFactContent] = useState<string>('');
  const [factTags, setFactTags] = useState<string>('');
  const [addingFact, setAddingFact] = useState<boolean>(false);

  const loadMemoryData = async (preferredFile?: MemoryFilename) => {
    setLoading(true);
    try {
      const [mdData, entriesData] = await Promise.all([
        fetchMarkdownMemoryApi(),
        fetchMemoryEntriesApi(),
      ]);
      setWorkspace(mdData.workspace);
      setFiles(mdData.files);
      setIndexStats(mdData.index_stats);
      setEntries(entriesData.entries);
      const targetName = preferredFile || selectedFile;
      const found = mdData.files.find((f) => f.filename === targetName) || mdData.files[0];
      if (found) {
        setSelectedFile(found.filename);
        setEditorText(found.content);
      }
    } catch (err: any) {
      notify(err?.message || 'Não foi possível carregar a memória do perfil ativo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMemoryData();
  }, []);

  const handleSelectFile = (filename: MemoryFilename) => {
    setSelectedFile(filename);
    const found = files.find((f) => f.filename === filename);
    setEditorText(found?.content || '');
  };

  const handleSaveMarkdown = async () => {
    setSavingMd(true);
    try {
      const res = await saveMarkdownMemoryApi(selectedFile, editorText);
      setFiles((prev) => prev.map((f) => (f.filename === selectedFile ? res.file : f)));
      setIndexStats(res.index_stats);
      notify(
        `${selectedFile} salvo e reindexado pelo Python (${res.chunks_indexed} chunks em ${res.python_elapsed_ms} ms).`,
        'success'
      );
      onMutated?.();
    } catch (err: any) {
      notify(err?.message || 'Falha ao salvar arquivo Markdown.', 'error');
    } finally {
      setSavingMd(false);
    }
  };

  const handleHybridSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) {
      notify('Digite um termo para pesquisar na memória híbrida.', 'warning');
      return;
    }
    const preset = WEIGHT_PRESETS.find((p) => p.id === weightPreset) || WEIGHT_PRESETS[0];
    setSearching(true);
    try {
      const res = await hybridSearchMemoryApi({
        query: q,
        limit: 8,
        bm25_weight: preset.bm25,
        vector_weight: preset.vector,
      });
      setSearchResult(res);
    } catch (err: any) {
      notify(err?.message || 'Erro ao executar busca híbrida.', 'error');
    } finally {
      setSearching(false);
    }
  };

  const handleAddFact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (factTitle.trim().length < 2 || factContent.trim().length < 4) {
      notify('Preencha título e conteúdo para registrar o fato.', 'warning');
      return;
    }
    setAddingFact(true);
    try {
      const tags = factTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await addMemoryEntryApi({
        scope: factScope,
        title: factTitle.trim(),
        content: factContent.trim(),
        tags,
      });
      setEntries(res.entries);
      setIndexStats(res.index_stats);
      setFactTitle('');
      setFactContent('');
      setFactTags('');
      notify(`Fato gravado na camada "${factScope}" e indexado no FTS5 + vetores.`, 'success');
      onMutated?.();
    } catch (err: any) {
      notify(err?.message || 'Falha ao salvar fato.', 'error');
    } finally {
      setAddingFact(false);
    }
  };

  const handleDeleteFact = async (id: string, title: string) => {
    try {
      const res = await deleteMemoryEntryApi(id);
      setEntries(res.entries);
      setIndexStats(res.index_stats);
      notify(`Fato "${title}" removido.`, 'info');
      onMutated?.();
    } catch (err: any) {
      notify(err?.message || 'Falha ao remover fato.', 'error');
    }
  };

  const activeFileMeta = files.find((f) => f.filename === selectedFile);
  const filteredEntries =
    scopeFilter === 'all' ? entries : entries.filter((item) => item.scope === scopeFilter);

  if (loading) {
    return (
      <div className="brain-poly-loading">
        <Loader2 size={16} className="spin" color="var(--accent-color)" />
        <span>Carregando arquivos Markdown e índice híbrido SQLite...</span>
      </div>
    );
  }

  return (
    <div className="brain-poly-stack">
      {/* Cabeçalho de Métricas do Perfil Ativo */}
      <section className="brain-poly-card">
        <div className="brain-poly-header">
          <div>
            <h2 className="brain-poly-title">
              Memória Viva em Markdown &amp; Índice Híbrido (OpenClaw + Hermes)
            </h2>
            <p className="brain-poly-subtitle mono tabular-nums">
              Perfil ativo: <strong style={{ color: 'var(--text-primary)' }}>{workspace?.name || 'Perfil Principal'}</strong>
              {' · '}
              {indexStats?.chunks ?? 0} chunks FTS5
              {' · '}
              {indexStats?.embeddings ?? 0} vetores 128d
              {' · '}
              {indexStats?.entries_memory ?? 0} fatos memory / {indexStats?.entries_user ?? 0} fatos user
              {' · '}
              {((indexStats?.db_size_bytes || 0) / 1024).toFixed(1)} KB
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadMemoryData(selectedFile)}
            className="btn btn-secondary btn-sm"
          >
            <RefreshCw size={14} />
            <span>Recarregar do Disco</span>
          </button>
        </div>
      </section>

      {/* Grid Principal: Editor Markdown + Busca Híbrida RRF */}
      <div className="brain-poly-grid-12">
        {/* Editor Markdown Confinado */}
        <section className="brain-poly-card">
          <div className="brain-poly-header">
            <div
              className="jarvis-segmented"
              role="tablist"
              aria-label="Arquivos Markdown de Memória"
            >
              {(['SOUL.md', 'MEMORY.md', 'USER.md'] as MemoryFilename[]).map((name) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={selectedFile === name}
                  onClick={() => handleSelectFile(name)}
                  className={`jarvis-segmented-btn mono ${selectedFile === name ? 'is-active' : ''}`}
                >
                  {name}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={savingMd}
              onClick={() => void handleSaveMarkdown()}
              className="btn btn-primary btn-sm"
            >
              {savingMd ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
              <span>Salvar e Reindexar</span>
            </button>
          </div>

          <div className="brain-poly-meta">
            <FileText size={14} />
            <span>workspaces/{workspace?.slug || 'default'}/{selectedFile}</span>
            <span aria-hidden="true">·</span>
            <span>{activeFileMeta?.size_bytes ?? 0} bytes</span>
            <span aria-hidden="true">·</span>
            <span>SHA {activeFileMeta?.content_hash?.slice(0, 10) || '—'}</span>
          </div>

          <label htmlFor="brain-markdown-editor" className="sr-only">
            Conteúdo de {selectedFile}
          </label>
          <textarea
            id="brain-markdown-editor"
            value={editorText}
            onChange={(e) => setEditorText(e.target.value)}
            rows={14}
            className="jarvis-textarea brain-poly-editor"
            placeholder="Escreva diretrizes, notas técnicas ou preferências em Markdown..."
          />
        </section>

        {/* Explorador de Busca Híbrida FTS5 (BM25) + Vetores (Cosseno) */}
        <section className="brain-poly-card">
          <div>
            <h3 className="brain-poly-title" style={{ fontSize: '0.94rem' }}>
              Busca Híbrida (FTS5 BM25 + Vetores RRF)
            </h3>
            <p className="brain-poly-subtitle">
              Executa consulta paralela no SQLite FTS5 e nos embeddings 128d pelo Worker Python 3.11.
            </p>
          </div>

          <form onSubmit={handleHybridSearch} className="brain-poly-stack" style={{ gap: '10px' }}>
            <div className="brain-poly-search-row">
              <label htmlFor="hybrid-search-input" className="sr-only">
                Consulta de busca híbrida
              </label>
              <input
                id="hybrid-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ex.: SQLite WAL, backup, protocolo..."
                className="jarvis-input"
              />
              <button
                type="submit"
                disabled={searching}
                className="btn btn-primary btn-sm"
              >
                {searching ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
                <span>Buscar</span>
              </button>
            </div>

            <div className="jarvis-segmented" style={{ width: '100%' }}>
              {WEIGHT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setWeightPreset(preset.id)}
                  className={`jarvis-segmented-btn ${weightPreset === preset.id ? 'is-active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center', fontSize: '0.73rem' }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </form>

          {searchResult ? (
            <div className="brain-poly-stack" style={{ gap: '10px' }}>
              <div className="brain-poly-meta" style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
                {searchResult.hits.length} resultado(s) · FTS5: {searchResult.fts_candidates} · Vetorial: {searchResult.vector_candidates} · {searchResult.elapsed_ms} ms
              </div>
              {searchResult.hits.length === 0 ? (
                <p className="brain-poly-subtitle">
                  Nenhum trecho encontrado para "{searchResult.query}". Salve um fato ou reindexe o perfil.
                </p>
              ) : (
                <div className="brain-poly-hit-list">
                  {searchResult.hits.map((hit) => (
                    <div key={hit.chunk_id} className="brain-poly-hit">
                      <div className="brain-poly-hit__top">
                        <span className="brain-poly-hit__source">
                          {hit.source_ref} · {hit.heading}
                        </span>
                        <span style={{ color: 'var(--text-primary)', flexShrink: 0 }}>
                          RRF {(hit.rrf_score * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="brain-poly-hit__snippet">{hit.snippet}</p>
                      <div className="brain-poly-meta" style={{ fontSize: '0.71rem' }}>
                        BM25 {(hit.bm25_score * 100).toFixed(0)}% · Cosseno {(hit.vector_score * 100).toFixed(0)}% · {hit.source_type}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="brain-poly-empty">
              Execute uma busca para comparar a pontuação FTS5 (BM25), a similaridade vetorial e a fusão RRF em tempo real.
            </div>
          )}
        </section>
      </div>

      {/* Camadas de Memória Persistente Hermes: memory vs user */}
      <section className="brain-poly-card">
        <div className="brain-poly-header">
          <div>
            <h3 className="brain-poly-title" style={{ fontSize: '0.94rem' }}>
              Fatos Consolidados por Camada (Estilo Hermes Agent)
            </h3>
            <p className="brain-poly-subtitle">
              Separa notas técnicas do agente (<code style={{ color: 'var(--text-primary)' }}>memory</code>) das preferências do usuário (<code style={{ color: 'var(--text-primary)' }}>user</code>).
            </p>
          </div>

          <div className="jarvis-segmented">
            {(['all', 'memory', 'user'] as const).map((sc) => (
              <button
                key={sc}
                type="button"
                onClick={() => setScopeFilter(sc)}
                className={`jarvis-segmented-btn ${scopeFilter === sc ? 'is-active' : ''}`}
              >
                {sc === 'all' ? 'Todos' : sc === 'memory' ? 'memory (Agente)' : 'user (Usuário)'}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleAddFact} className="brain-poly-fact-form">
          <div className="brain-poly-field">
            <label htmlFor="fact-scope-select" className="brain-poly-label">
              Camada
            </label>
            <select
              id="fact-scope-select"
              value={factScope}
              onChange={(e) => setFactScope(e.target.value as MemoryScope)}
              className="jarvis-select"
            >
              <option value="memory">memory (Técnico)</option>
              <option value="user">user (Usuário)</option>
            </select>
          </div>
          <div className="brain-poly-field">
            <label htmlFor="fact-title-input" className="brain-poly-label">
              Título do Fato
            </label>
            <input
              id="fact-title-input"
              type="text"
              value={factTitle}
              onChange={(e) => setFactTitle(e.target.value)}
              placeholder="Ex.: Porta oficial do gateway Go"
              className="jarvis-input"
            />
          </div>
          <div className="brain-poly-field">
            <label htmlFor="fact-content-input" className="brain-poly-label">
              Conteúdo Durável
            </label>
            <input
              id="fact-content-input"
              type="text"
              value={factContent}
              onChange={(e) => setFactContent(e.target.value)}
              placeholder="Ex.: Gateway Go escuta na porta 8080 com rate limit de 40 req/s."
              className="jarvis-input"
            />
          </div>
          <div className="brain-poly-field">
            <label htmlFor="fact-tags-input" className="brain-poly-label">
              Tags (vírgula)
            </label>
            <input
              id="fact-tags-input"
              type="text"
              value={factTags}
              onChange={(e) => setFactTags(e.target.value)}
              placeholder="go, gateway"
              className="jarvis-input"
            />
          </div>
          <button
            type="submit"
            disabled={addingFact}
            className="btn btn-primary"
          >
            {addingFact ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
            <span>Salvar</span>
          </button>
        </form>

        {filteredEntries.length === 0 ? (
          <p className="brain-poly-subtitle">
            Nenhum fato registrado nesta camada ainda. Adicione acima ou extraia automaticamente na aba Worker Python.
          </p>
        ) : (
          <div className="brain-poly-list">
            {filteredEntries.map((item) => (
              <div key={item.id} className="brain-poly-list-row">
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div className="brain-poly-meta" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.82rem' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{item.title}</strong>
                    <span aria-hidden="true">·</span>
                    <span className={`mono ${item.scope === 'user' ? 'brain-poly-text-warn' : 'brain-poly-text-ok'}`} style={{ fontSize: '0.73rem' }}>
                      {item.scope}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="mono tabular-nums" style={{ fontSize: '0.73rem' }}>
                      confiança {Math.round(item.confidence * 100)}%
                    </span>
                    {item.tags.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="mono" style={{ fontSize: '0.72rem' }}>{item.tags.join(', ')}</span>
                      </>
                    )}
                  </div>
                  <p className="brain-poly-subtitle" style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    {item.content}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Remover fato ${item.title}`}
                  onClick={() => void handleDeleteFact(item.id, item.title)}
                  className="btn btn-danger-ghost btn-icon-sm"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
