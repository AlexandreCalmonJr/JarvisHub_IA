import React, { useState } from 'react';
import { Server } from 'lucide-react';
import { PageHeader } from '../../shared/layout/PageHeader';
import { MockServerSection } from './backend/MockServerSection';
import { SqlPlaygroundSection } from './backend/SqlPlaygroundSection';

export const BackendStudioView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'mock_server' | 'sql_playground'>('mock_server');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
      <PageHeader
        title="Backend Studio & Servidor de Mocks"
        subtitle="Servidor de mocks nativo e playground interativo com auditor de consultas SQLite e índices WAL."
        icon={<Server size={16} />}
        actions={
          <div className="jarvis-segmented" role="tablist" aria-label="Ferramentas do Backend Studio">
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'mock_server'}
              onClick={() => setActiveSubTab('mock_server')}
              className={`jarvis-segmented-btn ${activeSubTab === 'mock_server' ? 'is-active' : ''}`}
            >
              Mock Server Nativo
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'sql_playground'}
              onClick={() => setActiveSubTab('sql_playground')}
              className={`jarvis-segmented-btn ${activeSubTab === 'sql_playground' ? 'is-active' : ''}`}
            >
              Playground SQL & Índices
            </button>
          </div>
        }
      />

      {activeSubTab === 'mock_server' ? <MockServerSection /> : <SqlPlaygroundSection />}
    </div>
  );
};
