import React, { useState } from 'react';
import { ApprovalRequestItem, getAgentLabel, getToolLabel } from '../../types';
import { decideApproval } from '../../api';
import { ShieldAlert, Check, X, FileDiff, RefreshCw } from 'lucide-react';
import { API_BASE } from '../../services/api/client';
import { PageHeader } from '../../shared/layout/PageHeader';

interface ApprovalCenterProps {
  approvals: ApprovalRequestItem[];
  onRefresh: () => void | Promise<void>;
  loading?: boolean;
  error?: string | null;
}

export const ApprovalCenter: React.FC<ApprovalCenterProps> = ({
  approvals,
  onRefresh,
  loading = false,
  error = null,
}) => {
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

  const pendingList = approvals.filter((a) => a.status === 'pending');

  const handleDecision = async (id: string, action: 'approve' | 'reject') => {
    if (!canDecide || actionLoading) return;
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
    <div className="jarvis-page-shell">
      <PageHeader
        title="Centro de Aprovações"
        subtitle="Autorização humana obrigatória. Agentes de IA são estritamente impedidos de autoaprovar ações."
        meta={[
          'Human-in-the-Loop',
          <span
            key="pending-count"
            className="jarvis-tabular"
            style={{
              color: pendingList.length > 0 ? 'var(--warning-color)' : '#4ade80',
              fontWeight: 600,
            }}
          >
            {pendingList.length} pendente{pendingList.length === 1 ? '' : 's'}
          </span>,
        ]}
        actions={
          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={loading}
            className="btn btn-ghost btn-sm"
            aria-label="Atualizar pedidos de aprovação"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Atualizar</span>
          </button>
        }
      />

      <div className="jarvis-callout jarvis-callout--info">
        A decisão será registada com a identidade da sessão autenticada. A identidade não pode ser escolhida nem alterada pelo navegador.
      </div>

      {errorMessage && (
        <div role="alert" className="jarvis-error-banner">
          {errorMessage}
        </div>
      )}

      {error ? (
        <div
          role="alert"
          className="jarvis-error-banner"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}
        >
          <span>Não foi possível consultar as aprovações: {error}</span>
          <button type="button" onClick={() => void onRefresh()} className="btn btn-ghost btn-sm">
            Tentar novamente
          </button>
        </div>
      ) : loading ? (
        <div role="status" className="jarvis-callout jarvis-callout--info">
          A carregar pedidos de aprovação…
        </div>
      ) : pendingList.length === 0 ? (
        <div className="jarvis-empty-state">
          <ShieldAlert size={28} />
          <div className="jarvis-empty-state-title">Nenhum pedido pendente</div>
          <div className="jarvis-empty-state-desc">
            Todas as operações foram avaliadas ou não há pedidos de escrita aguardando autorização no momento.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {pendingList.map((appr) => (
            <section key={appr.id} className="jarvis-settings-card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '14px',
                }}
              >
                <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                    <span className="badge badge-warning">Pendente de Aprovação</span>
                    <span
                      className="jarvis-tabular"
                      style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
                    >
                      #{appr.id.slice(0, 8)}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.02rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                    {appr.impact_summary}
                  </h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Agente:{' '}
                    <strong style={{ color: 'var(--accent-light)', fontWeight: 600 }}>
                      {getAgentLabel(appr.agent_role)}
                    </strong>{' '}
                    · Ação:{' '}
                    <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {getToolLabel(appr.operation)}
                    </strong>
                  </div>
                </div>

                {canDecide ? (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => void handleDecision(appr.id, 'reject')}
                      disabled={Boolean(actionLoading)}
                      className="btn btn-danger btn-sm"
                    >
                      <X size={14} />
                      <span>Recusar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDecision(appr.id, 'approve')}
                      disabled={actionLoading === appr.id}
                      className="btn btn-primary btn-sm"
                    >
                      <Check size={14} />
                      <span>{actionLoading === appr.id ? 'A processar…' : 'Aprovar Operação'}</span>
                    </button>
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                    Perfil de consulta — decisão reservada a utilizadores autorizados
                  </span>
                )}
              </div>

              {Array.isArray(appr.affected_resources) && appr.affected_resources.length > 0 && (
                <div>
                  <span className="user-profile-field-label" style={{ display: 'block', marginBottom: '6px' }}>
                    Recursos afetados
                  </span>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {appr.affected_resources.map((res, i) => (
                      <code
                        key={i}
                        style={{
                          padding: '3px 8px',
                          backgroundColor: 'var(--bg-primary)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.76rem',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-secondary)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {res}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              {appr.proposed_diff && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <FileDiff size={14} color="var(--accent-light)" />
                    <span className="user-profile-field-label">Diff unificado proposto</span>
                  </div>
                  <pre
                    style={{
                      padding: '14px 16px',
                      backgroundColor: 'var(--bg-primary)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.78rem',
                      overflowX: 'auto',
                      maxHeight: '420px',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)',
                      lineHeight: 1.6,
                      margin: 0,
                    }}
                  >
                    {appr.proposed_diff}
                  </pre>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
