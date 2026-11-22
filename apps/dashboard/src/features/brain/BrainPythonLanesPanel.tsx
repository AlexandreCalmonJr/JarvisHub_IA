import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Cpu,
  FolderPlus,
  Layers,
  Loader2,
  Play,
  RefreshCw,
} from 'lucide-react';
import { notify } from '../../shared/common/Toast';
import {
  activateWorkspaceApi,
  createWorkspaceApi,
  fetchPythonWorkerStatusApi,
  fetchSessionLanesApi,
  fetchWorkspacesApi,
  triggerPythonExtractFactsApi,
  triggerPythonReindexApi,
  type AgentWorkspaceItem,
  type PythonWorkerStatusResponse,
  type SessionLaneJobItem,
  type WorkspaceIndexStats,
} from '../../services/api/brainServer';

interface BrainPythonLanesPanelProps {
  onWorkspaceChanged?: () => void;
}

export const BrainPythonLanesPanel: React.FC<BrainPythonLanesPanelProps> = ({
  onWorkspaceChanged,
}) => {
  const [pyStatus, setPyStatus] = useState<PythonWorkerStatusResponse | null>(null);
  const [workspaces, setWorkspaces] = useState<AgentWorkspaceItem[]>([]);
  const [activeSlug, setActiveSlug] = useState<string>('default');
  const [activeStats, setActiveStats] = useState<WorkspaceIndexStats | null>(null);
  const [laneJobs, setLaneJobs] = useState<SessionLaneJobItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [testingPy, setTestingPy] = useState<boolean>(false);
  const [reindexing, setReindexing] = useState<boolean>(false);
  const [extracting, setExtracting] = useState<boolean>(false);
  const [transcriptInput, setTranscriptInput] = useState<string>(
    'Eu prefiro receber relatórios resumidos em português do Brasil pela manhã. O servidor principal roda SQLite WAL na porta 3000 com Worker Python 3.11 e gateway Go na porta 8080.'
  );
  const [lastExtractedCount, setLastExtractedCount] = useState<number | null>(null);

  // Novo Perfil Isolado
  const [newWsName, setNewWsName] = useState<string>('');
  const [newWsDesc, setNewWsDesc] = useState<string>('');
  const [creatingWs, setCreatingWs] = useState<boolean>(false);
  const [switchingSlug, setSwitchingSlug] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [statusData, wsData, lanesData] = await Promise.all([
        fetchPythonWorkerStatusApi(),
        fetchWorkspacesApi(),
        fetchSessionLanesApi(),
      ]);
      setPyStatus(statusData);
      setWorkspaces(wsData.workspaces);
      setActiveSlug(wsData.activeSlug);
      setActiveStats(wsData.active_stats);
      setLaneJobs(lanesData.jobs);
    } catch (err: any) {
      notify(err?.message || 'Falha ao carregar diagnóstico do Worker Python e filas.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const handlePingPython = async () => {
    setTestingPy(true);
    try {
      const statusData = await fetchPythonWorkerStatusApi();
      setPyStatus(statusData);
      notify(
        `Worker Python ${statusData.worker.python_version} online (SQLite ${statusData.worker.sqlite_version} · FTS5 ativo · ${statusData.worker.elapsed_ms ?? 1} ms).`,
        'success'
      );
    } catch (err: any) {
      notify(err?.message || 'Falha ao testar Worker Python.', 'error');
    } finally {
      setTestingPy(false);
    }
  };

  const handleReindex = async () => {
    setReindexing(true);
    try {
      const res = await triggerPythonReindexApi();
      setActiveStats(res.index_stats);
      notify(
        `Reindexação concluída: ${res.chunks_reindexed} chunks (${res.markdown_files} Markdown + ${res.entries_reindexed} fatos).`,
        'success'
      );
      await loadAll();
      onWorkspaceChanged?.();
    } catch (err: any) {
      notify(err?.message || 'Erro ao reindexar workspace no Worker Python.', 'error');
    } finally {
      setReindexing(false);
    }
  };

  const handleExtractFacts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (transcriptInput.trim().length < 15) {
      notify('Digite um texto de pelo menos 15 caracteres para extração.', 'warning');
      return;
    }
    setExtracting(true);
    try {
      const res = await triggerPythonExtractFactsApi(transcriptInput, true);
      setLastExtractedCount(res.persisted_count);
      notify(
        `Worker Python extraiu e salvou ${res.persisted_count} fato(s) nas camadas memory/user em ${res.python_elapsed_ms} ms.`,
        'success'
      );
      await loadAll();
      onWorkspaceChanged?.();
    } catch (err: any) {
      notify(err?.message || 'Falha ao extrair fatos.', 'error');
    } finally {
      setExtracting(false);
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newWsName.trim().length < 2) {
      notify('Informe um nome para o novo perfil isolado.', 'warning');
      return;
    }
    setCreatingWs(true);
    try {
      const res = await createWorkspaceApi({
        name: newWsName.trim(),
        description: newWsDesc.trim() || undefined,
      });
      setWorkspaces(res.workspaces);
      setActiveSlug(res.activeSlug);
      setActiveStats(res.active_stats);
      setNewWsName('');
      setNewWsDesc('');
      notify(`Perfil isolado "${res.created.name}" criado com state.db e arquivos Markdown próprios.`, 'success');
      await loadAll();
      onWorkspaceChanged?.();
    } catch (err: any) {
      notify(err?.message || 'Falha ao criar perfil isolado.', 'error');
    } finally {
      setCreatingWs(false);
    }
  };

  const handleActivateWorkspace = async (slug: string, name: string) => {
    setSwitchingSlug(slug);
    try {
      const res = await activateWorkspaceApi(slug);
      setWorkspaces(res.workspaces);
      setActiveSlug(res.activeSlug);
      setActiveStats(res.active_stats);
      notify(`Perfil isolado alternado para "${name}" (${slug}).`, 'success');
      await loadAll();
      onWorkspaceChanged?.();
    } catch (err: any) {
      notify(err?.message || 'Falha ao alternar perfil.', 'error');
    } finally {
      setSwitchingSlug(null);
    }
  };

  if (loading) {
    return (
      <div className="brain-poly-loading">
        <Loader2 size={16} className="spin" color="var(--accent-color)" />
        <span>Inspecionando Worker Python 3.11, perfis isolados e filas seriais...</span>
      </div>
    );
  }

  return (
    <div className="brain-poly-stack">
      {/* Bloco 1: Worker Python 3.11 Ao Vivo */}
      <section className="brain-poly-card">
        <div className="brain-poly-header">
          <div>
            <h2 className="brain-poly-title">
              <Cpu size={16} color="var(--accent-color)" />
              <span>Worker Python 3.11 Local (JSON-RPC via stdio)</span>
            </h2>
            <p className="brain-poly-subtitle mono tabular-nums">
              Python {pyStatus?.worker.python_version || '3.11'}
              {' · '}
              SQLite {pyStatus?.worker.sqlite_version || '3.40'}
              {' · '}
              FTS5 {pyStatus?.worker.fts5_available ? 'ativo' : 'indisponível'}
              {' · '}
              Vetores {pyStatus?.worker.vector_dimensions || 128}d
              {' · '}
              PID {pyStatus?.worker.pid || '—'}
              {' · '}
              {pyStatus?.worker.elapsed_ms ?? 1} ms
            </p>
          </div>

          <div className="brain-poly-actions">
            <button
              type="button"
              disabled={testingPy}
              onClick={() => void handlePingPython()}
              className="btn btn-secondary btn-sm"
            >
              {testingPy ? <Loader2 size={14} className="spin" /> : <Activity size={14} />}
              <span>Testar Worker Python</span>
            </button>
            <button
              type="button"
              disabled={reindexing}
              onClick={() => void handleReindex()}
              className="btn btn-primary btn-sm"
            >
              {reindexing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
              <span>Reindexar Híbrido (Python)</span>
            </button>
          </div>
        </div>

        {/* Métricas do Corpus Analisado pelo Python */}
        <div className="brain-poly-kpi-grid">
          <div className="brain-poly-kpi">
            <div className="brain-poly-kpi__label">Chunks Indexados</div>
            <div className="brain-poly-kpi__value">
              {pyStatus?.analysis.chunks ?? activeStats?.chunks ?? 0}
            </div>
          </div>
          <div className="brain-poly-kpi">
            <div className="brain-poly-kpi__label">Embeddings em BLOB</div>
            <div className="brain-poly-kpi__value">
              {pyStatus?.analysis.embeddings ?? activeStats?.embeddings ?? 0}
            </div>
          </div>
          <div className="brain-poly-kpi">
            <div className="brain-poly-kpi__label">Tokens Estimados</div>
            <div className="brain-poly-kpi__value">
              {pyStatus?.analysis.estimated_tokens ?? 0}
            </div>
          </div>
          <div className="brain-poly-kpi">
            <div className="brain-poly-kpi__label">Tarefas na Fila Serial</div>
            <div className="brain-poly-kpi__value">
              {pyStatus?.lanes.total_executed ?? laneJobs.length}
            </div>
          </div>
        </div>

        {/* Extrator de Fatos Hermes via Python */}
        <form onSubmit={handleExtractFacts} className="brain-poly-divider">
          <div className="brain-poly-header">
            <div>
              <h3 className="brain-poly-title" style={{ fontSize: '0.92rem' }}>
                Extrator de Fatos Duráveis (Pipeline Python estilo Hermes)
              </h3>
              <p className="brain-poly-subtitle">
                Analisa transcrições brutas, classifica fatos em <code style={{ color: 'var(--text-primary)' }}>memory</code> e <code style={{ color: 'var(--text-primary)' }}>user</code> e grava via escritor único.
              </p>
            </div>
            {lastExtractedCount !== null && (
              <span className="mono tabular-nums brain-poly-text-ok" style={{ fontSize: '0.76rem' }}>
                Última execução: +{lastExtractedCount} fato(s) salvo(s)
              </span>
            )}
          </div>

          <label htmlFor="python-extract-textarea" className="sr-only">
            Texto ou transcrição para extrair fatos duráveis
          </label>
          <textarea
            id="python-extract-textarea"
            rows={3}
            value={transcriptInput}
            onChange={(e) => setTranscriptInput(e.target.value)}
            className="jarvis-textarea"
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={extracting}
              className="btn btn-primary btn-sm"
            >
              {extracting ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
              <span>Extrair e Salvar Fatos (Python)</span>
            </button>
          </div>
        </form>
      </section>

      {/* Bloco 2: Perfis Isolados (Hermes Profiles) + Filas Seriais (Session Lanes) */}
      <div className="brain-poly-grid-2">
        {/* Perfis Isolados */}
        <section className="brain-poly-card">
          <div>
            <h3 className="brain-poly-title" style={{ fontSize: '0.94rem' }}>
              <Layers size={15} color="var(--accent-color)" />
              <span>Perfis Isolados por Projeto (SQLite WAL Próprio)</span>
            </h3>
            <p className="brain-poly-subtitle">
              Cada perfil cria seu próprio <code style={{ color: 'var(--text-primary)' }}>state.db</code> e arquivos <code style={{ color: 'var(--text-primary)' }}>SOUL.md / MEMORY.md / USER.md</code> isolados em disco.
            </p>
          </div>

          <div className="brain-poly-list">
            {workspaces.map((ws) => {
              const isActive = ws.slug === activeSlug;
              return (
                <div key={ws.slug} className="brain-poly-list-row brain-poly-list-row--center">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ws.name}</span>
                      {isActive && (
                        <span className="mono brain-poly-text-ok" style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                          <CheckCircle2 size={12} />
                          Ativo
                        </span>
                      )}
                    </div>
                    <div className="mono" style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ws.storage_subdir}/{ws.db_filename}
                    </div>
                  </div>

                  {!isActive && (
                    <button
                      type="button"
                      disabled={switchingSlug === ws.slug}
                      onClick={() => void handleActivateWorkspace(ws.slug, ws.name)}
                      className="btn btn-secondary btn-xs"
                    >
                      {switchingSlug === ws.slug ? 'Ativando...' : 'Ativar Perfil'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <form onSubmit={handleCreateWorkspace} className="brain-poly-divider">
            <div className="brain-poly-label">Novo Perfil Isolado</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
              <div>
                <label htmlFor="ws-name-input" className="sr-only">
                  Nome do perfil isolado
                </label>
                <input
                  id="ws-name-input"
                  type="text"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  placeholder="Ex.: Engenharia ou Pesquisa"
                  className="jarvis-input"
                />
              </div>
              <div>
                <label htmlFor="ws-desc-input" className="sr-only">
                  Descrição do perfil isolado
                </label>
                <input
                  id="ws-desc-input"
                  type="text"
                  value={newWsDesc}
                  onChange={(e) => setNewWsDesc(e.target.value)}
                  placeholder="Descrição opcional..."
                  className="jarvis-input"
                />
              </div>
            </div>
            <div>
              <button
                type="submit"
                disabled={creatingWs}
                className="btn btn-primary btn-sm"
              >
                {creatingWs ? <Loader2 size={14} className="spin" /> : <FolderPlus size={14} />}
                <span>Criar Perfil Isolado</span>
              </button>
            </div>
          </form>
        </section>

        {/* Filas Seriais por Sessão (Escritor Único) */}
        <section className="brain-poly-card">
          <div>
            <h3 className="brain-poly-title" style={{ fontSize: '0.94rem' }}>
              Filas Seriais por Sessão (Escritor Único SQLite)
            </h3>
            <p className="brain-poly-subtitle mono tabular-nums">
              Lanes ativas: {pyStatus?.lanes.active_lanes ?? 0} · Pendentes: {pyStatus?.lanes.pending_jobs ?? 0} · Histórico: {laneJobs.length}
            </p>
          </div>

          {laneJobs.length === 0 ? (
            <div className="brain-poly-empty">
              Nenhuma mutação registrada na fila ainda. Salve um arquivo Markdown ou execute a reindexação Python para ver o escritor único em ação.
            </div>
          ) : (
            <div className="brain-poly-table-wrap">
              <table className="brain-poly-table">
                <thead>
                  <tr>
                    <th>Tarefa</th>
                    <th>Sessão</th>
                    <th>Estado</th>
                    <th style={{ textAlign: 'right' }}>Duração</th>
                  </tr>
                </thead>
                <tbody>
                  {laneJobs.slice(0, 10).map((job) => (
                    <tr key={job.id}>
                      <td>
                        <div className="mono" style={{ color: 'var(--text-primary)', fontSize: '0.75rem' }}>
                          {job.job_type}
                        </div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', maxWidth: '210px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {job.summary}
                        </div>
                      </td>
                      <td className="mono" style={{ fontSize: '0.73rem', whiteSpace: 'nowrap' }}>
                        {job.session_id}
                      </td>
                      <td className="mono" style={{ fontSize: '0.73rem', whiteSpace: 'nowrap' }}>
                        <span className={job.status === 'failed' ? 'brain-poly-text-danger' : 'brain-poly-text-ok'}>
                          {job.status}
                        </span>
                      </td>
                      <td className="mono tabular-nums" style={{ fontSize: '0.73rem', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                        {job.duration_ms} ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
