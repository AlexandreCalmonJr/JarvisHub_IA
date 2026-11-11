import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Star, TrendingUp, Info } from 'lucide-react';
import { fetchModelQualitySummary } from '../../services/api/system';
import type { ModelQualitySummary } from '../../services/api/system';

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

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="glass-card" style={{ padding: '20px', border: '1px solid var(--border-color)', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', display: 'grid', placeItems: 'center', background: 'rgba(217, 119, 87, 0.12)', color: 'var(--accent-color)' }}>
            <TrendingUp size={18} />
          </div>
          <div>
            <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem' }}>Aprendizagem por qualidade</h2>
            <p style={{ margin: '3px 0 0', color: 'var(--text-muted)', fontSize: '0.76rem' }}>Avaliações privadas desta conta por modelo e especialista</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem' }}>
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>

      {error && <div role="alert" style={{ color: 'var(--danger-color, #ef4444)', fontSize: '0.8rem' }}>{error}</div>}
      {loading ? (
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82rem' }}>Carregando avaliações...</p>
      ) : rows.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', padding: '12px', borderRadius: '9px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          <Info size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
          Ainda não existem avaliações. Avalie as respostas no chat para começar a construir o histórico de qualidade.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {rows.map((row) => (
            <div key={`${row.model_name}:${row.provider}:${row.agent_role || 'general'}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <strong style={{ color: 'var(--text-primary)', fontSize: '0.82rem' }}>{row.model_name}</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{row.agent_role || 'Papel geral'} · {row.provider}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: 600 }}>
                  <Star size={14} color="var(--accent-color)" fill="var(--accent-color)" />
                  {row.average_rating.toFixed(2)}/5
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{row.feedback_count} avaliações</span>
                <span className="badge" style={{ fontSize: '0.66rem', padding: '3px 7px', borderRadius: '6px', background: row.sample_sufficient ? 'rgba(34,197,94,0.12)' : 'rgba(148,163,184,0.12)', color: row.sample_sufficient ? 'var(--success-color, #22c55e)' : 'var(--text-muted)' }}>
                  {row.sample_sufficient ? 'Influenciando seleção' : 'Aguardando amostras'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.70rem' }}>O Maestro só considera a nota após três avaliações. Segurança, privacidade, aprovações e orçamento continuam independentes desse sinal.</p>
    </section>
  );
};
