import React from 'react';

interface Props {
  isOnlineActive: boolean;
  loading: boolean;
  currentSpend: number;
  budgetMax: number;
  budgetPercent: number;
  providerName?: string;
  onOpenWizard: () => void;
  onRefresh: () => void;
}

export const ModelStatusHero: React.FC<Props> = ({
  isOnlineActive, loading, currentSpend, budgetMax, budgetPercent,
  providerName, onOpenWizard, onRefresh,
}) => (
  <section className="glass-card" style={{ padding: 22, borderRadius: 16, display: 'grid', gap: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <span style={{ color: 'var(--text-muted)', fontSize: 11, letterSpacing: '.12em', fontWeight: 700 }}>RUNTIME DE MODELOS</span>
        <h3 style={{ color: 'var(--text-primary)', fontSize: 20, margin: '7px 0 4px' }}>Estado do gateway</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>Visão operacional dos modelos locais e do provedor externo.</p>
      </div>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 11px',
        borderRadius: 999, fontSize: 12, fontWeight: 700,
        background: isOnlineActive ? 'rgba(34,197,94,.12)' : 'rgba(148,163,184,.12)',
        color: isOnlineActive ? '#4ade80' : 'var(--text-secondary)',
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnlineActive ? '#22c55e' : '#94a3b8' }} />
        {isOnlineActive ? 'Gateway online' : 'Modo local'}
      </span>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
      <div style={{ padding: 14, borderRadius: 12, background: 'var(--bg-secondary)' }}>
        <small style={{ color: 'var(--text-muted)' }}>Provedor externo</small>
        <div style={{ color: 'var(--text-primary)', fontWeight: 700, marginTop: 5 }}>{isOnlineActive ? (providerName || 'Configurado') : 'Não ativo'}</div>
      </div>
      <div style={{ padding: 14, borderRadius: 12, background: 'var(--bg-secondary)' }}>
        <small style={{ color: 'var(--text-muted)' }}>Consumo atual</small>
        <div style={{ color: 'var(--text-primary)', fontWeight: 700, marginTop: 5 }}>${currentSpend.toFixed(4)}</div>
      </div>
      <div style={{ padding: 14, borderRadius: 12, background: 'var(--bg-secondary)' }}>
        <small style={{ color: 'var(--text-muted)' }}>Limite configurado</small>
        <div style={{ color: 'var(--text-primary)', fontWeight: 700, marginTop: 5 }}>${budgetMax.toFixed(2)}</div>
      </div>
    </div>
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 7 }}>
        <span>Utilização do orçamento</span><strong>{budgetPercent}%</strong>
      </div>
      <div style={{ height: 7, borderRadius: 99, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
        <div style={{ width: `${budgetPercent}%`, height: '100%', background: budgetPercent >= 90 ? '#ef4444' : '#3b82f6', transition: 'width .25s' }} />
      </div>
    </div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button className="btn btn-primary" type="button" onClick={onOpenWizard}>Configurar modelos</button>
      <button className="btn btn-secondary" type="button" onClick={onRefresh} disabled={loading}>{loading ? 'A atualizar…' : 'Atualizar estado'}</button>
    </div>
  </section>
);
