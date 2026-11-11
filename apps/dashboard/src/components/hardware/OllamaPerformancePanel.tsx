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
        border: '1px solid var(--border-accent)',
        backgroundColor: 'var(--bg-secondary)',
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
          <Sliders size={20} color="var(--accent-color)" />
          <div>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
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
                aria-pressed={isSelected}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  textAlign: 'left',
                  backgroundColor: isSelected
                    ? 'var(--accent-glow)'
                    : 'rgba(255, 255, 255, 0.03)',
                  border: isSelected
                    ? '1px solid var(--border-accent)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div
                  style={{
                    fontSize: '0.86rem',
                    fontWeight: 700,
                    color: isSelected ? 'var(--accent-color)' : 'var(--text-primary)',
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
              color: 'var(--accent-color)',
              padding: '2px 8px',
              borderRadius: '6px',
              backgroundColor: 'var(--accent-glow)',
            }}
          >
            {selectedThreads} de {perfProfile?.logical_cores || '—'} Threads Ativas
          </span>
        </div>

        <input
          type="range"
          min={1}
          max={Math.max(1, Number(perfProfile?.logical_cores) || 1)}
          step={1}
          value={selectedThreads}
          onChange={(e) => setSelectedThreads(Number(e.target.value))}
          style={{
            width: '100%',
            accentColor: 'var(--accent-color)',
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
          <span>{perfProfile?.logical_cores || '—'} Threads disponíveis</span>
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
          💡 <strong>Recomendação:</strong> ajuste o limite de threads de acordo com a carga de trabalho e reserve capacidade para o sistema operativo e as restantes aplicações.
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
          }}
        >
          <CheckCircle2 size={15} />
          <span>{saving ? 'Salvando...' : 'Salvar Preferências de Desempenho'}</span>
        </button>
      </div>
    </div>
  );
};
