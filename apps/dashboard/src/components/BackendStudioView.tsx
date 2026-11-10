import React, { useState } from 'react';
import { MockServerSection } from './studios/backend/MockServerSection';
import { SqlPlaygroundSection } from './studios/backend/SqlPlaygroundSection';

export const BackendStudioView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'mock_server' | 'sql_playground'>('mock_server');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <h2
            className="claude-serif-title"
            style={{
              fontSize: '1.6rem',
              fontWeight: 500,
              margin: 0,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
            }}
          >
            Backend Studio & Servidor de Mocks
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
            Servidor de mocks nativo e playground interativo com auditor de consultas SQLite e índices WAL.
          </p>
        </div>

        {/* Seletor de Sub-Abas em Pílula */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            backgroundColor: 'var(--bg-tertiary)',
            padding: '4px',
            borderRadius: '9999px',
            border: '1px solid var(--border-color)',
          }}
        >
          <button
            onClick={() => setActiveSubTab('mock_server')}
            className={`btn ${activeSubTab === 'mock_server' ? 'btn-primary' : 'btn-ghost'}`}
            style={{
              fontSize: '0.82rem',
              padding: '6px 16px',
              borderRadius: '9999px',
            }}
          >
            Mock Server Nativo
          </button>
          <button
            onClick={() => setActiveSubTab('sql_playground')}
            className={`btn ${activeSubTab === 'sql_playground' ? 'btn-primary' : 'btn-ghost'}`}
            style={{
              fontSize: '0.82rem',
              padding: '6px 16px',
              borderRadius: '9999px',
            }}
          >
            Playground SQL & Índices
          </button>
        </div>
      </div>

      {/* Conteúdo Dinâmico por Sub-Aba */}
      {activeSubTab === 'mock_server' ? <MockServerSection /> : <SqlPlaygroundSection />}
    </div>
  );
};
