import React, { useRef, useEffect } from 'react';
import { Terminal, Search, ArrowDown, X } from 'lucide-react';

interface LogEntry {
  id: number;
  timestamp: string;
  level: string;
  logger: string;
  message: string;
}

interface TerminalLogConsoleProps {
  logs: LogEntry[];
  levelFilter: string;
  setLevelFilter: (level: string) => void;
  searchFilter: string;
  setSearchFilter: (search: string) => void;
  autoScroll: boolean;
  setAutoScroll: (scroll: boolean) => void;
}

export const TerminalLogConsole: React.FC<TerminalLogConsoleProps> = ({
  logs,
  levelFilter,
  setLevelFilter,
  searchFilter,
  setSearchFilter,
  autoScroll,
  setAutoScroll,
}) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter((l) => {
    if (levelFilter !== 'ALL' && l.level.toUpperCase() !== levelFilter.toUpperCase()) return false;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      return l.message.toLowerCase().includes(q) || l.logger.toLowerCase().includes(q);
    }
    return true;
  });

  const getLevelColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR':
      case 'CRITICAL':
        return '#f87171';
      case 'WARNING':
      case 'WARN':
        return '#fbbf24';
      case 'INFO':
        return 'var(--accent-light)';
      case 'DEBUG':
        return 'var(--text-muted)';
      default:
        return 'var(--warning-color)';
    }
  };

  return (
    <section
      className="jarvis-settings-card"
      style={{
        padding: 0,
        height: '520px',
        overflow: 'hidden',
        gap: 0,
      }}
    >
      {/* Barra de Filtros e Ferramentas do Terminal */}
      <div
        style={{
          padding: '10px 14px',
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Terminal size={15} color="var(--accent-light)" />
          <span
            className="jarvis-tabular"
            style={{
              fontSize: '0.78rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.03em',
            }}
          >
            CONSOLA UVICORN & FASTAPI ({filteredLogs.length} eventos)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div className="jarvis-segmented">
            {['ALL', 'INFO', 'WARNING', 'ERROR'].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLevelFilter(lvl)}
                className={`jarvis-segmented-btn ${levelFilter === lvl ? 'is-active' : ''}`}
                style={{ padding: '4px 9px', fontSize: '0.72rem' }}
              >
                {lvl === 'ALL' ? 'Todos' : lvl}
              </button>
            ))}
          </div>

          <div className="jarvis-search-box" style={{ minHeight: '30px', padding: '0 8px', width: '190px' }}>
            <Search size={13} />
            <input
              type="text"
              className="jarvis-search-box__input"
              placeholder="Filtrar logs..."
              aria-label="Filtrar logs por texto"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{ fontSize: '0.76rem', fontFamily: 'var(--font-mono)', padding: '4px 0' }}
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                className="btn btn-ghost btn-icon-sm"
                aria-label="Limpar filtro de logs"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            className={`btn btn-xs ${autoScroll ? 'btn-success' : 'btn-ghost'}`}
            aria-pressed={autoScroll}
            title="Rolar automaticamente para a mensagem mais recente"
          >
            <ArrowDown size={12} />
            <span>Auto-Scroll</span>
          </button>
        </div>
      </div>

      {/* Corpo do Terminal com Logs */}
      <div
        className="jarvis-tabular"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          backgroundColor: 'var(--bg-primary)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.76rem',
          lineHeight: 1.65,
        }}
      >
        {filteredLogs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: '80px', fontFamily: 'inherit' }}>
            Nenhum registro encontrado para os filtros selecionados.
          </div>
        ) : (
          filteredLogs.map((l) => (
            <div
              key={l.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                marginBottom: '2px',
                wordBreak: 'break-word',
              }}
            >
              <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>[{l.timestamp.slice(11, 19)}]</span>
              <span
                style={{
                  color: getLevelColor(l.level),
                  fontWeight: 700,
                  width: '68px',
                  flexShrink: 0,
                }}
              >
                [{l.level}]
              </span>
              <span
                style={{
                  color: 'var(--text-secondary)',
                  flexShrink: 0,
                  maxWidth: '150px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                [{l.logger}]:
              </span>
              <span style={{ color: 'var(--text-primary)', flex: 1 }}>{l.message}</span>
            </div>
          ))
        )}
        <div ref={terminalEndRef} />
      </div>
    </section>
  );
};
