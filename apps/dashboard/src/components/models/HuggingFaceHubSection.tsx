import React from 'react';

interface Props {
  curatedModels: any[];
  searchResults: any[];
  searchQuery: string;
  isSearching: boolean;
  downloadingModelId: string | null;
  downloadProgress: number;
  downloadStatusText: string;
  agentRecommendations: Record<string, { model: string; reason: string }>;
  canInstall?: boolean;
  isModelInstalled: (tag: string) => boolean;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (event?: React.FormEvent) => void;
  onClearSearch: () => void;
  onInstallModel: (modelTag: string, displayName: string) => void;
}

export const HuggingFaceHubSection: React.FC<Props> = (props) => {
  const {
    curatedModels, searchResults, searchQuery, isSearching, downloadingModelId,
    downloadProgress, downloadStatusText, agentRecommendations, canInstall = false, isModelInstalled,
    onSearchChange, onSearchSubmit, onClearSearch, onInstallModel,
  } = props;
  const list = searchQuery.trim() ? searchResults : curatedModels;

  const modelTag = (model: any) => model.model_tag || model.id || model.repo_id || model.name || '';
  const modelName = (model: any) => model.display_name || model.name || model.model_id || modelTag(model);

  return (
    <section className="glass-card" style={{ padding: 22, borderRadius: 16, display: 'grid', gap: 16 }}>
      <header>
        <h3 style={{ color: 'var(--text-primary)', margin: 0, fontSize: 20 }}>Hugging Face Hub</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '6px 0 0' }}>Descubra modelos compatíveis. A instalação no servidor é reservada a administradores.</p>
      </header>
      <form onSubmit={onSearchSubmit} style={{ display: 'flex', gap: 8 }}>
        <input value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} placeholder="Pesquisar modelos, tarefas ou famílias…" style={inputStyle} />
        <button className="btn btn-primary" type="submit" disabled={isSearching}>{isSearching ? 'A pesquisar…' : 'Pesquisar'}</button>
        {searchQuery && <button className="btn btn-secondary" type="button" onClick={onClearSearch}>Limpar</button>}
      </form>
      {downloadingModelId && (
        <div style={{ padding: 13, borderRadius: 10, background: 'var(--bg-secondary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: 'var(--text-secondary)', fontSize: 12 }}><strong>{downloadStatusText}</strong><span>{downloadProgress}%</span></div>
          <div style={{ height: 6, marginTop: 9, borderRadius: 99, background: 'var(--border-color)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${downloadProgress}%`, background: 'var(--accent-color)' }} /></div>
        </div>
      )}
      {list.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhum modelo disponível para apresentar.</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 12 }}>
          {list.map((model, index) => {
            const tag = modelTag(model);
            const name = modelName(model);
            const installed = isModelInstalled(tag);
            const recommendation = Object.values(agentRecommendations).find((item) => item.model === tag);
            return (
              <article key={tag || index} style={{ border: '1px solid var(--border-color)', borderRadius: 12, padding: 15, background: 'var(--bg-secondary)', display: 'grid', gap: 9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ color: 'var(--text-primary)', fontSize: 13, overflowWrap: 'anywhere' }}>{name}</strong>
                  {installed && <span style={{ color: '#4ade80', fontSize: 10, whiteSpace: 'nowrap' }}>Instalado</span>}
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: 11, overflowWrap: 'anywhere' }}>{tag}</span>
                {model.description && <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: 0 }}>{model.description}</p>}
                {recommendation && <small style={{ color: 'var(--accent-color)' }}>Recomendado: {recommendation.reason}</small>}
                {canInstall ? (
                  <button type="button" className="btn btn-secondary" disabled={installed || Boolean(downloadingModelId) || !tag} onClick={() => onInstallModel(tag, name)}>
                    {installed ? 'Já instalado' : downloadingModelId === tag ? 'A instalar…' : 'Instalar modelo'}
                  </button>
                ) : (
                  <small style={{ color: 'var(--text-muted)' }}>Instalação disponível apenas para administradores.</small>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

const inputStyle: React.CSSProperties = { flex: 1, minWidth: 0, padding: '11px 13px', borderRadius: 9, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' };
