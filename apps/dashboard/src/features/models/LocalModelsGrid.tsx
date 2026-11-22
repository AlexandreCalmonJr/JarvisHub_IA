import React from 'react';
import { Cpu } from 'lucide-react';

interface Props {
  models?: any[];
}

export const LocalModelsGrid: React.FC<Props> = ({ models = [] }) => (
  <section className="jarvis-settings-card">
    <div className="jarvis-settings-card-header">
      <div>
        <h3 className="jarvis-settings-card-title">Modelos instalados</h3>
        <p className="jarvis-settings-card-desc">
          Inventário local disponível no runtime Ollama.
        </p>
      </div>
      <span className="jarvis-tabular" style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
        {models.length} modelo{models.length === 1 ? '' : 's'}
      </span>
    </div>

    {models.length === 0 ? (
      <div className="jarvis-empty-state">
        <Cpu size={26} />
        <div className="jarvis-empty-state-title">Nenhum modelo local encontrado</div>
        <div className="jarvis-empty-state-desc">
          Inicie o Ollama ou utilize o Hugging Face Hub para instalar modelos compatíveis.
        </div>
      </div>
    ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: '10px' }}>
        {models.map((model, index) => {
          const name = model.name || model.model || model.id || `Modelo ${index + 1}`;
          const specs = [model.size, model.parameter_size, model.quantization_level].filter(Boolean);

          return (
            <article
              key={model.digest || model.id || name}
              className="jarvis-settings-subcard"
              style={{ gap: '8px', minWidth: 0 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <strong
                  style={{
                    color: 'var(--text-primary)',
                    fontSize: '0.86rem',
                    fontFamily: 'var(--font-mono)',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {name}
                </strong>
                <span style={{ color: '#4ade80', fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 }}>
                  Local
                </span>
              </div>
              {specs.length > 0 && (
                <div
                  className="jarvis-tabular"
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '0.74rem',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {specs.join(' · ')}
                </div>
              )}
            </article>
          );
        })}
      </div>
    )}
  </section>
);
