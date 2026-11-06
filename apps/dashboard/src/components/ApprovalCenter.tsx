import React, { useState } from 'react';
import { ApprovalRequestItem } from '../types';
import { decideApproval } from '../api';
import { ShieldAlert, Check, X, FileDiff, UserCheck } from 'lucide-react';

interface ApprovalCenterProps {
  approvals: ApprovalRequestItem[];
  onRefresh: () => void;
}

export const ApprovalCenter: React.FC<ApprovalCenterProps> = ({ approvals, onRefresh }) => {
  const [userName, setUserName] = useState('admin_dev');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pendingList = approvals.filter(a => a.status === 'pending');

  const handleDecision = async (id: string, action: 'approve' | 'reject') => {
    if (!userName.trim()) {
      setErrorMessage('Identificação do utilizador humano autorizador é obrigatória.');
      return;
    }
    setErrorMessage(null);
    setActionLoading(id);
    try {
      await decideApproval(id, action, userName.trim(), 'Decidido pelo Approval Center Web');
      onRefresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao processar decisão');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Approval Center</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
          Autorização humana obrigatória. Agentes de IA são estritamente impedidos de autoaprovar ações.
        </p>
      </div>

      {/* Identidade do Utilizador */}
      <div style={{
        padding: '16px 20px',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <UserCheck size={18} color="var(--accent-color)" />
          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Identidade do Autorizador Humano:</span>
        </div>
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="Ex: alexandre_lead"
          style={{
            padding: '8px 12px',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
            width: '240px',
          }}
        />
      </div>

      {errorMessage && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          color: '#f87171',
          fontSize: '0.875rem',
        }}>
          {errorMessage}
        </div>
      )}

      {/* Lista de Pedidos */}
      {pendingList.length === 0 ? (
        <div style={{
          padding: '48px 24px',
          textAlign: 'center',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          color: 'var(--text-secondary)',
        }}>
          <ShieldAlert size={36} color="var(--text-secondary)" style={{ margin: '0 auto 12px' }} />
          <h4 style={{ color: 'var(--text-primary)', marginBottom: '4px' }}>Nenhum pedido pendente</h4>
          <p style={{ fontSize: '0.85rem' }}>Todas as operações foram avaliadas ou não há pedidos de escrita no momento.</p>
        </div>
      ) : (
        pendingList.map((appr) => (
          <div
            key={appr.id}
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="badge badge-warning" style={{ marginBottom: '8px' }}>Pendente de Aprovação</span>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{appr.impact_summary}</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  ID: {appr.id} • Agente Solicitante: <code>{appr.agent_role}</code> • Operação: <code>{appr.operation}</code>
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleDecision(appr.id, 'reject')}
                  disabled={actionLoading === appr.id}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <X size={16} />
                  <span>Recusar</span>
                </button>
                <button
                  onClick={() => handleDecision(appr.id, 'approve')}
                  disabled={actionLoading === appr.id}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'var(--success-color)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Check size={16} />
                  <span>Aprovar Operação</span>
                </button>
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Recursos Afetados:
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {appr.affected_resources.map((res, i) => (
                  <code key={i} style={{ padding: '4px 8px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '0.8rem' }}>
                    {res}
                  </code>
                ))}
              </div>
            </div>

            {appr.proposed_diff && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <FileDiff size={16} color="var(--accent-color)" />
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Diff Unificado Proposto:</span>
                </div>
                <pre style={{
                  padding: '12px',
                  backgroundColor: 'var(--bg-primary)',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  overflowX: 'auto',
                  border: '1px solid var(--border-color)',
                  color: '#93c5fd',
                }}>
                  {appr.proposed_diff}
                </pre>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};
