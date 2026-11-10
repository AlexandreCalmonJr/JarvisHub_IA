import React from 'react';
import { Sliders, Battery, BatteryCharging, CheckCircle2 } from 'lucide-react';

interface OllamaPerformancePanelProps {
  perfProfile: any;
  selectedMode: string;
  setSelectedMode: (mode: string) => void;
  selectedThreads: number;
  setSelectedThreads: (threads: number) => void;
  onSave: () => void;
  saving: boolean;
}

export const OllamaPerformancePanel: React.FC<OllamaPerformancePanelProps> = ({
  perfProfile,
  selectedMode,
  setSelectedMode,
  selectedThreads,
  setSelectedThreads,
  onSave,
  saving,
}) => {
  return (
    <div
      className="glass-panel"
      style={{
        padding: '20px 24px',
        borderRadius: '14px',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sliders size={20} color="#38bdf8" />
          <div>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
              Aceleração de Hardware & Controle de Threads do Ollama
            </h4>
            <p style={{ fontSize: '0.80rem', color: 'var(--text-secondary)', margin: 0 }}>
              {perfProfile?.status_message ||
                'Ajuste dinâmico de consumo térmico, threads e economia de bateria'}
            </p>
          </div>
        </div>

        {/* Badge de Bateria */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '999px',
            fontSize: '0.78rem',
            fontWeight: 600,
            backgroundColor: perfProfile?.power?.power_plugged
              ? 'rgba(16, 185, 129, 0.15)'
              : 'rgba(245, 158, 11, 0.15)',
            border: `1px solid ${
              perfProfile?.power?.power_plugged
                ? 'rgba(16, 185, 129, 0.3)'
                : 'rgba(245, 158, 11, 0.3)'
            }`,
            color: perfProfile?.power?.power_plugged ? '#34d399' : '#fbbf24',
          }}
        >
          {perfProfile?.power?.power_plugged ? (
            <>
              <BatteryCharging size={15} />
              <span>Conectado à Tomada ({perfProfile?.power?.percent || 100}%)</span>
            </>
          ) : (
            <>
              <Battery size={15} />
              <span>
                Bateria: {perfProfile?.power?.percent}%{' '}
                {perfProfile?.power?.secs_left
                  ? `(~${Math.round(perfProfile.power.secs_left / 60)} min)`
                  : ''}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Seletor de Modo de Energia */}
      <div>
        <label
          style={{
            fontSize: '0.76rem',
            color: 'var(--text-muted)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            display: 'block',
            marginBottom: '8px',
          }}
        >
          Perfil de Energia & Desempenho
        </label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
            gap: '10px',
          }}
        >
          {[
            { id: 'auto', title: '🤖 Automático', desc: 'Alterna sozinho (Turbo na tomada, Eco na bateria)' },
            { id: 'turbo', title: '🚀 Modo Turbo', desc: 'Máximo desempenho e velocidade de tokens' },
            { id: 'balanced', title: '⚖️ Modo Balanceado', desc: 'Equilíbrio térmico e núcleos livres para o SO' },
            { id: 'eco', title: '🍃 Silencioso / Eco', desc: 'Mínimo aquecimento e máxima autonomia' },
          ].map((m) => {
            const isSelected = selectedMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMode(m.id)}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  textAlign: 'left',
                  backgroundColor: isSelected
                    ? 'rgba(56, 189, 248, 0.15)'
                    : 'rgba(255, 255, 255, 0.03)',
                  border: isSelected
                    ? '1px solid #38bdf8'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div
                  style={{
                    fontSize: '0.86rem',
                    fontWeight: 700,
                    color: isSelected ? '#38bdf8' : '#e2e8f0',
                    marginBottom: '4px',
                  }}
                >
                  {m.title}
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                  {m.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Slider de Threads do Ollama */}
      <div
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          padding: '16px',
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Limite de Threads de CPU para o Ollama
          </span>
          <span
            style={{
              fontSize: '0.80rem',
              fontWeight: 700,
              color: '#38bdf8',
              padding: '2px 8px',
              borderRadius: '6px',
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
            }}
          >
            {selectedThreads} de {perfProfile?.logical_cores || 8} Threads Ativas
          </span>
        </div>

        <input
          type="range"
          min={1}
          max={perfProfile?.logical_cores || 8}
          step={1}
          value={selectedThreads}
          onChange={(e) => setSelectedThreads(Number(e.target.value))}
          style={{
            width: '100%',
            accentColor: '#38bdf8',
            cursor: 'pointer',
            height: '6px',
          }}
        />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            marginTop: '4px',
          }}
        >
          <span>1 Thread (Ultraleve)</span>
          <span>Recomendado: 4 a 6 Threads</span>
          <span>{perfProfile?.logical_cores || 8} Threads (100% da CPU)</span>
        </div>

        <p
          style={{
            fontSize: '0.74rem',
            color: 'var(--text-secondary)',
            marginTop: '10px',
            marginBottom: '0',
            lineHeight: 1.4,
          }}
        >
          💡 <strong>Recomendação técnica para Intel Core i5:</strong> Reservar 4 a 6 threads deixa
          núcleos dedicados para o Windows, navegador e VS Code continuarem 100% fluidos e sem
          engasgos durante a geração de código.
        </p>
      </div>

      {/* Botão de Salvar Preferências */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="btn btn-primary"
          style={{
            fontSize: '0.82rem',
            padding: '8px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
          }}
        >
          <CheckCircle2 size={15} />
          <span>{saving ? 'Salvando...' : 'Salvar Preferências de Desempenho'}</span>
        </button>
      </div>
    </div>
  );
};
