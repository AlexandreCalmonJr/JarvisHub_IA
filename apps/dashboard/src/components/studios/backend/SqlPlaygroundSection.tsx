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
      setProjectDatabases(dbs || []);
      setDatabasesError(null);
      if (dbs && dbs.length > 0) {
        setSelectedDbPath(dbs[0].relative_path || dbs[0].absolute_path);
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
      if (!res.success) {
        setQueryResult(res);
      }
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
        Modo seguro: consultas SQLite somente leitura. O acesso é limitado aos bancos dentro de projetos da sua conta.
      </div>
      {(projectsError || databasesError || inspectionError) && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.35)', background: 'rgba(239, 68, 68, 0.08)', color: 'var(--text-primary)' }}>
          <AlertCircle size={16} color="#f87171" />
          <span style={{ fontSize: '0.84rem' }}>{projectsError || databasesError || inspectionError}</span>
          <button className="btn btn-ghost" onClick={() => selectedProjectId ? loadDatabasesForProject(selectedProjectId) : loadProjects()}>Tentar novamente</button>
        </div>
      )}
      {/* Barra de Seleção de Banco de Dados */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
          flexWrap: 'wrap',
          backgroundColor: 'var(--bg-secondary)',
          padding: '16px 20px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            PROJETO ATIVO
          </label>
          <select
            disabled={projectsLoading || projects.length === 0}
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            style={{
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '0.85rem',
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.id}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '220px' }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            ARQUIVO SQLITE
          </label>
          {databasesLoading ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', padding: '8px' }}>Carregando bancos...</div>
          ) : projectDatabases.length > 0 ? (
            <select
              value={selectedDbPath}
              onChange={(e) => setSelectedDbPath(e.target.value)}
              style={{
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '0.85rem',
              }}
            >
              {projectDatabases.map((db, idx) => (
                <option key={idx} value={db.relative_path}>
                  {db.name} ({db.size_kb} KB) — {db.relative_path}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              placeholder="Ex: app.db ou data/db.sqlite"
              value={selectedDbPath}
              onChange={(e) => setSelectedDbPath(e.target.value)}
              style={{
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '0.85rem',
              }}
            />
          )}
        </div>

        {dbInspection && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              alignSelf: 'flex-end',
              paddingBottom: '4px',
            }}
          >
            <span className="badge badge-success">{dbInspection.tables_count} Tabelas</span>
          </div>
        )}
      </div>

      {/* Editor e Execução de SQL */}
      <div
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Editor de Consultas SQL
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleAuditSql}
              className="btn btn-ghost"
              disabled={auditLoading || !selectedDbPath}
              style={{
                color: '#818cf8',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.82rem',
              }}
            >
              <Sparkles size={15} />
              Auditar Performance
            </button>
            <button
              onClick={handleExecuteSql}
              className="btn btn-primary"
              disabled={queryLoading || !selectedDbPath}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.82rem',
              }}
            >
              <Play size={15} />
              Executar Consulta
            </button>
          </div>
        </div>

        <textarea
          rows={4}
          value={sqlQuery}
          onChange={(e) => setSqlQuery(e.target.value)}
          placeholder="Digite sua instrução SQL aqui (ex: SELECT * FROM users LIMIT 10;)"
          style={{
            width: '100%',
            backgroundColor: 'var(--bg-primary)',
            color: '#e2e8f0',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '12px',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Resultado da Auditoria de Performance (EXPLAIN QUERY PLAN) */}
      {auditResult && (
        <div
          style={{
            backgroundColor: auditResult.is_table_scan
              ? 'rgba(239, 68, 68, 0.08)'
              : 'rgba(16, 185, 129, 0.08)',
            border: `1px solid ${
              auditResult.is_table_scan ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'
            }`,
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {auditResult.is_table_scan ? (
                <AlertTriangle size={20} color="#f87171" />
              ) : (
                <CheckCircle size={20} color="#34d399" />
              )}
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{auditResult.verdict}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Score de Otimização: <b>{auditResult.score}/100</b>
                </div>
              </div>
            </div>
            <button
              onClick={() => setAuditResult(null)}
              className="btn btn-ghost"
              style={{ fontSize: '0.75rem' }}
            >
              Fechar
            </button>
          </div>

          {/* Sugestões de Índices */}
          {auditResult.suggestions && auditResult.suggestions.length > 0 && (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {auditResult.suggestions.map((s: any, idx: number) => (
                <div
                  key={idx}
                  style={{
                    padding: '12px',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ color: '#fbbf24' }}>{s.recommendation}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <code style={{ color: '#38bdf8', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {s.example_sql}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(s.example_sql);
                        setCopiedIndex(true);
                        setTimeout(() => setCopiedIndex(false), 2000);
                      }}
                      className="btn btn-ghost"
                      style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                    >
                      {copiedIndex ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                      Copiar SQL
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
        <div
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                {queryResult.success ? 'Resultado da Execução' : 'Erro na Consulta'}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Tempo: <b>{queryResult.duration_ms} ms</b>
              </span>
              {queryResult.is_select && (
                <span className="badge badge-info">{queryResult.row_count} registros</span>
              )}
              {!queryResult.is_select && queryResult.success && (
                <span className="badge badge-success">
                  {queryResult.affected_rows} linhas afetadas
                </span>
              )}
            </div>
          </div>

          {!queryResult.success && (
            <div
              style={{
                padding: '12px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#f87171',
                borderRadius: '8px',
                fontSize: '0.85rem',
              }}
            >
              {queryResult.error}
            </div>
          )}

          {queryResult.success && queryResult.is_select && queryResult.rows.length > 0 && (
            <div style={{ overflowX: 'auto', maxHeight: '350px' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.82rem',
                  textAlign: 'left',
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {queryResult.columns.map((col: string, idx: number) => (
                      <th key={idx} style={{ padding: '10px 14px', fontWeight: 600 }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queryResult.rows.map((row: any, rIdx: number) => (
                    <tr
                      key={rIdx}
                      style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}
                    >
                      {queryResult.columns.map((col: string, cIdx: number) => (
                        <td
                          key={cIdx}
                          style={{
                            padding: '10px 14px',
                            fontFamily:
                              typeof row[col] === 'number' ? 'monospace' : 'inherit',
                          }}
                        >
                          {row[col] !== null ? String(row[col]) : <i style={{ opacity: 0.5 }}>NULL</i>}
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
