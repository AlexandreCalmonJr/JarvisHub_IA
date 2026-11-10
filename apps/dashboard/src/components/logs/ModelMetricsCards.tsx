import React from 'react';
import { Clock, Zap, Cpu, ShieldCheck } from 'lucide-react';

interface ModelMetrics {
  total_inferences: number;
  total_tokens: number;
  total_savings_usd: number;
  average_latency_seconds: number;
  average_tokens_per_second: number;
  fastest_model: string;
  success_rate_percent: number;
  recent_inferences: any[];
}

interface ModelMetricsCardsProps {
  metrics: ModelMetrics | null;
}

export const ModelMetricsCards: React.FC<ModelMetricsCardsProps> = ({ metrics }) => {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
        gap: '16px',
      }}
    >
      {/* Card 1: Latência Média */}
      <div
        className="glass-card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
        }}
      >
        <div
          style={{
            padding: '10px',
            borderRadius: '10px',
            backgroundColor: 'rgba(217, 119, 87, 0.12)',
            border: '1px solid rgba(217, 119, 87, 0.25)',
            color: 'var(--accent-color)',
          }}
        >
          <Clock size={22} />
        </div>
        <div>
          <div
            style={{
              fontSize: '0.74rem',
              color: 'var(--text-muted)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Latência Média Local
          </div>
          <div
            style={{
              fontSize: '1.35rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginTop: '2px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {metrics && metrics.average_latency_seconds > 0
              ? `${metrics.average_latency_seconds}s`
              : 'Calculando...'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--accent-color)', marginTop: '2px' }}>
            Tempo total por resposta
          </div>
        </div>
      </div>

      {/* Card 2: Velocidade Real */}
      <div
        className="glass-card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
        }}
      >
        <div
          style={{
            padding: '10px',
            borderRadius: '10px',
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            color: '#fbbf24',
          }}
        >
          <Zap size={22} />
        </div>
        <div>
          <div
            style={{
              fontSize: '0.74rem',
              color: 'var(--text-muted)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Velocidade de Geração
          </div>
          <div
            style={{
              fontSize: '1.35rem',
              fontWeight: 600,
              color: '#fbbf24',
              marginTop: '2px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {metrics && metrics.average_tokens_per_second > 0
              ? `${metrics.average_tokens_per_second} t/s`
              : '12 a 15 t/s'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Tokens por segundo na CPU
          </div>
        </div>
      </div>

      {/* Card 3: Modelo Mais Eficiente */}
      <div
        className="glass-card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
        }}
      >
        <div
          style={{
            padding: '10px',
            borderRadius: '10px',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            color: '#34d399',
          }}
        >
          <Cpu size={22} />
        </div>
        <div>
          <div
            style={{
              fontSize: '0.74rem',
              color: 'var(--text-muted)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Modelo Mais Veloz
          </div>
          <div
            style={{
              fontSize: '1.15rem',
              fontWeight: 600,
              color: '#34d399',
              marginTop: '2px',
              wordBreak: 'break-all',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {metrics?.fastest_model || 'llama3.2:3b'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Taxa de sucesso: {metrics?.success_rate_percent || 100}%
          </div>
        </div>
      </div>

      {/* Card 4: Economia Acumulada */}
      <div
        className="glass-card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
        }}
      >
        <div
          style={{
            padding: '10px',
            borderRadius: '10px',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            color: '#10b981',
          }}
        >
          <ShieldCheck size={22} />
        </div>
        <div>
          <div
            style={{
              fontSize: '0.74rem',
              color: 'var(--text-muted)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Economia Local-First
          </div>
          <div
            style={{
              fontSize: '1.35rem',
              fontWeight: 600,
              color: '#10b981',
              marginTop: '2px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            ${metrics?.total_savings_usd ? metrics.total_savings_usd.toFixed(3) : '0.000'} USD
          </div>
          <div style={{ fontSize: '0.72rem', color: '#10b981', marginTop: '2px' }}>
            100% Grátis (R$ 0,00 gasto)
          </div>
        </div>
      </div>
    </div>
  );
};
