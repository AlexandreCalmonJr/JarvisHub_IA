import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Star, TrendingUp, Info } from 'lucide-react';
import { fetchModelQualitySummary } from '../../services/api/system';
import type { ModelQualitySummary } from '../../services/api/system';
import { getAgentLabel, getModelLabel } from '../../types';

export const ModelQualityPanel: React.FC = () => {
  const [rows, setRows] = useState<ModelQualitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchModelQualitySummary());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar avaliações.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="jarvis-settings-card">
      <div className="jarvis-settings-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 'var(--radius-md)',
              display: 'grid',
              placeItems: 'center',
              backgroundColor: 'var(--accent-soft)',
              color: 'var(--accent-light)',
              flexShrink: 0,
            }}
          >
            <TrendingUp size={17} />
          </div>
          <div>
            <h3 className="jarvis-settings-card-title">Aprendizagem por qualidade</h3>
            <p className="jarvis-settings-card-desc">
              Avaliações privadas desta conta por modelo e especialista.
            </p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="btn btn-ghost btn-sm">
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
          <span>Atualizar</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="jarvis-error-banner">
          {error}
        </div>
      )}

      {loading ? (
        <div role="status" className="jarvis-callout jarvis-callout--info">
          Carregando avaliações…
        </div>
      ) : rows.length === 0 ? (
        <div className="jarvis-callout jarvis-callout--info" style={{ display: 'flex', alignItems: 'flex-start', gap: '9px' }}>
          <Info size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>
            Ainda não existem avaliações. Avalie as respostas no chat para começar a construir o histórico de qualidade.
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {rows.map((row) => (
            <div
              key={`${row.model_name}:${row.provider}:${row.agent_role || 'general'}`}
              className="jarvis-settings-subcard"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <strong style={{ color: 'var(--text-primary)', fontSize: '0.86rem' }}>
                  {getModelLabel(row.model_name)}
                </strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  {row.agent_role ? getAgentLabel(row.agent_role) : 'Papel geral'} · {row.provider}
                </span>
              </div>

              <div className="jarvis-tabular" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    color: 'var(--text-primary)',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <Star size={14} color="var(--accent-color)" fill="var(--accent-color)" />
                  {row.average_rating.toFixed(2)}/5
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>
                  {row.feedback_count} avaliações
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: row.sample_sufficient ? '#4ade80' : 'var(--text-muted)',
                  }}
                >
                  {row.sample_sufficient ? 'Influenciando seleção' : 'Aguardando amostras'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.74rem', lineHeight: 1.45 }}>
        O Maestro só considera a nota após três avaliações. Segurança, privacidade, aprovações e orçamento continuam independentes desse sinal.
      </p>
    </section>
  );
};
