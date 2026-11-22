import React, { useState } from 'react';
import {
  Swords,
  Globe,
  Loader2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Trophy,
  Cpu,
} from 'lucide-react';
import { ArenaSideResult, runModelArenaComparison } from '../../api';
import { MarkdownMessage } from '../chat/MarkdownMessage';
import { notify } from '../../shared/common/Toast';

interface ArenaModelOption {
  id: string;
  label: string;
  mode: 'LOCAL' | 'ONLINE';
}

const DEFAULT_ARENA_OPTIONS: ArenaModelOption[] = [
  { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen (Online · Raciocínio + Web)', mode: 'ONLINE' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (Online · Ultra-rápido)', mode: 'ONLINE' },
  { id: 'qwen2.5-coder:7b', label: 'Qwen 2.5 Coder 7B (Ollama Local)', mode: 'LOCAL' },
  { id: 'qwen2.5:7b', label: 'Qwen 2.5 7B (Ollama Local)', mode: 'LOCAL' },
  { id: 'llama3.2:3b', label: 'Llama 3.2 3B (Ollama Local Leve)', mode: 'LOCAL' },
  { id: 'deepseek-r1:8b', label: 'DeepSeek R1 8B (Ollama Local)', mode: 'LOCAL' },
];

interface ModelArenaPanelProps {
  installedLocalModels?: Array<{ name: string }>;
}

export const ModelArenaPanel: React.FC<ModelArenaPanelProps> = ({ installedLocalModels = [] }) => {
  const options: ArenaModelOption[] = React.useMemo(() => {
    const map = new Map<string, ArenaModelOption>();
    DEFAULT_ARENA_OPTIONS.forEach((opt) => map.set(opt.id, opt));
    installedLocalModels.forEach((m) => {
      if (m?.name && !map.has(m.name)) {
        map.set(m.name, { id: m.name, label: `${m.name} (Ollama Local)`, mode: 'LOCAL' });
      }
    });
    return Array.from(map.values());
  }, [installedLocalModels]);

  const [prompt, setPrompt] = useState(
    'Resuma em 3 tópicos práticos como proteger um notebook pessoal contra golpes de phishing no dia a dia.'
  );
  const [modelA, setModelA] = useState('gemini-4-hydrogen');
  const [modelB, setModelB] = useState('gemini-3.1-flash-lite');
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ left: ArenaSideResult; right: ArenaSideResult } | null>(null);
  const [winner, setWinner] = useState<'left' | 'right' | null>(null);
  const [openReasoning, setOpenReasoning] = useState<{ left: boolean; right: boolean }>({
    left: false,
    right: false,
  });

  const handleRunArena = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || running) return;
    setRunning(true);
    setWinner(null);
    setOpenReasoning({ left: false, right: false });
    try {
      const res = await runModelArenaComparison({
        prompt: prompt.trim(),
        model_a: modelA,
        model_b: modelB,
        enable_web_search: enableWebSearch,
      });
      setResult(res);
    } catch (err: any) {
      notify(err.message || 'Falha ao executar comparação na Arena.', 'error');
    } finally {
      setRunning(false);
    }
  };

  const renderSideCard = (side: 'left' | 'right', data: ArenaSideResult, label: string) => {
    const isWinner = winner === side;
    const reasoningOpen = openReasoning[side];
    return (
      <article
        className="jarvis-settings-subcard"
        style={{
          gap: '12px',
          borderColor: isWinner ? 'var(--accent-color)' : 'var(--border-color)',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Cpu size={14} color="var(--accent-light)" />
              <strong style={{ fontSize: '0.86rem', color: 'var(--text-primary)' }}>{label}</strong>
            </div>
            <div className="jarvis-tabular" style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
              <span style={{ color: data.execution_mode === 'LOCAL' ? '#4ade80' : '#60a5fa', fontWeight: 700 }}>
                {data.execution_mode}
              </span>{' '}
              · <span style={{ fontFamily: 'var(--font-mono)' }}>{data.model_used}</span> · {data.latency_ms} ms
            </div>
          </div>

          {data.routing_note && (
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{data.routing_note}</div>
          )}

          {data.reasoning && (
            <div>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setOpenReasoning((prev) => ({ ...prev, [side]: !prev[side] }))}
              >
                {reasoningOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>Ver raciocínio</span>
              </button>
              {reasoningOpen && (
                <div
                  style={{
                    marginTop: '6px',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '0.76rem',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.5,
                  }}
                >
                  {data.reasoning}
                </div>
              )}
            </div>
          )}

          <div style={{ fontSize: '0.86rem', lineHeight: 1.6, color: 'var(--text-primary)' }}>
            {data.error ? (
              <div className="jarvis-callout jarvis-callout--danger">{data.error}</div>
            ) : (
              <MarkdownMessage content={data.text} />
            )}
          </div>

          {Array.isArray(data.sources) && data.sources.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '6px', borderTop: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Fontes consultadas na web
              </span>
              {data.sources.map((src, idx) => (
                <a
                  key={`${src.url}-${idx}`}
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '0.75rem',
                    color: 'var(--accent-light)',
                    textDecoration: 'none',
                  }}
                >
                  <ExternalLink size={11} />
                  <span>{src.title || src.url}</span>
                </a>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className={`btn btn-sm btn-block ${isWinner ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => {
            setWinner(side);
            notify(`Voto registrado para ${data.model_used}.`, 'success');
          }}
        >
          <Trophy size={13} />
          <span>{isWinner ? 'Vencedor desta rodada' : 'Escolher esta resposta'}</span>
        </button>
      </article>
    );
  };

  return (
    <section className="jarvis-settings-card">
      <div className="jarvis-settings-card-header">
        <div>
          <h3 className="jarvis-settings-card-title">Modo Arena (Comparação A/B Lado a Lado)</h3>
          <p className="jarvis-settings-card-desc">
            Envie a mesma pergunta para dois modelos simultaneamente e compare velocidade, clareza e raciocínio.
          </p>
        </div>
      </div>

      <form onSubmit={handleRunArena} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span className="user-profile-field-label">Modelo A (Esquerda)</span>
            <select
              className="jarvis-input"
              value={modelA}
              onChange={(e) => setModelA(e.target.value)}
            >
              {options.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span className="user-profile-field-label">Modelo B (Direita)</span>
            <select
              className="jarvis-input"
              value={modelB}
              onChange={(e) => setModelB(e.target.value)}
            >
              {options.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span className="user-profile-field-label">Prompt de teste</span>
          <textarea
            className="jarvis-input"
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Digite a pergunta ou desafio para comparar os dois modelos..."
          />
        </label>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={enableWebSearch}
              onChange={(e) => setEnableWebSearch(e.target.checked)}
            />
            <Globe size={14} color={enableWebSearch ? '#60a5fa' : 'var(--text-muted)'} />
            <span>Ativar Pesquisa Web ao vivo nos modelos Gemini</span>
          </label>

          <button type="submit" className="btn btn-primary btn-sm" disabled={running || !prompt.trim()}>
            {running ? <Loader2 size={14} className="spin" /> : <Swords size={14} />}
            <span>{running ? 'Comparando modelos…' : 'Comparar lado a lado'}</span>
          </button>
        </div>
      </form>

      {result && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
            gap: '14px',
            marginTop: '6px',
          }}
        >
          {renderSideCard('left', result.left, 'Modelo A')}
          {renderSideCard('right', result.right, 'Modelo B')}
        </div>
      )}
    </section>
  );
};
