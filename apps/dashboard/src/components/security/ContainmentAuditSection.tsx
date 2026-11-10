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

interface ContainmentAuditSectionProps {
  onRefresh: () => void;
}

export const ContainmentAuditSection: React.FC<ContainmentAuditSectionProps> = ({
  onRefresh,
}) => {
  const [killLoading, setKillLoading] = useState(false);
  const [taskIdInput, setTaskIdInput] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // Trilha de Auditoria ao Vivo
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string>('');

  const loadAuditLogs = async () => {
    setLogsLoading(true);
    try {
      const data = await fetchAuditLogs(20, 0, severityFilter || undefined);
      setAuditLogs(data.events || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, [severityFilter]);

  const handleGlobalKill = async () => {
    if (
      !window.confirm(
        'ATENÇÃO: Deseja suspender imediatamente todas as operações e ferramentas do JARVIS HUB?'
      )
    ) {
      return;
    }
    setKillLoading(true);
    try {
      await triggerKillSwitch('global');
      setMessage(
        'Kill Switch Global ACIONADO com sucesso! Todas as ferramentas foram bloqueadas.'
      );
      onRefresh();
      loadAuditLogs();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    } finally {
      setKillLoading(false);
    }
  };

  const handleCancelTask = async () => {
    if (!taskIdInput.trim()) return;
    setKillLoading(true);
    try {
      await triggerKillSwitch('task', taskIdInput.trim());
      setMessage(`Tarefa '${taskIdInput.trim()}' cancelada com sucesso.`);
      setTaskIdInput('');
      onRefresh();
      loadAuditLogs();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    } finally {
      setKillLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {message && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            borderRadius: '8px',
            color: '#818cf8',
            fontSize: '0.875rem',
          }}
        >
          {message}
        </div>
      )}

      {/* Kill Switch Card */}
      <div
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '12px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertOctagon size={24} color="var(--danger-color)" />
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--danger-color)' }}>
              Kill Switch (Contenção Imediata)
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Bloqueie instantaneamente chamadas de ferramentas e encerre processos de risco em execução.
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            alignItems: 'center',
            paddingTop: '8px',
          }}
        >
          <button
            onClick={handleGlobalKill}
            disabled={killLoading}
            className="btn btn-danger"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <AlertOctagon size={16} />
            {killLoading ? 'Acionando...' : 'Suspender Todo o Sistema (Global)'}
          </button>

          <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '280px' }}>
            <input
              type="text"
              placeholder="ID da Tarefa (ex: task_12345)"
              value={taskIdInput}
              onChange={(e) => setTaskIdInput(e.target.value)}
              style={{
                flex: 1,
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '0.875rem',
              }}
            />
            <button
              onClick={handleCancelTask}
              disabled={killLoading || !taskIdInput.trim()}
              className="btn btn-ghost"
              style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: 'var(--danger-color)' }}
            >
              Cancelar Tarefa
            </button>
          </div>
        </div>
      </div>

      {/* Trilha de Auditoria */}
      <div
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
            <FileText size={18} color="var(--primary-color)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Trilha de Auditoria ao Vivo</h3>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              style={{
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '0.8rem',
              }}
            >
              <option value="">Todas as severidades</option>
              <option value="CRITICAL">Apenas Críticas</option>
              <option value="WARNING">Avisos e Erros</option>
              <option value="INFO">Informativas</option>
            </select>
            <button
              onClick={loadAuditLogs}
              disabled={logsLoading}
              className="btn btn-ghost"
              style={{ padding: '4px 8px' }}
              title="Recarregar logs"
            >
              <RefreshCw size={14} className={logsLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '350px',
            overflowY: 'auto',
          }}
        >
          {auditLogs.length === 0 ? (
            <div
              style={{
                padding: '24px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.875rem',
              }}
            >
              Nenhum evento registrado com o filtro selecionado.
            </div>
          ) : (
            auditLogs.map((log, idx) => {
              const isCritical = log.severity === 'CRITICAL';
              const isWarning = log.severity === 'WARNING';
              return (
                <div
                  key={log.id || idx}
                  style={{
                    padding: '10px 14px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    fontSize: '0.82rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    {isCritical ? (
                      <AlertOctagon
                        size={16}
                        color="var(--danger-color)"
                        style={{ flexShrink: 0 }}
                      />
                    ) : isWarning ? (
                      <AlertTriangle
                        size={16}
                        color="var(--warning-color)"
                        style={{ flexShrink: 0 }}
                      />
                    ) : (
                      <Info
                        size={16}
                        color="var(--primary-color)"
                        style={{ flexShrink: 0 }}
                      />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {log.operation}
                      </span>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                        Status: <code>{log.status}</code> {log.reason && `• ${log.reason}`}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      className={`badge ${
                        isCritical
                          ? 'badge-danger'
                          : isWarning
                          ? 'badge-warning'
                          : 'badge-info'
                      }`}
                    >
                      {log.severity}
                    </span>
                    <span
                      style={{
                        color: 'var(--text-secondary)',
                        fontSize: '0.72rem',
                        fontFamily: 'monospace',
                      }}
                    >
                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Políticas Ativas */}
      <div
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '24px',
        }}
      >
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '16px' }}>
          Políticas de Segurança do Backend
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.875rem' }}>
            <CheckCircle size={18} color="var(--success-color)" />
            <span>
              <b>Redaction Automático</b>: Chaves API e senhas mascaradas antes de ir para logs e respostas.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.875rem' }}>
            <CheckCircle size={18} color="var(--success-color)" />
            <span>
              <b>Path Traversal Guard</b>: Confinamento rigoroso à raiz de projetos permitidos.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.875rem' }}>
            <CheckCircle size={18} color="var(--success-color)" />
            <span>
              <b>Autoaprovação Bloqueada</b>: Agentes de IA rejeitados incondicionalmente no Approval Center.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.875rem' }}>
            <CheckCircle size={18} color="var(--success-color)" />
            <span>
              <b>Sandbox com Timeout</b>: Subprocessos de teste encerrados automaticamente em 60s.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
