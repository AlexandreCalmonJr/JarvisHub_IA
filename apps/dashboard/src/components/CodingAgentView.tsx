import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  FileDiff,
  FolderGit2,
  Play,
  RefreshCw,
  ShieldAlert,
  Square,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import {
  CodingEvent,
  CodingModeInfo,
  CodingToolInfo,
  clearCodingMessages,
  decideCodingApproval,
  fetchCodingMessages,
  fetchCodingTools,
  reloadMcpServers,
  runCodingAgentStream,
} from '../services/api';
import { fetchWorkspaceProjects } from '../services/api';
import { notify } from './common/Toast';

type Mode = 'plan' | 'ask' | 'auto';

interface Entry {
  id: string;
  kind: 'user' | 'assistant' | 'tool' | 'error' | 'info';
  text: string;
  callId?: string;
  name?: string;
  risk?: string;
  success?: boolean;
  denied?: boolean;
  args?: Record<string, unknown>;
  timestamp: string;
}

interface PendingApproval {
  id: string;
  operation: string;
  impact_summary: string;
  affected_resources: string[];
  proposed_diff?: string;
  reversible?: boolean;
}

const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const newSessionId = () => `coding_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const newEntryId = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const RISK_COLORS: Record<string, string> = {
  read: '#34d399',
  write: '#fbbf24',
  exec: '#f87171',
};

export const CodingAgentView: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState<string>(() => localStorage.getItem('jarvis_coding_project') || '');
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem('jarvis_coding_mode') as Mode) || 'ask');
  const [model, setModel] = useState<string>(() => localStorage.getItem('jarvis_coding_model') || '');
  const [decidedBy, setDecidedBy] = useState<string>(
    () => localStorage.getItem('jarvis_coding_user') || 'local_developer'
  );
  const [sessionId, setSessionId] = useState<string>(() => {
    const saved = localStorage.getItem('jarvis_coding_session');
    if (saved) return saved;
    const created = newSessionId();
    localStorage.setItem('jarvis_coding_session', created);
    return created;
  });
  const [tools, setTools] = useState<CodingToolInfo[]>([]);
  const [modes, setModes] = useState<CodingModeInfo[]>([]);
  const [provider, setProvider] = useState<{ name: string; model: string; error?: string } | null>(null);
  const [showTools, setShowTools] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [mcpBusy, setMcpBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    localStorage.setItem('jarvis_coding_session', sessionId);
  }, [sessionId]);
  useEffect(() => {
    localStorage.setItem('jarvis_coding_mode', mode);
  }, [mode]);
  useEffect(() => {
    localStorage.setItem('jarvis_coding_user', decidedBy);
  }, [decidedBy]);
  useEffect(() => {
    if (projectId) localStorage.setItem('jarvis_coding_project', projectId);
  }, [projectId]);
  useEffect(() => {
    if (model) localStorage.setItem('jarvis_coding_model', model);
    else localStorage.removeItem('jarvis_coding_model');
  }, [model]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [entries, pendingApproval, running]);

  useEffect(() => {
    (async () => {
      try {
        const [projectsData, toolsData] = await Promise.all([
          fetchWorkspaceProjects().catch(() => []),
          fetchCodingTools().catch(() => null),
        ]);
        setProjects(projectsData);
        if (!projectId && projectsData.length > 0) {
          setProjectId(projectsData[0].id);
        }
        if (toolsData) {
          setTools(toolsData.tools);
          setModes(toolsData.modes);
          setProvider(toolsData.provider);
        }
      } catch (err: any) {
        setError(err.message || 'Falha ao inicializar o Coding Agent.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const history = await fetchCodingMessages(sessionId);
        const mapped: Entry[] = history
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({
            id: `hist_${m.id}`,
            kind: m.role === 'user' ? 'user' : 'assistant',
            text: m.content || '',
            timestamp: m.created_at?.slice(11, 16) || '',
          }));
        setEntries(mapped);
      } catch {
        // Histórico indisponível não bloqueia a UI.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const currentMode = useMemo(() => modes.find((m) => m.id === mode), [modes, mode]);

  const append = (entry: Omit<Entry, 'id' | 'timestamp'> & { timestamp?: string }) => {
    setEntries((prev) => [
      ...prev,
      { id: newEntryId(), timestamp: entry.timestamp || now(), ...entry },
    ]);
  };

  const handleEvent = (event: CodingEvent) => {
    switch (event.type) {
      case 'start':
        if (typeof event.session_id === 'string') setSessionId(event.session_id);
        if (typeof event.model === 'string' && event.model) setProvider((p) => ({ ...(p || { name: 'llm', model: '' }), model: event.model as string }));
        append({
          kind: 'info',
          text: `Execução iniciada • modo ${(event.mode as string) || mode} • modelo ${(event.model as string) || 'padrão'}`,
        });
        break;
      case 'assistant':
        if (typeof event.content === 'string' && event.content.trim()) {
          append({ kind: 'assistant', text: event.content });
        }
        break;
      case 'tool_call':
        append({
          kind: 'tool',
          text: `Chamando ${event.name as string}...`,
          callId: event.call_id as string,
          name: event.name as string,
          risk: event.risk as string,
          args: (event.arguments as Record<string, unknown>) || {},
          success: undefined,
        });
        break;
      case 'tool_result': {
        const callId = event.call_id as string;
        const output = (event.output as string) || (event.error as string) || '';
        setEntries((prev) =>
          prev.map((entry) =>
            entry.kind === 'tool' && entry.callId === callId
              ? {
                  ...entry,
                  success: Boolean(event.success),
                  denied: Boolean(event.denied),
                  text: output || (event.success ? 'Concluído.' : 'Falhou.'),
                }
              : entry
          )
        );
        break;
      }
      case 'approval_required':
        setPendingApproval({
          id: event.approval_id as string,
          operation: event.operation as string,
          impact_summary: event.impact_summary as string,
          affected_resources: (event.affected_resources as string[]) || [],
          proposed_diff: event.proposed_diff as string | undefined,
          reversible: event.reversible as boolean | undefined,
        });
        break;
      case 'final': {
        const summary = (event.summary as string) || '';
        const changed = (event.changed_files as string[]) || [];
        append({
          kind: 'info',
          text:
            `Concluído em ${Number(event.iterations || 0)} iteração(ões), ` +
            `${Number(event.tool_calls || 0)} ferramenta(s) executada(s)` +
            (changed.length ? ` • arquivos: ${changed.join(', ')}` : '') +
            (summary ? `\n${summary}` : ''),
        });
        setRunning(false);
        break;
      }
      case 'error':
        append({ kind: 'error', text: (event.error as string) || 'Erro desconhecido.' });
        setError((event.error as string) || 'Erro desconhecido.');
        setRunning(false);
        break;
      default:
        break;
    }
  };

  const handleSubmit = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || running) return;
    if (!projectId) {
      notify('Selecione um projeto do workspace antes de executar o agente.', 'warning');
      return;
    }
    setError(null);
    append({ kind: 'user', text: trimmed });
    setPrompt('');
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await runCodingAgentStream(
        {
          prompt: trimmed,
          project_id: projectId,
          session_id: sessionId,
          mode,
          model: model.trim() || undefined,
          include_history: true,
        },
        handleEvent,
        controller.signal
      );
    } catch (err: any) {
      if (err.name === 'AbortError') {
        append({ kind: 'info', text: 'Execução interrompida pelo utilizador.' });
      } else {
        append({ kind: 'error', text: err.message || 'Falha ao executar o agente.' });
        setError(err.message || 'Falha ao executar o agente.');
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
      setPendingApproval(null);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleDecision = async (action: 'approve' | 'reject') => {
    if (!pendingApproval || approvalBusy) return;
    if (!decidedBy.trim()) {
      notify('Informe a identidade do humano autorizador.', 'warning');
      return;
    }
    setApprovalBusy(true);
    try {
      await decideCodingApproval(pendingApproval.id, action, decidedBy.trim(), 'Decidido no Coding Agent');
      append({
        kind: 'info',
        text:
          action === 'approve'
            ? `Operação ${pendingApproval.operation} aprovada por ${decidedBy.trim()}.`
            : `Operação ${pendingApproval.operation} rejeitada por ${decidedBy.trim()}.`,
      });
      setPendingApproval(null);
    } catch (err: any) {
      notify(err.message || 'Falha ao decidir a aprovação.', 'error');
    } finally {
      setApprovalBusy(false);
    }
  };

  const handleNewSession = () => {
    const sid = newSessionId();
    setSessionId(sid);
    setEntries([]);
    setPendingApproval(null);
    setError(null);
    notify('Nova sessão do Coding Agent criada.', 'success');
  };

  const handleClearHistory = async () => {
    try {
      await clearCodingMessages(sessionId);
      setEntries([]);
      notify('Histórico da sessão apagado.', 'success');
    } catch (err: any) {
      notify(err.message || 'Falha ao limpar histórico.', 'error');
    }
  };

  const handleReloadMcp = async () => {
    setMcpBusy(true);
    try {
      const summary = await reloadMcpServers();
      const toolsData = await fetchCodingTools().catch(() => null);
      if (toolsData) {
        setTools(toolsData.tools);
        setModes(toolsData.modes);
        setProvider(toolsData.provider);
      }
      const errors = Object.values(summary.errors || {});
      if (errors.length > 0) {
        notify(
          `MCP: ${summary.tools} ferramenta(s) via ${summary.servers} servidor(es). Falhas: ${errors.join('; ')}`,
          'warning'
        );
      } else {
        notify(
          `MCP recarregado: ${summary.tools} ferramenta(s) via ${summary.servers} servidor(es).`,
          'success'
        );
      }
    } catch (err: any) {
      notify(err.message || 'Falha ao recarregar servidores MCP.', 'error');
    } finally {
      setMcpBusy(false);
    }
  };

  const renderEntry = (entry: Entry) => {
    if (entry.kind === 'user') {
      return (
        <div key={entry.id} style={styles.userRow}>
          <div style={styles.userBubble}>
            <div style={styles.meta}>{entry.timestamp} • Você</div>
            <div style={styles.preWrap}>{entry.text}</div>
          </div>
        </div>
      );
    }
    if (entry.kind === 'assistant') {
      return (
        <div key={entry.id} style={styles.assistantRow}>
          <div style={styles.assistantBubble}>
            <div style={{ ...styles.meta, color: '#a5b4fc' }}>
              {entry.timestamp} • JARVIS Coding Agent
            </div>
            <div style={styles.preWrap}>{entry.text}</div>
          </div>
        </div>
      );
    }
    if (entry.kind === 'tool') {
      const color = entry.denied ? '#f87171' : entry.success === false ? '#f87171' : entry.success ? '#34d399' : '#93c5fd';
      return (
        <div key={entry.id} style={styles.toolCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Terminal size={14} color={color} />
            <strong style={{ fontSize: '0.82rem', color }}>{entry.name}</strong>
            {entry.risk && (
              <span style={{ ...styles.riskBadge, color: RISK_COLORS[entry.risk] || '#94a3b8', borderColor: `${RISK_COLORS[entry.risk] || '#94a3b8'}55` }}>
                {entry.risk}
              </span>
            )}
            {entry.denied && <span style={{ fontSize: '0.72rem', color: '#f87171' }}>negado</span>}
            {entry.success === true && !entry.denied && <Check size={14} color="#34d399" />}
            {entry.success === false && <X size={14} color="#f87171" />}
          </div>
          {entry.args && Object.keys(entry.args).length > 0 && (
            <pre style={styles.pre}>{JSON.stringify(entry.args, null, 2)}</pre>
          )}
          {entry.text && <pre style={styles.pre}>{entry.text}</pre>}
        </div>
      );
    }
    if (entry.kind === 'error') {
      return (
        <div key={entry.id} style={styles.errorCard}>
          <ShieldAlert size={15} color="#f87171" />
          <div style={styles.preWrap}>{entry.text}</div>
        </div>
      );
    }
    return (
      <div key={entry.id} style={styles.infoCard}>
        <Sparkles size={14} color="#818cf8" />
        <div style={{ whiteSpace: 'pre-wrap' }}>{entry.text}</div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h2 className="claude-serif-title" style={{ fontSize: '1.6rem', fontWeight: 500, margin: 0, letterSpacing: '-0.02em' }}>
            Coding Agent (Claude Code / OpenCode)
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', marginTop: '3px', maxWidth: '760px' }}>
            Agente autônomo com leitura, edição, busca e execução de comandos confinados ao projeto selecionado.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={handleNewSession} style={styles.secondaryButton} disabled={running}>
            Nova sessão
          </button>
          <button onClick={handleClearHistory} style={styles.secondaryButton} disabled={running}>
            Limpar histórico
          </button>
        </div>
      </div>

      {/* Configuração */}
      <div style={styles.configCard}>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Projeto</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            style={styles.input}
            disabled={running}
          >
            <option value="">Selecione um projeto...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.id} ({p.project_type || 'projeto'})
              </option>
            ))}
          </select>
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Modo</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            style={styles.input}
            disabled={running}
          >
            {modes.length === 0 && (
              <>
                <option value="plan">Planejar</option>
                <option value="ask">Assistido</option>
                <option value="auto">Automático</option>
              </>
            )}
            {modes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Modelo (opcional)</label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={provider?.model || 'padrão do provedor'}
            style={styles.input}
            disabled={running}
          />
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Autorizador humano</label>
          <input
            value={decidedBy}
            onChange={(e) => setDecidedBy(e.target.value)}
            placeholder="ex: alexandre_lead"
            style={styles.input}
            disabled={running}
          />
        </div>
      </div>

      {/* Descrição do modo / provedor */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
          {currentMode?.label || mode}
        </span>
        <span>{currentMode?.description}</span>
        {provider && (
          <span style={{ marginLeft: 'auto' }}>
            Provedor: <strong style={{ color: '#a5b4fc' }}>{provider.name}</strong> • Modelo:{' '}
            <strong style={{ color: '#a5b4fc' }}>{provider.model}</strong>
            {provider.error ? ` • ${provider.error}` : ''}
          </span>
        )}
      </div>

      {/* Ferramentas */}
      <div style={styles.toolsCard}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setShowTools((v) => !v)}
            style={{ ...styles.ghostButton, flex: 1, justifyContent: 'space-between' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={15} color="#818cf8" />
              Ferramentas disponíveis ({tools.length})
            </span>
            {showTools ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          <button
            onClick={handleReloadMcp}
            disabled={mcpBusy}
            title="Recarregar servidores MCP e redescobrir ferramentas"
            style={{ ...styles.ghostButton, opacity: mcpBusy ? 0.6 : 1 }}
          >
            <RefreshCw size={14} color="#818cf8" className={mcpBusy ? 'spin' : undefined} />
            {mcpBusy ? 'Recarregando...' : 'Recarregar MCP'}
          </button>
        </div>
        {showTools && (
          <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '8px' }}>
            {tools.map((tool) => (
              <div key={tool.name} style={styles.toolItem}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <code style={{ fontSize: '0.78rem', color: '#e0e7ff' }}>{tool.name}</code>
                  <span style={{ ...styles.riskBadge, color: RISK_COLORS[tool.risk] || '#94a3b8', borderColor: `${RISK_COLORS[tool.risk] || '#94a3b8'}55` }}>
                    {tool.risk}
                  </span>
                  {tool.requires_approval && <ShieldAlert size={12} color="#fbbf24" />}
                </div>
                <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
                  {tool.description}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div style={styles.errorCard}>
          <ShieldAlert size={15} color="#f87171" />
          <div>{error}</div>
        </div>
      )}

      {/* Linha do tempo */}
      <div style={styles.timeline}>
        {entries.length === 0 && !running && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '36px 16px' }}>
            <FolderGit2 size={34} color="#334155" style={{ margin: '0 auto 10px' }} />
            <p style={{ fontSize: '0.9rem' }}>
              Selecione um projeto e descreva a tarefa. Exemplos:
            </p>
            <p style={{ fontSize: '0.8rem', marginTop: '6px', color: '#94a3b8' }}>
              “Explique a arquitetura deste projeto” • “Corrija o bug no endpoint de login” •
              “Rode os testes e corrija as falhas”
            </p>
          </div>
        )}
        {entries.map(renderEntry)}
        {running && !pendingApproval && (
          <div style={styles.infoCard}>
            <Bot size={14} color="#818cf8" />
            <div>Agente em execução...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Aprovação pendente */}
      {pendingApproval && (
        <div style={styles.approvalCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>Aprovação necessária</span>
              <h4 style={{ fontSize: '0.98rem', fontWeight: 700, marginTop: '8px' }}>{pendingApproval.impact_summary}</h4>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Operação: <strong style={{ color: '#93c5fd' }}>{pendingApproval.operation}</strong> • ID: #{pendingApproval.id.slice(0, 10)}
                {pendingApproval.reversible === false ? ' • irreversível' : ' • reversível'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <button
                onClick={() => handleDecision('reject')}
                disabled={approvalBusy}
                style={styles.rejectButton}
              >
                <X size={15} /> Recusar
              </button>
              <button
                onClick={() => handleDecision('approve')}
                disabled={approvalBusy}
                style={styles.approveButton}
              >
                <Check size={15} /> Aprovar
              </button>
            </div>
          </div>
          {pendingApproval.affected_resources.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
              {pendingApproval.affected_resources.map((res, i) => (
                <code key={i} style={styles.resourceChip}>{res}</code>
              ))}
            </div>
          )}
          {pendingApproval.proposed_diff && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                <FileDiff size={14} color="#818cf8" /> Diff proposto
              </div>
              <pre style={{ ...styles.pre, maxHeight: '240px', color: '#93c5fd' }}>{pendingApproval.proposed_diff}</pre>
            </div>
          )}
        </div>
      )}

      {/* Entrada */}
      <div style={styles.inputRow}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Descreva a tarefa de código... (Enter para enviar, Shift+Enter para nova linha)"
          rows={3}
          style={styles.textarea}
          disabled={running}
        />
        {running ? (
          <button onClick={handleStop} style={styles.stopButton} title="Interromper execução">
            <Square size={17} />
          </button>
        ) : (
          <button onClick={handleSubmit} style={styles.sendButton} title="Executar agente">
            <Play size={18} />
          </button>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  configCard: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
    gap: '12px',
    padding: '14px 16px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
  },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
  label: { fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' },
  input: {
    padding: '8px 10px',
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: '7px',
    color: 'var(--text-primary)',
    fontSize: '0.82rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  toolsCard: {
    padding: '12px 14px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
  },
  toolItem: {
    padding: '10px 12px',
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
  },
  riskBadge: {
    fontSize: '0.64rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    padding: '1px 6px',
    borderRadius: '999px',
    border: '1px solid',
    letterSpacing: '0.03em',
  },
  timeline: {
    flex: 1,
    minHeight: '220px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '4px 2px',
  },
  userRow: { display: 'flex', justifyContent: 'flex-end' },
  userBubble: {
    maxWidth: '82%',
    padding: '12px 16px',
    backgroundColor: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    borderRadius: '16px 16px 4px 16px',
    fontSize: '0.86rem',
    color: 'var(--text-primary)',
  },
  assistantRow: { display: 'flex', justifyContent: 'flex-start' },
  assistantBubble: {
    maxWidth: '88%',
    padding: '12px 16px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '16px 16px 16px 4px',
    fontSize: '0.86rem',
  },
  meta: { fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: '5px' },
  preWrap: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.55 },
  toolCard: {
    padding: '10px 12px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  pre: {
    margin: 0,
    padding: '9px 10px',
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: '7px',
    fontSize: '0.74rem',
    lineHeight: 1.45,
    color: 'var(--text-primary)',
    overflowX: 'auto',
    maxHeight: '180px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  infoCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: 'rgba(217, 119, 87, 0.08)',
    border: '1px solid rgba(217, 119, 87, 0.25)',
    borderRadius: '8px',
    fontSize: '0.78rem',
    color: 'var(--text-secondary)',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '10px 12px',
    backgroundColor: 'rgba(239, 68, 68, 0.09)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    fontSize: '0.8rem',
    color: '#fca5a5',
  },
  approvalCard: {
    padding: '14px 16px',
    backgroundColor: 'rgba(245, 158, 11, 0.07)',
    border: '1px solid rgba(245, 158, 11, 0.35)',
    borderRadius: '12px',
  },
  resourceChip: {
    padding: '2px 8px',
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: '5px',
    fontSize: '0.72rem',
    color: '#cbd5e1',
  },
  inputRow: { display: 'flex', gap: '10px', alignItems: 'flex-end' },
  textarea: {
    flex: 1,
    padding: '12px 14px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    color: 'var(--text-primary)',
    fontSize: '0.86rem',
    resize: 'vertical',
    minHeight: '68px',
    outline: 'none',
    fontFamily: 'inherit',
  },
  sendButton: {
    width: '46px',
    height: '46px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #d97757 0%, #c86a4b 100%)',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 2px 10px rgba(217, 119, 87, 0.35)',
  },
  stopButton: {
    width: '46px',
    height: '46px',
    borderRadius: '10px',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    color: '#f87171',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  secondaryButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 12px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '0.78rem',
  },
  ghostButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: 0,
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: '0.82rem',
    fontWeight: 600,
  },
  rejectButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '7px 13px',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.35)',
    color: '#f87171',
    borderRadius: '7px',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 600,
  },
  approveButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '7px 13px',
    backgroundColor: 'var(--success-color, #10b981)',
    border: 'none',
    color: '#fff',
    borderRadius: '7px',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 600,
  },
};
