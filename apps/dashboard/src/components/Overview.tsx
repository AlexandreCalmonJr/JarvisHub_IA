import React from 'react';
import { SystemHealth, ApprovalRequestItem } from '../types';

interface OverviewProps {
  health: SystemHealth | null;
  approvals: ApprovalRequestItem[];
  healthLoading: boolean;
  approvalsLoading: boolean;
  healthError: string | null;
  approvalsError: string | null;
}

const statusLabel = (status?: string) => {
  if (!status) return 'Não informado';
  const normalized = status.toLowerCase();
  if (['operational', 'healthy', 'ready', 'active'].includes(normalized)) return 'Operacional';
  if (['offline', 'degraded', 'error', 'failed'].includes(normalized)) return 'Indisponível';
  return status;
};

const statusColor = (status?: string) => {
  const normalized = (status || '').toLowerCase();
  if (['operational', 'healthy', 'ready', 'active'].includes(normalized)) return 'var(--success-color, #34d399)';
  if (['offline', 'degraded', 'error', 'failed'].includes(normalized)) return 'var(--danger-color, #f87171)';
  return 'var(--text-secondary)';
};

const MetricCard: React.FC<{ label: string; value: React.ReactNode; detail: string }> = ({ label, value, detail }) => (
  <section className="glass-card" style={{ padding: '20px', borderRadius: '12px', minWidth: 0 }}>
    <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
    <div style={{ marginTop: '12px', color: 'var(--text-primary)', fontSize: '1.35rem', fontWeight: 650 }}>{value}</div>
    <p style={{ color: 'var(--text-muted)', fontSize: '0.76rem', lineHeight: 1.5, margin: '8px 0 0' }}>{detail}</p>
  </section>
);

export const Overview: React.FC<OverviewProps> = ({
  health,
  approvals,
  healthLoading,
  approvalsLoading,
  healthError,
  approvalsError,
}) => {
  const pendingCount = approvals.filter((item) => item.status === 'pending').length;
  const queue = health?.components?.inference_queue;
  const runtimeStatus = health?.components?.model_runtime;
  const globalStatus = health?.status;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="claude-serif-title" style={{ fontSize: '1.6rem', fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>Visão Geral</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', margin: '5px 0 0' }}>
            Estado dos serviços do JARVIS e atividade que exige atenção
          </p>
        </div>
        <span className="claude-pill-badge" aria-live="polite">
          {healthLoading ? 'Atualizando estado…' : healthError ? 'Falha na comunicação' : health ? 'Dados do servidor' : 'Aguardando dados'}
        </span>
      </header>

      {healthError && (
        <div role="alert" className="glass-card" style={{ padding: '14px 16px', border: '1px solid rgba(248, 113, 113, 0.35)', borderRadius: '10px' }}>
          <strong style={{ color: 'var(--text-primary)', fontSize: '0.88rem' }}>Não foi possível consultar a saúde do sistema.</strong>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '5px 0 0' }}>{healthError}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.74rem', margin: '5px 0 0' }}>Os indicadores abaixo não serão substituídos por valores fictícios.</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '14px' }}>
        <MetricCard
          label="Estado global"
          value={healthLoading && !health ? 'Carregando…' : health ? (globalStatus === 'healthy' ? 'Operacional' : globalStatus === 'degraded' ? 'Degradado' : 'Indisponível') : 'Sem dados'}
          detail={health ? 'Resultado informado pelo endpoint de saúde do backend.' : 'Aguardando uma resposta válida do servidor.'}
        />
        <MetricCard
          label="Runtime de modelos"
          value={healthLoading && !health ? 'Carregando…' : statusLabel(runtimeStatus)}
          detail={runtimeStatus ? 'Disponibilidade do runtime reportada pelo backend.' : 'O backend ainda não informou o estado do runtime.'}
        />
        <MetricCard
          label="Fila de inferência"
          value={queue ? `${queue.active} ativa(s)` : healthLoading ? 'Carregando…' : 'Sem dados'}
          detail={queue ? `${queue.waiting} solicitação(ões) aguardando.` : 'Métrica não fornecida nesta resposta.'}
        />
        <MetricCard
          label="Aprovações pendentes"
          value={approvalsLoading ? 'Carregando…' : approvalsError ? 'Indisponível' : pendingCount}
          detail={approvalsError ? 'Não foi possível consultar a fila de aprovações.' : 'Operações aguardando uma decisão humana.'}
        />
      </div>

      <section className="glass-panel" style={{ padding: '22px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h2 className="claude-serif-title" style={{ fontSize: '1.12rem', fontWeight: 500, margin: 0 }}>Componentes monitorados</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '5px 0 0' }}>Estados recebidos do serviço de saúde do backend. Não representam uma auditoria completa de segurança.</p>
        </div>
        {healthLoading && !health ? (
          <p role="status" style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', margin: 0 }}>Consultando componentes…</p>
        ) : health ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: '10px' }}>
            {[
              ['Núcleo de segurança', health.components?.security_core],
              ['Motor de aprovações', health.components?.approval_engine],
              ['Runtime de modelos', health.components?.model_runtime],
            ].map(([label, status]) => (
              <div key={label} style={{ padding: '13px 14px', border: '1px solid var(--border-color)', borderRadius: '9px', background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', color: statusColor(status), fontSize: '0.86rem', fontWeight: 600 }}>
                  <span aria-hidden="true" style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusColor(status) }} />
                  {statusLabel(status)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p role="status" style={{ color: 'var(--text-muted)', fontSize: '0.84rem', margin: 0 }}>Componentes indisponíveis até que o backend responda.</p>
        )}
      </section>

      <section className="glass-panel" style={{ padding: '22px', borderRadius: '14px' }}>
        <h2 className="claude-serif-title" style={{ fontSize: '1.12rem', fontWeight: 500, margin: 0 }}>Atenção operacional</h2>
        {approvalsError ? (
          <p role="alert" style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', margin: '10px 0 0' }}>{approvalsError}</p>
        ) : approvalsLoading ? (
          <p role="status" style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', margin: '10px 0 0' }}>Consultando aprovações…</p>
        ) : pendingCount > 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', margin: '10px 0 0' }}>{pendingCount} operação(ões) aguardando sua análise na Central de Aprovações.</p>
        ) : (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', margin: '10px 0 0' }}>Nenhuma aprovação pendente foi retornada pela API.</p>
        )}
      </section>
    </div>
  );
};
