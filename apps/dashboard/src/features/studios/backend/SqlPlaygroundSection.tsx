import React, { useState, useEffect } from 'react';
import {
  Play,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  Check,
  Copy,
  AlertCircle,
} from 'lucide-react';
import {
  fetchWorkspaceProjects,
  fetchProjectDatabases,
  inspectSqlDatabase,
  executeSqlQuery,
  auditSqlQuery,
} from '../../../api';

export const SqlPlaygroundSection: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [databasesError, setDatabasesError] = useState<string | null>(null);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [databasesLoading, setDatabasesLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projectDatabases, setProjectDatabases] = useState<any[]>([]);
  const [selectedDbPath, setSelectedDbPath] = useState<string>('');
  const [dbInspection, setDbInspection] = useState<any | null>(null);
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM sqlite_master WHERE type="table";');
  const [queryResult, setQueryResult] = useState<any | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<any | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(false);

  const loadProjects = async () => {
    setProjectsLoading(true);
    try {
      const projs = await fetchWorkspaceProjects();
      setProjects(projs || []);
      setProjectsError(null);
      if (projs && projs.length > 0 && !selectedProjectId) {
        setSelectedProjectId(projs[0].id);
      }
    } catch (e: any) {
      setProjectsError(e?.message || 'Falha ao carregar projetos.');
    } finally {
      setProjectsLoading(false);
    }
  };

  const loadDatabasesForProject = async (projId: string) => {
    if (!projId) return;
    setDatabasesLoading(true);
    try {
      const dbs = await fetchProjectDatabases(projId);
      const safeDbs = Array.isArray(dbs) ? dbs : [];
      setProjectDatabases(safeDbs);
      setDatabasesError(null);
      if (safeDbs.length > 0) {
        setSelectedDbPath(safeDbs[0].relative_path || safeDbs[0].absolute_path || '');
      } else {
        setSelectedDbPath('');
        setDbInspection(null);
      }
    } catch (e: any) {
      setDatabasesError(e?.message || 'Falha ao carregar bancos de dados do projeto.');
    } finally {
      setDatabasesLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadDatabasesForProject(selectedProjectId);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (selectedDbPath && selectedProjectId) {
      setInspectionError(null);
      inspectSqlDatabase(selectedDbPath, selectedProjectId)
        .then((res) => setDbInspection(res))
        .catch((err: any) => {
          setDbInspection(null);
          setInspectionError(err?.message || 'Falha ao inspecionar o banco.');
        });
    }
  }, [selectedDbPath, selectedProjectId]);

  const handleExecuteSql = async () => {
    if (!selectedDbPath || !sqlQuery.trim()) return;
    setQueryLoading(true);
    setQueryResult(null);
    try {
      const res = await executeSqlQuery(selectedDbPath, sqlQuery.trim(), selectedProjectId);
      setQueryResult(res);
    } catch (err: any) {
      setQueryResult({ success: false, error: err.message, duration_ms: 0 });
    } finally {
      setQueryLoading(false);
    }
  };

  const handleAuditSql = async () => {
    if (!selectedDbPath || !sqlQuery.trim()) return;
    setAuditLoading(true);
    setAuditResult(null);
    try {
      const res = await auditSqlQuery(selectedDbPath, sqlQuery.trim(), selectedProjectId);
      setAuditResult(res);
    } catch (err: any) {
      setAuditResult({ status: 'error', error: err.message });
    } finally {
      setAuditLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div className="jarvis-callout jarvis-callout--info">
        Modo seguro: consultas SQLite somente leitura. O acesso é limitado aos bancos dentro de projetos da sua conta.
      </div>

      {(projectsError || databasesError || inspectionError) && (
        <div
          role="alert"
          className="jarvis-error-banner"
          style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}
        >
          <AlertCircle size={16} color="var(--danger-color)" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{projectsError || databasesError || inspectionError}</span>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => (selectedProjectId ? loadDatabasesForProject(selectedProjectId) : loadProjects())}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Barra de Seleção de Banco de Dados */}
      <div
        className="jarvis-settings-card"
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div style={{ minWidth: 'min(100%, 200px)' }}>
          <label htmlFor="sql-project-select" className="user-profile-field-label">
            Projeto ativo
          </label>
          <select
            id="sql-project-select"
            disabled={projectsLoading || projects.length === 0}
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="jarvis-select"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.id}
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1, minWidth: 'min(100%, 240px)' }}>
          <label htmlFor="sql-db-control" className="user-profile-field-label">
            Arquivo SQLite
          </label>
          {databasesLoading ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', padding: '8px 0' }}>
              Carregando bancos...
            </div>
          ) : projectDatabases.length > 0 ? (
            <select
              id="sql-db-control"
              value={selectedDbPath}
              onChange={(e) => setSelectedDbPath(e.target.value)}
              className="jarvis-select"
            >
              {projectDatabases.map((db, idx) => (
                <option key={idx} value={db.relative_path}>
                  {db.name} ({db.size_kb} KB) — {db.relative_path}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="sql-db-control"
              type="text"
              placeholder="Ex: app.db ou data/db.sqlite"
              value={selectedDbPath}
              onChange={(e) => setSelectedDbPath(e.target.value)}
              className="jarvis-input"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          )}
        </div>

        {dbInspection && (
          <div
            className="jarvis-tabular"
            style={{
              fontSize: '0.78rem',
              fontWeight: 600,
              color: 'var(--success-color)',
              paddingBottom: '9px',
            }}
          >
            {dbInspection.tables_count} tabelas detectadas
          </div>
        )}
      </div>

      {/* Editor e Execução de SQL */}
      <div className="jarvis-settings-card" style={{ gap: '12px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <label
            htmlFor="sql-query-textarea"
            style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}
          >
            Editor de Consultas SQL
          </label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleAuditSql}
              className="btn btn-secondary btn-sm"
              disabled={auditLoading || !selectedDbPath}
            >
              <Sparkles size={14} />
              <span>{auditLoading ? 'Auditando...' : 'Auditar Performance'}</span>
            </button>
            <button
              type="button"
              onClick={handleExecuteSql}
              className="btn btn-primary btn-sm"
              disabled={queryLoading || !selectedDbPath}
            >
              <Play size={14} />
              <span>{queryLoading ? 'Executando...' : 'Executar Consulta'}</span>
            </button>
          </div>
        </div>

        <textarea
          id="sql-query-textarea"
          rows={4}
          value={sqlQuery}
          onChange={(e) => setSqlQuery(e.target.value)}
          placeholder="Digite sua instrução SQL aqui (ex: SELECT * FROM users LIMIT 10;)"
          className="jarvis-textarea"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
        />
      </div>

      {/* Resultado da Auditoria de Performance (EXPLAIN QUERY PLAN) */}
      {auditResult && (
        <div
          className={`jarvis-callout ${
            auditResult.status === 'error' || auditResult.is_table_scan
              ? 'jarvis-callout--danger'
              : auditResult.status === 'skipped'
                ? 'jarvis-callout--info'
                : 'jarvis-callout--success'
          }`}
          style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px 18px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {auditResult.status === 'error' || auditResult.is_table_scan ? (
                <AlertTriangle size={18} color="var(--danger-color)" />
              ) : auditResult.status === 'skipped' ? (
                <Sparkles size={18} color="var(--accent-light)" />
              ) : (
                <CheckCircle size={18} color="var(--success-color)" />
              )}
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  {auditResult.error || auditResult.message || auditResult.verdict || 'Auditoria concluída.'}
                </div>
                {typeof auditResult.score === 'number' && (
                  <div className="jarvis-tabular" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Score de Otimização: <strong>{auditResult.score}/100</strong>
                  </div>
                )}
              </div>
            </div>
            <button type="button" onClick={() => setAuditResult(null)} className="btn btn-ghost btn-xs">
              Fechar
            </button>
          </div>

          {auditResult.suggestions && auditResult.suggestions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {auditResult.suggestions.map((s: any, idx: number) => (
                <div
                  key={idx}
                  className="jarvis-settings-subcard"
                  style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
                >
                  <div style={{ color: 'var(--warning-color)', fontSize: '0.82rem' }}>{s.recommendation}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <code style={{ color: 'var(--accent-light)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                      {s.example_sql}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        if (!navigator.clipboard?.writeText) return;
                        navigator.clipboard
                          .writeText(s.example_sql)
                          .then(() => {
                            setCopiedIndex(true);
                            window.setTimeout(() => setCopiedIndex(false), 2000);
                          })
                          .catch(() => setInspectionError('Não foi possível copiar a sugestão SQL.'));
                      }}
                      className={`btn btn-xs ${copiedIndex ? 'btn-success' : 'btn-secondary'}`}
                    >
                      {copiedIndex ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedIndex ? 'Copiado' : 'Copiar SQL'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tabela de Resultados da Query */}
      {queryResult && (
        <div className="jarvis-settings-card" style={{ gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                {queryResult.success ? 'Resultado da Execução' : 'Erro na Consulta'}
              </span>
              <span className="jarvis-tabular" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                Tempo: <strong>{queryResult.duration_ms} ms</strong>
              </span>
              {queryResult.is_select && (
                <span className="jarvis-tabular" style={{ fontSize: '0.76rem', color: 'var(--accent-light)' }}>
                  · {queryResult.row_count} registros
                </span>
              )}
              {!queryResult.is_select && queryResult.success && (
                <span className="jarvis-tabular" style={{ fontSize: '0.76rem', color: 'var(--success-color)' }}>
                  · {queryResult.affected_rows} linhas afetadas
                </span>
              )}
            </div>
          </div>

          {!queryResult.success && (
            <div role="alert" className="jarvis-error-banner">
              {queryResult.error}
            </div>
          )}

          {queryResult.success &&
            queryResult.is_select &&
            Array.isArray(queryResult.columns) &&
            Array.isArray(queryResult.rows) &&
            queryResult.rows.length > 0 && (
            <div className="jarvis-table-wrap" style={{ maxHeight: '360px', overflowY: 'auto' }}>
              <table className="jarvis-table">
                <thead>
                  <tr>
                    {queryResult.columns.map((col: string, idx: number) => (
                      <th key={idx}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queryResult.rows.map((row: any, rIdx: number) => (
                    <tr key={rIdx}>
                      {queryResult.columns.map((col: string, cIdx: number) => (
                        <td
                          key={cIdx}
                          className={typeof row[col] === 'number' ? 'jarvis-tabular' : undefined}
                          style={{
                            fontFamily: typeof row[col] === 'number' ? 'var(--font-mono)' : 'inherit',
                          }}
                        >
                          {row[col] !== null ? String(row[col]) : <em style={{ opacity: 0.5 }}>NULL</em>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
