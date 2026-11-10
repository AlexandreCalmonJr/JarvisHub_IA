import React, { useState, useEffect } from 'react';
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
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // ROI e Produtividade
  const [roiData, setRoiData] = useState<any | null>(null);

  // Dívida Técnica
  const [debtData, setDebtData] = useState<any | null>(null);

  // Relatório Executivo Consolidado
  const [reportMarkdown, setReportMarkdown] = useState<string | null>(null);
  const [copiedReport, setCopiedReport] = useState(false);

  const loadInitial = async () => {
    try {
      const [projs, roi] = await Promise.all([
        fetchWorkspaceProjects().catch(() => []),
        fetchProductivityRoi().catch(() => null),
      ]);
      setProjects(projs || []);
      setRoiData(roi);
      if (projs && projs.length > 0 && !selectedProjectId) {
        setSelectedProjectId(projs[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadProjectDebt = async (projId: string) => {
    if (!projId) return;
    try {
      const debt = await fetchProjectTechDebt(projId);
      setDebtData(debt);
    } catch (e) {
      console.error(e);
      setDebtData(null);
    }
  };

  const generateReport = async (projId?: string) => {
    try {
      const rep = await fetchExecutiveReport(projId);
      setReportMarkdown(rep.markdown);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadInitial();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectDebt(selectedProjectId);
      generateReport(selectedProjectId);
    }
  }, [selectedProjectId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
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

      {/* Grid de KPIs de ROI e Produtividade */}
      {roiData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px' }}>
          <div className="glass-card" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
              <span style={{ fontSize: '0.76rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Economia em Nuvem</span>
              <DollarSign size={16} color="#34d399" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 600, color: '#34d399', fontFamily: 'var(--font-mono)' }}>
              US$ {roiData.cost_saved_usd}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Aprox. R$ {roiData.cost_saved_brl} poupados em APIs
            </div>
          </div>

          <div className="glass-card" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
              <span style={{ fontSize: '0.76rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tempo Poupado</span>
              <Clock size={16} color="var(--accent-color)" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 600, color: 'var(--accent-color)', fontFamily: 'var(--font-mono)' }}>
              {roiData.engineering_hours_saved}h
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Horas de engenharia automatizadas
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
              Ações executadas pelos 26 especialistas
            </div>
          </div>

          <div className="glass-card" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
              <span style={{ fontSize: '0.76rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Soberania de Dados</span>
              <ShieldCheck size={16} color="#10b981" />
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 600, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
              100% Local
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Zero dependência externa ou vazamento
            </div>
          </div>
        </div>
      )}

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
                  navigator.clipboard.writeText(reportMarkdown);
                  setCopiedReport(true);
                  setTimeout(() => setCopiedReport(false), 2000);
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

        {reportMarkdown && (
          <pre
            style={{
              backgroundColor: '#161514',
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
