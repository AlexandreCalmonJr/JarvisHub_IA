import React, { useState } from 'react';
import { ContainmentAuditSection } from './security/ContainmentAuditSection';
import { DevSecOpsSection } from './security/DevSecOpsSection';

interface SecurityCenterViewProps {
  onRefresh: () => void;
}

export const SecurityCenterView: React.FC<SecurityCenterViewProps> = ({ onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'containment' | 'devsecops'>('containment');

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
            Security Center & Cibersegurança
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
            Governança de permissões, contenção de emergência, varredura offline de CVEs e Red Team sandbox.
          </p>
        </div>

        {/* Abas Superiores em Pílula */}
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
            onClick={() => setActiveTab('containment')}
            className={`btn ${activeTab === 'containment' ? 'btn-primary' : 'btn-ghost'}`}
            style={{
              fontSize: '0.82rem',
              padding: '6px 16px',
              borderRadius: '9999px',
            }}
          >
            Contenção & Auditoria
          </button>
          <button
            onClick={() => setActiveTab('devsecops')}
            className={`btn ${activeTab === 'devsecops' ? 'btn-primary' : 'btn-ghost'}`}
            style={{
              fontSize: '0.82rem',
              padding: '6px 16px',
              borderRadius: '9999px',
            }}
          >
            DevSecOps & Cibersegurança
          </button>
        </div>
      </div>

      {/* Conteúdo Dinâmico por Aba */}
      {activeTab === 'containment' ? (
        <ContainmentAuditSection onRefresh={onRefresh} />
      ) : (
        <DevSecOpsSection />
      )}
    </div>
  );
};
