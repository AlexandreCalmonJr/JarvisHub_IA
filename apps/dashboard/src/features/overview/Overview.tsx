import React, { useState } from 'react';
import {
  Activity,
  ShieldCheck,
  Layers,
  BellRing,
  AlertCircle,
  ArrowUp,
  MessageSquare,
  FolderKanban,
  Bot,
  X,
  ArrowRight,
  Sparkles,
  BookOpen,
  ListTodo,
} from 'lucide-react';
import { SystemHealth, ApprovalRequestItem, getStatusLabel } from '../../types';
import { ModelUsageCharts } from './ModelUsageCharts';
import { getAccountStorageKey } from '../../services/accountScope';
import { useAssistantIdentity } from '../../context/AssistantIdentityContext';
import { formatAssistantPlaceholder, getTimeBasedGreeting } from '../../services/assistantIdentity';

interface OverviewProps {
  health: SystemHealth | null;
  approvals: ApprovalRequestItem[];
  healthLoading: boolean;
  approvalsLoading: boolean;
  healthError: string | null;
  approvalsError: string | null;
  onStartChat?: (prompt?: string) => void;
  onNavigate?: (tab: string) => void;
}

const ENGINEERING_STARTER_PROMPTS = [
  {
    label: 'Diagnosticar projetos',
    prompt: 'Analise a estrutura atual dos projetos no workspace e sugira as melhorias mais urgentes.',
  },
  {
    label: 'Auditar segurança',
    prompt: '/audit Faça uma revisão rápida de segurança e possíveis riscos nos fluxos ativos.',
  },
  {
    label: 'Debate entre especialistas',
    prompt: '/debate Quais são as prioridades técnicas para evoluir esta aplicação com segurança?',
  },
];

const SIMPLE_STARTER_PROMPTS = [
  {
    label: 'Organizar meu dia',
    prompt: 'Me ajude a organizar minhas prioridades e tarefas importantes para hoje de forma leve e clara.',
  },
  {
    label: 'Resumir um tema de estudo',
    prompt: 'Crie um resumo didático com os pontos principais e perguntas de revisão sobre o tema que vou enviar.',
  },
  {
    label: 'Revisar um documento',
    prompt: 'Revise o texto ou PDF que vou enviar e destaque se há algo importante ou inconsistente.',
  },
];

const statusLabel = (status?: string) => {
  if (!status) return 'Não informado';
  const normalized = status.toLowerCase();
  if (['operational', 'healthy', 'ready', 'active'].includes(normalized)) return 'Operacional';
  if (['offline', 'degraded', 'error', 'failed'].includes(normalized)) return 'Indisponível';
  return getStatusLabel(status);
};

const statusColor = (status?: string) => {
  const normalized = (status || '').toLowerCase();
  if (['operational', 'healthy', 'ready', 'active'].includes(normalized)) return 'var(--success-color)';
  if (['offline', 'degraded', 'error', 'failed'].includes(normalized)) return 'var(--danger-color)';
  return 'var(--text-secondary)';
};

const MetricCard: React.FC<{
  label: string;
  value: React.ReactNode;
  detail: string;
  icon: React.ReactNode;
  accentColor?: string;
}> = ({ label, value, detail, icon, accentColor }) => (
  <section
    className="glass-panel"
    style={{
      padding: '18px 20px',
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
      <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 500 }}>
        {label}
      </span>
      <span style={{ color: accentColor || 'var(--text-muted)', display: 'flex' }}>{icon}</span>
    </div>
    <div
      className="tabular-nums"
      style={{
        color: accentColor || 'var(--text-primary)',
        fontSize: '1.45rem',
        fontWeight: 700,
        letterSpacing: '-0.02em',
        lineHeight: 1.2,
      }}
    >
      {value}
    </div>
    <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', lineHeight: 1.45, margin: 0 }}>
      {detail}
    </p>
  </section>
);

export const Overview: React.FC<OverviewProps> = ({
  health,
  approvals,
  healthLoading,
  approvalsLoading,
  healthError,
  approvalsError,
  onStartChat,
  onNavigate,
}) => {
  const { assistantName, experienceMode, profile } = useAssistantIdentity();
  const isSimpleMode = experienceMode === 'simple';
  const greeting = getTimeBasedGreeting(assistantName, profile.displayName);
  const starterPrompts = isSimpleMode ? SIMPLE_STARTER_PROMPTS : ENGINEERING_STARTER_PROMPTS;
  const [quickPrompt, setQuickPrompt] = useState('');
  const [onboardingDismissed, setOnboardingDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(getAccountStorageKey('jarvis_overview_onboarding_dismissed')) === 'true';
    } catch {
      return false;
    }
  });

  const pendingCount = approvals.filter((item) => item.status === 'pending').length;
  const queue = health?.components?.inference_queue;
  const runtimeStatus = health?.components?.model_runtime;
  const globalStatus = health?.status;

  const handleDismissOnboarding = () => {
    setOnboardingDismissed(true);
    try {
      localStorage.setItem(getAccountStorageKey('jarvis_overview_onboarding_dismissed'), 'true');
    } catch {}
  };

  const handleQuickLaunch = (promptText?: string) => {
    const trimmed = (promptText ?? quickPrompt).trim();
    if (onStartChat) {
      onStartChat(trimmed || undefined);
      setQuickPrompt('');
    } else if (onNavigate) {
      onNavigate('chat');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        maxWidth: '1320px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      <header className="jarvis-page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{greeting.headline}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', margin: '4px 0 0' }}>
            {greeting.subtitle}
          </p>
        </div>
        <div
          aria-live="polite"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.8rem',
            color: healthError ? 'var(--danger-color)' : 'var(--text-secondary)',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: healthError
                ? 'var(--danger-color)'
                : health
                  ? 'var(--success-color)'
                  : 'var(--text-muted)',
            }}
          />
          <span>
            {healthLoading
              ? 'Atualizando estado…'
              : healthError
                ? 'Falha na comunicação'
                : health
                  ? 'Conectado ao servidor'
                  : 'Aguardando dados'}
          </span>
        </div>
      </header>

      {/* Entrada Rápida Chat-First */}
      <section
        aria-label="Início rápido de conversa"
        className="glass-panel"
        style={{
          padding: '20px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              O que você quer resolver agora?
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Digite um pedido abaixo para abrir o chat diretamente, ou use <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>@</code> e <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>/</code> dentro da conversa.
            </p>
          </div>
          {onStartChat && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onStartChat()}
            >
              <MessageSquare size={14} />
              <span>Abrir conversas</span>
            </button>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleQuickLaunch();
          }}
          className="claude-capsule"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 10px 8px 16px',
          }}
        >
          <Sparkles size={16} color="var(--accent-light)" style={{ flexShrink: 0 }} />
          <input
            type="text"
            value={quickPrompt}
            onChange={(e) => setQuickPrompt(e.target.value)}
            placeholder={formatAssistantPlaceholder(assistantName, experienceMode)}
            aria-label={`Digite uma tarefa ou pergunta para ${assistantName}`}
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '0.92rem',
              fontFamily: 'inherit',
              padding: '6px 0',
            }}
          />
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            aria-label="Enviar para o chat"
          >
            <span>Enviar</span>
            <ArrowUp size={14} />
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sugestões rápidas:</span>
          {starterPrompts.map((item) => (
            <button
              key={item.label}
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => handleQuickLaunch(item.prompt)}
            >
              {item.label}
              <ArrowRight size={12} />
            </button>
          ))}
        </div>
      </section>

      {/* Guia de Primeiros Passos (dispensável) */}
      {!onboardingDismissed && (
        <section
          aria-label="Primeiros passos no JARVIS"
          className="glass-panel"
          style={{
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Primeiros passos
              </span>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                · 3 caminhos para aproveitar o workspace
              </span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={handleDismissOnboarding}
              aria-label="Ocultar guia de primeiros passos"
            >
              <X size={13} />
              <span>Ocultar</span>
            </button>
          </div>

          <div className="jarvis-onboarding-strip">
            {isSimpleMode ? (
              <>
                <button
                  type="button"
                  className="jarvis-choice-card"
                  onClick={() => handleQuickLaunch()}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.84rem' }}>
                    <MessageSquare size={15} color="var(--accent-light)" />
                    <span>1. Converse com {assistantName}</span>
                  </div>
                  <p style={{ margin: '5px 0 0', fontSize: '0.77rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    Peça resumos, ideias, revisões de PDFs ou ajuda nos seus estudos de forma natural.
                  </p>
                </button>

                <button
                  type="button"
                  className="jarvis-choice-card"
                  onClick={() => onNavigate?.('tasks')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.84rem' }}>
                    <ListTodo size={15} color="var(--accent-light)" />
                    <span>2. Organize suas tarefas</span>
                  </div>
                  <p style={{ margin: '5px 0 0', fontSize: '0.77rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    Acompanhe o que está em andamento e o que já foi concluído na sua rotina.
                  </p>
                </button>

                <button
                  type="button"
                  className="jarvis-choice-card"
                  onClick={() => onNavigate?.('knowledge')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.84rem' }}>
                    <BookOpen size={15} color="var(--accent-light)" />
                    <span>3. Salve nos seus Cadernos</span>
                  </div>
                  <p style={{ margin: '5px 0 0', fontSize: '0.77rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    Guarde anotações, pesquisas e lembretes para {assistantName} recordar quando você precisar.
                  </p>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="jarvis-choice-card"
                  onClick={() => handleQuickLaunch()}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.84rem' }}>
                    <MessageSquare size={15} color="var(--accent-light)" />
                    <span>1. Converse ou delegue</span>
                  </div>
                  <p style={{ margin: '5px 0 0', fontSize: '0.77rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    Peça código, análises ou planos no chat. Use <strong>@</strong> para chamar um especialista.
                  </p>
                </button>

                <button
                  type="button"
                  className="jarvis-choice-card"
                  onClick={() => onNavigate?.('workspace')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.84rem' }}>
                    <FolderKanban size={15} color="var(--accent-light)" />
                    <span>2. Conecte um projeto</span>
                  </div>
                  <p style={{ margin: '5px 0 0', fontSize: '0.77rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    Vincule um repositório em Projetos para que os agentes leiam e editem o contexto real.
                  </p>
                </button>

                <button
                  type="button"
                  className="jarvis-choice-card"
                  onClick={() => onNavigate?.('agents')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.84rem' }}>
                    <Bot size={15} color="var(--accent-light)" />
                    <span>3. Conheça os especialistas</span>
                  </div>
                  <p style={{ margin: '5px 0 0', fontSize: '0.77rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    Explore os agentes de QA, Segurança e Engenharia ou fixe seus favoritos no dock lateral.
                  </p>
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {healthError && (
        <div role="alert" className="jarvis-error-banner">
          <AlertCircle size={18} color="var(--danger-color)" style={{ flexShrink: 0 }} />
          <div>
            <strong style={{ color: 'var(--text-primary)', fontSize: '0.86rem' }}>
              Não foi possível consultar a saúde do sistema.
            </strong>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '3px 0 0' }}>
              {healthError} — Os indicadores abaixo não são substituídos por valores fictícios.
            </p>
          </div>
        </div>
      )}

      {isSimpleMode ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
            gap: '14px',
          }}
        >
          <MetricCard
            label="Assistente ativo"
            icon={<Sparkles size={16} />}
            accentColor="var(--accent-light)"
            value={assistantName}
            detail="Personalize o nome ou alterne para o Modo Completo quando quiser."
          />
          <MetricCard
            label="Disponibilidade"
            icon={<Activity size={16} />}
            accentColor={health ? statusColor(globalStatus) : undefined}
            value={health ? 'Online' : healthLoading ? 'Conectando…' : 'Verificando'}
            detail="Pronto para conversar, resumir arquivos e organizar tarefas."
          />
          <MetricCard
            label="Espaço privado"
            icon={<ShieldCheck size={16} />}
            value="Protegido"
            detail="Suas conversas, cadernos e preferências ficam isolados na sua conta."
          />
        </div>
      ) : (
        <>
          {/* KPI Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
              gap: '14px',
            }}
          >
            <MetricCard
              label="Estado do sistema"
              icon={<Activity size={16} />}
              accentColor={health ? statusColor(globalStatus) : undefined}
              value={
                healthLoading && !health
                  ? 'Carregando…'
                  : health
                    ? globalStatus === 'healthy'
                      ? 'Operacional'
                      : globalStatus === 'degraded'
                        ? 'Degradado'
                        : 'Indisponível'
                    : 'Sem dados'
              }
              detail={
                health
                  ? 'Serviços principais respondendo normalmente.'
                  : 'Aguardando resposta do servidor.'
              }
            />
            <MetricCard
              label="Motor de IA"
              icon={<Layers size={16} />}
              accentColor={runtimeStatus ? statusColor(runtimeStatus) : undefined}
              value={healthLoading && !health ? 'Carregando…' : statusLabel(runtimeStatus)}
              detail={
                runtimeStatus
                  ? 'Disponibilidade do runtime de modelos.'
                  : 'Runtime ainda não informado pelo servidor.'
              }
            />
            <MetricCard
              label="Execuções em andamento"
              icon={<ShieldCheck size={16} />}
              value={
                queue ? `${queue.active} ativa(s)` : healthLoading ? 'Carregando…' : 'Sem dados'
              }
              detail={
                queue
                  ? `${queue.waiting} solicitação(ões) na fila.`
                  : 'Métrica indisponível nesta consulta.'
              }
            />
            <MetricCard
              label="Aprovações pendentes"
              icon={<BellRing size={16} />}
              accentColor={pendingCount > 0 ? 'var(--warning-color)' : undefined}
              value={approvalsLoading ? 'Carregando…' : approvalsError ? 'Indisponível' : pendingCount}
              detail={
                approvalsError
                  ? 'Não foi possível consultar a fila de aprovações.'
                  : 'Ações aguardando revisão humana.'
              }
            />
          </div>

          {/* Monitored Components + Operational Attention */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
              gap: '16px',
            }}
          >
            <section
              className="glass-panel"
              style={{
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                  Serviços monitorados
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '4px 0 0' }}>
                  Status em tempo real reportado pelo backend da plataforma.
                </p>
              </div>
              {healthLoading && !health ? (
                <p role="status" style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', margin: 0 }}>
                  Consultando componentes…
                </p>
              ) : health ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))',
                    gap: '10px',
                  }}
                >
                  {[
                    ['Núcleo de segurança', health.components?.security_core],
                    ['Motor de aprovações', health.components?.approval_engine],
                    ['Motor de modelos', health.components?.model_runtime],
                  ].map(([label, status]) => (
                    <div
                      key={label}
                      style={{
                        padding: '12px 14px',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-tertiary)',
                      }}
                    >
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{label}</div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '7px',
                          marginTop: '6px',
                          color: statusColor(status),
                          fontSize: '0.86rem',
                          fontWeight: 600,
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            background: statusColor(status),
                          }}
                        />
                        {statusLabel(status)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p role="status" style={{ color: 'var(--text-muted)', fontSize: '0.84rem', margin: 0 }}>
                  Componentes indisponíveis até que o backend responda.
                </p>
              )}
            </section>

            <section
              className="glass-panel"
              style={{
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Atenção operacional</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '4px 0 0' }}>
                    Resumo das decisões pendentes na Central de Aprovações.
                  </p>
                </div>
                {pendingCount > 0 && onNavigate && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => onNavigate('approvals')}
                  >
                    Revisar
                    <ArrowRight size={12} />
                  </button>
                )}
              </div>

              <div
                style={{
                  padding: '14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                }}
              >
                {approvalsError ? (
                  <p role="alert" style={{ color: '#fca5a5', fontSize: '0.84rem', margin: 0 }}>
                    {approvalsError}
                  </p>
                ) : approvalsLoading ? (
                  <p role="status" style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', margin: 0 }}>
                    Consultando aprovações…
                  </p>
                ) : pendingCount > 0 ? (
                  <p style={{ color: 'var(--text-primary)', fontSize: '0.86rem', margin: 0 }}>
                    <strong className="tabular-nums" style={{ color: 'var(--warning-color)' }}>
                      {pendingCount}
                    </strong>{' '}
                    operação(ões) aguardando análise na Central de Aprovações.
                  </p>
                ) : (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', margin: 0 }}>
                    Tudo em dia — nenhuma aprovação pendente no momento.
                  </p>
                )}
              </div>
            </section>
          </div>

          <ModelUsageCharts />
        </>
      )}
    </div>
  );
};
