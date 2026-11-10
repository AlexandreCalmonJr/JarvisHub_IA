import React, { useState, useEffect } from 'react';
import {
  Zap,
  CheckCircle2,
  RefreshCw,
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
  const [loading, setLoading] = useState<boolean>(true);
  const [applying, setApplying] = useState<boolean>(false);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);

  // Estados de Desempenho e Threads do Ollama
  const [perfProfile, setPerfProfile] = useState<any>(null);
  const [selectedMode, setSelectedMode] = useState<string>('auto');
  const [selectedThreads, setSelectedThreads] = useState<number>(6);
  const [perfSaving, setPerfSaving] = useState<boolean>(false);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const [res, perf] = await Promise.all([
        fetchHardwareProfile(),
        fetchPerformanceMode().catch(() => null),
      ]);
      setData(res);
      if (perf) {
        setPerfProfile(perf);
        setSelectedMode(perf.mode || 'auto');
        setSelectedThreads(perf.cpu_threads || 6);
      }
    } catch (e) {
      console.error('Falha ao carregar perfil de hardware:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePerformance = async () => {
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
    loadProfile();
  }, []);

  const handleApplyOptimal = async () => {
    setApplying(true);
    setApplySuccess(null);
    try {
      const res = await applyHardwareOptimizations();
      setApplySuccess(res.message || 'Configuração recomendada aplicada aos especialistas!');
      await loadProfile();
    } catch (e: any) {
      alert(`Erro ao aplicar otimizações: ${e.message}`);
    } finally {
      setApplying(false);
    }
  };

  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-secondary)' }}>
        <RefreshCw size={28} className="spin" style={{ margin: '0 auto 16px', color: '#818cf8' }} />
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Diagnosticando Hardware do Computador...</h3>
        <p style={{ fontSize: '0.84rem', marginTop: '6px' }}>
          Identificando processador, memória RAM, aceleradores gráficos e modelos Ollama locais
        </p>
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
              Ajusta o Maestro para llama3.2:3b e timeouts ideais
            </span>
          </div>
        </div>
      </div>

      {/* Painel de Controle Dinâmico de Threads e Modo de Energia */}
      <OllamaPerformancePanel
        perfProfile={perfProfile}
        selectedMode={selectedMode}
        setSelectedMode={setSelectedMode}
        selectedThreads={selectedThreads}
        setSelectedThreads={setSelectedThreads}
        onSave={handleSavePerformance}
        saving={perfSaving}
      />

      {/* Grid com os 3 Componentes Físicos (CPU, RAM, GPU) */}
      <HardwareSpecsCards cpu={cpu} ram={ram} gpu={gpu} />

      {/* Modelos Instalados & Aceleração Híbrida */}
      <InstalledModelsEvaluation modelsEval={modelsEval} cloudOptions={cloudOptions} />
    </div>
  );
};
