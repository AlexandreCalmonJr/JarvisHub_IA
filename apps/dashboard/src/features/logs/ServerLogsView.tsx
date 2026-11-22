import React, { useState, useEffect } from 'react';
import { Pause, Play, Copy, Check, Trash2 } from 'lucide-react';
import { API_BASE } from '../../services/api/client';
import { fetchServerLogs, clearServerLogs } from '../../api';
import { fetchOverviewTelemetry } from '../../services/api/system';
import { PageHeader } from '../../shared/layout/PageHeader';
import { ModelMetricsCards } from './ModelMetricsCards';
import { InferenceHistoryTable } from './InferenceHistoryTable';
import { TerminalLogConsole } from './TerminalLogConsole';
import { ConfirmDialog } from '../../shared/common/ConfirmDialog';

interface LogEntry {
  id: number;
  timestamp: string;
  level: string;
  logger: string;
  message: string;
}

interface ModelMetrics {
  total_inferences: number;
  total_tokens: number;
  total_savings_usd: number | null;
  average_latency_seconds: number;
  average_tokens_per_second: number;
  fastest_model: string;
  success_rate_percent: number;
  recent_inferences: any[];
}

function toModelMetrics(telemetry: {
  summary: {
    total_inferences: number;
    successful: number;
    total_tokens: number;
    average_latency_ms: number;
  };
  records: any[];
  model_performance: any[];
}): ModelMetrics {
  const records = telemetry.records || [];
  const successful = records.filter(
    (record) => record.status === 'success' && Number(record.duration_ms) > 0
  );
  const totalDurationMs = successful.reduce(
    (sum, record) => sum + Number(record.duration_ms || 0),
    0
  );
  const totalCompletionTokens = successful.reduce(
    (sum, record) => sum + Number(record.completion_tokens || 0),
    0
  );
  const fastest = [...(telemetry.model_performance || [])]
    .filter((entry) => Number(entry.average_latency_ms) > 0)
    .sort((a, b) => Number(a.average_latency_ms) - Number(b.average_latency_ms))[0];

  return {
    total_inferences: telemetry.summary.total_inferences,
    total_tokens: telemetry.summary.total_tokens,
    total_savings_usd: null,
    average_latency_seconds:
      Math.round((Number(telemetry.summary.average_latency_ms) / 1000) * 100) / 100,
    average_tokens_per_second: totalDurationMs
      ? Math.round((totalCompletionTokens / (totalDurationMs / 1000)) * 10) / 10
      : 0,
    fastest_model: fastest?.model_name || '—',
    success_rate_percent: telemetry.summary.total_inferences
      ? Math.round(
          (telemetry.summary.successful / telemetry.summary.total_inferences) * 1000
        ) / 10
      : 0,
    recent_inferences: records,
  };
}

export const ServerLogsView: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [showInferenceTable, setShowInferenceTable] = useState<boolean>(true);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((principal) => {
        if (!cancelled) {
          setIsAdmin(principal?.kind === 'human' && principal?.role === 'admin');
          setRoleLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsAdmin(false);
          setRoleLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    const [logsResult, metricsResult] = await Promise.allSettled([
      fetchServerLogs(300, levelFilter, searchFilter),
      fetchOverviewTelemetry(50),
    ]);
    if (logsResult.status === 'fulfilled') {
      setLogs(logsResult.value.logs || []);
      setLogsError(null);
    } else {
      setLogsError(logsResult.reason instanceof Error ? logsResult.reason.message : 'Falha ao carregar logs do servidor.');
    }
    if (metricsResult.status === 'fulfilled') {
      setMetrics(toModelMetrics(metricsResult.value));
      setMetricsError(null);
    } else {
      setMetricsError(metricsResult.reason instanceof Error ? metricsResult.reason.message : 'Falha ao carregar métricas.');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) void loadInitialData();
  }, [levelFilter, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const interval = setInterval(async () => {
      try {
        setMetrics(toModelMetrics(await fetchOverviewTelemetry(50)));
        setMetricsError(null);
      } catch (error) {
        setMetricsError(
          error instanceof Error ? error.message : 'Falha ao carregar métricas.'
        );
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !isStreaming) return;

    let cancelled = false;
    let eventSource: EventSource | null = null;
    let retryTimer: number | undefined;
    let attempt = 0;

    const connect = () => {
      if (cancelled) return;
      try {
        eventSource = new EventSource(`${API_BASE}/system/server-logs/stream`, {
          withCredentials: true,
        });
        eventSource.onopen = () => {
          attempt = 0;
        };
        eventSource.onmessage = (event) => {
          try {
            const entry: LogEntry = JSON.parse(event.data);
            setLogs((prev) => {
              const next = [...prev, entry];
              return next.length > 500 ? next.slice(-500) : next;
            });
          } catch (err) {
            console.warn('Erro ao processar log SSE:', err);
          }
        };
        eventSource.onerror = () => {
          eventSource?.close();
          eventSource = null;
          if (cancelled) return;
          const delay = Math.min(30000, 1000 * 2 ** attempt);
          attempt += 1;
          retryTimer = window.setTimeout(connect, delay);
        };
      } catch (e) {
        console.error('Falha ao iniciar SSE de logs:', e);
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (eventSource) eventSource.close();
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [isAdmin, isStreaming]);

  const handleClear = () => {
    if (!isAdmin) return;
    setConfirmClearOpen(true);
  };

  const confirmClear = async () => {
    if (!isAdmin) return;
    setClearingLogs(true);
    try {
      await clearServerLogs();
      setLogs([]);
      setLogsError(null);
      setConfirmClearOpen(false);
    } catch (e: any) {
      setLogsError(e.message || 'Não foi possível limpar os logs.');
    } finally {
      setClearingLogs(false);
    }
  };

  const handleCopyLogs = () => {
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.level}] [${l.logger}]: ${l.message}`)
      .join('\n');
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setLogsError('Não foi possível copiar os logs.'));
  };

  return (
    <div className="jarvis-page-shell">
      <PageHeader
        title="Logs do Servidor & Métricas"
        subtitle="Telemetria de inferência, latência e registros de execução do FastAPI e Uvicorn em tempo real."
        meta={
          isAdmin
            ? [
                <span
                  key="stream-state"
                  style={{ color: isStreaming ? '#4ade80' : 'var(--text-muted)', fontWeight: 600 }}
                >
                  {isStreaming ? 'Stream ativo' : 'Stream pausado'}
                </span>,
                <span key="events-count" className="jarvis-tabular">
                  {logs.length} evento{logs.length === 1 ? '' : 's'}
                </span>,
              ]
            : undefined
        }
        actions={
          isAdmin ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setIsStreaming(!isStreaming)}
                className="btn btn-secondary btn-sm"
                title={isStreaming ? 'Pausar recepção de novos logs' : 'Retomar streaming de logs'}
              >
                {isStreaming ? <Pause size={13} /> : <Play size={13} />}
                <span>{isStreaming ? 'Pausar Stream' : 'Retomar'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyLogs}
                className="btn btn-secondary btn-sm"
                title="Copiar todos os logs exibidos para a área de transferência"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                <span>{copied ? 'Copiado' : 'Copiar'}</span>
              </button>

              <button
                type="button"
                onClick={handleClear}
                className="btn btn-danger-ghost btn-sm"
              >
                <Trash2 size={13} />
                <span>Limpar</span>
              </button>
            </div>
          ) : undefined
        }
      />

      {!roleLoaded && (
        <div role="status" className="jarvis-callout jarvis-callout--info">
          A verificar permissões dos logs do servidor…
        </div>
      )}

      {roleLoaded && !isAdmin && (
        <div className="jarvis-callout jarvis-callout--info">
          Os logs globais do servidor e a limpeza do buffer são restritos a administradores. As métricas individuais de inferência permanecem disponíveis nos módulos autorizados da sua conta.
        </div>
      )}

      {isAdmin && (
        <>
          {loading && (
            <div role="status" className="jarvis-callout jarvis-callout--info">
              Carregando logs e métricas…
            </div>
          )}
          {logsError && (
            <div role="alert" className="jarvis-error-banner">
              {logsError}
            </div>
          )}
          {metricsError && (
            <div role="alert" className="jarvis-callout jarvis-callout--danger">
              Métricas indisponíveis: {metricsError}
            </div>
          )}

          <ModelMetricsCards metrics={metrics} />

          {metrics && (
            <InferenceHistoryTable
              recentInferences={metrics.recent_inferences}
              showTable={showInferenceTable}
              onToggleTable={() => setShowInferenceTable(!showInferenceTable)}
            />
          )}

          <TerminalLogConsole
            logs={logs}
            levelFilter={levelFilter}
            setLevelFilter={setLevelFilter}
            searchFilter={searchFilter}
            setSearchFilter={setSearchFilter}
            autoScroll={autoScroll}
            setAutoScroll={setAutoScroll}
          />
        </>
      )}

      <ConfirmDialog
        isOpen={confirmClearOpen}
        title="Limpar logs do servidor"
        description="Deseja limpar o buffer global de logs do servidor?"
        confirmLabel="Limpar buffer"
        tone="danger"
        isLoading={clearingLogs}
        onConfirm={confirmClear}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </div>
  );
};
