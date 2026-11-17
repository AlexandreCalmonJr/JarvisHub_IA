import React from 'react';

interface Props { models?: any[] }

export const LocalModelsGrid: React.FC<Props> = ({ models = [] }) => (
  <section style={{ display: 'grid', gap: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h3 style={{ color: 'var(--text-primary)', margin: 0, fontSize: 17 }}>Modelos instalados</h3>
      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{models.length} modelo(s)</span>
    </div>
    {models.length === 0 ? (
      <div className="glass-card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-secondary)', borderRadius: 14 }}>
        Nenhum modelo local foi encontrado. Inicie o Ollama e atualize o inventário.
      </div>
    ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
        {models.map((model, index) => {
          const name = model.name || model.model || model.id || `Modelo ${index + 1}`;
          return (
            <article key={model.digest || model.id || name} className="glass-card" style={{ padding: 16, borderRadius: 12, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{name}</strong>
                <span style={{ color: '#4ade80', fontSize: 11 }}>Local</span>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12, color: 'var(--text-muted)', fontSize: 11 }}>
                {model.size && <span>{model.size}</span>}
                {model.parameter_size && <span>{model.parameter_size}</span>}
                {model.quantization_level && <span>{model.quantization_level}</span>}
              </div>
            </article>
          );
        })}
      </div>
    )}
  </section>
);
