import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../services/api/client';
import {
  fetchWorkspaceProjects,
  fetchProjectTests,
  runProjectTests,
  generatePlaywrightTest,
  fetchChaosEdgeCases,
} from '../../api';
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
import { getCategoryLabel } from '../../types';
import { PageHeader } from '../../shared/layout/PageHeader';

export const QualityStudioView: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [canRunTests, setCanRunTests] = useState(false);
  const [canGeneratePlaywright, setCanGeneratePlaywright] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
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
      setChaosCases(Array.isArray(cases) ? cases : []);
      setChaosError(null);
    } catch (e: any) {
      setChaosError(e?.message || 'Falha ao carregar casos de borda.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((principal) => {
        if (cancelled) return;
        const human = principal?.kind === 'human';
        const admin = human && principal?.role === 'admin';
        const developer = human && principal?.role === 'developer';
        setCanRunTests(admin);
        setCanGeneratePlaywright(admin || developer);
        setRoleLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setCanRunTests(false);
          setCanGeneratePlaywright(false);
          setRoleLoaded(true);
        }
      });
    loadProjects();
    loadChaosCases();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectTests(selectedProjectId);
    }
  }, [selectedProjectId]);

  const handleRunTests = async () => {
    if (!canRunTests || !selectedProjectId) return;
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
        summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
        raw_output: err.message,
      });
    } finally {
      setRunningTests(false);
    }
  };

  const handleGeneratePlaywright = async () => {
    if (!canGeneratePlaywright) return;
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
      {!roleLoaded && (
        <div role="status" className="jarvis-callout jarvis-callout--info">
          A verificar permissões do Quality Studio…
        </div>
      )}

      <PageHeader
        title="Quality Studio & Testes E2E"
        subtitle="Execução controlada de testes, gerador de roteiros Playwright e suíte de casos de borda (Chaos Testing)."
        icon={<CheckCircle size={16} />}
        meta={[
          <span key="fw" style={{ textTransform: 'uppercase' }}>
            {discovered?.test_framework || 'Pytest'}
          </span>,
          <span key="files" className="jarvis-tabular">
            {discovered?.total_files || 0} arquivos de teste
          </span>,
          <span key="chaos" className="jarvis-tabular">
            {chaosCases.length} casos de borda
          </span>,
        ]}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <label
              htmlFor="qa-project-select"
              style={{
                fontSize: '0.74rem',
                color: 'var(--text-muted)',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Projeto
            </label>
            <select
              id="qa-project-select"
              disabled={projectsLoading || projects.length === 0}
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="jarvis-select"
              style={{ width: 'auto', minWidth: '180px' }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.id}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {(projectsError || discoveryError || chaosError || playwrightError) && (
        <div
          role="alert"
          className="jarvis-error-banner"
          style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}
        >
          <AlertCircle size={16} color="var(--danger-color)" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{projectsError || discoveryError || chaosError || playwrightError}</span>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => {
              if (projectsError) loadProjects();
              else if (discoveryError && selectedProjectId) loadProjectTests(selectedProjectId);
              else if (chaosError) loadChaosCases();
              else if (playwrightError) handleGeneratePlaywright();
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Painel Principal de Testes */}
      <div className="jarvis-settings-card" style={{ gap: '16px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              fontSize: '0.84rem',
              color: 'var(--text-secondary)',
            }}
          >
            <span style={{ color: 'var(--accent-light)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.76rem' }}>
              Framework: {discovered?.test_framework || 'Pytest'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="jarvis-tabular">
              Arquivos detectados: <strong style={{ color: 'var(--text-primary)' }}>{discovered?.total_files || 0}</strong>
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => loadProjectTests(selectedProjectId)}
              className="btn btn-secondary btn-icon-sm"
              disabled={loadingDiscovery}
              title="Recarregar testes"
              aria-label="Recarregar testes"
            >
              <RefreshCw size={14} className={loadingDiscovery ? 'spin' : ''} />
            </button>
            {canRunTests && (
              <button
                type="button"
                onClick={handleRunTests}
                disabled={runningTests || !selectedProjectId}
                className="btn btn-primary btn-sm"
              >
                <Play size={14} />
                <span>{runningTests ? 'Executando Suíte...' : 'Executar Testes'}</span>
              </button>
            )}
          </div>
        </div>

        {!canRunTests && (
          <div className="jarvis-callout">
            A execução de código está reservada a administradores até existir isolamento de processo por conta.
          </div>
        )}

        {/* Lista de Arquivos de Teste */}
        {loadingDiscovery && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
            A localizar testes do projeto...
          </div>
        )}
        {discovered && (!Array.isArray(discovered.test_files) || discovered.test_files.length === 0) && !discoveryError && !loadingDiscovery && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            Nenhum arquivo de teste encontrado neste projeto.
          </div>
        )}
        {discovered && Array.isArray(discovered.test_files) && discovered.test_files.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {discovered.test_files.map((file: string, idx: number) => (
              <span
                key={idx}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.76rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--accent-light)',
                }}
              >
                <FileCode size={12} />
                <span>{file}</span>
              </span>
            ))}
          </div>
        )}

        {/* Semáforo de Resultados */}
        {testResult && (
          <div
            className={`jarvis-callout ${testResult.is_success ? 'jarvis-callout--success' : 'jarvis-callout--danger'}`}
            style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px 18px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {testResult.is_success ? (
                  <CheckCircle size={20} color="var(--success-color)" />
                ) : (
                  <XCircle size={20} color="var(--danger-color)" />
                )}
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      color: testResult.is_success ? 'var(--success-color)' : 'var(--danger-color)',
                    }}
                  >
                    {testResult.is_success
                      ? 'Todos os Testes Foram Aprovados'
                      : testResult.status === 'error'
                        ? 'Não foi possível iniciar os testes'
                        : testResult.status === 'timeout'
                          ? 'Tempo limite da execução atingido'
                          : 'Falha Detectada nos Testes'}
                  </div>
                  <div
                    className="jarvis-tabular"
                    style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Clock size={12} /> Duração: {testResult.duration_seconds} segundos
                  </div>
                </div>
              </div>

              <div className="jarvis-tabular" style={{ display: 'flex', gap: '12px', fontSize: '0.78rem', fontWeight: 600 }}>
                <span style={{ color: 'var(--success-color)' }}>✓ {testResult.summary?.passed || 0} Aprovados</span>
                {testResult.summary?.failed > 0 && (
                  <span style={{ color: 'var(--danger-color)' }}>✕ {testResult.summary?.failed} Reprovados</span>
                )}
                {testResult.summary?.skipped > 0 && (
                  <span style={{ color: 'var(--warning-color)' }}>⊘ {testResult.summary?.skipped} Pulados</span>
                )}
              </div>
            </div>

            <pre
              style={{
                backgroundColor: 'var(--bg-primary)',
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '16px' }}>
        {/* Card Gerador Playwright */}
        <div className="jarvis-settings-card" style={{ gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileCode size={17} color="var(--accent-light)" />
            <h3 style={{ fontSize: '0.96rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Gerador E2E Playwright
            </h3>
          </div>

          {canGeneratePlaywright ? (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
                  gap: '10px',
                }}
              >
                <div>
                  <label htmlFor="pw-target-url" className="user-profile-field-label">
                    URL Alvo
                  </label>
                  <input
                    id="pw-target-url"
                    type="text"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    className="jarvis-input"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                  />
                </div>
                <div>
                  <label htmlFor="pw-scenario-name" className="user-profile-field-label">
                    Nome do Cenário
                  </label>
                  <input
                    id="pw-scenario-name"
                    type="text"
                    value={scenarioName}
                    onChange={(e) => setScenarioName(e.target.value)}
                    className="jarvis-input"
                  />
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleGeneratePlaywright}
                  disabled={playwrightLoading}
                  className="btn btn-primary btn-sm"
                >
                  <Sparkles size={14} />
                  <span>{playwrightLoading ? 'Gerando Script...' : 'Gerar Roteiro Playwright'}</span>
                </button>
              </div>
            </>
          ) : (
            <div className="jarvis-callout">
              A geração de scripts Playwright está reservada a perfis admin e developer.
            </div>
          )}

          {generatedScript && canGeneratePlaywright && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  test_{scenarioName}_e2e.py
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (!navigator.clipboard?.writeText) return;
                    navigator.clipboard
                      .writeText(generatedScript)
                      .then(() => {
                        setCopiedPlaywright(true);
                        window.setTimeout(() => setCopiedPlaywright(false), 2000);
                      })
                      .catch(() => setPlaywrightError('Não foi possível copiar o script.'));
                  }}
                  className={`btn btn-xs ${copiedPlaywright ? 'btn-success' : 'btn-secondary'}`}
                >
                  {copiedPlaywright ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedPlaywright ? 'Copiado' : 'Copiar Script'}</span>
                </button>
              </div>
              <pre
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  padding: '12px',
                  borderRadius: '8px',
                  fontSize: '0.76rem',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  overflowX: 'auto',
                  maxHeight: '200px',
                  margin: 0,
                }}
              >
                {generatedScript}
              </pre>
            </div>
          )}
        </div>

        {/* Card Chaos Testing / Casos de Borda */}
        <div className="jarvis-settings-card" style={{ gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Flame size={17} color="var(--warning-color)" />
            <h3 style={{ fontSize: '0.96rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Casos de Borda (Chaos Testing)
            </h3>
          </div>

          {chaosError ? (
            <div role="alert" className="jarvis-error-banner">
              {chaosError}
            </div>
          ) : chaosCases.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              Nenhum caso de borda disponível.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
              {chaosCases.map((c, idx) => (
                <div
                  key={idx}
                  className="jarvis-settings-subcard"
                  style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                      {c.name}
                    </span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: 'var(--warning-color)',
                      }}
                    >
                      {getCategoryLabel(c.category)}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{c.expected_behavior}</div>
                  <code
                    style={{
                      fontSize: '0.72rem',
                      backgroundColor: 'var(--bg-primary)',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      color: 'var(--warning-color)',
                      fontFamily: 'var(--font-mono)',
                      border: '1px solid var(--border-color)',
                      overflowX: 'auto',
                    }}
                  >
                    {JSON.stringify(c.payload)}
                  </code>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
