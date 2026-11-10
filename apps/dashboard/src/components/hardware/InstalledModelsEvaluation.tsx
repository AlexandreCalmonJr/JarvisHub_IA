import React from 'react';
import { Sparkles } from 'lucide-react';

interface InstalledModelsEvaluationProps {
  modelsEval: any[];
  cloudOptions: any[];
}

export const InstalledModelsEvaluation: React.FC<InstalledModelsEvaluationProps> = ({
  modelsEval,
  cloudOptions,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Modelos Instalados no Ollama Local & Classificação */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>
              Modelos Instalados no Ollama Local ({modelsEval.length})
            </h3>
            <p style={{ fontSize: '0.80rem', color: 'var(--text-secondary)' }}>
              Classificação de adequação técnica para o processador e memória do seu computador
            </p>
          </div>
          <span style={{ fontSize: '0.76rem', color: '#10b981', fontWeight: 600 }}>
            ● Ollama Conectado em 127.0.0.1:11434
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
            gap: '16px',
          }}
        >
          {modelsEval.map((m: any, idx: number) => (
            <div
              key={idx}
              style={{
                padding: '16px 18px',
                borderRadius: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.025)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: 'var(--text-primary)',
                  }}
                >
                  {m.model_name}
                </span>
                <span className={`badge ${m.badge_color}`} style={{ fontSize: '0.70rem' }}>
                  {m.badge}
                </span>
              </div>

              <p style={{ fontSize: '0.80rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {m.verdict}
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                  fontSize: '0.74rem',
                  backgroundColor: 'rgba(0, 0, 0, 0.25)',
                  padding: '10px',
                  borderRadius: '8px',
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                    Velocidade Estimada:
                  </span>
                  <span style={{ fontWeight: 600, color: '#38bdf8' }}>{m.expected_speed_tps}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                    Tempo de Resposta:
                  </span>
                  <span style={{ fontWeight: 600, color: '#fbbf24' }}>{m.expected_latency}</span>
                </div>
                <div style={{ gridColumn: 'span 2', marginTop: '2px' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Missão Ideal:</span>
                  <span style={{ fontWeight: 600, color: '#34d399' }}>{m.best_for}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Aceleração Híbrida em Nuvem Gratuita */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <Sparkles size={20} color="#fbbf24" />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>
            Opções de Aceleração Híbrida sem Custo (Tiers Gratuitos)
          </h3>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Quando você precisar de respostas gigantes ou código instantâneo sem esquentar seu notebook, você pode ativar estes provedores gratuitos:
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
            gap: '16px',
          }}
        >
          {cloudOptions.map((opt: any, idx: number) => (
            <div
              key={idx}
              style={{
                padding: '16px 18px',
                borderRadius: '12px',
                backgroundColor: 'rgba(99, 102, 241, 0.05)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.90rem', fontWeight: 700, color: '#818cf8' }}>
                  {opt.provider}
                </span>
                <span className="badge badge-success" style={{ fontSize: '0.68rem' }}>
                  {opt.cost}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Modelo: <code style={{ color: '#e2e8f0' }}>{opt.model}</code>
              </div>
              <div style={{ fontSize: '0.80rem', color: '#38bdf8', fontWeight: 600 }}>
                ⚡ Velocidade: {opt.speed} ({opt.latency})
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {opt.highlight}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
