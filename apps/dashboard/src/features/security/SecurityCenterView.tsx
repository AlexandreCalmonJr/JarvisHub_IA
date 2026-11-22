import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import { ContainmentAuditSection } from './ContainmentAuditSection';
import { DevSecOpsSection } from './DevSecOpsSection';
import { SentinelSocSection } from './SentinelSocSection';
import { PermissionsMatrixSection } from './PermissionsMatrixSection';
import { PageHeader } from '../../shared/layout/PageHeader';

interface SecurityCenterViewProps {
  onRefresh: () => void;
}

type SecurityTab = 'sentinel' | 'permissions' | 'containment' | 'devsecops';

export const SecurityCenterView: React.FC<SecurityCenterViewProps> = ({ onRefresh }) => {
  const [activeTab, setActiveTab] = useState<SecurityTab>('sentinel');

  return (
    <div className="jarvis-page-shell">
      <PageHeader
        icon={<Shield size={18} />}
        title="Sentinela & Segurança"
        subtitle="SOC pessoal com Kira Sentinela, Vault Lock, Escudo PII, matriz granular de permissões por pasta, contenção e auditoria."
        actions={
          <div className="jarvis-segmented" role="tablist" aria-label="Módulos de segurança">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'sentinel'}
              onClick={() => setActiveTab('sentinel')}
              className={`jarvis-segmented-btn ${activeTab === 'sentinel' ? 'is-active' : ''}`}
            >
              Sentinela & Incidentes
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'permissions'}
              onClick={() => setActiveTab('permissions')}
              className={`jarvis-segmented-btn ${activeTab === 'permissions' ? 'is-active' : ''}`}
            >
              Matriz de Permissões
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'containment'}
              onClick={() => setActiveTab('containment')}
              className={`jarvis-segmented-btn ${activeTab === 'containment' ? 'is-active' : ''}`}
            >
              Contenção & Auditoria
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'devsecops'}
              onClick={() => setActiveTab('devsecops')}
              className={`jarvis-segmented-btn ${activeTab === 'devsecops' ? 'is-active' : ''}`}
            >
              DevSecOps & CVEs
            </button>
          </div>
        }
      />

      {activeTab === 'sentinel' && <SentinelSocSection onRefresh={onRefresh} />}
      {activeTab === 'permissions' && <PermissionsMatrixSection />}
      {activeTab === 'containment' && <ContainmentAuditSection onRefresh={onRefresh} />}
      {activeTab === 'devsecops' && <DevSecOpsSection />}
    </div>
  );
};

