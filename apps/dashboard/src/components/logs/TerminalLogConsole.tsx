import React, { useRef, useEffect } from 'react';
import { Terminal, Search, ArrowDown } from 'lucide-react';

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
        return '#f87171'; // Vermelho
      case 'WARNING':
      case 'WARN':
        return '#fbbf24'; // Amarelo
      case 'INFO':
        return 'var(--accent-color)'; // Terracota Claude
      case 'DEBUG':
        return '#9c9a92'; // Cinza aveludado
      default:
        return '#d97757';
    }
  };

  return (
    <div
      className="glass-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '520px',
        overflow: 'hidden',
        backgroundColor: '#161514',
        border: '1px solid var(--border-color)',
        borderRadius: '14px',
      }}
    >
      {/* Barra de Filtros e Ferramentas do Terminal */}
      <div
        style={{
          padding: '10px 14px',
          backgroundColor: 'var(--bg-tertiary)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Terminal size={16} color="var(--accent-color)" />
          <span
            style={{
              fontSize: '0.80rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.04em',
            }}
          >
            CONSOLA UVICORN & FASTAPI ({filteredLogs.length} eventos)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Filtro de Nível */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {['ALL', 'INFO', 'WARNING', 'ERROR'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                style={{
                  fontSize: '0.68rem',
                  padding: '3px 8px',
                  borderRadius: '5px',
                  border: '1px solid',
                  borderColor: levelFilter === lvl ? 'var(--accent-color)' : 'var(--border-color)',
                  backgroundColor:
                    levelFilter === lvl ? 'rgba(217, 119, 87, 0.2)' : 'transparent',
                  color: levelFilter === lvl ? 'var(--accent-color)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {lvl === 'ALL' ? 'TODOS' : lvl}
              </button>
            ))}
          </div>

          {/* Busca Rápida */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: 'var(--bg-surface)',
              borderRadius: '6px',
              padding: '3px 8px',
              border: '1px solid var(--border-color)',
            }}
          >
            <Search size={13} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Filtrar logs..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: '0.74rem',
                fontFamily: 'var(--font-mono)',
                width: '120px',
              }}
            />
          </div>

          {/* Toggle Auto-Scroll */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            style={{
              fontSize: '0.68rem',
              padding: '3px 8px',
              borderRadius: '5px',
              border: '1px solid',
              borderColor: autoScroll ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-color)',
              backgroundColor: autoScroll ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
              color: autoScroll ? '#34d399' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Rolar automaticamente para a mensagem mais recente"
          >
            <ArrowDown size={12} />
            <span>Auto-Scroll</span>
          </button>
        </div>
      </div>

      {/* Corpo do Terminal com Logs */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: '0.76rem',
          lineHeight: 1.6,
        }}
      >
        {filteredLogs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: '80px' }}>
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
              <span style={{ color: '#64748b', flexShrink: 0 }}>[{l.timestamp.slice(11, 19)}]</span>
              <span
                style={{
                  color: getLevelColor(l.level),
                  fontWeight: 700,
                  width: '65px',
                  flexShrink: 0,
                }}
              >
                [{l.level}]
              </span>
              <span
                style={{
                  color: '#94a3b8',
                  flexShrink: 0,
                  maxWidth: '140px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                [{l.logger}]:
              </span>
              <span style={{ color: '#e2e8f0', flex: 1 }}>{l.message}</span>
            </div>
          ))
        )}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
};
