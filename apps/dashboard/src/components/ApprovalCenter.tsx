import React, { useState } from 'react';
import { ApprovalRequestItem, getAgentLabel, getToolLabel } from '../types';
import { decideApproval } from '../api';
import { ShieldAlert, Check, X, FileDiff } from 'lucide-react';
import { API_BASE } from '../services/api/client';

interface ApprovalCenterProps {
  approvals: ApprovalRequestItem[];
  onRefresh: () => void | Promise<void>;
  loading?: boolean;
  error?: string | null;
}

export const ApprovalCenter: React.FC<ApprovalCenterProps> = ({ approvals, onRefresh, loading = false, error = null }) => {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canDecide, setCanDecide] = useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((principal) => {
        if (!cancelled) {
          setCanDecide(
            principal?.kind === 'human' &&
            (principal?.role === 'admin' || principal?.role === 'developer')
          );
        }
      })
      .catch(() => {
        if (!cancelled) setCanDecide(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pendingList = approvals.filter(a => a.status === 'pending');

  const handleDecision = async (id: string, action: 'approve' | 'reject') => {
    setErrorMessage(null);
    setActionLoading(id);
    try {
      await decideApproval(id, action, 'Decidido pelo Approval Center Web');
      await onRefresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao processar decisão');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 className="claude-serif-title" style={{ fontSize: '1.6rem', fontWeight: 500, margin: 0, letterSpacing: '-0.02em' }}>
            Approval Center
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', marginTop: '3px' }}>
            Autorização humana obrigatória. Agentes de IA são estritamente impedidos de autoaprovar ações.
          </p>
        </div>

        <div className="claude-pill-badge">
          <span>Human-in-the-Loop</span>
          <span style={{ color: 'var(--text-muted)' }}>·</span>
          <span style={{ color: pendingList.length > 0 ? 'var(--warning-color)' : 'var(--success-color)', fontWeight: 600 }}>
            {pendingList.length} Pendente{pendingList.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div
        className="glass-card"
        style={{
          padding: '12px 16px',
          borderRadius: '10px',
          color: 'var(--text-secondary)',
          fontSize: '0.84rem',
        }}
      >
        A decisão será registada com a identidade da sessão autenticada. A identidade não pode ser escolhida nem alterada pelo navegador.
      </div>

      {errorMessage && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            color: '#f87171',
            fontSize: '0.85rem',
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Lista de Pedidos */}
      {error ? (
        <div role="alert" className="glass-card" style={{ padding: '18px', border: '1px solid rgba(248, 113, 113, 0.35)', borderRadius: '12px', color: 'var(--text-secondary)' }}>
          Não foi possível consultar as aprovações: {error}
          <button type="button" onClick={onRefresh} className="btn btn-ghost" style={{ marginLeft: '10px' }}>Tentar novamente</button>
        </div>
      ) : loading ? (
        <div role="status" className="glass-panel" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          A carregar pedidos de aprovação…
        </div>
      ) : pendingList.length === 0 ? (
        <div
          className="glass-panel"
          style={{
            padding: '56px 24px',
            textAlign: 'center',
            borderRadius: '16px',
            color: 'var(--text-secondary)',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: 'var(--text-muted)',
            }}
          >
            <ShieldAlert size={26} />
          </div>
          <h4 className="claude-serif-title" style={{ color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '6px' }}>
            Nenhum pedido pendente
          </h4>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto' }}>
            Todas as operações foram avaliadas ou não há pedidos de escrita no disco aguardando autorização no momento.
          </p>
        </div>
      ) : (
        pendingList.map((appr) => (
          <div
            key={appr.id}
            className="glass-card"
            style={{
              borderRadius: '16px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <span className="badge badge-warning" style={{ marginBottom: '8px' }}>Pendente de Aprovação</span>
                <h3 className="claude-serif-title" style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', margin: '4px 0' }}>
                  {appr.impact_summary}
                </h3>
                <span style={{ fontSize: '0.80rem', color: 'var(--text-muted)' }}>
                  ID: #{appr.id.slice(0, 8)} • Agente: <strong style={{ color: 'var(--accent-color)' }}>{getAgentLabel(appr.agent_role)}</strong> • Ação: <strong style={{ color: 'var(--text-primary)' }}>{getToolLabel(appr.operation)}</strong>
                </span>
              </div>
              {canDecide ? (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleDecision(appr.id, 'reject')}
                  disabled={actionLoading === appr.id}
                  className="btn btn-secondary"
                  style={{
                    padding: '8px 16px',
                    color: '#f87171',
                    gap: '6px',
                  }}
                >
                  <X size={15} />
                  <span>Recusar</span>
                </button>
                <button
                  onClick={() => handleDecision(appr.id, 'approve')}
                  disabled={actionLoading === appr.id}
                  className="btn btn-primary"
                  style={{
                    padding: '8px 18px',
                    gap: '6px',
                  }}
                >
                  <Check size={15} />
                  <span>{actionLoading === appr.id ? 'A processar…' : 'Aprovar Operação'}</span>
                </button>
                </div>
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                  Perfil de consulta — decisão reservada a utilizadores autorizados
                </span>
              )}
            </div>

            <div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                Recursos Afetados:
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {(Array.isArray(appr.affected_resources) ? appr.affected_resources : []).map((res, i) => (
                  <code key={i} style={{ padding: '4px 10px', backgroundColor: 'var(--bg-primary)', borderRadius: '6px', fontSize: '0.78rem', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                    {res}
                  </code>
                ))}
              </div>
            </div>

            {appr.proposed_diff && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <FileDiff size={15} color="var(--accent-color)" />
                  <span style={{ fontSize: '0.80rem', fontWeight: 600, color: 'var(--text-primary)' }}>Diff Unificado Proposto:</span>
                </div>
                <pre style={{
                  padding: '14px 16px',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: '10px',
                  fontSize: '0.80rem',
                  overflowX: 'auto',
                  maxHeight: '420px',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  lineHeight: '1.6',
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
