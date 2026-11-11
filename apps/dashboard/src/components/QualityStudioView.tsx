import React, { useState, useEffect } from 'react';
import {
  fetchWorkspaceProjects,
  fetchProjectTests,
  runProjectTests,
  generatePlaywrightTest,
  fetchChaosEdgeCases,
} from '../api';
import {
  CheckCircle,
  XCircle,
  Play,
  RefreshCw,
  Clock,
  Sparkles,
  Copy,
  Check,
  FileCode,
  Flame,
  AlertCircle,
} from 'lucide-react';

export const QualityStudioView: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [chaosError, setChaosError] = useState<string | null>(null);
  const [playwrightError, setPlaywrightError] = useState<string | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // Descoberta e Execução
  const [discovered, setDiscovered] = useState<any | null>(null);
  const [loadingDiscovery, setLoadingDiscovery] = useState(false);
  const [runningTests, setRunningTests] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);

  // Playwright E2E
  const [targetUrl, setTargetUrl] = useState('http://127.0.0.1:8000');
  const [scenarioName, setScenarioName] = useState('fluxo_principal');
  const [generatedScript, setGeneratedScript] = useState<string | null>(null);
  const [playwrightLoading, setPlaywrightLoading] = useState(false);
  const [copiedPlaywright, setCopiedPlaywright] = useState(false);

  // Chaos Testing
  const [chaosCases, setChaosCases] = useState<any[]>([]);

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

  const loadProjectTests = async (projId: string) => {
    if (!projId) return;
    setLoadingDiscovery(true);
    setDiscoveryError(null);
    setTestResult(null);
    try {
      const res = await fetchProjectTests(projId);
      setDiscovered(res);
    } catch (e: any) {
      setDiscoveryError(e?.message || 'Falha ao descobrir testes do projeto.');
    } finally {
      setLoadingDiscovery(false);
    }
  };

  const loadChaosCases = async () => {
    try {
      const cases = await fetchChaosEdgeCases();
      setChaosCases(cases || []);
      setChaosError(null);
    } catch (e: any) {
      setChaosError(e?.message || 'Falha ao carregar casos de borda.');
    }
  };

  useEffect(() => {
    loadProjects();
    loadChaosCases();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectTests(selectedProjectId);
    }
  }, [selectedProjectId]);

  const handleRunTests = async () => {
    if (!selectedProjectId) return;
    setRunningTests(true);
    setTestResult(null);
    try {
      const res = await runProjectTests(selectedProjectId);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        is_success: false,
        status: 'error',
        duration_seconds: 0,
        summary: { total: 0, passed: 0, failed: 1, skipped: 0 },
        raw_output: err.message,
      });
    } finally {
      setRunningTests(false);
    }
  };

  const handleGeneratePlaywright = async () => {
    setPlaywrightLoading(true);
    setPlaywrightError(null);
    try {
      const res = await generatePlaywrightTest(targetUrl, scenarioName);
      setGeneratedScript(res.code);
    } catch (err: any) {
      setPlaywrightError(err?.message || 'Falha ao gerar roteiro Playwright.');
    } finally {
      setPlaywrightLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {(projectsError || discoveryError || chaosError || playwrightError) && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.35)', background: 'rgba(239, 68, 68, 0.08)', color: 'var(--text-primary)' }}>
          <AlertCircle size={16} color="#f87171" />
          <span style={{ fontSize: '0.84rem' }}>{projectsError || discoveryError || chaosError || playwrightError}</span>
          <button className="btn btn-ghost" onClick={() => selectedProjectId ? loadProjectTests(selectedProjectId) : loadProjects()}>Tentar novamente</button>
        </div>
      )}
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
            Quality Studio & Testes E2E
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
            Automação de testes em sandbox, gerador de roteiros Playwright e suíte de testes de estresse (Chaos Testing).
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

      {/* Painel Principal de Testes */}
      <div
        className="glass-card"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="badge badge-info" style={{ textTransform: 'uppercase' }}>
              Framework: {discovered?.test_framework || 'Pytest'}
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Arquivos de Teste Detectados: <b>{discovered?.total_files || 0}</b>
            </span>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => loadProjectTests(selectedProjectId)} className="btn btn-ghost" disabled={loadingDiscovery} title="Recarregar">
              <RefreshCw size={14} className={loadingDiscovery ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={handleRunTests}
              disabled={runningTests || !selectedProjectId}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 18px', borderRadius: '8px' }}
            >
              <Play size={15} />
              {runningTests ? 'Executando Suíte...' : 'Executar Testes em Sandbox'}
            </button>
          </div>
        </div>

        {/* Lista de Arquivos de Teste */}
        {loadingDiscovery && <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>A localizar testes do projeto...</div>}
        {discovered && discovered.test_files.length === 0 && !discoveryError && !loadingDiscovery && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Nenhum arquivo de teste encontrado neste projeto.</div>
        )}
        {discovered && discovered.test_files.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {discovered.test_files.map((file: string, idx: number) => (
              <span
                key={idx}
                style={{
                  padding: '4px 10px',
                  backgroundColor: 'var(--bg-surface)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.78rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--accent-color)',
                }}
              >
                📄 {file}
              </span>
            ))}
          </div>
        )}

        {/* Semáforo de Resultados */}
        {testResult && (
          <div
            style={{
              marginTop: '10px',
              padding: '16px 20px',
              borderRadius: '10px',
              backgroundColor: testResult.is_success ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${testResult.is_success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {testResult.is_success ? <CheckCircle size={22} color="#34d399" /> : <XCircle size={22} color="#f87171" />}
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: testResult.is_success ? '#34d399' : '#f87171' }}>
                    {testResult.is_success ? 'Todos os Testes Foram Aprovados' : 'Falha Detectada nos Testes'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={12} /> Duração: {testResult.duration_seconds} segundos
                  </div>
                </div>
              </div>

              {/* Semáforo */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <span className="badge badge-success" style={{ fontSize: '0.82rem' }}>
                  ✓ {testResult.summary?.passed || 0} Aprovados
                </span>
                {testResult.summary?.failed > 0 && (
                  <span className="badge badge-danger" style={{ fontSize: '0.82rem' }}>
                    ✕ {testResult.summary?.failed} Reprovados
                  </span>
                )}
                {testResult.summary?.skipped > 0 && (
                  <span className="badge badge-warning" style={{ fontSize: '0.82rem' }}>
                    ⊘ {testResult.summary?.skipped} Pulados
                  </span>
                )}
              </div>
            </div>

            {/* Terminal de Saída */}
            <pre
              style={{
                backgroundColor: '#161514',
                border: '1px solid var(--border-color)',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                overflowX: 'auto',
                maxHeight: '180px',
                margin: 0,
              }}
            >
              {testResult.raw_output}
            </pre>
          </div>
        )}
      </div>

      {/* Grid: Playwright E2E e Chaos Testing */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '20px' }}>
        {/* Card Gerador Playwright */}
        <div
          className="glass-card"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: '14px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileCode size={20} color="var(--accent-color)" />
            <h3 className="claude-serif-title" style={{ fontSize: '1.15rem', fontWeight: 500, margin: 0 }}>
              Gerador E2E Playwright
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: '10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>URL Alvo</label>
              <input
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 10px', fontSize: '0.82rem' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Nome do Cenário</label>
              <input
                type="text"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 10px', fontSize: '0.82rem' }}
              />
            </div>
          </div>

          <button
            onClick={handleGeneratePlaywright}
            disabled={playwrightLoading}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.82rem', borderRadius: '8px' }}
          >
            <Sparkles size={14} />
            {playwrightLoading ? 'Gerando Script...' : 'Gerar Roteiro Playwright'}
          </button>

          {generatedScript && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  test_{scenarioName}_e2e.py
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedScript);
                    setCopiedPlaywright(true);
                    setTimeout(() => setCopiedPlaywright(false), 2000);
                  }}
                  className="btn btn-ghost"
                  style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                >
                  {copiedPlaywright ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                  Copiar Script
                </button>
              </div>
              <pre
                style={{
                  backgroundColor: '#161514',
                  border: '1px solid var(--border-color)',
                  padding: '12px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  overflowX: 'auto',
                  maxHeight: '180px',
                  margin: 0,
                }}
              >
                {generatedScript}
              </pre>
            </div>
          )}
        </div>

        {/* Card Chaos Testing / Casos de Borda */}
        <div
          className="glass-card"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: '14px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Flame size={20} color="#f59e0b" />
            <h3 className="claude-serif-title" style={{ fontSize: '1.15rem', fontWeight: 500, margin: 0 }}>
              Casos de Borda (Chaos Testing)
            </h3>
          </div>

          {chaosError ? (
            <div role="alert" style={{ color: '#f87171', fontSize: '0.82rem' }}>{chaosError}</div>
          ) : chaosCases.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Nenhum caso de borda disponível.</div>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
            {chaosCases.map((c, idx) => (
              <div
                key={idx}
                style={{
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)' }}>{c.name}</span>
                  <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                    {c.category}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{c.expected_behavior}</div>
                <code style={{ fontSize: '0.72rem', backgroundColor: '#161514', padding: '4px 6px', borderRadius: '4px', color: '#f6ad92', fontFamily: 'var(--font-mono)', border: '1px solid var(--border-color)' }}>
                  {JSON.stringify(c.payload)}
                </code>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
