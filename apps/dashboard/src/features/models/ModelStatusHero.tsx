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
  isOnlineActive,
  loading,
  currentSpend,
  budgetMax,
  budgetPercent,
  providerName,
  onOpenWizard,
  onRefresh,
}) => (
  <section className="jarvis-settings-card">
    <div className="jarvis-settings-card-header">
      <div>
        <span
          style={{
            color: 'var(--text-muted)',
            fontSize: '0.7rem',
            letterSpacing: '0.08em',
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          Runtime de Modelos
        </span>
        <h3 className="jarvis-settings-card-title" style={{ marginTop: '4px' }}>
          Estado do gateway
        </h3>
        <p className="jarvis-settings-card-desc">
          Visão operacional dos modelos locais e do provedor externo.
        </p>
      </div>

      <span
        className={`badge ${isOnlineActive ? 'badge-success' : ''}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: isOnlineActive ? '#4ade80' : 'var(--text-muted)',
          }}
        />
        {isOnlineActive ? 'Gateway online' : 'Modo local'}
      </span>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
      <div className="jarvis-settings-subcard" style={{ gap: '4px' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>Provedor externo</span>
        <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.95rem' }}>
          {isOnlineActive ? (providerName || 'Configurado') : 'Não ativo'}
        </div>
      </div>

      <div className="jarvis-settings-subcard" style={{ gap: '4px' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>Consumo atual</span>
        <div
          className="jarvis-tabular"
          style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}
        >
          ${currentSpend.toFixed(4)}
        </div>
      </div>

      <div className="jarvis-settings-subcard" style={{ gap: '4px' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>Limite configurado</span>
        <div
          className="jarvis-tabular"
          style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}
        >
          ${budgetMax.toFixed(2)}
        </div>
      </div>
    </div>

    <div>
      <div
        className="jarvis-tabular"
        style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '7px' }}
      >
        <span>Utilização do orçamento</span>
        <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{budgetPercent}%</strong>
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
            width: `${budgetPercent}%`,
            height: '100%',
            backgroundColor: budgetPercent >= 90 ? '#ef4444' : 'var(--accent-color)',
            transition: 'width 0.25s ease',
          }}
        />
      </div>
    </div>

    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <button className="btn btn-primary btn-sm" type="button" onClick={onOpenWizard}>
        Configurar modelos
      </button>
      <button className="btn btn-secondary btn-sm" type="button" onClick={onRefresh} disabled={loading}>
        {loading ? 'A atualizar…' : 'Atualizar estado'}
      </button>
    </div>
  </section>
);
