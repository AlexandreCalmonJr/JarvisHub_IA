import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, BarChart3, Coins, RefreshCw } from 'lucide-react';
import {
  OverviewTelemetryResponse,
  fetchOverviewTelemetry,
} from '../../services/api/system';

interface TokenTimelinePoint {
  label: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
}

interface ModelUsageBarPoint {
  model: string;
  fullModel: string;
  sucessos: number;
  falhas: number;
  tokensTotais: number;
  latenciaMediaMs: number;
}

const formatCompactNumber = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
};

const shortenModelName = (name: string): string => {
  if (!name) return 'Desconhecido';
  return name.length > 18 ? `${name.slice(0, 16)}…` : name;
};

const formatTimestampLabel = (iso: string, index: number): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return `#${index + 1}`;
  return parsed.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const tooltipContentStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-hover)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontSize: '0.78rem',
  boxShadow: 'var(--shadow-md)',
};

export const ModelUsageCharts: React.FC = () => {
  const [telemetry, setTelemetry] = useState<OverviewTelemetryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [modelChartMetric, setModelChartMetric] = useState<'executions' | 'tokens'>('executions');

  const loadTelemetry = async () => {
    setLoading(true);
    try {
      const data = await fetchOverviewTelemetry(100);
      setTelemetry(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar as métricas de uso de modelos.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTelemetry();
  }, []);

  const tokenTimeline = useMemo<TokenTimelinePoint[]>(() => {
    if (!telemetry?.records?.length) return [];
    const chronological = [...telemetry.records].reverse().slice(-24);
    return chronological.map((rec, idx) => {
      const promptTokens = Number(rec.prompt_tokens) || 0;
      const completionTokens = Number(rec.completion_tokens) || 0;
      return {
        label: formatTimestampLabel(rec.created_at, idx),
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        model: rec.model_name,
      };
    });
  }, [telemetry]);

  const modelUsageData = useMemo<ModelUsageBarPoint[]>(() => {
    if (!telemetry) return [];

    const byModel = new Map<
      string,
      {
        sucessos: number;
        falhas: number;
        tokensTotais: number;
        latencyWeightedSum: number;
        totalCount: number;
      }
    >();

    for (const rec of telemetry.records) {
      const key = rec.model_name || 'desconhecido';
      const current = byModel.get(key) || {
        sucessos: 0,
        falhas: 0,
        tokensTotais: 0,
        latencyWeightedSum: 0,
        totalCount: 0,
      };
      if (rec.status === 'success') current.sucessos += 1;
      else current.falhas += 1;
      current.tokensTotais += (Number(rec.prompt_tokens) || 0) + (Number(rec.completion_tokens) || 0);
      current.latencyWeightedSum += Number(rec.duration_ms) || 0;
      current.totalCount += 1;
      byModel.set(key, current);
    }

    if (byModel.size === 0 && telemetry.model_performance.length > 0) {
      for (const perf of telemetry.model_performance) {
        const key = perf.model_name || 'desconhecido';
        const current = byModel.get(key) || {
          sucessos: 0,
          falhas: 0,
          tokensTotais: 0,
          latencyWeightedSum: 0,
          totalCount: 0,
        };
        const count = Number(perf.total_inferences) || 0;
        current.sucessos += Number(perf.successful) || 0;
        current.falhas += Number(perf.failed) || 0;
        current.tokensTotais += Math.round((Number(perf.average_tokens) || 0) * count);
        current.latencyWeightedSum += (Number(perf.average_latency_ms) || 0) * count;
        current.totalCount += count;
        byModel.set(key, current);
      }
    }

    return Array.from(byModel.entries())
      .map(([modelName, agg]) => ({
        model: shortenModelName(modelName),
        fullModel: modelName,
        sucessos: agg.sucessos,
        falhas: agg.falhas,
        tokensTotais: agg.tokensTotais,
        latenciaMediaMs: agg.totalCount > 0 ? Math.round(agg.latencyWeightedSum / agg.totalCount) : 0,
      }))
      .sort((a, b) => b.sucessos + b.falhas - (a.sucessos + a.falhas))
      .slice(0, 8);
  }, [telemetry]);

  const summary = telemetry?.summary;
  const hasChartData = tokenTimeline.length > 0 || modelUsageData.length > 0;

  return (
    <section
      className="glass-panel"
      aria-labelledby="overview-telemetry-title"
      style={{
        padding: '22px',
        borderRadius: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h2
            id="overview-telemetry-title"
            className="claude-serif-title"
            style={{ fontSize: '1.12rem', fontWeight: 500, margin: 0 }}
          >
            Uso de Modelos &amp; Consumo de Tokens
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '5px 0 0' }}>
            Telemetria real de inferências e tokens registados para a sua conta.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadTelemetry()}
          disabled={loading}
          className="btn btn-secondary btn-sm"
        >
          <RefreshCw size={13} className={loading ? 'spin' : undefined} />
          <span>{loading ? 'Atualizando…' : 'Atualizar métricas'}</span>
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="glass-card"
          style={{
            padding: '12px 14px',
            border: '1px solid rgba(248, 113, 113, 0.35)',
            borderRadius: '10px',
          }}
        >
          <strong style={{ color: 'var(--text-primary)', fontSize: '0.84rem' }}>
            Telemetria de modelos indisponível.
          </strong>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: '4px 0 0' }}>
            {error}
          </p>
        </div>
      )}

      {!error && summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
            gap: '10px',
          }}
        >
          <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.76rem' }}>
              <Coins size={14} color="var(--accent-light)" />
              <span>Tokens consumidos</span>
            </div>
            <div className="tabular-nums" style={{ marginTop: '6px', fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              {summary.total_tokens.toLocaleString('pt-BR')}
            </div>
          </div>

          <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.76rem' }}>
              <Activity size={14} color="var(--success-color)" />
              <span>Inferências executadas</span>
            </div>
            <div className="tabular-nums" style={{ marginTop: '6px', fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              {summary.total_inferences.toLocaleString('pt-BR')}{' '}
              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                ({summary.successful} ok / {summary.failed} falha)
              </span>
            </div>
          </div>

          <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.76rem' }}>
              <BarChart3 size={14} color="var(--warning-color)" />
              <span>Latência média</span>
            </div>
            <div className="tabular-nums" style={{ marginTop: '6px', fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              {Math.round(summary.average_latency_ms)} ms
            </div>
          </div>

          <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem' }}>Custo registado</div>
            <div className="tabular-nums" style={{ marginTop: '6px', fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              US$ {summary.total_cost_usd.toFixed(4)}
            </div>
          </div>
        </div>
      )}

      {loading && !telemetry ? (
        <p role="status" style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', margin: 0 }}>
          Consultando telemetria de modelos e tokens…
        </p>
      ) : !error && !hasChartData ? (
        <div
          style={{
            padding: '24px',
            borderRadius: '10px',
            border: '1px dashed var(--border-color)',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            fontSize: '0.84rem',
          }}
        >
          Nenhuma inferência registada nesta conta até ao momento. Os gráficos de consumo de tokens e modelos aparecerão automaticamente após as primeiras execuções.
        </div>
      ) : !error && hasChartData ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
            gap: '16px',
          }}
        >
          {/* Gráfico 1: Consumo de Tokens por Execução */}
          <div
            className="glass-card"
            style={{
              padding: '16px',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              minWidth: 0,
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Tokens Consumidos (Prompt vs. Resposta)
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Últimas {tokenTimeline.length} execuções cronológicas
              </p>
            </div>
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={tokenTimeline} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="promptTokensGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="completionTokensGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" stroke="#7c8ca3" fontSize={11} tickLine={false} />
                  <YAxis stroke="#7c8ca3" fontSize={11} tickLine={false} tickFormatter={formatCompactNumber} />
                  <Tooltip
                    contentStyle={tooltipContentStyle}
                    formatter={(value, name) => [
                      Number(value || 0).toLocaleString('pt-BR'),
                      name === 'promptTokens' ? 'Tokens de Entrada' : 'Tokens de Resposta',
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}
                    formatter={(value) =>
                      value === 'promptTokens' ? 'Entrada (Prompt)' : 'Saída (Resposta)'
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="promptTokens"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#promptTokensGradient)"
                  />
                  <Area
                    type="monotone"
                    dataKey="completionTokens"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#completionTokensGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráfico 2: Distribuição por Modelo */}
          <div
            className="glass-card"
            style={{
              padding: '16px',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              minWidth: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Distribuição por Modelo
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Comparativo entre modelos utilizados na conta
                </p>
              </div>
              <div className="jarvis-segmented">
                <button
                  type="button"
                  onClick={() => setModelChartMetric('executions')}
                  className={`jarvis-segmented-btn ${modelChartMetric === 'executions' ? 'is-active' : ''}`}
                >
                  Execuções
                </button>
                <button
                  type="button"
                  onClick={() => setModelChartMetric('tokens')}
                  className={`jarvis-segmented-btn ${modelChartMetric === 'tokens' ? 'is-active' : ''}`}
                >
                  Tokens
                </button>
              </div>
            </div>

            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modelUsageData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="model" stroke="#7c8ca3" fontSize={11} tickLine={false} />
                  <YAxis stroke="#7c8ca3" fontSize={11} tickLine={false} tickFormatter={formatCompactNumber} />
                  <Tooltip
                    contentStyle={tooltipContentStyle}
                    labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullModel || String(_label)}
                    formatter={(value, name) => [
                      Number(value || 0).toLocaleString('pt-BR'),
                      name === 'sucessos'
                        ? 'Sucessos'
                        : name === 'falhas'
                          ? 'Falhas'
                          : 'Tokens Totais',
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }} />
                  {modelChartMetric === 'executions' ? (
                    <>
                      <Bar dataKey="sucessos" name="Sucessos" stackId="runs" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="falhas" name="Falhas" stackId="runs" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </>
                  ) : (
                    <Bar dataKey="tokensTotais" name="Tokens Totais" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};
