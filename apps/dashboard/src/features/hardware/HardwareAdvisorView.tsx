import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../services/api/client';
import {
  Zap,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Cpu,
} from 'lucide-react';
import {
  fetchHardwareProfile,
  applyHardwareOptimizations,
  fetchPerformanceMode,
  setPerformanceMode,
} from '../../api';
import { notify } from '../../shared/common/Toast';
import { ConfirmDialog } from '../../shared/common/ConfirmDialog';
import { PageHeader } from '../../shared/layout/PageHeader';
import { HardwareSpecsCards } from './HardwareSpecsCards';
import { OllamaPerformancePanel } from './OllamaPerformancePanel';
import { InstalledModelsEvaluation } from './InstalledModelsEvaluation';

export const HardwareAdvisorView: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [performanceError, setPerformanceError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [applying, setApplying] = useState<boolean>(false);
  const [confirmApplyOpen, setConfirmApplyOpen] = useState<boolean>(false);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);

  const [perfProfile, setPerfProfile] = useState<any>(null);
  const [selectedMode, setSelectedMode] = useState<string>('auto');
  const [selectedThreads, setSelectedThreads] = useState<number>(6);
  const [perfSaving, setPerfSaving] = useState<boolean>(false);

  const loadProfile = async () => {
    setLoading(true);
    const [hardwareResult, performanceResult] = await Promise.allSettled([
      fetchHardwareProfile(),
      fetchPerformanceMode(),
    ]);
    if (hardwareResult.status === 'fulfilled') {
      setData(hardwareResult.value);
      setLoadError(null);
    } else {
      setData(null);
      setLoadError((hardwareResult.reason as Error)?.message || 'Falha ao carregar diagnóstico de hardware.');
    }
    if (performanceResult.status === 'fulfilled') {
      const perf = performanceResult.value;
      setPerfProfile(perf);
      setSelectedMode(perf.mode || 'auto');
      const logicalCores = Math.max(1, Number(perf.logical_cores) || 1);
      setSelectedThreads(Math.max(1, Math.min(Number(perf.cpu_threads) || Math.min(6, logicalCores), logicalCores)));
      setPerformanceError(null);
    } else {
      setPerfProfile(null);
      setPerformanceError((performanceResult.reason as Error)?.message || 'Falha ao carregar perfil de desempenho.');
    }
    setLoading(false);
  };

  const handleSavePerformance = async () => {
    if (!isAdmin || !perfProfile) return;
    setPerfSaving(true);
    try {
      const updated = await setPerformanceMode(selectedMode, selectedThreads);
      setPerfProfile(updated);
      notify(
        `Modo ${updated.effective_mode.toUpperCase()} com ${updated.effective_threads} threads salvo com sucesso!`,
        'success'
      );
    } catch (err: any) {
      notify(`Erro ao salvar configurações de desempenho: ${err.message}`, 'error');
    } finally {
      setPerfSaving(false);
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
        if (admin) void loadProfile();
        else setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setIsAdmin(false);
          setRoleLoaded(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleApplyOptimal = () => {
    if (!isAdmin) return;
    setConfirmApplyOpen(true);
  };

  const confirmApplyOptimal = async () => {
    if (!isAdmin) return;
    setApplying(true);
    setApplySuccess(null);
    setActionError(null);
    try {
      const res = await applyHardwareOptimizations();
      setApplySuccess(res.message || 'O servidor confirmou a aplicação das recomendações.');
      setConfirmApplyOpen(false);
      await loadProfile();
    } catch (e: any) {
      setActionError(e?.message || 'Falha ao aplicar otimizações.');
      notify(`Erro ao aplicar otimizações: ${e.message}`, 'error');
    } finally {
      setApplying(false);
    }
  };

  if (!roleLoaded) {
    return (
      <div className="jarvis-page-shell">
        <div role="status" className="jarvis-callout jarvis-callout--info">
          Verificando permissões do diagnóstico de hardware…
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="jarvis-page-shell">
        <PageHeader
          title="Diagnóstico de Hardware & Modelos"
          subtitle="Análise dos recursos físicos reais da máquina e calibração de modelos para máxima velocidade local."
        />
        <div className="jarvis-callout jarvis-callout--info">
          O diagnóstico da máquina anfitriã e as alterações globais de desempenho estão disponíveis apenas para administradores.
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="jarvis-page-shell">
        <PageHeader
          title="Diagnóstico de Hardware & Modelos"
          subtitle="Análise dos recursos físicos reais da máquina e calibração de modelos para máxima velocidade local."
        />
        <div role="status" className="jarvis-empty-state">
          <RefreshCw size={24} className="spin" />
          <div className="jarvis-empty-state-title">Diagnosticando hardware do computador…</div>
          <div className="jarvis-empty-state-desc">
            Identificando processador, memória RAM, aceleradores gráficos e modelos Ollama locais.
          </div>
        </div>
      </div>
    );
  }

  if (!data && !loading) {
    return (
      <div className="jarvis-page-shell">
        <PageHeader
          title="Diagnóstico de Hardware & Modelos"
          subtitle="Análise dos recursos físicos reais da máquina e calibração de modelos para máxima velocidade local."
        />
        <section className="jarvis-settings-card">
          <div role="alert" className="jarvis-error-banner" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} />
            <span>{loadError || 'Diagnóstico de hardware indisponível.'}</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', margin: 0 }}>
            O diagnóstico e as configurações globais do equipamento estão disponíveis apenas para administradores.
          </p>
          <div>
            <button type="button" onClick={loadProfile} className="btn btn-secondary btn-sm">
              Tentar novamente
            </button>
          </div>
        </section>
      </div>
    );
  }

  const specs = data?.specs || {};
  const recs = data?.recommendations || {};
  const cpu = specs.cpu || {};
  const ram = specs.ram || {};
  const gpu = specs.gpu || {};
  const hwTier = recs.hardware_tier || {};
  const modelsEval = recs.models_evaluation || [];
  const cloudOptions = recs.cloud_acceleration_options || [];

  return (
    <div className="jarvis-page-shell">
      <PageHeader
        title="Diagnóstico de Hardware & Modelos"
        subtitle="Análise dos recursos físicos reais da máquina e calibração de modelos para máxima velocidade local."
        meta={[
          <span key="cpu" className="jarvis-tabular">{cpu.logical_cores || '—'} threads lógicas</span>,
          <span key="ram" className="jarvis-tabular">{ram.total_gb ? `${ram.total_gb} GB RAM` : 'RAM indisponível'}</span>,
          gpu.has_dedicated_gpu ? 'GPU Dedicada' : 'Gráficos Integrados',
        ]}
        actions={
          <button
            type="button"
            onClick={loadProfile}
            disabled={loading}
            className="btn btn-secondary btn-sm"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>{loading ? 'Diagnosticando…' : 'Reescanear Hardware'}</span>
          </button>
        }
      />

      {(performanceError || actionError) && (
        <div role="alert" className="jarvis-error-banner">
          {performanceError || actionError}
        </div>
      )}

      {/* Banner de Diagnóstico e Perfil do Equipamento */}
      <section className="jarvis-settings-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div style={{ flex: '1 1 300px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
              <Cpu size={16} color="var(--accent-light)" />
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--accent-light)',
                }}
              >
                Perfil Classificado
              </span>
            </div>
            <h3 style={{ fontSize: '1.08rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>
              {hwTier.title || 'Computador Local com Gráficos Integrados'}
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              {hwTier.description}
            </p>

            {applySuccess && (
              <div
                role="status"
                className="jarvis-callout jarvis-callout--success"
                style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <CheckCircle2 size={15} />
                <span>{applySuccess}</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start', maxWidth: '300px' }}>
            <button
              type="button"
              onClick={handleApplyOptimal}
              disabled={applying}
              className="btn btn-primary btn-sm"
            >
              <Zap size={14} />
              <span>{applying ? 'Aplicando otimização…' : 'Aplicar Otimização Recomendada'}</span>
            </button>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Aplica os modelos recomendados pelo diagnóstico e atualiza as configurações globais dos agentes.
            </span>
          </div>
        </div>
      </section>

      {perfProfile ? (
        <OllamaPerformancePanel
          perfProfile={perfProfile}
          selectedMode={selectedMode}
          setSelectedMode={setSelectedMode}
          selectedThreads={selectedThreads}
          setSelectedThreads={setSelectedThreads}
          onSave={handleSavePerformance}
          saving={perfSaving}
        />
      ) : (
        <div className="jarvis-callout jarvis-callout--info">
          O perfil de desempenho não está disponível; não é possível guardar alterações até obter uma leitura válida do hardware.
        </div>
      )}

      <HardwareSpecsCards cpu={cpu} ram={ram} gpu={gpu} />

      <InstalledModelsEvaluation modelsEval={modelsEval} cloudOptions={cloudOptions} />

      <ConfirmDialog
        isOpen={confirmApplyOpen}
        title="Aplicar otimização recomendada"
        description="Aplicar as recomendações ao perfil global dos agentes? Esta operação altera a configuração de modelos de todo o servidor."
        confirmLabel="Aplicar recomendações"
        tone="warning"
        isLoading={applying}
        onConfirm={confirmApplyOptimal}
        onCancel={() => setConfirmApplyOpen(false)}
      />
    </div>
  );
};
