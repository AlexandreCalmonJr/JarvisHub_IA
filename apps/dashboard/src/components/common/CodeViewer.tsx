import React, { useState } from 'react';
import { Copy, Check, Terminal, FileCode } from 'lucide-react';

interface CodeViewerProps {
  code: string;
  language?: string;
  filename?: string;
  maxHeight?: string;
  showLineNumbers?: boolean;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({
  code,
  language = 'plaintext',
  filename,
  maxHeight = '500px',
  showLineNumbers = true,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = code.split('\n');

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
      {/* Code Header Bar */}
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
          {filename ? (
            <FileCode size={15} color="var(--accent-color)" />
          ) : (
            <Terminal size={15} color="var(--accent-color)" />
          )}
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {filename || language.toUpperCase()}
          </span>
          <span
            style={{
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              padding: '2px 6px',
              borderRadius: '4px',
            }}
          >
            {lines.length} {lines.length === 1 ? 'linha' : 'linhas'}
          </span>
        </div>

        <button
          onClick={handleCopy}
          className="btn btn-ghost"
          style={{
            fontSize: '0.75rem',
            padding: '4px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            borderRadius: '6px',
            color: copied ? 'var(--success-color)' : 'var(--text-secondary)',
          }}
          title="Copiar código para a área de transferência"
        >
          {copied ? <Check size={14} color="var(--success-color)" /> : <Copy size={14} />}
          <span>{copied ? 'Copiado!' : 'Copiar'}</span>
        </button>
      </div>

      {/* Code Body */}
      <div
        style={{
          maxHeight,
          overflowY: 'auto',
          overflowX: 'auto',
          padding: '14px 16px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.84rem',
          lineHeight: '1.6',
        }}
      >
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} style={{ verticalAlign: 'top' }}>
                {showLineNumbers && (
                  <td
                    style={{
                      userSelect: 'none',
                      color: 'rgba(255, 255, 255, 0.22)',
                      paddingRight: '16px',
                      textAlign: 'right',
                      width: '1%',
                      whiteSpace: 'nowrap',
                      fontSize: '0.78rem',
                    }}
                  >
                    {idx + 1}
                  </td>
                )}
                <td style={{ whiteSpace: 'pre', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                  {line || ' '}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
