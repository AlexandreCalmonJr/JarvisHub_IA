import React, { useState, useEffect } from 'react';
import {
  AlertOctagon,
  CheckCircle,
  RefreshCw,
  FileText,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { triggerKillSwitch, fetchAuditLogs } from '../../api';
import { API_BASE } from '../../services/api/client';
import { getOperationLabel, getSeverityLabel, getStatusLabel } from '../../types';
import { ConfirmDialog } from '../../shared/common/ConfirmDialog';

interface ContainmentAuditSectionProps {
  onRefresh: () => void;
}

export const ContainmentAuditSection: React.FC<ContainmentAuditSectionProps> = ({
  onRefresh,
}) => {
  const [killLoading, setKillLoading] = useState(false);
  const [canKill, setCanKill] = useState(false);
  const [taskIdInput, setTaskIdInput] = useState('');
  const [pendingKillAction, setPendingKillAction] = useState<
    { mode: 'global' } | { mode: 'task'; taskId: string } | null
  >(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalEvents, setTotalEvents] = useState(0);
  const PAGE_SIZE = 20;

  const loadAuditLogs = async (targetPage?: number) => {
    const activePage = typeof targetPage === 'number' ? targetPage : page;
    setLogsLoading(true);
    try {
      const data = await fetchAuditLogs(PAGE_SIZE, (activePage - 1) * PAGE_SIZE, severityFilter || undefined);
      setAuditLogs(data.events || []);
      setTotalEvents(data.total || 0);
      setLogsError(null);
    } catch (e) {
      setLogsError(e instanceof Error ? e.message : 'Não foi possível carregar a trilha de auditoria.');
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((principal) => {
        if (!cancelled) setCanKill(principal?.kind === 'human' && principal?.role === 'admin');
      })
      .catch(() => {
        if (!cancelled) setCanKill(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPage(1);
    void loadAuditLogs(1);
  }, [severityFilter]);

  const handleGlobalKill = () => {
    if (!canKill) return;
    setPendingKillAction({ mode: 'global' });
  };

  const handleCancelTask = () => {
    if (!canKill || !taskIdInput.trim()) return;
    setPendingKillAction({ mode: 'task', taskId: taskIdInput.trim() });
  };

  const confirmKillAction = async () => {
    if (!canKill || !pendingKillAction) return;
    setKillLoading(true);
    try {
      if (pendingKillAction.mode === 'global') {
        await triggerKillSwitch('global');
        setMessage({
          type: 'success',
          text: 'Kill Switch Global acionado. As operações foram bloqueadas pelo mecanismo de contenção.',
        });
      } else {
        await triggerKillSwitch('task', pendingKillAction.taskId);
        setMessage({
          type: 'success',
          text: `Tarefa '${pendingKillAction.taskId}' cancelada com sucesso.`,
        });
        setTaskIdInput('');
      }
      setPendingKillAction(null);
      onRefresh();
      loadAuditLogs();
    } catch (err: any) {
      setMessage({ type: 'error', text: `Erro: ${err.message}` });
    } finally {
      setKillLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {message && (
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`jarvis-callout ${
            message.type === 'success' ? 'jarvis-callout--success' : 'jarvis-callout--danger'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Kill Switch */}
      {canKill ? (
        <section
          className="jarvis-settings-card"
          style={{ borderColor: 'rgba(239, 68, 68, 0.3)', gap: '16px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--danger-soft)',
                border: '1px solid rgba(239, 68, 68, 0.28)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <AlertOctagon size={18} color="#f87171" />
            </div>
            <div>
              <h3 style={{ fontSize: '0.96rem', fontWeight: 600, color: '#f87171', margin: 0 }}>
                Kill Switch (Contenção Imediata)
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '2px 0 0 0' }}>
                Bloqueie instantaneamente chamadas de ferramentas e encerre processos de risco em execução.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleGlobalKill}
              disabled={killLoading}
              className="btn btn-danger btn-sm"
            >
              <AlertOctagon size={15} />
              <span>{killLoading ? 'Acionando…' : 'Suspender Todo o Sistema (Global)'}</span>
            </button>

            <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '260px' }}>
              <input
                type="text"
                aria-label="ID da tarefa para cancelar"
                placeholder="ID da Tarefa (ex: task_12345)"
                value={taskIdInput}
                onChange={(e) => setTaskIdInput(e.target.value)}
                className="jarvis-input"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
              />
              <button
                type="button"
                onClick={handleCancelTask}
                disabled={killLoading || !taskIdInput.trim()}
                className="btn btn-danger-ghost btn-sm"
                style={{ flexShrink: 0 }}
              >
                Cancelar Tarefa
              </button>
            </div>
          </div>
        </section>
      ) : (
        <div className="jarvis-callout">
          Os comandos de contenção global estão reservados ao administrador. A trilha de auditoria permanece disponível
          conforme as permissões da conta.
        </div>
      )}

      {/* Trilha de Auditoria */}
      <section className="jarvis-settings-card" style={{ gap: '14px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={16} color="var(--accent-light)" />
            <h3 style={{ fontSize: '0.96rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Trilha de Auditoria ao Vivo
            </h3>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              aria-label="Filtrar por severidade"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="jarvis-select"
              style={{ width: 'auto', minWidth: '170px', minHeight: '32px', padding: '5px 10px', fontSize: '0.8rem' }}
            >
              <option value="">Todas as severidades</option>
              <option value="CRITICAL">Apenas Críticas</option>
              <option value="WARNING">Avisos e Erros</option>
              <option value="INFO">Informativas</option>
            </select>
            <button
              type="button"
              onClick={() => void loadAuditLogs(page)}
              disabled={logsLoading}
              className="btn btn-secondary btn-icon-sm"
              title="Recarregar logs"
              aria-label="Recarregar logs"
            >
              <RefreshCw size={14} className={logsLoading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '360px',
            overflowY: 'auto',
          }}
        >
          {logsError ? (
            <div role="alert" className="jarvis-error-banner">
              {logsError}
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="jarvis-empty-state" style={{ padding: '24px' }}>
              <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                Nenhum evento registrado com o filtro selecionado.
              </span>
            </div>
          ) : (
            auditLogs.map((log, idx) => {
              const isCritical = log.severity === 'CRITICAL';
              const isWarning = log.severity === 'WARNING';
              return (
                <div
                  key={log.id || idx}
                  className="jarvis-settings-subcard"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                    {isCritical ? (
                      <AlertOctagon size={15} color="#f87171" style={{ flexShrink: 0 }} />
                    ) : isWarning ? (
                      <AlertTriangle size={15} color="#fbbf24" style={{ flexShrink: 0 }} />
                    ) : (
                      <Info size={15} color="var(--accent-light)" style={{ flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                        {getOperationLabel(log.operation)}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '2px' }}>
                        Status: <code>{getStatusLabel(log.status)}</code>
                        {log.reason ? ` · ${log.reason}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="meta-inline jarvis-tabular" style={{ flexShrink: 0, fontSize: '0.74rem' }}>
                    <span
                      style={{
                        fontWeight: 600,
                        color: isCritical ? '#f87171' : isWarning ? '#fbbf24' : 'var(--accent-light)',
                      }}
                    >
                      {getSeverityLabel(log.severity)}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('pt-BR') : '—'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {totalEvents > PAGE_SIZE && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '12px',
              borderTop: '1px solid var(--border-subtle)',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <span className="jarvis-tabular" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Exibindo {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalEvents)} de {totalEvents} eventos
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                disabled={page <= 1 || logsLoading}
                onClick={() => {
                  const prev = Math.max(1, page - 1);
                  setPage(prev);
                  void loadAuditLogs(prev);
                }}
              >
                Anterior
              </button>
              <span className="jarvis-tabular" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {page} / {Math.max(1, Math.ceil(totalEvents / PAGE_SIZE))}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                disabled={page >= Math.ceil(totalEvents / PAGE_SIZE) || logsLoading}
                onClick={() => {
                  const next = page + 1;
                  setPage(next);
                  void loadAuditLogs(next);
                }}
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Políticas de Segurança do Backend */}
      <section className="jarvis-settings-section">
        <h3 className="jarvis-settings-section__title">Políticas de Segurança do Backend</h3>
        <div className="jarvis-settings-card">
          {[
            {
              title: 'Redaction Automático',
              desc: 'Chaves de API e senhas são mascaradas antes de chegar aos logs e respostas.',
            },
            {
              title: 'Path Traversal Guard',
              desc: 'Confinamento rigoroso à raiz dos projetos permitidos no workspace.',
            },
            {
              title: 'Autoaprovação Bloqueada',
              desc: 'Agentes de IA são rejeitados incondicionalmente no Approval Center.',
            },
            {
              title: 'Sandbox com Timeout',
              desc: 'Subprocessos de teste e execução são encerrados automaticamente ao atingir o limite.',
            },
          ].map((policy) => (
            <div key={policy.title} className="jarvis-setting-row">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: 1 }}>
                <CheckCircle size={15} color="#4ade80" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <div className="jarvis-setting-row__title">{policy.title}</div>
                  <div className="jarvis-setting-row__desc">{policy.desc}</div>
                </div>
              </div>
              <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#4ade80' }}>Ativa</span>
            </div>
          ))}
        </div>
      </section>

      <ConfirmDialog
        isOpen={Boolean(pendingKillAction)}
        title={pendingKillAction?.mode === 'global' ? 'Acionar Kill Switch Global' : 'Cancelar tarefa'}
        description={
          pendingKillAction?.mode === 'global'
            ? 'ATENÇÃO: Deseja suspender imediatamente todas as operações e ferramentas do JARVIS HUB?'
            : pendingKillAction?.mode === 'task'
              ? `Cancelar a tarefa '${pendingKillAction.taskId}'? Esta ação não pode ser desfeita.`
              : null
        }
        confirmLabel={pendingKillAction?.mode === 'global' ? 'Suspender sistema' : 'Cancelar tarefa'}
        tone="danger"
        isLoading={killLoading}
        onConfirm={confirmKillAction}
        onCancel={() => setPendingKillAction(null)}
      />
    </div>
  );
};
