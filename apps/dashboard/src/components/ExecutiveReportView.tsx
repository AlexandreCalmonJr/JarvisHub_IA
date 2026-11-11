import React, { useState, useEffect } from 'react';
import { API_BASE } from '../services/api/client';
import {
  fetchWorkspaceProjects,
  fetchProductivityRoi,
  fetchProjectTechDebt,
  fetchExecutiveReport,
} from '../api';
import {
  DollarSign,
  Clock,
  Zap,
  ShieldCheck,
  FileText,
  Copy,
  Check,
  Printer,
} from 'lucide-react';

export const ExecutiveReportView: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  // ROI global (administrativo)
  const [roiData, setRoiData] = useState<any | null>(null);
  const [roiLoading, setRoiLoading] = useState(false);
  const [roiError, setRoiError] = useState<string | null>(null);

  // Dívida Técnica do projeto selecionado
  const [debtData, setDebtData] = useState<any | null>(null);
  const [debtLoading, setDebtLoading] = useState(false);
  const [debtError, setDebtError] = useState<string | null>(null);

  // Relatório Executivo Consolidado
  const [reportMarkdown, setReportMarkdown] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [copiedReport, setCopiedReport] = useState(false);

  const loadInitial = async (includeGlobalRoi = isAdmin) => {
    setProjectsLoading(true);
    setRoiLoading(true);
    const [projectResult, roiResult] = await Promise.allSettled([
      fetchWorkspaceProjects(),
      includeGlobalRoi ? fetchProductivityRoi() : Promise.resolve(null),
    ]);
    if (projectResult.status === 'fulfilled') {
      const projs = projectResult.value || [];
      setProjects(projs);
      setProjectsError(null);
      if (projs.length > 0 && !projs.some((project) => project.id === selectedProjectId)) setSelectedProjectId(projs[0].id);
      else if (projs.length === 0) setSelectedProjectId('');
    } else {
      setProjects([]);
      setProjectsError((projectResult.reason as Error)?.message || 'Falha ao carregar projetos.');
    }
    if (roiResult.status === 'fulfilled' && roiResult.value) {
      setRoiData(roiResult.value);
      setRoiError(null);
    } else if (includeGlobalRoi && roiResult.status === 'rejected') {
      setRoiData(null);
      setRoiError((roiResult.reason as Error)?.message || 'Métricas globais indisponíveis. Apenas administradores podem consultá-las.');
    }
    setProjectsLoading(false);
    setRoiLoading(false);
  };

  const loadProjectDebt = async (projId: string, isCancelled: () => boolean = () => false) => {
    if (!projId) {
      if (!isCancelled()) setDebtData(null);
      return;
    }
    if (!isCancelled()) {
      setDebtLoading(true);
      setDebtError(null);
      setDebtData(null);
    }
    try {
      const debt = await fetchProjectTechDebt(projId);
      if (!isCancelled()) setDebtData(debt);
    } catch (e: any) {
      if (!isCancelled()) setDebtError(e?.message || 'Falha ao analisar dívida técnica do projeto.');
    } finally {
      if (!isCancelled()) setDebtLoading(false);
    }
  };

  const generateReport = async (projId?: string, isCancelled: () => boolean = () => false) => {
    if (!isCancelled()) {
      setReportLoading(true);
      setReportError(null);
      setReportMarkdown(null);
    }
    try {
      const rep = await fetchExecutiveReport(projId);
      if (!isCancelled()) setReportMarkdown(rep.markdown || '');
    } catch (e: any) {
      if (!isCancelled()) setReportError(e?.message || 'Falha ao gerar relatório executivo.');
    } finally {
      if (!isCancelled()) setReportLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((principal) => {
        if (cancelled) return;
        const admin = principal?.kind === 'human' && principal?.role === 'admin';
        setIsAdmin(admin);
        setRoleLoaded(true);
        void loadInitial(admin);
      })
      .catch(() => {
        if (cancelled) return;
        setIsAdmin(false);
        setRoleLoaded(true);
        void loadInitial(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (selectedProjectId) {
      void loadProjectDebt(selectedProjectId, () => cancelled);
      void generateReport(selectedProjectId, () => cancelled);
    } else {
      setDebtData(null);
      setReportMarkdown(null);
    }
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {!roleLoaded && <div role="status" className="glass-panel" style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>A verificar permissões dos relatórios…</div>}
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2
            className="claude-serif-title"
            style={{
              fontSize: '1.6rem',
              fontWeight: 500,
              margin: 0,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
            }}
          >
            Inteligência de Engenharia & Métricas
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
            Indicadores executivos de ROI, economia financeira via inferência local e auditoria de dívida técnica.
          </p>
        </div>

        {/* Seletor de Projeto */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.04em' }}>
            PROJETO:
          </label>
          <select
            disabled={projectsLoading || projects.length === 0}
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '9999px',
              padding: '6px 14px',
              fontSize: '0.82rem',
              outline: 'none',
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {projectsError && <div role="alert" style={{ color: 'var(--danger-color)', fontSize: '0.84rem' }}>{projectsError}</div>}
      {projectsLoading && <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Carregando projetos...</div>}
      {!projectsLoading && !projectsError && projects.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>Nenhum projeto disponível nesta conta.</div>}

      {/* Grid de KPIs de ROI e Produtividade */}
      {isAdmin ? <>
      {roiLoading && <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>A carregar métricas globais...</div>}
      {roiError && <div role="alert" style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Métricas globais: {roiError}</div>}
      {roiData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px' }}>
          <div className="glass-card" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
              <span style={{ fontSize: '0.76rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Economia Estimada em Nuvem</span>
              <DollarSign size={16} color="#34d399" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 600, color: '#34d399', fontFamily: 'var(--font-mono)' }}>
              US$ {roiData.cost_saved_usd}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Aprox. R$ {roiData.cost_saved_brl}; estimativa com 4.500 tokens por tarefa
            </div>
          </div>

          <div className="glass-card" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
              <span style={{ fontSize: '0.76rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tempo Potencialmente Poupado</span>
              <Clock size={16} color="var(--accent-color)" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 600, color: 'var(--accent-color)', fontFamily: 'var(--font-mono)' }}>
              {roiData.engineering_hours_saved}h
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Estimativa de 0,42h por tarefa concluída
            </div>
          </div>

          <div className="glass-card" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
              <span style={{ fontSize: '0.76rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tarefas Concluídas</span>
              <Zap size={16} color="#fbbf24" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 600, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
              {roiData.total_tasks_completed}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Tarefas registradas no ambiente
            </div>
          </div>

          <div className="glass-card" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
              <span style={{ fontSize: '0.76rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Política de Dados</span>
              <ShieldCheck size={16} color="#10b981" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 600, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
              Privado por conta
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Isolamento aplicado por proprietário nas áreas homologadas
            </div>
          </div>
        </div>
      )}
      </> : (
        <div className="glass-panel" style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          Os indicadores globais de ROI e produtividade estão reservados a administradores. Os relatórios e a análise técnica do projeto selecionado continuam disponíveis dentro da sua conta.
        </div>
      )}

      {debtLoading && <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Analisando dívida técnica do projeto...</div>}
      {debtError && <div role="alert" style={{ color: '#f87171', fontSize: '0.84rem' }}>{debtError}</div>}

      {/* Dívida Técnica do Projeto */}
      {debtData && (
        <div className="glass-card" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 className="claude-serif-title" style={{ fontSize: '1.2rem', fontWeight: 500, margin: 0 }}>
                Saúde Arquitetural & Dívida Técnica
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '4px' }}>
                Total de Linhas: <b>{debtData.metrics.total_lines_of_code}</b> • Arquivos: <b>{debtData.metrics.total_files}</b> • Densidade de Comentários: <b>{debtData.metrics.comment_ratio_percent}%</b>
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className={`badge ${debtData.score >= 80 ? 'badge-success' : debtData.score >= 60 ? 'badge-warning' : 'badge-danger'}`} style={{ fontSize: '0.85rem' }}>
                Nota: {debtData.grade} ({debtData.score}/100)
              </span>
            </div>
          </div>

          {/* Recomendações Estratégicas */}
          {debtData.recommendations && debtData.recommendations.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {debtData.recommendations.map((rec: string, idx: number) => (
                <div key={idx} style={{ padding: '10px 14px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                  💡 {rec}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {reportLoading && <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Gerando relatório executivo...</div>}
      {reportError && <div role="alert" style={{ color: '#f87171', fontSize: '0.84rem' }}>{reportError}</div>}

      {/* Relatório Executivo Consolidado */}
      <div className="glass-card" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={20} color="var(--accent-color)" />
            <h3 className="claude-serif-title" style={{ fontSize: '1.2rem', fontWeight: 500, margin: 0 }}>
              Relatório Executivo Consolidado
            </h3>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => window.print()}
              className="btn btn-ghost"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
            >
              <Printer size={14} />
              Imprimir / PDF
            </button>
            {reportMarkdown && (
              <button
                onClick={() => {
                  if (!navigator.clipboard?.writeText) return;
                  navigator.clipboard.writeText(reportMarkdown)
                    .then(() => {
                      setCopiedReport(true);
                      window.setTimeout(() => setCopiedReport(false), 2000);
                    })
                    .catch(() => setReportError('Não foi possível copiar o relatório.'));
                }}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', borderRadius: '8px' }}
              >
                {copiedReport ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
                Copiar Markdown
              </button>
            )}
          </div>
        </div>

        {!reportLoading && !reportError && !reportMarkdown && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>Selecione um projeto para gerar o relatório.</div>
        )}
        {reportMarkdown && (
          <pre
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              padding: '16px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              overflowX: 'auto',
              maxHeight: '350px',
              margin: 0,
              whiteSpace: 'pre-wrap',
            }}
          >
            {reportMarkdown}
          </pre>
        )}
      </div>
    </div>
  );
};
