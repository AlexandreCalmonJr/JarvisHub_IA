import React from 'react';
import { Search, Sparkles, RefreshCw } from 'lucide-react';

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
      <form onSubmit={onSearch} style={{ display: 'flex', gap: '10px' }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#070a12',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            padding: '9px 16px',
            gap: '10px',
          }}
        >
          <Search size={18} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Pesquisar nos manuais e documentações indexadas (ex: autenticação jwt, regras de negócio, tabelas)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#fff',
              fontSize: '0.88rem',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={isSearching}
          className="btn btn-primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.84rem',
            padding: '0 20px',
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
          }}
        >
          {isSearching ? <RefreshCw size={14} className="spin" /> : <Sparkles size={14} />}
          <span>{isSearching ? 'Buscando...' : 'Buscar no Vault'}</span>
        </button>

        {searchResults.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClear}
            style={{ fontSize: '0.82rem', padding: '0 12px', color: 'var(--text-muted)' }}
          >
            Limpar Busca
          </button>
        )}
      </form>

      {/* Resultados de Busca em Destaque */}
      {searchResults.length > 0 && (
        <div
          style={{
            padding: '18px 22px',
            borderRadius: '14px',
            backgroundColor: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.90rem', fontWeight: 700, color: '#a5b4fc' }}>
              Trechos Relevantes Recuperados ({searchResults.length} correspondências):
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {searchResults.map((res, i) => (
              <div
                key={i}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#38bdf8' }}>
                    📄 {res.doc_name} (Bloco #{res.chunk_index + 1})
                  </span>
                  <span className="badge badge-purple" style={{ fontSize: '0.68rem' }}>
                    {res.category}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: '0.80rem',
                    color: '#e2e8f0',
                    margin: 0,
                    lineHeight: 1.5,
                    fontFamily: 'monospace',
                  }}
                >
                  {res.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
