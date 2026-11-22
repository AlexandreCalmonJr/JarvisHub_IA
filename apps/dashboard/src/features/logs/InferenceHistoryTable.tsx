import React from 'react';
import { Layers, ChevronDown, ChevronUp } from 'lucide-react';
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
    <section className="jarvis-settings-card" style={{ gap: showTable ? '14px' : '0' }}>
      <div className="jarvis-settings-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={16} color="var(--accent-light)" />
          <h3 className="jarvis-settings-card-title">
            Últimas chamadas a modelos LLM ({recentInferences.length})
          </h3>
        </div>
        <button
          type="button"
          onClick={onToggleTable}
          className="btn btn-ghost btn-xs"
          aria-expanded={showTable}
        >
          <span>{showTable ? 'Ocultar' : 'Exibir detalhes'}</span>
          {showTable ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {showTable && (
        <div className="jarvis-table-wrap">
          <table className="jarvis-table jarvis-tabular">
            <thead>
              <tr>
                <th>Horário</th>
                <th>Agente</th>
                <th>Modelo utilizado</th>
                <th>Tempo de resposta</th>
                <th>Velocidade</th>
                <th>Tokens</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentInferences.map((inf, idx) => (
                <tr key={inf.id || idx}>
                  <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }}>
                    {new Date(inf.timestamp).toLocaleTimeString()}
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {getAgentLabel(inf.agent_role)}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--accent-light)' }}>
                    {getModelLabel(inf.model_name)}
                  </td>
                  <td
                    style={{
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.78rem',
                      color: inf.elapsed_seconds > 40 ? '#fbbf24' : 'var(--accent-light)',
                    }}
                  >
                    {inf.elapsed_seconds}s ({inf.latency_ms} ms)
                  </td>
                  <td style={{ color: '#4ade80', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                    {inf.tokens_per_second > 0 ? `${inf.tokens_per_second} t/s` : '—'}
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                    {inf.total_tokens}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        inf.status === 'success' ? 'badge-success' : 'badge-danger'
                      }`}
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
    </section>
  );
};
