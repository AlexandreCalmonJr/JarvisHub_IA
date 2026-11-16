import React, { useState } from 'react';
import { Copy, Check, FileDiff, Columns, AlignJustify } from 'lucide-react';

interface DiffViewerProps {
  diff: string;
  filename?: string;
  maxHeight?: string;
}

interface DiffLine {
  type: 'add' | 'del' | 'context' | 'header';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  diff,
  filename,
  maxHeight = '450px',
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');

  const handleCopy = () => {
    navigator.clipboard.writeText(diff);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Parse lines of unified diff
  const rawLines = diff.split('\n');
  const parsedLines: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  let additions = 0;
  let deletions = 0;

  for (const line of rawLines) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      parsedLines.push({ type: 'header', content: line });
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
      parsedLines.push({
        type: 'add',
        newLineNumber: newLine++,
        content: line.slice(1),
      });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
      parsedLines.push({
        type: 'del',
        oldLineNumber: oldLine++,
        content: line.slice(1),
      });
    } else {
      parsedLines.push({
        type: 'context',
        oldLineNumber: oldLine++,
        newLineNumber: newLine++,
        content: line.startsWith(' ') ? line.slice(1) : line,
      });
    }
  }

  return (
    <div
      style={{
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-secondary)',
        overflow: 'hidden',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          padding: '10px 16px',
          backgroundColor: 'var(--bg-tertiary)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileDiff size={16} color="var(--accent-color)" />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {filename || 'Visualizador de Diff Interativo'}
          </span>
          <span
            style={{
              fontSize: '0.75rem',
              padding: '2px 8px',
              borderRadius: '999px',
              backgroundColor: 'rgba(34, 197, 94, 0.2)',
              color: '#4ade80',
              fontWeight: 700,
            }}
          >
            +{additions}
          </span>
          <span
            style={{
              fontSize: '0.75rem',
              padding: '2px 8px',
              borderRadius: '999px',
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              color: '#f87171',
              fontWeight: 700,
            }}
          >
            -{deletions}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* View Mode Toggle */}
          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '6px',
              padding: '2px',
              border: '1px solid var(--border-color)',
            }}
          >
            <button
              onClick={() => setViewMode('unified')}
              title="Modo Unificado"
              style={{
                background: viewMode === 'unified' ? 'var(--accent-color)' : 'transparent',
                color: viewMode === 'unified' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              <AlignJustify size={13} /> Unificado
            </button>
            <button
              onClick={() => setViewMode('split')}
              title="Modo Lado a Lado (Split)"
              style={{
                background: viewMode === 'split' ? 'var(--accent-color)' : 'transparent',
                color: viewMode === 'split' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              <Columns size={13} /> Split
            </button>
          </div>

          <button
            onClick={handleCopy}
            title="Copiar diff completo"
            style={{
              background: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '5px 10px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.75rem',
            }}
          >
            {copied ? <Check size={14} color="#4ade80" /> : <Copy size={14} />}
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      </div>

      {/* Code Container */}
      <div
        style={{
          maxHeight,
          overflowY: 'auto',
          overflowX: 'auto',
          fontFamily: 'var(--font-mono, "JetBrains Mono", Consolas, monospace)',
          fontSize: '0.82rem',
          lineHeight: '1.45',
        }}
      >
        {viewMode === 'unified' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {parsedLines.map((line, idx) => {
                let bg = 'transparent';
                let textColor = 'var(--text-primary)';
                let sign = ' ';

                if (line.type === 'add') {
                  bg = 'rgba(34, 197, 94, 0.12)';
                  textColor = '#86efac';
                  sign = '+';
                } else if (line.type === 'del') {
                  bg = 'rgba(239, 68, 68, 0.12)';
                  textColor = '#fca5a5';
                  sign = '-';
                } else if (line.type === 'header') {
                  bg = 'rgba(6, 182, 212, 0.15)';
                  textColor = '#67e8f9';
                }

                return (
                  <tr key={idx} style={{ backgroundColor: bg }}>
                    <td
                      style={{
                        width: '45px',
                        padding: '2px 8px',
                        textAlign: 'right',
                        color: 'var(--text-muted, #64748b)',
                        userSelect: 'none',
                        borderRight: '1px solid var(--border-color)',
                        fontSize: '0.75rem',
                      }}
                    >
                      {line.oldLineNumber || ''}
                    </td>
                    <td
                      style={{
                        width: '45px',
                        padding: '2px 8px',
                        textAlign: 'right',
                        color: 'var(--text-muted, #64748b)',
                        userSelect: 'none',
                        borderRight: '1px solid var(--border-color)',
                        fontSize: '0.75rem',
                      }}
                    >
                      {line.newLineNumber || ''}
                    </td>
                    <td
                      style={{
                        width: '20px',
                        padding: '2px 4px',
                        textAlign: 'center',
                        color: textColor,
                        userSelect: 'none',
                        fontWeight: 700,
                      }}
                    >
                      {line.type !== 'header' ? sign : ''}
                    </td>
                    <td
                      style={{
                        padding: '2px 8px',
                        color: textColor,
                        whiteSpace: 'pre',
                      }}
                    >
                      {line.content}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          /* Split View */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minWidth: '700px' }}>
            {/* Left: Original / Deletions */}
            <div style={{ borderRight: '1px solid var(--border-color)' }}>
              <div
                style={{
                  padding: '4px 12px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  color: '#f87171',
                  borderBottom: '1px solid var(--border-color)',
                }}
              >
                Original (Antes)
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {parsedLines
                    .filter((l) => l.type === 'del' || l.type === 'context')
                    .map((l, i) => (
                      <tr
                        key={i}
                        style={{
                          backgroundColor:
                            l.type === 'del' ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
                        }}
                      >
                        <td
                          style={{
                            width: '40px',
                            padding: '2px 6px',
                            textAlign: 'right',
                            color: 'var(--text-muted, #64748b)',
                            userSelect: 'none',
                            fontSize: '0.75rem',
                            borderRight: '1px solid var(--border-color)',
                          }}
                        >
                          {l.oldLineNumber || ''}
                        </td>
                        <td
                          style={{
                            padding: '2px 8px',
                            color: l.type === 'del' ? '#fca5a5' : 'var(--text-primary)',
                            whiteSpace: 'pre',
                          }}
                        >
                          {l.content}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Right: New / Additions */}
            <div>
              <div
                style={{
                  padding: '4px 12px',
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  color: '#4ade80',
                  borderBottom: '1px solid var(--border-color)',
                }}
              >
                Modificado (Depois)
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {parsedLines
                    .filter((l) => l.type === 'add' || l.type === 'context')
                    .map((l, i) => (
                      <tr
                        key={i}
                        style={{
                          backgroundColor:
                            l.type === 'add' ? 'rgba(34, 197, 94, 0.12)' : 'transparent',
                        }}
                      >
                        <td
                          style={{
                            width: '40px',
                            padding: '2px 6px',
                            textAlign: 'right',
                            color: 'var(--text-muted, #64748b)',
                            userSelect: 'none',
                            fontSize: '0.75rem',
                            borderRight: '1px solid var(--border-color)',
                          }}
                        >
                          {l.newLineNumber || ''}
                        </td>
                        <td
                          style={{
                            padding: '2px 8px',
                            color: l.type === 'add' ? '#86efac' : 'var(--text-primary)',
                            whiteSpace: 'pre',
                          }}
                        >
                          {l.content}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
