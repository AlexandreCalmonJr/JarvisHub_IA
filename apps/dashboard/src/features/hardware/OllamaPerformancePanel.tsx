import React from 'react';
import { Sliders, Battery, BatteryCharging, CheckCircle2, Cpu, Zap, Scale, Leaf, Info } from 'lucide-react';

interface OllamaPerformancePanelProps {
  perfProfile: any;
  selectedMode: string;
  setSelectedMode: (mode: string) => void;
  selectedThreads: number;
  setSelectedThreads: (threads: number) => void;
  onSave: () => void;
  saving: boolean;
}

const MODE_OPTIONS = [
  { id: 'auto', title: 'Automático', desc: 'Alterna sozinho (Turbo na tomada, Eco na bateria)', icon: Cpu },
  { id: 'turbo', title: 'Modo Turbo', desc: 'Máximo desempenho e velocidade de tokens', icon: Zap },
  { id: 'balanced', title: 'Modo Balanceado', desc: 'Equilíbrio térmico e núcleos livres para o SO', icon: Scale },
  { id: 'eco', title: 'Silencioso / Eco', desc: 'Mínimo aquecimento e máxima autonomia', icon: Leaf },
] as const;

export const OllamaPerformancePanel: React.FC<OllamaPerformancePanelProps> = ({
  perfProfile,
  selectedMode,
  setSelectedMode,
  selectedThreads,
  setSelectedThreads,
  onSave,
  saving,
}) => {
  const isPlugged = perfProfile?.power?.power_plugged === true;
  const hasPercent = typeof perfProfile?.power?.percent === 'number';

  return (
    <section className="jarvis-settings-card" style={{ borderColor: 'var(--border-accent)' }}>
      <div className="jarvis-settings-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sliders size={18} color="var(--accent-light)" />
          <div>
            <h4 className="jarvis-settings-card-title">
              Aceleração de Hardware & Controle de Threads do Ollama
            </h4>
            <p className="jarvis-settings-card-desc">
              {perfProfile?.status_message ||
                'Ajuste dinâmico de consumo térmico, threads e economia de bateria.'}
            </p>
          </div>
        </div>

        <div
          className="jarvis-tabular"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.78rem',
            fontWeight: 600,
            color: isPlugged ? '#4ade80' : hasPercent ? '#fbbf24' : 'var(--text-muted)',
          }}
        >
          {isPlugged ? (
            <>
              <BatteryCharging size={15} />
              <span>Ligado à corrente{hasPercent ? ` (${perfProfile.power.percent}%)` : ''}</span>
            </>
          ) : hasPercent ? (
            <>
              <Battery size={15} />
              <span>
                Bateria: {perfProfile.power.percent}%{' '}
                {perfProfile.power.secs_left ? `(~${Math.round(perfProfile.power.secs_left / 60)} min)` : ''}
              </span>
            </>
          ) : (
            <>
              <Battery size={15} />
              <span>Estado de energia indisponível</span>
            </>
          )}
        </div>
      </div>

      {/* Seletor de Modo de Energia */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span className="user-profile-field-label">Perfil de energia e desempenho</span>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
            gap: '8px',
          }}
        >
          {MODE_OPTIONS.map((m) => {
            const isSelected = selectedMode === m.id;
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMode(m.id)}
                aria-pressed={isSelected}
                className={`jarvis-choice-card ${isSelected ? 'is-active' : ''}`}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    color: isSelected ? 'var(--accent-light)' : 'var(--text-primary)',
                    marginBottom: '3px',
                  }}
                >
                  <Icon size={14} />
                  <span>{m.title}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {m.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Slider de Threads do Ollama */}
      <div className="jarvis-settings-subcard" style={{ gap: '10px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <label
            htmlFor="ollama-cpu-threads-range"
            style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}
          >
            Limite de threads de CPU para o Ollama
          </label>
          <span
            className="jarvis-tabular"
            style={{
              fontSize: '0.78rem',
              fontWeight: 600,
              color: 'var(--accent-light)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {selectedThreads} de {perfProfile?.logical_cores || '—'} threads ativas
          </span>
        </div>

        <input
          id="ollama-cpu-threads-range"
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
          className="jarvis-tabular"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
          }}
        >
          <span>1 thread (Ultraleve)</span>
          <span>Ajuste conforme a capacidade do equipamento</span>
          <span>{perfProfile?.logical_cores || '—'} threads disponíveis</span>
        </div>

        <div className="jarvis-callout jarvis-callout--info" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>
            <strong>Recomendação:</strong> ajuste o limite de threads de acordo com a carga de trabalho e reserve capacidade para o sistema operativo e as restantes aplicações.
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="btn btn-primary btn-sm"
        >
          <CheckCircle2 size={14} />
          <span>{saving ? 'Salvando…' : 'Salvar Preferências de Desempenho'}</span>
        </button>
      </div>
    </section>
  );
};
