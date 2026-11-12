import React from 'react';
import { Layers } from 'lucide-react';
import { getAgentLabel, getModelLabel } from '../../types';

interface InferenceHistoryTableProps {
  recentInferences: any[];
  showTable: boolean;
  onToggleTable: () => void;
}

export const InferenceHistoryTable: React.FC<InferenceHistoryTableProps> = ({
  recentInferences,
  showTable,
  onToggleTable,
}) => {
  if (!recentInferences || recentInferences.length === 0) return null;

  return (
    <div className="glass-panel" style={{ padding: '16px 20px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          marginBottom: showTable ? '12px' : 0,
        }}
        onClick={onToggleTable}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={16} color="#818cf8" />
          <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>
            Últimas Chamadas a Modelos LLM ({recentInferences.length})
          </span>
        </div>
        <span style={{ fontSize: '0.75rem', color: '#818cf8' }}>
          {showTable ? 'Ocultar' : 'Exibir Detalhes'}
        </span>
      </div>

      {showTable && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr
                style={{
                  color: 'var(--text-muted)',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  textAlign: 'left',
                }}
              >
                <th style={{ padding: '8px 10px' }}>Horário</th>
                <th style={{ padding: '8px 10px' }}>Agente</th>
                <th style={{ padding: '8px 10px' }}>Modelo Utilizado</th>
                <th style={{ padding: '8px 10px' }}>Tempo de Resposta</th>
                <th style={{ padding: '8px 10px' }}>Velocidade</th>
                <th style={{ padding: '8px 10px' }}>Tokens</th>
                <th style={{ padding: '8px 10px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentInferences.map((inf, idx) => (
                <tr
                  key={idx}
                  style={{
                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                    backgroundColor: idx % 2 === 0 ? 'rgba(255, 255, 255, 0.015)' : 'transparent',
                  }}
                >
                  <td
                    style={{
                      padding: '8px 10px',
                      color: 'var(--text-muted)',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {new Date(inf.timestamp).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{getAgentLabel(inf.agent_role)}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span
                      className="badge badge-purple"
                      style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem' }}
                    >
                      {getModelLabel(inf.model_name)}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      fontWeight: 600,
                      color: inf.elapsed_seconds > 40 ? '#fbbf24' : '#38bdf8',
                    }}
                  >
                    {inf.elapsed_seconds}s ({inf.latency_ms} ms)
                  </td>
                  <td style={{ padding: '8px 10px', color: '#34d399' }}>
                    {inf.tokens_per_second > 0 ? `${inf.tokens_per_second} t/s` : '—'}
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>
                    {inf.total_tokens} tokens
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <span
                      className={`badge ${
                        inf.status === 'success' ? 'badge-success' : 'badge-danger'
                      }`}
                      style={{ fontSize: '0.68rem' }}
                    >
                      {inf.status === 'success' ? 'Concluído' : 'Falha'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
