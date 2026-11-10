import React, { useState } from 'react';
import { Copy, Check, Terminal, GitCompare } from 'lucide-react';
import { formatFriendlyText, sanitizeUserFacingText } from '../../types';

interface MarkdownMessageProps {
  content: string;
}

export const MarkdownMessage: React.FC<MarkdownMessageProps> = React.memo(({ content }) => {
  // Parser de blocos (código, cabeçalhos, listas, parágrafos)
  const renderFormattedText = (text: string) => {
    // Divide o conteúdo preservando blocos de código com cercas ```
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      const matchIndex = match.index;
      // Texto antes do bloco de código
      if (matchIndex > lastIndex) {
        const textBefore = text.substring(lastIndex, matchIndex);
        parts.push(renderTextSections(textBefore, `text-${lastIndex}`));
      }

      // Bloco de código
      const lang = match[1] || 'plaintext';
      const code = match[2];
      parts.push(
        <CodeBlockItem
          key={`code-${matchIndex}`}
          language={lang}
          code={code}
        />
      );

      lastIndex = matchIndex + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(renderTextSections(text.substring(lastIndex), `text-${lastIndex}`));
    }

    return parts;
  };

  // Renderiza seções de texto normais (cabeçalhos, listas, parágrafos)
  const renderTextSections = (rawText: string, keyPrefix: string) => {
    const lines = rawText.split('\n');
    const nodes: React.ReactNode[] = [];
    let currentList: { type: 'ul' | 'ol'; items: React.ReactNode[] } | null = null;

    const flushList = (idx: number) => {
      if (currentList) {
        if (currentList.type === 'ul') {
          nodes.push(
            <ul
              key={`${keyPrefix}-list-${idx}`}
              style={{
                margin: '8px 0 12px 20px',
                paddingLeft: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {currentList.items.map((it, i) => (
                <li key={i} style={{ lineHeight: '1.5' }}>
                  {it}
                </li>
              ))}
            </ul>
          );
        } else {
          nodes.push(
            <ol
              key={`${keyPrefix}-list-${idx}`}
              style={{
                margin: '8px 0 12px 22px',
                paddingLeft: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {currentList.items.map((it, i) => (
                <li key={i} style={{ lineHeight: '1.5' }}>
                  {it}
                </li>
              ))}
            </ol>
          );
        }
        currentList = null;
      }
    };

    lines.forEach((line, lineIdx) => {
      const trimmed = line.trim();

      // Se for um bloco JSON ou erro serializado, converte para card visual limpo
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed);
          flushList(lineIdx);
          if (parsed.detail) {
            nodes.push(
              <div
                key={`${keyPrefix}-alert-${lineIdx}`}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  fontSize: '0.86rem',
                  margin: '8px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>ℹ️ <strong>Status do Sistema:</strong> {parsed.detail}</span>
              </div>
            );
            return;
          }
        } catch {
          // Mantém fluxo normal
        }
      }

      // Divisores horizontais
      if (trimmed === '---' || trimmed === '***') {
        flushList(lineIdx);
        nodes.push(
          <hr
            key={`${keyPrefix}-hr-${lineIdx}`}
            style={{
              border: 'none',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              margin: '16px 0',
            }}
          />
        );
        return;
      }

      // Cabeçalhos (###, ##, #)
      if (trimmed.startsWith('### ')) {
        flushList(lineIdx);
        const titleText = trimmed.replace('### ', '');
        nodes.push(
          <div
            key={`${keyPrefix}-h3-${lineIdx}`}
            className="claude-serif-title"
            style={{
              marginTop: '16px',
              marginBottom: '8px',
              paddingBottom: '4px',
              fontSize: '1.05rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {renderInlineMarkdown(titleText)}
          </div>
        );
        return;
      }

      if (trimmed.startsWith('## ')) {
        flushList(lineIdx);
        const titleText = trimmed.replace('## ', '');
        nodes.push(
          <h3
            key={`${keyPrefix}-h2-${lineIdx}`}
            className="claude-serif-title"
            style={{
              marginTop: '18px',
              marginBottom: '8px',
              fontSize: '1.2rem',
              fontWeight: 500,
              color: 'var(--text-primary)',
            }}
          >
            {renderInlineMarkdown(titleText)}
          </h3>
        );
        return;
      }

      if (trimmed.startsWith('# ')) {
        flushList(lineIdx);
        const titleText = trimmed.replace('# ', '');
        nodes.push(
          <h2
            key={`${keyPrefix}-h1-${lineIdx}`}
            className="claude-serif-title"
            style={{
              marginTop: '20px',
              marginBottom: '10px',
              fontSize: '1.4rem',
              fontWeight: 500,
              color: 'var(--text-primary)',
            }}
          >
            {renderInlineMarkdown(titleText)}
          </h2>
        );
        return;
      }

      // Listas de marcadores (- ou *)
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const itemContent = trimmed.substring(2);
        if (!currentList || currentList.type !== 'ul') {
          flushList(lineIdx);
          currentList = { type: 'ul', items: [] };
        }
        currentList.items.push(renderInlineMarkdown(itemContent));
        return;
      }

      // Listas ordenadas (1., 2., etc)
      const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
      if (orderedMatch) {
        const itemContent = orderedMatch[2];
        if (!currentList || currentList.type !== 'ol') {
          flushList(lineIdx);
          currentList = { type: 'ol', items: [] };
        }
        currentList.items.push(renderInlineMarkdown(itemContent));
        return;
      }

      // Parágrafo normal
      flushList(lineIdx);
      if (trimmed.length > 0) {
        nodes.push(
          <p
            key={`${keyPrefix}-p-${lineIdx}`}
            style={{
              marginBottom: '8px',
              lineHeight: '1.6',
              fontSize: '0.9rem',
              color: 'var(--text-primary)',
            }}
          >
            {renderInlineMarkdown(trimmed)}
          </p>
        );
      }
    });

    flushList(lines.length);
    return nodes;
  };

  // Parser inline: transforma **negrito**, *itálico*, `código` em elementos reais HTML
  const renderInlineMarkdown = (text: string): React.ReactNode => {
    // Regex para tokens: `código`, ***negrito e itálico***, **negrito**, *itálico*, links
    const parts: React.ReactNode[] = [];
    const tokenRegex = /(`[^`]+`|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;

    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        parts.push(text.substring(lastIdx, match.index));
      }

      const token = match[0];
      if (token.startsWith('`') && token.endsWith('`')) {
        const rawCode = token.slice(1, -1);
        parts.push(
          <code
            key={`inline-code-${match.index}`}
            style={{
              backgroundColor: 'rgba(217, 119, 87, 0.08)',
              padding: '2px 7px',
              borderRadius: '5px',
              fontSize: '0.82rem',
              color: '#f6ad92',
              fontFamily: "'JetBrains Mono', monospace",
              border: '1px solid rgba(217, 119, 87, 0.22)',
            }}
          >
            {formatFriendlyText(rawCode)}
          </code>
        );
      } else if (token.startsWith('***') && token.endsWith('***')) {
        parts.push(
          <strong key={`bold-italic-${match.index}`} style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            <em style={{ fontStyle: 'italic' }}>{token.slice(3, -3)}</em>
          </strong>
        );
      } else if (token.startsWith('**') && token.endsWith('**')) {
        parts.push(
          <strong key={`bold-${match.index}`} style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {token.slice(2, -2)}
          </strong>
        );
      } else if (token.startsWith('*') && token.endsWith('*')) {
        parts.push(
          <em key={`italic-${match.index}`} style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
            {token.slice(1, -1)}
          </em>
        );
      } else if (token.startsWith('[') && token.includes('](')) {
        const linkMatch = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (linkMatch) {
          parts.push(
            <a
              key={`link-${match.index}`}
              href={linkMatch[2]}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--accent-color)',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
              }}
            >
              {linkMatch[1]}
            </a>
          );
        } else {
          parts.push(token);
        }
      }

      lastIdx = match.index + token.length;
    }

    if (lastIdx < text.length) {
      parts.push(text.substring(lastIdx));
    }

    return parts;
  };

  const safeContent = sanitizeUserFacingText(content);
  return <div style={{ wordBreak: 'break-word' }}>{renderFormattedText(safeContent)}</div>;
});

// Componente para blocos de código com botão de cópia e realce
const CodeBlockItem: React.FC<{ language: string; code: string }> = React.memo(({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isDiff = language === 'diff';
  const lines = code.split('\n');

  return (
    <div
      style={{
        margin: '12px 0 16px',
        borderRadius: '10px',
        backgroundColor: '#161514',
        border: '1px solid var(--border-color)',
        overflow: 'hidden',
        boxShadow: '0 4px 18px rgba(0, 0, 0, 0.4)',
      }}
    >
      <div
        style={{
          padding: '8px 14px',
          backgroundColor: 'var(--bg-tertiary)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isDiff ? <GitCompare size={14} color="var(--accent-color)" /> : <Terminal size={14} color="var(--accent-color)" />}
          <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
            {language.toUpperCase() || 'CÓDIGO'}
          </span>
        </div>

        <button
          onClick={handleCopy}
          className="btn btn-ghost"
          style={{
            fontSize: '0.72rem',
            padding: '3px 8px',
            color: copied ? '#34d399' : 'var(--text-secondary)',
          }}
          title="Copiar código"
        >
          {copied ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
          <span>{copied ? 'Copiado!' : 'Copiar'}</span>
        </button>
      </div>

      <div
        style={{
          padding: '12px 14px',
          overflowX: 'auto',
          maxHeight: '420px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.82rem',
          lineHeight: '1.55',
        }}
      >
        {isDiff ? (
          lines.map((line, idx) => {
            let cls = '';
            if (line.startsWith('+') && !line.startsWith('+++')) cls = 'diff-line-add';
            else if (line.startsWith('-') && !line.startsWith('---')) cls = 'diff-line-del';
            else if (line.startsWith('@@') || line.startsWith('diff')) cls = 'diff-line-info';

            return (
              <div key={idx} className={cls} style={{ padding: '1px 8px', whiteSpace: 'pre' }}>
                {line || ' '}
              </div>
            );
          })
        ) : (
          <pre style={{ margin: 0, whiteSpace: 'pre', color: 'var(--text-primary)' }}>{code}</pre>
        )}
      </div>
    </div>
  );
});
