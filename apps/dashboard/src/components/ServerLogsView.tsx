import React, { useState, useEffect } from 'react';
import { fetchServerLogs, clearServerLogs, fetchModelMetrics } from '../api';
import { ModelMetricsCards } from './logs/ModelMetricsCards';
import { InferenceHistoryTable } from './logs/InferenceHistoryTable';
import { TerminalLogConsole } from './logs/TerminalLogConsole';

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
  total_savings_usd: number;
  average_latency_seconds: number;
  average_tokens_per_second: number;
  fastest_model: string;
  success_rate_percent: number;
  recent_inferences: any[];
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

  // Carrega métricas e logs iniciais
  const loadInitialData = async () => {
    setLoading(true);
    const [logsResult, metricsResult] = await Promise.allSettled([
      fetchServerLogs(300, levelFilter, searchFilter),
      fetchModelMetrics(),
    ]);
    if (logsResult.status === 'fulfilled') {
      setLogs(logsResult.value.logs || []);
      setLogsError(null);
    } else {
      setLogsError(logsResult.reason instanceof Error ? logsResult.reason.message : 'Falha ao carregar logs do servidor.');
    }
    if (metricsResult.status === 'fulfilled') {
      setMetrics(metricsResult.value);
      setMetricsError(null);
    } else {
      setMetricsError(metricsResult.reason instanceof Error ? metricsResult.reason.message : 'Falha ao carregar métricas.');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadInitialData();
  }, [levelFilter]);

  // Conexão SSE para streaming em tempo real
  useEffect(() => {
    if (!isStreaming) return;

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/v1/system/server-logs/stream');
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
        setIsStreaming(false);
      };
    } catch (e) {
      console.error('Falha ao iniciar SSE de logs:', e);
    }

    const interval = setInterval(async () => {
      try {
        const m = await fetchModelMetrics();
        setMetrics(m);
      } catch {}
    }, 4000);

    return () => {
      if (eventSource) eventSource.close();
      clearInterval(interval);
    };
  }, [isStreaming]);

  const handleClear = async () => {
    try {
      await clearServerLogs();
      setLogs([]);
      setLogsError(null);
    } catch (e: any) {
      setLogsError(e.message || 'Não foi possível limpar os logs.');
    }
  };

  const handleCopyLogs = () => {
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.level}] [${l.logger}]: ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2
            className="claude-serif-title"
            style={{
              fontSize: '1.6rem',
              fontWeight: 500,
              margin: 0,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
            }}
          >
            Logs do Servidor & Métricas
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Telemetria de inferência, latência e registros de execução do FastAPI e Uvicorn em tempo real.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setIsStreaming(!isStreaming)}
            className="btn btn-secondary"
            style={{ fontSize: '0.82rem', padding: '7px 12px', borderRadius: '8px' }}
            title={isStreaming ? 'Pausar recepção de novos logs' : 'Retomar streaming de logs'}
          >
            <span>{isStreaming ? 'Pausar Stream' : 'Retomar'}</span>
          </button>

          <button
            onClick={handleCopyLogs}
            className="btn btn-secondary"
            style={{ fontSize: '0.82rem', padding: '7px 12px', borderRadius: '8px' }}
            title="Copiar todos os logs exibidos para a área de transferência"
          >
            <span>{copied ? 'Copiado!' : 'Copiar'}</span>
          </button>

          <button
            onClick={handleClear}
            className="btn btn-ghost"
            style={{ fontSize: '0.82rem', padding: '7px 12px', color: 'var(--text-muted)' }}
          >
            Limpar
          </button>
        </div>
      </div>

      {loading && <p role="status" style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Carregando logs e métricas...</p>}
      {logsError && <div role="alert" style={{ padding: '12px 14px', border: '1px solid var(--danger-color)', borderRadius: '8px', color: 'var(--danger-color)', fontSize: '0.84rem' }}>{logsError}</div>}
      {metricsError && <div role="alert" style={{ padding: '12px 14px', border: '1px solid var(--warning-color)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>Métricas indisponíveis: {metricsError}</div>}

      {/* Cards de Métricas */}
      <ModelMetricsCards metrics={metrics} />

      {/* Tabela de Histórico Recente de Inferências */}
      {metrics && (
        <InferenceHistoryTable
          recentInferences={metrics.recent_inferences}
          showTable={showInferenceTable}
          onToggleTable={() => setShowInferenceTable(!showInferenceTable)}
        />
      )}

      {/* Console Terminal de Logs */}
      <TerminalLogConsole
        logs={logs}
        levelFilter={levelFilter}
        setLevelFilter={setLevelFilter}
        searchFilter={searchFilter}
        setSearchFilter={setSearchFilter}
        autoScroll={autoScroll}
        setAutoScroll={setAutoScroll}
      />
    </div>
  );
};
