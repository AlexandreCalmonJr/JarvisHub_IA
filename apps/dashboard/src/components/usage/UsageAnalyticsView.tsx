import React, { useState, useEffect, useMemo } from 'react';
import {
  Cpu,
  HardDrive,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import {
  fetchOverviewTelemetry,
  fetchResources,
  InferenceTelemetryDetail,
  InferenceTelemetrySummary,
  ModelPerformanceSummary,
} from '../../services/api/system';

type Metric = 'Custo' | 'Tokens' | 'Latência';

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
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [metricDropdownOpen, setMetricDropdownOpen] = useState(false);
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cpuUsage, setCpuUsage] = useState<number | null>(null);
  const [ramUsage, setRamUsage] = useState<number | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [summary, setSummary] = useState<InferenceTelemetrySummary | null>(null);
  const [records, setRecords] = useState<InferenceTelemetryDetail[]>([]);
  const [modelPerformance, setModelPerformance] = useState<ModelPerformanceSummary[]>([]);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);

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

  // `modelPerformance` é mantido para indicar que a telemetria inclui o
  // desempenho por modelo; a UI abaixo deriva os detalhes das chamadas reais.
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
      style={{
        maxWidth: '920px',
        margin: '0 auto',
        padding: '24px 20px 48px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        color: '#f4f4f5',
      }}
    >
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <button
              type="button"
              onClick={() => window.history.back()}
              className="btn btn-ghost"
              style={{ padding: '4px 6px', color: '#9ca3af' }}
              title="Voltar"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => window.history.forward()}
              className="btn btn-ghost"
              style={{ padding: '4px 6px', color: '#9ca3af' }}
              title="Avançar"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div>
            <h1 className="claude-serif-title" style={{ fontSize: '1.45rem', fontWeight: 600, margin: 0, color: '#f5f5f5' }}>
              Uso e Custos
            </h1>
            <p style={{ fontSize: '0.80rem', color: '#888888', marginTop: '2px' }}>
              Telemetria real de inferências, tokens e custos da sua conta, além de métricas de hardware.
            </p>
          </div>
        </div>

        {/* Filtros e hardware */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '5px 10px',
              borderRadius: '999px',
              fontSize: '12px',
              color: '#d4d4d4',
            }}
          >
            <Cpu size={14} color="#38bdf8" />
            <span style={{ fontWeight: 600 }}>{cpuUsage === null ? '—' : `${cpuUsage}%`}</span>
            <span style={{ color: '#71717a' }}>CPU</span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '5px 10px',
              borderRadius: '999px',
              fontSize: '12px',
              color: '#d4d4d4',
            }}
          >
            <HardDrive size={14} color="#c084fc" />
            <span style={{ fontWeight: 600 }}>{ramUsage === null ? '—' : `${ramUsage}%`}</span>
            <span style={{ color: '#71717a' }}>RAM</span>
          </div>

          {/* Dropdown Agente */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
              className="btn btn-ghost"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: '#d4d4d4',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                padding: '5px 12px',
                borderRadius: '999px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <span>{selectedAgent}</span>
              <ChevronDown size={12} color="#71717a" />
            </button>

            {agentDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '36px',
                  right: 0,
                  width: '200px',
                  backgroundColor: '#18181b',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  padding: '4px',
                  zIndex: 50,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                }}
              >
                {agentOptions.map((agent) => (
                  <button
                    key={agent}
                    type="button"
                    onClick={() => {
                      setSelectedAgent(agent);
                      setAgentDropdownOpen(false);
                    }}
                    className="btn btn-ghost"
                    style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 10px', fontSize: '12px' }}
                  >
                    {agent}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dropdown Métrica */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setMetricDropdownOpen(!metricDropdownOpen)}
              className="btn btn-ghost"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: '#d4d4d4',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                padding: '5px 12px',
                borderRadius: '999px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <span>{selectedMetric}</span>
              <ChevronDown size={12} color="#71717a" />
            </button>

            {metricDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '36px',
                  right: 0,
                  width: '140px',
                  backgroundColor: '#18181b',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  padding: '4px',
                  zIndex: 50,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                }}
              >
                {(['Custo', 'Tokens', 'Latência'] as Metric[]).map((metric) => (
                  <button
                    key={metric}
                    type="button"
                    onClick={() => {
                      setSelectedMetric(metric);
                      setMetricDropdownOpen(false);
                    }}
                    className="btn btn-ghost"
                    style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 10px', fontSize: '12px' }}
                  >
                    {metric}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dropdown Período */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setPeriodDropdownOpen(!periodDropdownOpen)}
              className="btn btn-ghost"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: '#d4d4d4',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                padding: '5px 12px',
                borderRadius: '999px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <span>{selectedPeriod}</span>
              <ChevronDown size={12} color="#71717a" />
            </button>

            {periodDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '36px',
                  right: 0,
                  width: '140px',
                  backgroundColor: '#18181b',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  padding: '4px',
                  zIndex: 50,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                }}
              >
                {Object.keys(PERIOD_DAYS).map((period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => {
                      setSelectedPeriod(period);
                      setPeriodDropdownOpen(false);
                    }}
                    className="btn btn-ghost"
                    style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 10px', fontSize: '12px' }}
                  >
                    {period}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="btn btn-ghost"
            style={{
              padding: '6px',
              borderRadius: '50%',
              color: '#a1a1aa',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
            }}
            title="Atualizar telemetria"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {telemetryError && (
        <div role="alert" style={{ fontSize: '12px', color: '#fca5a5' }}>
          Telemetria indisponível: {telemetryError}
        </div>
      )}

      {/* Métrica principal */}
      <div style={{ marginTop: '8px' }}>
        <div style={{ fontSize: '2.5rem', fontWeight: 600, color: '#f5f5f5', letterSpacing: '-0.03em' }}>
          {mainValue}
        </div>
        <div style={{ fontSize: '13px', color: '#71717a', marginTop: '2px' }}>
          {formatInteger(totals.inferences)} inferências · {selectedPeriod} · taxa de sucesso{' '}
          {totals.inferences ? `${totals.successRate}%` : '—'}
          {fastestModel ? ` · modelo mais rápido: ${fastestModel}` : ''}
        </div>
      </div>

      {/* Gráfico temporal */}
      <div
        style={{
          width: '100%',
          height: '180px',
          position: 'relative',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          padding: '16px',
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
              fontSize: '12px',
              color: '#71717a',
              pointerEvents: 'none',
            }}
          >
            Sem inferências registadas neste período.
          </div>
        )}
        <svg
          style={{ width: '100%', height: '110px', overflow: 'visible' }}
          viewBox="0 0 800 100"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="usageGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          <line x1="0" y1="20" x2="800" y2="20" stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />
          <line x1="0" y1="60" x2="800" y2="60" stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />
          <line x1="0" y1="95" x2="800" y2="95" stroke="rgba(255,255,255,0.08)" />

          {chart.area && <path d={chart.area} fill="url(#usageGradient)" />}
          {chart.line && (
            <path d={chart.line} fill="none" stroke="#38bdf8" strokeWidth="2.5" />
          )}
          {chart.last && (
            <circle cx={chart.last.x} cy={chart.last.y} r="4.5" fill="#38bdf8" stroke="#0c0c0e" strokeWidth="2" />
          )}
        </svg>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#52525b', padding: '0 4px' }}>
          <span>{series[0]?.day}</span>
          <span>{series[Math.floor(series.length / 3)]?.day}</span>
          <span>{series[Math.floor((series.length * 2) / 3)]?.day}</span>
          <span>Hoje</span>
        </div>
      </div>

      {/* Detalhamento por provedor */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa', marginBottom: '4px' }}>
          Detalhamento por Provedor
        </div>

        {providers.length === 0 && (
          <div style={{ fontSize: '12px', color: '#71717a' }}>
            Nenhuma chamada a provedores neste período.
          </div>
        )}

        {providers.map((provider) => {
          const isExpanded = expandedProvider === provider.id;
          return (
            <div
              key={provider.id}
              style={{
                backgroundColor: '#141417',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
              }}
            >
              <div
                onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <ChevronRight
                    size={14}
                    color="#71717a"
                    style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}
                  />
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#f4f4f5' }}>{provider.name}</span>
                    <span style={{ fontSize: '12px', color: '#71717a', marginLeft: '8px' }}>
                      ({formatCompact(provider.tokens)} tokens)
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <span style={{ fontSize: '13px', color: '#a1a1aa' }}>{formatUsd(provider.cost)}</span>
                  <span style={{ fontSize: '11px', color: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.12)', padding: '2px 8px', borderRadius: '999px' }}>
                    {provider.inferences} chamadas
                  </span>
                </div>
              </div>

              {isExpanded && (
                <div
                  style={{
                    padding: '12px 20px 16px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                    backgroundColor: 'rgba(0, 0, 0, 0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <p style={{ margin: 0, fontSize: '12px', color: '#71717a' }}>
                    Modelos: {provider.models.join(', ') || '—'}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginTop: '4px' }}>
                    <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '8px 12px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#71717a' }}>Inferências</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#e4e4e7', marginTop: '2px' }}>{formatInteger(provider.inferences)}</div>
                    </div>
                    <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '8px 12px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#71717a' }}>Taxa de sucesso</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#e4e4e7', marginTop: '2px' }}>
                        {provider.inferences ? `${Math.round((provider.successful / provider.inferences) * 1000) / 10}%` : '—'}
                      </div>
                    </div>
                    <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '8px 12px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#71717a' }}>Latência média</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#e4e4e7', marginTop: '2px' }}>
                        {provider.averageLatencyMs > 0 ? `${(provider.averageLatencyMs / 1000).toFixed(2)} s` : '—'}
                      </div>
                    </div>
                    <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '8px 12px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#71717a' }}>Custo registado</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#e4e4e7', marginTop: '2px' }}>{formatUsd(provider.cost)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Totais */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa' }}>
          Totais de Tokens ({selectedPeriod})
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
          }}
        >
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
            <div
              key={item.label}
              style={{
                backgroundColor: '#141417',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '14px',
              }}
            >
              <div style={{ fontSize: '11px', color: '#71717a', lineHeight: 1.3 }}>{item.label}</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f4f4f5', marginTop: '6px' }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '11px', color: '#52525b' }}>
          Fonte: /api/v1/system/inference-telemetry (janela das 500 inferências mais recentes da conta).
          {summary ? ` Total histórico: ${formatInteger(summary.total_inferences)} inferências.` : ''}
        </div>
      </div>
    </div>
  );
};
