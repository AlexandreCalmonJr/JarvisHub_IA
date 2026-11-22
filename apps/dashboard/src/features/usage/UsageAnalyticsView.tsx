import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Cpu,
  HardDrive,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  BarChart3,
} from 'lucide-react';
import {
  fetchOverviewTelemetry,
  fetchResources,
  InferenceTelemetryDetail,
  InferenceTelemetrySummary,
  ModelPerformanceSummary,
} from '../../services/api/system';
import { PageHeader } from '../../shared/layout/PageHeader';

type Metric = 'Custo' | 'Tokens' | 'Latência';
type OpenMenu = 'agent' | 'metric' | 'period' | null;

interface UsagePoint {
  day: string;
  value: number;
}

interface ProviderUsage {
  id: string;
  name: string;
  models: string[];
  inferences: number;
  successful: number;
  tokens: number;
  cost: number;
  averageLatencyMs: number;
}

const PERIOD_DAYS: Record<string, number> = {
  '7 dias': 7,
  '30 dias': 30,
  '90 dias': 90,
  'Este ano': 365,
};

const formatInteger = (value: number) => Math.round(value).toLocaleString('pt-BR');

const formatUsd = (value: number) =>
  value >= 1 ? `US$ ${value.toFixed(2)}` : `US$ ${value.toFixed(4)}`;

const formatCompact = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} mi`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} mil`;
  return formatInteger(value);
};

export const UsageAnalyticsView: React.FC = () => {
  const [selectedAgent, setSelectedAgent] = useState('Todos os agentes');
  const [selectedMetric, setSelectedMetric] = useState<Metric>('Custo');
  const [selectedPeriod, setSelectedPeriod] = useState('30 dias');
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [loading, setLoading] = useState(false);
  const [cpuUsage, setCpuUsage] = useState<number | null>(null);
  const [ramUsage, setRamUsage] = useState<number | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [summary, setSummary] = useState<InferenceTelemetrySummary | null>(null);
  const [records, setRecords] = useState<InferenceTelemetryDetail[]>([]);
  const [modelPerformance, setModelPerformance] = useState<ModelPerformanceSummary[]>([]);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const filterBarRef = useRef<HTMLDivElement | null>(null);

  const loadHardwareMetrics = async () => {
    try {
      const resources = await fetchResources();
      setCpuUsage(
        typeof resources.cpu_percent === 'number' ? Math.round(resources.cpu_percent) : null
      );
      setRamUsage(
        typeof resources.ram_percent === 'number' ? Math.round(resources.ram_percent) : null
      );
    } catch (e) {
      console.warn('Falha ao obter telemetria de hardware:', e);
      setCpuUsage(null);
      setRamUsage(null);
    }
  };

  const loadTelemetry = async () => {
    setLoading(true);
    try {
      const telemetry = await fetchOverviewTelemetry(500);
      setSummary(telemetry.summary);
      setRecords(telemetry.records);
      setModelPerformance(telemetry.model_performance);
      setTelemetryError(null);
    } catch (e) {
      setTelemetryError(
        e instanceof Error ? e.message : 'Falha ao carregar a telemetria de inferência.'
      );
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    await Promise.all([loadHardwareMetrics(), loadTelemetry()]);
  };

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      void loadHardwareMetrics();
      void loadTelemetry();
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!openMenu) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (filterBarRef.current && !filterBarRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenu]);

  const agentOptions = useMemo(() => {
    const roles = new Set<string>();
    for (const record of records) {
      roles.add(record.agent_role || 'Não atribuído');
    }
    return ['Todos os agentes', ...Array.from(roles).sort()];
  }, [records]);

  const filteredRecords = useMemo(() => {
    const days = PERIOD_DAYS[selectedPeriod] ?? 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return records.filter((record) => {
      const timestamp = Date.parse(record.created_at);
      if (Number.isFinite(timestamp) && timestamp < cutoff) return false;
      if (
        selectedAgent !== 'Todos os agentes' &&
        (record.agent_role || 'Não atribuído') !== selectedAgent
      ) {
        return false;
      }
      return true;
    });
  }, [records, selectedAgent, selectedPeriod]);

  const totals = useMemo(() => {
    let inputTokens = 0;
    let outputTokens = 0;
    let cost = 0;
    let successfulDuration = 0;
    let successfulCount = 0;
    let successful = 0;
    for (const record of filteredRecords) {
      inputTokens += Number(record.prompt_tokens || 0);
      outputTokens += Number(record.completion_tokens || 0);
      cost += Number(record.cost_usd || 0);
      if (record.status === 'success') {
        successful += 1;
        if (Number(record.duration_ms) > 0) {
          successfulDuration += Number(record.duration_ms);
          successfulCount += 1;
        }
      }
    }
    return {
      inputTokens,
      outputTokens,
      tokens: inputTokens + outputTokens,
      cost,
      inferences: filteredRecords.length,
      successRate: filteredRecords.length
        ? Math.round((successful / filteredRecords.length) * 1000) / 10
        : 0,
      averageLatencyMs: successfulCount ? successfulDuration / successfulCount : 0,
    };
  }, [filteredRecords]);

  // Série diária calculada exclusivamente a partir das inferências reais.
  const series = useMemo<UsagePoint[]>(() => {
    const days = PERIOD_DAYS[selectedPeriod] ?? 30;
    const buckets = new Map<string, { total: number; count: number }>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date(today);
      date.setDate(date.getDate() - offset);
      buckets.set(date.toISOString().slice(0, 10), { total: 0, count: 0 });
    }

    for (const record of filteredRecords) {
      const timestamp = Date.parse(record.created_at);
      if (!Number.isFinite(timestamp)) continue;
      const key = new Date(timestamp).toISOString().slice(0, 10);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      const value =
        selectedMetric === 'Custo'
          ? Number(record.cost_usd || 0)
          : selectedMetric === 'Tokens'
            ? Number(record.prompt_tokens || 0) + Number(record.completion_tokens || 0)
            : Number(record.duration_ms || 0);
      bucket.total += value;
      bucket.count += 1;
    }

    return Array.from(buckets.entries()).map(([key, bucket]) => {
      const date = new Date(`${key}T00:00:00`);
      return {
        day: date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        value:
          selectedMetric === 'Latência'
            ? bucket.count
              ? bucket.total / bucket.count
              : 0
            : bucket.total,
      };
    });
  }, [filteredRecords, selectedMetric, selectedPeriod]);

  const chartMax = useMemo(
    () => Math.max(...series.map((point) => point.value), 0),
    [series]
  );

  const chart = useMemo(() => {
    const coords = series.map((point, index) => ({
      x: series.length <= 1 ? 0 : (index / (series.length - 1)) * 800,
      y: chartMax > 0 ? 92 - (point.value / chartMax) * 70 : 92,
    }));
    const line = coords
      .map((coord, index) => `${index === 0 ? 'M' : 'L'} ${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`)
      .join(' ');
    return {
      line,
      area: line ? `${line} L 800 95 L 0 95 Z` : '',
      last: coords[coords.length - 1],
    };
  }, [series, chartMax]);

  const providers = useMemo<ProviderUsage[]>(() => {
    const groups = new Map<string, ProviderUsage & { duration: number; durationCount: number }>();
    for (const record of filteredRecords) {
      const id = record.provider || 'desconhecido';
      const group =
        groups.get(id) ||
        {
          id,
          name: id === 'ollama' ? 'Ollama (local)' : id,
          models: [],
          inferences: 0,
          successful: 0,
          tokens: 0,
          cost: 0,
          averageLatencyMs: 0,
          duration: 0,
          durationCount: 0,
        };
      group.inferences += 1;
      group.tokens += Number(record.prompt_tokens || 0) + Number(record.completion_tokens || 0);
      group.cost += Number(record.cost_usd || 0);
      if (!group.models.includes(record.model_name)) group.models.push(record.model_name);
      if (record.status === 'success') {
        group.successful += 1;
        if (Number(record.duration_ms) > 0) {
          group.duration += Number(record.duration_ms);
          group.durationCount += 1;
        }
      }
      groups.set(id, group);
    }
    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        averageLatencyMs: group.durationCount ? group.duration / group.durationCount : 0,
      }))
      .sort((a, b) => b.inferences - a.inferences);
  }, [filteredRecords]);

  const mainValue =
    selectedMetric === 'Custo'
      ? formatUsd(totals.cost)
      : selectedMetric === 'Tokens'
        ? `${formatInteger(totals.tokens)} tokens`
        : totals.averageLatencyMs > 0
          ? `${(totals.averageLatencyMs / 1000).toFixed(2)} s`
          : '—';

  const fastestModel = useMemo(() => {
    const withLatency = modelPerformance.filter(
      (entry) => Number(entry.average_latency_ms) > 0
    );
    return withLatency.sort(
      (a, b) => Number(a.average_latency_ms) - Number(b.average_latency_ms)
    )[0]?.model_name;
  }, [modelPerformance]);

  return (
    <div
      className="jarvis-page-shell"
      style={{
        maxWidth: '1040px',
        padding: '24px clamp(16px, 3vw, 28px) 48px',
      }}
    >
      <PageHeader
        icon={<BarChart3 size={18} />}
        title="Uso e Custos"
        subtitle="Telemetria real de inferências, tokens e custos da sua conta, além de métricas de hardware."
        meta={[
          <span key="cpu" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <Cpu size={13} color="var(--accent-light)" />
            CPU {cpuUsage === null ? '—' : `${cpuUsage}%`}
          </span>,
          <span key="ram" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <HardDrive size={13} color="var(--text-secondary)" />
            RAM {ramUsage === null ? '—' : `${ramUsage}%`}
          </span>,
          `${formatInteger(totals.inferences)} inferências (${selectedPeriod})`,
        ]}
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="btn btn-secondary btn-sm"
            aria-label="Atualizar telemetria"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>{loading ? 'Atualizando…' : 'Atualizar'}</span>
          </button>
        }
      />

      {/* Barra de Filtros */}
      <div className="jarvis-filter-bar" ref={filterBarRef}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Filtro Agente */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setOpenMenu((prev) => (prev === 'agent' ? null : 'agent'))}
              aria-expanded={openMenu === 'agent'}
              aria-haspopup="menu"
              className={`btn btn-secondary btn-xs ${openMenu === 'agent' ? 'is-active' : ''}`}
            >
              <span style={{ color: 'var(--text-muted)' }}>Agente:</span>
              <span>{selectedAgent}</span>
              <ChevronDown size={12} />
            </button>

            {openMenu === 'agent' && (
              <div
                className="jarvis-popover"
                role="menu"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  minWidth: '210px',
                  maxHeight: '260px',
                  overflowY: 'auto',
                  zIndex: 50,
                }}
              >
                <div className="jarvis-popover__label">Filtrar por especialista</div>
                {agentOptions.map((agent) => (
                  <button
                    key={agent}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSelectedAgent(agent);
                      setOpenMenu(null);
                    }}
                    className={`btn btn-ghost btn-xs btn-block btn-start ${selectedAgent === agent ? 'is-active' : ''}`}
                  >
                    {agent}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filtro Métrica */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setOpenMenu((prev) => (prev === 'metric' ? null : 'metric'))}
              aria-expanded={openMenu === 'metric'}
              aria-haspopup="menu"
              className={`btn btn-secondary btn-xs ${openMenu === 'metric' ? 'is-active' : ''}`}
            >
              <span style={{ color: 'var(--text-muted)' }}>Métrica:</span>
              <span>{selectedMetric}</span>
              <ChevronDown size={12} />
            </button>

            {openMenu === 'metric' && (
              <div
                className="jarvis-popover"
                role="menu"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  minWidth: '150px',
                  zIndex: 50,
                }}
              >
                <div className="jarvis-popover__label">Série temporal</div>
                {(['Custo', 'Tokens', 'Latência'] as Metric[]).map((metric) => (
                  <button
                    key={metric}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSelectedMetric(metric);
                      setOpenMenu(null);
                    }}
                    className={`btn btn-ghost btn-xs btn-block btn-start ${selectedMetric === metric ? 'is-active' : ''}`}
                  >
                    {metric}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filtro Período */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setOpenMenu((prev) => (prev === 'period' ? null : 'period'))}
              aria-expanded={openMenu === 'period'}
              aria-haspopup="menu"
              className={`btn btn-secondary btn-xs ${openMenu === 'period' ? 'is-active' : ''}`}
            >
              <span style={{ color: 'var(--text-muted)' }}>Período:</span>
              <span>{selectedPeriod}</span>
              <ChevronDown size={12} />
            </button>

            {openMenu === 'period' && (
              <div
                className="jarvis-popover"
                role="menu"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  minWidth: '150px',
                  zIndex: 50,
                }}
              >
                <div className="jarvis-popover__label">Janela de análise</div>
                {Object.keys(PERIOD_DAYS).map((period) => (
                  <button
                    key={period}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSelectedPeriod(period);
                      setOpenMenu(null);
                    }}
                    className={`btn btn-ghost btn-xs btn-block btn-start ${selectedPeriod === period ? 'is-active' : ''}`}
                  >
                    {period}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="jarvis-tabular" style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
          Taxa de sucesso:{' '}
          <strong style={{ color: 'var(--text-primary)' }}>
            {totals.inferences ? `${totals.successRate}%` : '—'}
          </strong>
          {fastestModel ? ` · mais rápido: ${fastestModel}` : ''}
        </div>
      </div>

      {telemetryError && (
        <div role="alert" className="jarvis-error-banner">
          Telemetria indisponível: {telemetryError}
        </div>
      )}

      {/* Métrica Principal + Gráfico Temporal */}
      <section className="jarvis-settings-card" style={{ gap: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '0.74rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {selectedMetric} acumulado · {selectedPeriod}
            </div>
            <div
              className="jarvis-tabular"
              style={{
                fontSize: '2.1rem',
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-primary)',
                letterSpacing: '-0.03em',
                marginTop: '4px',
              }}
            >
              {mainValue}
            </div>
          </div>
          <div className="jarvis-tabular" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {formatInteger(totals.inferences)} inferências · {formatCompact(totals.tokens)} tokens
          </div>
        </div>

        <div
          style={{
            width: '100%',
            height: '164px',
            position: 'relative',
            backgroundColor: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            padding: '14px 16px 12px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          {totals.inferences === 0 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            >
              Sem inferências registadas neste período.
            </div>
          )}
          <svg
            style={{ width: '100%', height: '108px', overflow: 'visible' }}
            viewBox="0 0 800 100"
            preserveAspectRatio="none"
            aria-label={`Gráfico temporal de ${selectedMetric}`}
          >
            <defs>
              <linearGradient id="usageGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            <line x1="0" y1="20" x2="800" y2="20" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
            <line x1="0" y1="60" x2="800" y2="60" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
            <line x1="0" y1="95" x2="800" y2="95" stroke="rgba(255,255,255,0.09)" />

            {chart.area && <path d={chart.area} fill="url(#usageGradient)" />}
            {chart.line && (
              <path d={chart.line} fill="none" stroke="#3b82f6" strokeWidth="2.25" />
            )}
            {chart.last && (
              <circle cx={chart.last.x} cy={chart.last.y} r="4.2" fill="#60a5fa" stroke="#0d1117" strokeWidth="2" />
            )}
          </svg>

          <div
            className="jarvis-tabular"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.72rem',
              color: 'var(--text-muted)',
              padding: '0 2px',
            }}
          >
            <span>{series[0]?.day}</span>
            <span>{series[Math.floor(series.length / 3)]?.day}</span>
            <span>{series[Math.floor((series.length * 2) / 3)]?.day}</span>
            <span>Hoje</span>
          </div>
        </div>
      </section>

      {/* Totais de Tokens */}
      <section className="jarvis-settings-section">
        <h2 className="jarvis-settings-section__title">
          Totais de Execução ({selectedPeriod})
        </h2>

        <div className="jarvis-kpi-strip">
          {[
            { label: 'Inferências', value: formatInteger(totals.inferences) },
            { label: 'Tokens de entrada', value: formatInteger(totals.inputTokens) },
            { label: 'Tokens de saída', value: formatInteger(totals.outputTokens) },
            { label: 'Custo total', value: formatUsd(totals.cost) },
            {
              label: 'Latência média',
              value: totals.averageLatencyMs > 0 ? `${(totals.averageLatencyMs / 1000).toFixed(2)} s` : '—',
            },
          ].map((item) => (
            <div key={item.label} className="jarvis-kpi-card">
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{item.label}</div>
              <div className="jarvis-kpi-card__value" style={{ fontSize: '1.28rem' }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Detalhamento por Provedor */}
      <section className="jarvis-settings-section">
        <h2 className="jarvis-settings-section__title">Detalhamento por Provedor</h2>

        {providers.length === 0 ? (
          <div className="jarvis-settings-card" style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            Nenhuma chamada a provedores registada neste período.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {providers.map((provider) => {
              const isExpanded = expandedProvider === provider.id;
              return (
                <div
                  key={provider.id}
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    className="jarvis-accordion-trigger"
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <ChevronRight
                        size={14}
                        color="var(--text-muted)"
                        style={{
                          transform: isExpanded ? 'rotate(90deg)' : 'none',
                          transition: 'transform 0.15s ease',
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {provider.name}
                        </span>
                        <span className="jarvis-tabular" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                          {formatCompact(provider.tokens)} tokens
                        </span>
                      </div>
                    </div>

                    <div className="meta-inline jarvis-tabular" style={{ flexShrink: 0 }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        {formatUsd(provider.cost)}
                      </span>
                      <span style={{ color: '#4ade80', fontWeight: 500 }}>
                        {formatInteger(provider.inferences)} chamadas
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div
                      style={{
                        padding: '14px 18px 16px',
                        borderTop: '1px solid var(--border-subtle)',
                        backgroundColor: 'var(--bg-primary)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                      }}
                    >
                      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Modelos:</strong>{' '}
                        {provider.models.join(', ') || '—'}
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                        <div className="jarvis-settings-subcard">
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Inferências</div>
                          <div className="jarvis-tabular" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '3px', fontFamily: 'var(--font-mono)' }}>
                            {formatInteger(provider.inferences)}
                          </div>
                        </div>
                        <div className="jarvis-settings-subcard">
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Taxa de sucesso</div>
                          <div className="jarvis-tabular" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '3px', fontFamily: 'var(--font-mono)' }}>
                            {provider.inferences ? `${Math.round((provider.successful / provider.inferences) * 1000) / 10}%` : '—'}
                          </div>
                        </div>
                        <div className="jarvis-settings-subcard">
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Latência média</div>
                          <div className="jarvis-tabular" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '3px', fontFamily: 'var(--font-mono)' }}>
                            {provider.averageLatencyMs > 0 ? `${(provider.averageLatencyMs / 1000).toFixed(2)} s` : '—'}
                          </div>
                        </div>
                        <div className="jarvis-settings-subcard">
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Custo registado</div>
                          <div className="jarvis-tabular" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '3px', fontFamily: 'var(--font-mono)' }}>
                            {formatUsd(provider.cost)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="jarvis-tabular" style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          Fonte: <code>/api/v1/system/inference-telemetry</code> (janela das 500 inferências mais recentes da conta).
          {summary ? ` Total histórico: ${formatInteger(summary.total_inferences)} inferências.` : ''}
        </div>
      </section>
    </div>
  );
};
