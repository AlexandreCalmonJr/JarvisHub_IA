import React, { useState, useEffect } from 'react';
import { API_BASE } from '../services/api/client';
import {
  Zap,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import {
  fetchHardwareProfile,
  applyHardwareOptimizations,
  fetchPerformanceMode,
  setPerformanceMode,
} from '../api';
import { notify } from './common/Toast';
import { HardwareSpecsCards } from './hardware/HardwareSpecsCards';
import { OllamaPerformancePanel } from './hardware/OllamaPerformancePanel';
import { InstalledModelsEvaluation } from './hardware/InstalledModelsEvaluation';

export const HardwareAdvisorView: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [performanceError, setPerformanceError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [applying, setApplying] = useState<boolean>(false);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);

  // Estados de Desempenho e Threads do Ollama
  const [perfProfile, setPerfProfile] = useState<any>(null);
  const [selectedMode, setSelectedMode] = useState<string>('auto');
  const [selectedThreads, setSelectedThreads] = useState<number>(6);
  const [perfSaving, setPerfSaving] = useState<boolean>(false);

  const loadProfile = async () => {
    if (!isAdmin) return;
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

  const handleApplyOptimal = async () => {
    if (!isAdmin || !window.confirm('Aplicar as recomendações ao perfil global dos agentes? Esta operação altera a configuração de modelos de todo o servidor.')) return;
    setApplying(true);
    setApplySuccess(null);
    setActionError(null);
    try {
      const res = await applyHardwareOptimizations();
      setApplySuccess(res.message || 'Configuração recomendada aplicada aos especialistas!');
      await loadProfile();
    } catch (e: any) {
      setActionError(e?.message || 'Falha ao aplicar otimizações.');
      notify(`Erro ao aplicar otimizações: ${e.message}`, 'error');
    } finally {
      setApplying(false);
    }
  };

  if (!roleLoaded) {
    return <div role="status" className="glass-panel" style={{ padding: '24px', color: 'var(--text-secondary)' }}>A verificar permissões do diagnóstico de hardware…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '1.1rem' }}>Diagnóstico de Hardware</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.84rem' }}>O diagnóstico da máquina anfitriã e as alterações globais de desempenho estão disponíveis apenas para administradores.</p>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-secondary)' }}>
        <RefreshCw size={28} className="spin" style={{ margin: '0 auto 16px', color: 'var(--accent-color)' }} />
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Diagnosticando Hardware do Computador...</h3>
        <p style={{ fontSize: '0.84rem', marginTop: '6px' }}>
          Identificando processador, memória RAM, aceleradores gráficos e modelos Ollama locais
        </p>
      </div>
    );
  }

  if (!data && !loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '32px', border: '1px solid var(--border-color)', borderRadius: '14px', background: 'var(--bg-tertiary)' }}>
        <div role="alert" style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={18} color="#f87171" />
          <span>{loadError || 'Diagnóstico de hardware indisponível.'}</span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>O diagnóstico e as configurações globais do equipamento estão disponíveis apenas para administradores.</p>
        <div><button onClick={loadProfile} className="btn btn-secondary">Tentar novamente</button></div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {(performanceError || actionError) && (
        <div role="alert" style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.35)', background: 'rgba(239, 68, 68, 0.08)', color: 'var(--text-primary)', fontSize: '0.84rem' }}>
          {performanceError || actionError}
        </div>
      )}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
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
            Diagnóstico de Hardware & Modelos
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Análise dos recursos físicos reais da máquina e calibração de modelos para máxima velocidade local.
          </p>
        </div>

        <button
          onClick={loadProfile}
          className="btn btn-secondary"
          style={{ fontSize: '0.82rem', padding: '7px 14px', borderRadius: '8px' }}
        >
          <span>{loading ? 'Diagnosticando...' : 'Reescanear Hardware'}</span>
        </button>
      </div>

      {/* Banner de Diagnóstico e Perfil do Equipamento */}
      <div
        className="glass-panel"
        style={{
          padding: '20px 24px',
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ flex: 1, minWidth: '280px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span className="badge badge-info" style={{ fontSize: '0.72rem', padding: '3px 8px' }}>
                Perfil Classificado
              </span>
              <h3 className="claude-serif-title" style={{ fontSize: '1.2rem', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
                {hwTier.title || 'Computador Local com Gráficos Integrados'}
              </h3>
            </div>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              {hwTier.description}
            </p>

            {applySuccess && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#34d399',
                  fontSize: '0.80rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <CheckCircle2 size={16} />
                <span>{applySuccess}</span>
              </div>
            )}
          </div>

          {/* Botão de Ação Rápida com 1 Clique */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
            <button
              onClick={handleApplyOptimal}
              disabled={applying}
              className="btn btn-primary"
              style={{
                fontSize: '0.84rem',
                padding: '10px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderRadius: '8px',
              }}
            >
              <Zap size={16} />
              <span>{applying ? 'Aplicando Otimização...' : '⚡ Aplicar Otimização Recomendada'}</span>
            </button>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Aplica os modelos recomendados pelo diagnóstico e atualiza as configurações globais dos agentes.
            </span>
          </div>
        </div>
      </div>

      {/* Painel de Controle Dinâmico de Threads e Modo de Energia */}
      {perfProfile ? <OllamaPerformancePanel
        perfProfile={perfProfile}
        selectedMode={selectedMode}
        setSelectedMode={setSelectedMode}
        selectedThreads={selectedThreads}
        setSelectedThreads={setSelectedThreads}
        onSave={handleSavePerformance}
        saving={perfSaving}
      /> : <div className="glass-panel" style={{ padding: '16px', color: 'var(--text-secondary)' }}>O perfil de desempenho não está disponível; não é possível guardar alterações até obter uma leitura válida do hardware.</div>}

      {/* Grid com os 3 Componentes Físicos (CPU, RAM, GPU) */}
      <HardwareSpecsCards cpu={cpu} ram={ram} gpu={gpu} />

      {/* Modelos Instalados & Aceleração Híbrida */}
      <InstalledModelsEvaluation modelsEval={modelsEval} cloudOptions={cloudOptions} />
    </div>
  );
};
