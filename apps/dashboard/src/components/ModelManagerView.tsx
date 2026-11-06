import React, { useState, useEffect } from 'react';
import { Server, Cpu, CloudOff, Zap, ShieldCheck, RefreshCw } from 'lucide-react';
import { fetchModels } from '../api';

export const ModelManagerView: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchModels();
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Model Manager</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Inventário de modelos de IA locais (Ollama CPU) e Gateway Híbrido com failover.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={loadData} disabled={loading}>
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <Cpu size={20} color="var(--accent-color)" />
            <span style={{ fontWeight: 600 }}>Runtime Primário</span>
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>Ollama Local-First</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '4px' }}>
            Inferência executada 100% na CPU (Intel i5-8265U). Zero dependência de cloud.
          </p>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <Zap size={20} color="var(--warning-color)" />
            <span style={{ fontWeight: 600 }}>Limite de Concorrência</span>
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>1 Inferência por vez</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '4px' }}>
            Protege o notebook contra superaquecimento e saturação de memória RAM.
          </p>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <CloudOff size={20} color="var(--success-color)" />
            <span style={{ fontWeight: 600 }}>Gateway Online Opcional</span>
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>Desativado (Offline Seguro)</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '4px' }}>
            Teto de custo: $5.00 USD • Gasto atual: $0.00 USD
          </p>
        </div>
      </div>

      <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Modelos Locais Registados</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {data?.models?.map((m: any) => (
          <div key={m.name} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                padding: '10px',
                borderRadius: '8px',
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                color: 'var(--accent-color)',
              }}>
                <Server size={22} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '1rem' }}>{m.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Missão: {m.role} • Contexto: {m.context.toLocaleString()} tokens
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="badge badge-info">{m.speed}</span>
              <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ShieldCheck size={12} /> Local Ready
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
