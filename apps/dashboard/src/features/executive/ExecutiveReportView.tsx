import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../services/api/client';
import {
  fetchWorkspaceProjects,
  fetchProductivityRoi,
  fetchProjectTechDebt,
  fetchExecutiveReport,
} from '../../api';
import {
  DollarSign,
  Clock,
  Zap,
  ShieldCheck,
  FileText,
  Copy,
  Check,
  Printer,
  Lightbulb,
} from 'lucide-react';
import { PageHeader } from '../../shared/layout/PageHeader';

export const ExecutiveReportView: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  const [roiData, setRoiData] = useState<any | null>(null);
  const [roiLoading, setRoiLoading] = useState(false);
  const [roiError, setRoiError] = useState<string | null>(null);

  const [debtData, setDebtData] = useState<any | null>(null);
  const [debtLoading, setDebtLoading] = useState(false);
  const [debtError, setDebtError] = useState<string | null>(null);

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
      if (projs.length > 0 && !projs.some((project) => project.id === selectedProjectId)) {
        setSelectedProjectId(projs[0].id);
      } else if (projs.length === 0) {
        setSelectedProjectId('');
      }
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
    <div className="jarvis-page-shell">
      <PageHeader
        title="Inteligência de Engenharia & Métricas"
        subtitle="Indicadores executivos de ROI, economia via inferência local e auditoria de dívida técnica."
        meta={[
          <span key="proj-count" className="jarvis-tabular">
            {projects.length} projeto{projects.length === 1 ? '' : 's'}
          </span>,
          isAdmin ? 'Visão executiva global' : 'Visão da conta',
        ]}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <label htmlFor="exec-report-project" className="user-profile-field-label" style={{ margin: 0 }}>
              Projeto
            </label>
            <select
              id="exec-report-project"
              className="jarvis-select"
              style={{ minWidth: '200px' }}
              disabled={projectsLoading || projects.length === 0}
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
            >
              {projects.length === 0 ? (
                <option value="">Nenhum projeto disponível</option>
              ) : (
                projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.id}
                  </option>
                ))
              )}
            </select>
          </div>
        }
      />

      {!roleLoaded && (
        <div role="status" className="jarvis-callout jarvis-callout--info">
          A verificar permissões dos relatórios…
        </div>
      )}

      {projectsError && (
        <div role="alert" className="jarvis-error-banner">
          {projectsError}
        </div>
      )}
      {projectsLoading && (
        <div role="status" className="jarvis-callout jarvis-callout--info">
          Carregando projetos…
        </div>
      )}
      {!projectsLoading && !projectsError && projects.length === 0 && (
        <div className="jarvis-callout jarvis-callout--info">
          Nenhum projeto disponível nesta conta.
        </div>
      )}

      {/* Grid de KPIs de ROI e Produtividade */}
      {isAdmin ? (
        <>
          {roiLoading && (
            <div role="status" className="jarvis-callout jarvis-callout--info">
              A carregar métricas globais…
            </div>
          )}
          {roiError && (
            <div role="alert" className="jarvis-callout jarvis-callout--danger">
              Métricas globais: {roiError}
            </div>
          )}
          {roiData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: '12px' }}>
              <div className="jarvis-settings-card" style={{ padding: '16px', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="user-profile-field-label">Economia Estimada em Nuvem</span>
                  <DollarSign size={15} color="#4ade80" />
                </div>
                <div
                  className="jarvis-tabular"
                  style={{ fontSize: '1.45rem', fontWeight: 600, color: '#4ade80', fontFamily: 'var(--font-mono)' }}
                >
                  US$ {roiData.cost_saved_usd}
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  Aprox. R$ {roiData.cost_saved_brl}; estimativa com 4.500 tokens por tarefa
                </div>
              </div>

              <div className="jarvis-settings-card" style={{ padding: '16px', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="user-profile-field-label">Tempo Potencialmente Poupado</span>
                  <Clock size={15} color="var(--accent-light)" />
                </div>
                <div
                  className="jarvis-tabular"
                  style={{ fontSize: '1.45rem', fontWeight: 600, color: 'var(--accent-light)', fontFamily: 'var(--font-mono)' }}
                >
                  {roiData.engineering_hours_saved}h
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  Estimativa de 0,42h por tarefa concluída
                </div>
              </div>

              <div className="jarvis-settings-card" style={{ padding: '16px', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="user-profile-field-label">Tarefas Concluídas</span>
                  <Zap size={15} color="#fbbf24" />
                </div>
                <div
                  className="jarvis-tabular"
                  style={{ fontSize: '1.45rem', fontWeight: 600, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}
                >
                  {roiData.total_tasks_completed}
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  Tarefas registradas no ambiente
                </div>
              </div>

              <div className="jarvis-settings-card" style={{ padding: '16px', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="user-profile-field-label">Política de Dados</span>
                  <ShieldCheck size={15} color="#4ade80" />
                </div>
                <div
                  style={{ fontSize: '1.15rem', fontWeight: 600, color: '#4ade80', fontFamily: 'var(--font-mono)' }}
                >
                  Privado por conta
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  Isolamento aplicado por proprietário nas áreas homologadas
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="jarvis-callout jarvis-callout--info">
          Os indicadores globais de ROI e produtividade estão reservados a administradores. Os relatórios e a análise técnica do projeto selecionado continuam disponíveis dentro da sua conta.
        </div>
      )}

      {debtLoading && (
        <div role="status" className="jarvis-callout jarvis-callout--info">
          Analisando dívida técnica do projeto…
        </div>
      )}
      {debtError && (
        <div role="alert" className="jarvis-error-banner">
          {debtError}
        </div>
      )}

      {/* Dívida Técnica do Projeto */}
      {debtData && (
        <section className="jarvis-settings-card">
          <div className="jarvis-settings-card-header">
            <div>
              <h3 className="jarvis-settings-card-title">
                Saúde Arquitetural & Dívida Técnica
              </h3>
              <p className="jarvis-settings-card-desc jarvis-tabular">
                Total de linhas: <strong style={{ color: 'var(--text-primary)' }}>{debtData.metrics?.total_lines_of_code ?? '—'}</strong> ·
                Arquivos: <strong style={{ color: 'var(--text-primary)' }}>{debtData.metrics?.total_files ?? '—'}</strong> ·
                Densidade de comentários: <strong style={{ color: 'var(--text-primary)' }}>{debtData.metrics?.comment_ratio_percent ?? '—'}%</strong>
              </p>
            </div>

            {typeof debtData.score === 'number' && (
              <span
                className={`badge jarvis-tabular ${
                  debtData.score >= 80 ? 'badge-success' : debtData.score >= 60 ? 'badge-warning' : 'badge-danger'
                }`}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
              >
                Nota: {debtData.grade ?? '—'} ({debtData.score}/100)
              </span>
            )}
          </div>

          {debtData.recommendations && debtData.recommendations.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {debtData.recommendations.map((rec: string, idx: number) => (
                <div
                  key={idx}
                  className="jarvis-settings-subcard"
                  style={{ flexDirection: 'row', alignItems: 'flex-start', gap: '9px', fontSize: '0.82rem', color: 'var(--text-primary)' }}
                >
                  <Lightbulb size={14} color="var(--accent-light)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>{rec}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {reportLoading && (
        <div role="status" className="jarvis-callout jarvis-callout--info">
          Gerando relatório executivo…
        </div>
      )}
      {reportError && (
        <div role="alert" className="jarvis-error-banner">
          {reportError}
        </div>
      )}

      {/* Relatório Executivo Consolidado */}
      <section className="jarvis-settings-card">
        <div className="jarvis-settings-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={17} color="var(--accent-light)" />
            <div>
              <h3 className="jarvis-settings-card-title">Relatório Executivo Consolidado</h3>
              <p className="jarvis-settings-card-desc">
                Resumo técnico exportável em Markdown ou impressão direta.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => window.print()}
              className="btn btn-ghost btn-sm"
            >
              <Printer size={14} />
              <span>Imprimir / PDF</span>
            </button>
            {reportMarkdown && (
              <button
                type="button"
                onClick={() => {
                  if (!navigator.clipboard?.writeText) return;
                  navigator.clipboard.writeText(reportMarkdown)
                    .then(() => {
                      setCopiedReport(true);
                      window.setTimeout(() => setCopiedReport(false), 2000);
                    })
                    .catch(() => setReportError('Não foi possível copiar o relatório.'));
                }}
                className="btn btn-primary btn-sm"
              >
                {copiedReport ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedReport ? 'Copiado' : 'Copiar Markdown'}</span>
              </button>
            )}
          </div>
        </div>

        {!reportLoading && !reportError && !reportMarkdown && (
          <div className="jarvis-empty-state">
            <FileText size={26} />
            <div className="jarvis-empty-state-title">Selecione um projeto para gerar o relatório</div>
            <div className="jarvis-empty-state-desc">
              Escolha um projeto no seletor superior para consolidar métricas e recomendações técnicas.
            </div>
          </div>
        )}

        {reportMarkdown && (
          <pre
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              padding: '16px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8rem',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              overflowX: 'auto',
              maxHeight: '380px',
              margin: 0,
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
            }}
          >
            {reportMarkdown}
          </pre>
        )}
      </section>
    </div>
  );
};
