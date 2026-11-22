import React from 'react';
import { Search, Sparkles, RefreshCw, FileText, X } from 'lucide-react';
import { getCategoryLabel } from '../../types';

interface KnowledgeSearchBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSearch: (e?: React.FormEvent) => void;
  isSearching: boolean;
  searchResults: any[];
  onClear: () => void;
}

export const KnowledgeSearchBar: React.FC<KnowledgeSearchBarProps> = ({
  searchQuery,
  setSearchQuery,
  onSearch,
  isSearching,
  searchResults,
  onClear,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <form onSubmit={onSearch} className="jarvis-filter-bar">
        <div className="jarvis-search-box" style={{ flex: '1 1 280px' }}>
          <Search size={15} />
          <input
            type="text"
            className="jarvis-search-box__input"
            placeholder="Pesquisar nos manuais e documentações indexadas (ex: autenticação jwt, regras de negócio)..."
            aria-label="Pesquisar na base de conhecimento"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={onClear}
              className="btn btn-ghost btn-icon-sm"
              aria-label="Limpar busca"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={isSearching || !searchQuery.trim()}
          className="btn btn-primary btn-sm"
        >
          {isSearching ? <RefreshCw size={14} className="spin" /> : <Sparkles size={14} />}
          <span>{isSearching ? 'Buscando…' : 'Buscar no Vault'}</span>
        </button>

        {searchResults.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClear}
          >
            Limpar resultados
          </button>
        )}
      </form>

      {searchResults.length > 0 && (
        <section className="jarvis-settings-card" style={{ borderColor: 'var(--border-accent)' }}>
          <div className="jarvis-settings-card-header">
            <div>
              <h3 className="jarvis-settings-card-title" style={{ color: 'var(--accent-light)' }}>
                Trechos relevantes recuperados ({searchResults.length})
              </h3>
              <p className="jarvis-settings-card-desc">
                Correspondências semânticas retornadas para a consulta atual.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {searchResults.map((res, i) => (
              <div key={i} className="jarvis-settings-subcard" style={{ gap: '8px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                    <FileText size={14} color="var(--accent-light)" style={{ flexShrink: 0 }} />
                    <span
                      style={{
                        fontSize: '0.84rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        wordBreak: 'break-word',
                      }}
                    >
                      {res.doc_name}
                    </span>
                    <span
                      className="jarvis-tabular"
                      style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
                    >
                      Bloco #{(Number(res.chunk_index) || 0) + 1}
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--accent-light)',
                    }}
                  >
                    {getCategoryLabel(res.category)}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    margin: 0,
                    lineHeight: 1.55,
                    fontFamily: 'var(--font-mono)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {res.content}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
