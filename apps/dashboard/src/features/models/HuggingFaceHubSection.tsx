import React from 'react';
import { Search, X, Download, Check, Box, Wifi, Cpu } from 'lucide-react';

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
  hfConnected?: boolean;
  onReconnectHf?: () => void;
  isModelInstalled: (tag: string) => boolean;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (event?: React.FormEvent) => void;
  onClearSearch: () => void;
  onInstallModel: (modelTag: string, displayName: string) => void;
}

const FIT_COLOR_MAP: Record<string, string> = {
  gpu_smooth: '#4ade80',
  cpu_ok: '#fbbf24',
  recommend_online: '#60a5fa',
};

export const HuggingFaceHubSection: React.FC<Props> = (props) => {
  const {
    curatedModels,
    searchResults,
    searchQuery,
    isSearching,
    downloadingModelId,
    downloadProgress,
    downloadStatusText,
    agentRecommendations,
    canInstall = false,
    hfConnected = true,
    onReconnectHf,
    isModelInstalled,
    onSearchChange,
    onSearchSubmit,
    onClearSearch,
    onInstallModel,
  } = props;
  const list = searchQuery.trim() ? searchResults : curatedModels;

  const modelTag = (model: any) => model.model_tag || model.id || model.repo_id || model.name || '';
  const modelName = (model: any) => model.display_name || model.name || model.model_id || modelTag(model);

  return (
    <section className="jarvis-settings-card">
      <div className="jarvis-settings-card-header">
        <div>
          <h3 className="jarvis-settings-card-title">Hugging Face Hub · Compatibilidade de Hardware</h3>
          <p className="jarvis-settings-card-desc">
            Pesquise modelos abertos reais no Hugging Face já classificados conforme a GPU e memória RAM do notebook ativo.
          </p>
        </div>
      </div>

      {!hfConnected && (
        <div
          className="jarvis-callout jarvis-callout--info"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}
        >
          <span>
            <strong>Hugging Face está desconectado.</strong> O Consultor de Hardware redirecionou os agentes para Ollama local + Gemini Online.
          </span>
          {onReconnectHf && (
            <button type="button" className="btn btn-primary btn-xs" onClick={onReconnectHf}>
              <Wifi size={12} />
              <span>Reconectar Hugging Face</span>
            </button>
          )}
        </div>
      )}

      <form onSubmit={onSearchSubmit} className="jarvis-filter-bar" style={{ padding: 0, border: 'none', background: 'transparent' }}>
        <div className="jarvis-search-box" style={{ flex: '1 1 260px' }}>
          <Search size={14} />
          <input
            type="text"
            className="jarvis-search-box__input"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Pesquisar modelos GGUF, Qwen, Llama, DeepSeek…"
            aria-label="Pesquisar modelos no Hugging Face Hub"
            disabled={!hfConnected}
          />
          {searchQuery && (
            <button
              type="button"
              className="btn btn-ghost btn-icon-sm"
              onClick={onClearSearch}
              aria-label="Limpar pesquisa"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <button className="btn btn-primary btn-sm" type="submit" disabled={isSearching || !hfConnected}>
          {isSearching ? 'A pesquisar…' : 'Pesquisar'}
        </button>
        {searchQuery && (
          <button className="btn btn-ghost btn-sm" type="button" onClick={onClearSearch}>
            Limpar
          </button>
        )}
      </form>

      {downloadingModelId && (
        <div className="jarvis-settings-subcard" style={{ gap: '8px' }}>
          <div
            className="jarvis-tabular"
            style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}
          >
            <strong style={{ color: 'var(--text-primary)' }}>{downloadStatusText}</strong>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{downloadProgress}%</span>
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 99,
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-subtle)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${downloadProgress}%`,
                backgroundColor: 'var(--accent-color)',
                transition: 'width 0.25s ease',
              }}
            />
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div className="jarvis-empty-state">
          <Box size={26} />
          <div className="jarvis-empty-state-title">
            {hfConnected ? 'Nenhum modelo disponível' : 'Catálogo pausado enquanto desconectado'}
          </div>
          <div className="jarvis-empty-state-desc">
            {hfConnected
              ? 'Tente outro termo de pesquisa ou limpe o filtro para ver os modelos curados.'
              : 'Reconecte o Hugging Face acima ou na aba Consultor & Provedores para buscar modelos.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 275px), 1fr))', gap: '12px' }}>
          {list.map((model, index) => {
            const tag = modelTag(model);
            const name = modelName(model);
            const installed = isModelInstalled(tag);
            const recommendation = Object.values(agentRecommendations).find((item) => item.model === tag);
            const fitTier: string = model.fit_tier || 'gpu_smooth';
            const fitLabel: string = model.fit_label || 'Compatível com o hardware';
            const vramEst: number | undefined =
              typeof model.required_vram_gb === 'number' ? model.required_vram_gb : undefined;

            return (
              <article
                key={tag || index}
                className="jarvis-settings-subcard"
                style={{ gap: '10px', justifyContent: 'space-between' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.86rem', overflowWrap: 'anywhere' }}>
                      {name}
                    </strong>
                    {installed && (
                      <span
                        style={{
                          color: '#4ade80',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        <Check size={11} />
                        Instalado
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: '0.73rem',
                      fontFamily: 'var(--font-mono)',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {tag}
                  </span>

                  <div
                    className="jarvis-tabular"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      flexWrap: 'wrap',
                      fontSize: '0.73rem',
                      color: FIT_COLOR_MAP[fitTier] || 'var(--text-secondary)',
                      fontWeight: 600,
                    }}
                  >
                    <Cpu size={12} />
                    <span>{fitLabel}</span>
                    {vramEst !== undefined && (
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                        · ~{vramEst} GB VRAM
                      </span>
                    )}
                  </div>

                  {model.description && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: 0, lineHeight: 1.45 }}>
                      {model.description}
                    </p>
                  )}
                  {recommendation && (
                    <small style={{ color: 'var(--accent-light)', fontSize: '0.74rem' }}>
                      Recomendado: {recommendation.reason}
                    </small>
                  )}
                </div>

                {canInstall ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-block"
                    disabled={installed || Boolean(downloadingModelId) || !tag}
                    onClick={() => onInstallModel(tag, name)}
                  >
                    <Download size={13} />
                    <span>
                      {installed ? 'Já instalado' : downloadingModelId === tag ? 'A instalar…' : 'Instalar no Ollama'}
                    </span>
                  </button>
                ) : (
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>
                    Instalação local gerenciada no modo Engenharia / Administrador.
                  </small>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

