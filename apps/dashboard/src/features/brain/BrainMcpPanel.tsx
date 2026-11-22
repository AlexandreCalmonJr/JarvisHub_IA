import React, { useEffect, useState } from 'react';
import {
  Loader2,
  Play,
  Plug,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Trash2,
} from 'lucide-react';
import { notify } from '../../shared/common/Toast';
import {
  addMcpServerApi,
  deleteMcpServerApi,
  discoverMcpToolsApi,
  fetchMcpServersApi,
  invokeMcpToolApi,
  toggleMcpApprovalApi,
  type McpServerItem,
  type McpToolLogItem,
} from '../../services/api/brainServer';

interface BrainMcpPanelProps {
  onMutated?: () => void;
}

export const BrainMcpPanel: React.FC<BrainMcpPanelProps> = ({ onMutated }) => {
  const [servers, setServers] = useState<McpServerItem[]>([]);
  const [logs, setLogs] = useState<McpToolLogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [invokingKey, setInvokingKey] = useState<string | null>(null);
  const [lastOutput, setLastOutput] = useState<{ title: string; json: string } | null>(null);

  // Formulário Novo Servidor MCP
  const [name, setName] = useState<string>('');
  const [transport, setTransport] = useState<'stdio' | 'http'>('http');
  const [endpoint, setEndpoint] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [adding, setAdding] = useState<boolean>(false);

  const loadMcp = async () => {
    setLoading(true);
    try {
      const data = await fetchMcpServersApi();
      setServers(data.servers);
      setLogs(data.logs);
    } catch (err: any) {
      notify(err?.message || 'Não foi possível carregar os servidores MCP.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMcp();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2 || !endpoint.trim()) {
      notify('Preencha nome e endpoint do servidor MCP.', 'warning');
      return;
    }
    setAdding(true);
    try {
      const res = await addMcpServerApi({
        name: name.trim(),
        transport,
        endpoint: endpoint.trim(),
        description: description.trim() || undefined,
      });
      setServers(res.servers);
      setName('');
      setEndpoint('');
      setDescription('');
      notify(`Servidor MCP "${res.created.name}" registrado. Aprove-o para habilitar invocações.`, 'success');
      onMutated?.();
    } catch (err: any) {
      notify(err?.message || 'Falha ao cadastrar servidor MCP.', 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleToggleApproval = async (server: McpServerItem) => {
    setBusyId(server.id);
    try {
      const res = await toggleMcpApprovalApi(server.id, !server.is_approved);
      setServers(res.servers);
      notify(
        `Servidor MCP "${server.name}" ${res.server.is_approved ? 'aprovado' : 'bloqueado'}.`,
        'info'
      );
      onMutated?.();
    } catch (err: any) {
      notify(err?.message || 'Falha ao alterar aprovação.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDiscover = async (server: McpServerItem) => {
    setBusyId(server.id);
    try {
      const res = await discoverMcpToolsApi(server.id);
      setServers(res.servers);
      notify(res.detail, 'success');
    } catch (err: any) {
      notify(err?.message || 'Falha ao descobrir ferramentas MCP.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleInvoke = async (server: McpServerItem, toolName: string, inputHint: string) => {
    const key = `${server.id}:${toolName}`;
    setInvokingKey(key);
    try {
      let parsedArgs: Record<string, unknown> = {};
      try {
        const candidate = JSON.parse(inputHint || '{}');
        if (candidate && typeof candidate === 'object') parsedArgs = candidate;
      } catch {
        parsedArgs = {};
      }
      const res = await invokeMcpToolApi(server.id, toolName, parsedArgs);
      setLogs(res.logs);
      setLastOutput({
        title: `${server.name} · ${toolName}`,
        json: JSON.stringify(res.output, null, 2),
      });
      notify(res.summary, 'success');
      onMutated?.();
    } catch (err: any) {
      notify(err?.message || 'Falha ao invocar ferramenta MCP.', 'error');
      await loadMcp();
    } finally {
      setInvokingKey(null);
    }
  };

  const handleDelete = async (server: McpServerItem) => {
    setBusyId(server.id);
    try {
      const res = await deleteMcpServerApi(server.id);
      setServers(res.servers);
      setLogs(res.logs);
      notify(`Servidor MCP "${server.name}" removido.`, 'info');
      onMutated?.();
    } catch (err: any) {
      notify(err?.message || 'Não foi possível remover este servidor MCP.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="brain-poly-loading">
        <Loader2 size={16} className="spin" color="var(--accent-color)" />
        <span>Carregando catálogo e logs do Gateway MCP...</span>
      </div>
    );
  }

  return (
    <div className="brain-poly-stack">
      <section className="brain-poly-card">
        <div className="brain-poly-header">
          <div>
            <h2 className="brain-poly-title">
              <Plug size={16} color="var(--accent-color)" />
              <span>Gateway MCP Nativo (Model Context Protocol)</span>
            </h2>
            <p className="brain-poly-subtitle mono tabular-nums">
              {servers.length} servidor(es) registrados · {servers.filter((s) => s.is_approved).length} aprovado(s) · {logs.length} invocação(ões) auditadas
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadMcp()}
            className="btn btn-secondary btn-sm"
          >
            <RefreshCw size={14} />
            <span>Atualizar</span>
          </button>
        </div>
      </section>

      {/* Lista de Servidores MCP + Execução Auditada */}
      <div className="brain-poly-grid-12">
        <div className="brain-poly-stack">
          {servers.map((server) => (
            <section key={server.id} className="brain-poly-card">
              <div className="brain-poly-header" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div className="brain-poly-meta" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.88rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {server.name}
                    </h3>
                    <span aria-hidden="true">·</span>
                    <span className="mono" style={{ fontSize: '0.73rem' }}>{server.transport.toUpperCase()}</span>
                    <span aria-hidden="true">·</span>
                    <span className={`mono ${server.is_approved ? 'brain-poly-text-ok' : 'brain-poly-text-warn'}`} style={{ fontSize: '0.73rem' }}>
                      {server.is_approved ? 'Aprovado' : 'Aguardando aprovação'}
                    </span>
                  </div>
                  <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {server.endpoint}
                  </div>
                  <p className="brain-poly-subtitle" style={{ margin: 0 }}>{server.description}</p>
                </div>

                <div className="brain-poly-actions">
                  <button
                    type="button"
                    disabled={busyId === server.id}
                    onClick={() => void handleDiscover(server)}
                    className="btn btn-secondary btn-xs"
                  >
                    Descobrir Ferramentas
                  </button>
                  <button
                    type="button"
                    disabled={busyId === server.id}
                    onClick={() => void handleToggleApproval(server)}
                    className={server.is_approved ? 'btn btn-secondary btn-xs' : 'btn btn-primary btn-xs'}
                  >
                    {server.is_approved ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                    <span>{server.is_approved ? 'Bloquear' : 'Aprovar'}</span>
                  </button>
                  {!server.is_builtin && (
                    <button
                      type="button"
                      aria-label={`Remover servidor MCP ${server.name}`}
                      disabled={busyId === server.id}
                      onClick={() => void handleDelete(server)}
                      className="btn btn-danger-ghost btn-icon-sm"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {server.tools.length === 0 ? (
                <p className="brain-poly-subtitle" style={{ paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
                  Nenhuma ferramenta descoberta ainda. Clique em "Descobrir Ferramentas".
                </p>
              ) : (
                <div className="brain-poly-list">
                  {server.tools.map((tool) => {
                    const key = `${server.id}:${tool.name}`;
                    const running = invokingKey === key;
                    return (
                      <div key={tool.name} className="brain-poly-list-row brain-poly-list-row--center">
                        <div style={{ minWidth: 0 }}>
                          <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span>{tool.name}</span>
                            {tool.requires_approval && (
                              <span className="brain-poly-text-warn" style={{ fontSize: '0.72rem' }}>· ação sensível</span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {tool.description}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={running}
                          onClick={() => void handleInvoke(server, tool.name, tool.input_hint)}
                          className="btn btn-secondary btn-xs"
                        >
                          {running ? <Loader2 size={12} className="spin" /> : <Play size={12} color="var(--accent-light)" />}
                          <span>Executar</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>

        {/* Coluna Direita: Novo Servidor MCP + Retorno & Auditoria */}
        <div className="brain-poly-stack">
          <section className="brain-poly-card">
            <h3 className="brain-poly-title" style={{ fontSize: '0.94rem' }}>
              Registrar Novo Servidor MCP
            </h3>
            <form onSubmit={handleRegister} className="brain-poly-stack" style={{ gap: '12px' }}>
              <div className="brain-poly-field">
                <label htmlFor="mcp-name-input" className="brain-poly-label">
                  Nome do Servidor
                </label>
                <input
                  id="mcp-name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Go Crawler Gateway ou Filesystem MCP"
                  className="jarvis-input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '130px minmax(0, 1fr)', gap: '10px' }}>
                <div className="brain-poly-field">
                  <label htmlFor="mcp-transport-select" className="brain-poly-label">
                    Transporte
                  </label>
                  <select
                    id="mcp-transport-select"
                    value={transport}
                    onChange={(e) => setTransport(e.target.value as 'stdio' | 'http')}
                    className="jarvis-select"
                  >
                    <option value="http">HTTP / HTTPS</option>
                    <option value="stdio">STDIO Local</option>
                  </select>
                </div>
                <div className="brain-poly-field">
                  <label htmlFor="mcp-endpoint-input" className="brain-poly-label">
                    Endpoint ou Identificador
                  </label>
                  <input
                    id="mcp-endpoint-input"
                    type="text"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    placeholder={transport === 'http' ? 'https://meu-mcp.ts.net' : 'mcp-server-filesystem'}
                    className="jarvis-input mono"
                  />
                </div>
              </div>

              <div className="brain-poly-field">
                <label htmlFor="mcp-desc-input" className="brain-poly-label">
                  Descrição (opcional)
                </label>
                <input
                  id="mcp-desc-input"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Escopo das ferramentas expostas por este servidor..."
                  className="jarvis-input"
                />
              </div>

              <button
                type="submit"
                disabled={adding}
                className="btn btn-primary btn-block"
              >
                {adding ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                <span>Registrar Servidor MCP</span>
              </button>
            </form>
          </section>

          {lastOutput && (
            <section className="brain-poly-card">
              <div className="mono" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-light)' }}>
                {lastOutput.title}
              </div>
              <pre className="brain-poly-pre">{lastOutput.json}</pre>
            </section>
          )}

          <section className="brain-poly-card">
            <h3 className="brain-poly-title" style={{ fontSize: '0.94rem' }}>
              Trilha de Auditoria MCP
            </h3>
            {logs.length === 0 ? (
              <div className="brain-poly-empty">
                Nenhuma ferramenta MCP foi executada ainda. Clique em "Executar" em qualquer servidor aprovado.
              </div>
            ) : (
              <div className="brain-poly-list" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                {logs.slice(0, 12).map((log) => (
                  <div key={log.id} className="brain-poly-list-row" style={{ flexDirection: 'column', gap: '4px' }}>
                    <div className="brain-poly-hit__top" style={{ width: '100%' }}>
                      <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.server_name} · {log.tool_name}
                      </span>
                      <span
                        className={
                          log.status === 'success'
                            ? 'brain-poly-text-ok'
                            : log.status === 'blocked'
                            ? 'brain-poly-text-warn'
                            : 'brain-poly-text-danger'
                        }
                        style={{ flexShrink: 0 }}
                      >
                        {log.status} · {log.duration_ms} ms
                      </span>
                    </div>
                    <p className="brain-poly-subtitle" style={{ margin: 0, fontSize: '0.75rem' }}>
                      {log.output_summary}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
