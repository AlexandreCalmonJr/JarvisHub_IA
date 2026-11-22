import React from 'react';
import { Sparkles, Zap } from 'lucide-react';
import { getModelLabel } from '../../types';

interface InstalledModelsEvaluationProps {
  modelsEval: any[];
  cloudOptions: any[];
}

export const InstalledModelsEvaluation: React.FC<InstalledModelsEvaluationProps> = ({
  modelsEval,
  cloudOptions,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Modelos Instalados no Ollama Local & Classificação */}
      <section className="jarvis-settings-card">
        <div className="jarvis-settings-card-header">
          <div>
            <h3 className="jarvis-settings-card-title">
              Modelos Instalados no Ollama Local ({modelsEval.length})
            </h3>
            <p className="jarvis-settings-card-desc">
              Classificação de adequação técnica para o processador e memória do computador.
            </p>
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.76rem',
              color: '#4ade80',
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#4ade80' }} />
            Ollama em 127.0.0.1:11434
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
            gap: '12px',
          }}
        >
          {modelsEval.map((m: any, idx: number) => (
            <div key={m.model_name || idx} className="jarvis-settings-subcard" style={{ gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-primary)',
                    wordBreak: 'break-word',
                  }}
                >
                  {getModelLabel(m.model_name)}
                </span>
                <span className={`badge ${m.badge_color}`}>
                  {m.badge}
                </span>
              </div>

              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45, margin: 0 }}>
                {m.verdict}
              </p>

              <div
                className="jarvis-tabular"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                  fontSize: '0.75rem',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>
                    Velocidade estimada
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--accent-light)', fontFamily: 'var(--font-mono)' }}>
                    {m.expected_speed_tps}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>
                    Tempo de resposta
                  </span>
                  <span style={{ fontWeight: 600, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
                    {m.expected_latency}
                  </span>
                </div>
                <div style={{ gridColumn: 'span 2', marginTop: '2px' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>
                    Missão ideal
                  </span>
                  <span style={{ fontWeight: 600, color: '#4ade80' }}>{m.best_for}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Aceleração Híbrida em Nuvem Gratuita */}
      <section className="jarvis-settings-card">
        <div className="jarvis-settings-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={17} color="#fbbf24" />
            <div>
              <h3 className="jarvis-settings-card-title">
                Opções de Aceleração Híbrida sem Custo (Tiers Gratuitos)
              </h3>
              <p className="jarvis-settings-card-desc">
                Provedores externos gratuitos disponíveis para respostas extensas ou geração rápida sem sobrecarregar o hardware local.
              </p>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
            gap: '12px',
          }}
        >
          {cloudOptions.map((opt: any, idx: number) => (
            <div
              key={opt.provider || idx}
              className="jarvis-settings-subcard"
              style={{ gap: '8px', borderColor: 'var(--border-accent)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-light)' }}>
                  {opt.provider}
                </span>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#4ade80' }}>
                  {opt.cost}
                </span>
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                Modelo:{' '}
                <code style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {opt.model}
                </code>
              </div>
              <div
                className="jarvis-tabular"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '0.78rem',
                  color: 'var(--accent-light)',
                  fontWeight: 600,
                }}
              >
                <Zap size={13} />
                <span>
                  Velocidade: {opt.speed} ({opt.latency})
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45, margin: 0 }}>
                {opt.highlight}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
