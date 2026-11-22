import React from 'react';
import { Clock, Zap, Cpu, ShieldCheck } from 'lucide-react';

interface ModelMetrics {
  total_inferences: number;
  total_tokens: number;
  total_savings_usd: number | null;
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
  const cards = [
    {
      label: 'Latência Média Local',
      value: metrics && metrics.average_latency_seconds > 0 ? `${metrics.average_latency_seconds}s` : '—',
      hint: 'Tempo total por resposta',
      color: 'var(--accent-light)',
      iconBg: 'var(--accent-soft)',
      icon: <Clock size={18} />,
    },
    {
      label: 'Velocidade de Geração',
      value: metrics && metrics.average_tokens_per_second > 0 ? `${metrics.average_tokens_per_second} t/s` : '—',
      hint: 'Tokens por segundo na CPU',
      color: '#fbbf24',
      iconBg: 'rgba(245, 158, 11, 0.12)',
      icon: <Zap size={18} />,
    },
    {
      label: 'Modelo Mais Veloz',
      value: metrics?.fastest_model || '—',
      hint: `Taxa de sucesso: ${typeof metrics?.success_rate_percent === 'number' ? `${metrics.success_rate_percent}%` : '—'}`,
      color: '#4ade80',
      iconBg: 'rgba(34, 197, 94, 0.12)',
      icon: <Cpu size={18} />,
      compact: true,
    },
    {
      label: 'Economia Local-First',
      value: typeof metrics?.total_savings_usd === 'number' ? `$${metrics.total_savings_usd.toFixed(3)}` : '—',
      hint: 'Estimativa de custo evitado',
      color: '#4ade80',
      iconBg: 'rgba(34, 197, 94, 0.12)',
      icon: <ShieldCheck size={18} />,
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
        gap: '12px',
      }}
    >
      {cards.map((card) => (
        <div
          key={card.label}
          className="jarvis-settings-card"
          style={{
            padding: '16px',
            flexDirection: 'row',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 'var(--radius-md)',
              backgroundColor: card.iconBg,
              color: card.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {card.icon}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="user-profile-field-label">{card.label}</div>
            <div
              className="jarvis-tabular"
              style={{
                fontSize: card.compact ? '1.05rem' : '1.28rem',
                fontWeight: 600,
                color: card.color,
                marginTop: '3px',
                fontFamily: 'var(--font-mono)',
                wordBreak: 'break-word',
              }}
            >
              {card.value}
            </div>
            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              {card.hint}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
