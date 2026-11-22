import React, { useState, useEffect } from 'react';
import {
  Cpu,
  HardDrive,
  Laptop,
  Wifi,
  WifiOff,
  Sparkles,
  Check,
  Loader2,
  Save,
  Sliders,
  ShieldCheck,
} from 'lucide-react';
import {
  HardwareAdvisorPayload,
  saveHardwareProfile,
  updateProviderConnectivity,
  applyHardwareRecommendations,
} from '../../api';
import { getDefaultMascotForRole } from '../../services/mascots';
import { MascotAvatar } from '../../shared/common/MascotAvatar';
import { notify } from '../../shared/common/Toast';

interface HardwareAdvisorPanelProps {
  advisor: HardwareAdvisorPayload | null;
  loading: boolean;
  onAdvisorUpdated: (next: HardwareAdvisorPayload) => void;
  onRecommendationsApplied: () => void;
}

const FIT_COLORS: Record<'gpu_smooth' | 'cpu_ok' | 'recommend_online', string> = {
  gpu_smooth: '#4ade80',
  cpu_ok: '#fbbf24',
  recommend_online: '#60a5fa',
};

export const HardwareAdvisorPanel: React.FC<HardwareAdvisorPanelProps> = ({
  advisor,
  loading,
  onAdvisorUpdated,
  onRecommendationsApplied,
}) => {
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [applyingRole, setApplyingRole] = useState<string | null>(null);
  const [appliedRoles, setAppliedRoles] = useState<Record<string, boolean>>({});
  const [editingProfile, setEditingProfile] = useState(false);

  const activeProfile =
    advisor?.profiles.find((p) => p.id === advisor.active_profile_id) || advisor?.profiles[0] || null;

  const [formCpu, setFormCpu] = useState('');
  const [formRam, setFormRam] = useState(16);
  const [formGpu, setFormGpu] = useState('');
  const [formVram, setFormVram] = useState(8);
  const [formOllamaUrl, setFormOllamaUrl] = useState('http://127.0.0.1:11434');
  const [formLabel, setFormLabel] = useState('');
  const [formOwner, setFormOwner] = useState('');

  useEffect(() => {
    if (!activeProfile) return;
    setFormCpu(activeProfile.cpu);
    setFormRam(activeProfile.ram_gb);
    setFormGpu(activeProfile.gpu_name);
    setFormVram(activeProfile.vram_gb);
    setFormOllamaUrl(activeProfile.ollama_url);
    setFormLabel(activeProfile.label);
    setFormOwner(activeProfile.owner);
  }, [activeProfile?.id, activeProfile?.vram_gb, activeProfile?.ram_gb, activeProfile?.ollama_url]);

  if (loading && !advisor) {
    return (
      <div className="jarvis-callout jarvis-callout--info" role="status">
        Analisando perfil de hardware, GPU e provedores de IA…
      </div>
    );
  }

  if (!advisor) {
    return (
      <div className="jarvis-callout jarvis-callout--danger" role="alert">
        Não foi possível carregar o Consultor de Hardware e Provedores.
      </div>
    );
  }

  const handleSelectProfile = async (profileId: string) => {
    setSavingProfile(true);
    try {
      const updated = await saveHardwareProfile({ active_profile_id: profileId });
      onAdvisorUpdated(updated);
      setAppliedRoles({});
      notify('Perfil de hardware alternado. Recomendações recalculadas.', 'success');
    } catch (err: any) {
      notify(err.message || 'Falha ao alternar perfil de hardware.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveProfileEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile) return;
    setSavingProfile(true);
    try {
      const updated = await saveHardwareProfile({
        active_profile_id: activeProfile.id,
        profile: {
          id: activeProfile.id,
          label: formLabel.trim() || activeProfile.label,
          owner: formOwner.trim() || activeProfile.owner,
          cpu: formCpu.trim() || activeProfile.cpu,
          ram_gb: Math.max(4, Number(formRam) || 8),
          gpu_name: formGpu.trim() || activeProfile.gpu_name,
          vram_gb: Math.max(0, Number(formVram) || 0),
          ollama_url: formOllamaUrl.trim() || 'http://127.0.0.1:11434',
          is_active: true,
        },
      });
      onAdvisorUpdated(updated);
      setEditingProfile(false);
      setAppliedRoles({});
      notify('Especificações de hardware salvas e recomendações recalculadas.', 'success');
    } catch (err: any) {
      notify(err.message || 'Erro ao salvar perfil de hardware.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleToggleProvider = async (
    key: 'ollama_connected' | 'huggingface_connected' | 'gemini_connected',
    nextValue: boolean,
    friendlyName: string
  ) => {
    setBusyProvider(key);
    try {
      const updated = await updateProviderConnectivity({ [key]: nextValue });
      onAdvisorUpdated(updated);
      setAppliedRoles({});
      notify(
        nextValue
          ? `${friendlyName} conectado. Matriz de agentes recalculada.`
          : `${friendlyName} desconectado. Consultor ajustou os agentes para a melhor rota disponível.`,
        'info'
      );
    } catch (err: any) {
      notify(err.message || `Falha ao atualizar ${friendlyName}.`, 'error');
    } finally {
      setBusyProvider(null);
    }
  };

  const handleApplySingle = async (agentRole: string, properName: string, model: string) => {
    setApplyingRole(agentRole);
    try {
      await applyHardwareRecommendations({ agent_role: agentRole });
      setAppliedRoles((prev) => ({ ...prev, [agentRole]: true }));
      notify(`${properName} atualizado para ${model}.`, 'success');
      onRecommendationsApplied();
    } catch (err: any) {
      notify(err.message || 'Falha ao aplicar modelo ao agente.', 'error');
    } finally {
      setApplyingRole(null);
    }
  };

  const handleApplyAll = async () => {
    setApplyingRole('__all__');
    try {
      const res = await applyHardwareRecommendations({ apply_all: true });
      const nextMap: Record<string, boolean> = {};
      advisor.recommendations.forEach((r) => {
        nextMap[r.agent_role] = true;
      });
      setAppliedRoles(nextMap);
      notify(`${res.applied_count} agentes atualizados com o melhor modelo para o seu hardware.`, 'success');
      onRecommendationsApplied();
    } catch (err: any) {
      notify(err.message || 'Falha ao aplicar recomendações.', 'error');
    } finally {
      setApplyingRole(null);
    }
  };

  const localCount = advisor.recommendations.filter((r) => r.execution_mode === 'LOCAL').length;
  const onlineCount = advisor.recommendations.filter((r) => r.execution_mode === 'ONLINE').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Provedores Conectados (Ollama, Hugging Face, Gemini Online) */}
      <section className="jarvis-settings-card">
        <div className="jarvis-settings-card-header">
          <div>
            <h3 className="jarvis-settings-card-title">Provedores de IA & Roteamento Híbrido</h3>
            <p className="jarvis-settings-card-desc">
              Conecte ou desconecte provedores para recalcular automaticamente qual modelo local ou online atende melhor cada especialista.
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
            gap: '12px',
          }}
        >
          {/* Ollama Local */}
          <article className="jarvis-settings-subcard" style={{ justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>Ollama Local (PC / LAN)</strong>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: advisor.providers.ollama_connected ? '#4ade80' : 'var(--text-muted)',
                  }}
                >
                  {advisor.providers.ollama_connected ? 'Conectado' : 'Desconectado'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                Inferência privada no seu computador. Ideal para cibersegurança, dados sensíveis e código offline.
              </p>
              <div className="jarvis-tabular" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {activeProfile?.ollama_url || 'http://127.0.0.1:11434'} ·{' '}
                {advisor.providers.ollama_reachable
                  ? `Alcançável (${advisor.providers.ollama_latency_ms ?? 0} ms)`
                  : 'Standby local'}
              </div>
            </div>
            <button
              type="button"
              disabled={busyProvider !== null}
              onClick={() =>
                handleToggleProvider('ollama_connected', !advisor.providers.ollama_connected, 'Ollama Local')
              }
              className={`btn btn-sm btn-block ${advisor.providers.ollama_connected ? 'btn-secondary' : 'btn-primary'}`}
            >
              {busyProvider === 'ollama_connected' ? (
                <Loader2 size={13} className="spin" />
              ) : advisor.providers.ollama_connected ? (
                <WifiOff size={13} />
              ) : (
                <Wifi size={13} />
              )}
              <span>{advisor.providers.ollama_connected ? 'Desconectar Ollama' : 'Conectar Ollama'}</span>
            </button>
          </article>

          {/* Hugging Face Hub */}
          <article className="jarvis-settings-subcard" style={{ justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>Hugging Face Hub</strong>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: advisor.providers.huggingface_connected ? '#4ade80' : '#fbbf24',
                  }}
                >
                  {advisor.providers.huggingface_connected ? 'Conectado' : 'Desconectado'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                Catálogo aberto de modelos GGUF/quantizados. Ao desconectar, o consultor prioriza Ollama local já otimizado + Gemini Online.
              </p>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {advisor.providers.huggingface_connected
                  ? 'Busca pública ativa com filtro de VRAM'
                  : 'Modo autônomo: Hardware Local + Gemini'}
              </div>
            </div>
            <button
              type="button"
              data-testid="toggle-huggingface-btn"
              disabled={busyProvider !== null}
              onClick={() =>
                handleToggleProvider(
                  'huggingface_connected',
                  !advisor.providers.huggingface_connected,
                  'Hugging Face Hub'
                )
              }
              className={`btn btn-sm btn-block ${advisor.providers.huggingface_connected ? 'btn-secondary' : 'btn-primary'}`}
            >
              {busyProvider === 'huggingface_connected' ? (
                <Loader2 size={13} className="spin" />
              ) : advisor.providers.huggingface_connected ? (
                <WifiOff size={13} />
              ) : (
                <Wifi size={13} />
              )}
              <span>
                {advisor.providers.huggingface_connected ? 'Desconectar Hugging Face' : 'Conectar Hugging Face'}
              </span>
            </button>
          </article>

          {/* Gemini Online (gerenciado no servidor — sem campo de API Key) */}
          <article className="jarvis-settings-subcard" style={{ justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>Gemini Online</strong>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: advisor.providers.gemini_connected ? '#60a5fa' : 'var(--text-muted)',
                  }}
                >
                  {advisor.providers.gemini_connected ? 'Conectado' : 'Pausado'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                Motor online com pesquisa web ao vivo e raciocínio estruturado. Ideal para design, apresentações e pesquisa.
              </p>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <ShieldCheck size={12} color="#60a5fa" />
                <span>
                  {advisor.providers.gemini_api_configured
                    ? 'Credencial segura ativa no servidor'
                    : 'Integrado via ambiente seguro do servidor'}
                </span>
              </div>
            </div>
            <button
              type="button"
              disabled={busyProvider !== null}
              onClick={() =>
                handleToggleProvider('gemini_connected', !advisor.providers.gemini_connected, 'Gemini Online')
              }
              className={`btn btn-sm btn-block ${advisor.providers.gemini_connected ? 'btn-secondary' : 'btn-primary'}`}
            >
              {busyProvider === 'gemini_connected' ? (
                <Loader2 size={13} className="spin" />
              ) : advisor.providers.gemini_connected ? (
                <WifiOff size={13} />
              ) : (
                <Wifi size={13} />
              )}
              <span>{advisor.providers.gemini_connected ? 'Desconectar Gemini' : 'Conectar Gemini'}</span>
            </button>
          </article>
        </div>
      </section>

      {/* 2. Perfil de Hardware & GPU dos Notebooks */}
      <section className="jarvis-settings-card">
        <div className="jarvis-settings-card-header">
          <div>
            <h3 className="jarvis-settings-card-title">Perfil de Hardware & GPU do Notebook</h3>
            <p className="jarvis-settings-card-desc">
              Alterne entre seus notebooks ou ajuste CPU, RAM e VRAM para calibrar o limite de modelos locais.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setEditingProfile((prev) => !prev)}
          >
            <Sliders size={13} />
            <span>{editingProfile ? 'Fechar edição' : 'Editar hardware'}</span>
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
            gap: '10px',
          }}
        >
          {advisor.profiles.map((prof) => {
            const isSelected = prof.id === advisor.active_profile_id;
            return (
              <button
                key={prof.id}
                type="button"
                disabled={savingProfile}
                onClick={() => void handleSelectProfile(prof.id)}
                className={`jarvis-choice-card ${isSelected ? 'is-active' : ''}`}
                style={{ textAlign: 'left' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', width: '100%' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                    <Laptop size={15} color={isSelected ? 'var(--accent-light)' : 'var(--text-muted)'} />
                    {prof.label}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: isSelected ? 'var(--accent-light)' : 'var(--text-muted)', fontWeight: 600 }}>
                    {isSelected ? 'Ativo' : prof.owner}
                  </span>
                </div>
                <div
                  className="jarvis-tabular"
                  style={{
                    marginTop: '8px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '10px',
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Cpu size={12} color="var(--text-muted)" />
                    {prof.gpu_name} ({prof.vram_gb} GB VRAM)
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <HardDrive size={12} color="var(--text-muted)" />
                    {prof.ram_gb} GB RAM
                  </span>
                </div>
                <div style={{ marginTop: '4px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {prof.cpu}
                </div>
              </button>
            );
          })}
        </div>

        {editingProfile && activeProfile && (
          <form
            onSubmit={handleSaveProfileEdits}
            className="jarvis-settings-subcard"
            style={{ marginTop: '4px', gap: '12px' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span className="user-profile-field-label">Nome do computador</span>
                <input className="jarvis-input" value={formLabel} onChange={(e) => setFormLabel(e.target.value)} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span className="user-profile-field-label">Processador (CPU)</span>
                <input className="jarvis-input" value={formCpu} onChange={(e) => setFormCpu(e.target.value)} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span className="user-profile-field-label">Placa de Vídeo (GPU)</span>
                <input className="jarvis-input" value={formGpu} onChange={(e) => setFormGpu(e.target.value)} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span className="user-profile-field-label">VRAM da GPU (GB)</span>
                <input
                  type="number"
                  min={0}
                  max={192}
                  step={1}
                  className="jarvis-input jarvis-tabular"
                  value={formVram}
                  onChange={(e) => setFormVram(Number(e.target.value))}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span className="user-profile-field-label">Memória RAM (GB)</span>
                <input
                  type="number"
                  min={4}
                  max={512}
                  step={2}
                  className="jarvis-input jarvis-tabular"
                  value={formRam}
                  onChange={(e) => setFormRam(Number(e.target.value))}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span className="user-profile-field-label">Endereço Ollama (Local / LAN)</span>
                <input
                  className="jarvis-input"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  value={formOllamaUrl}
                  onChange={(e) => setFormOllamaUrl(e.target.value)}
                />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingProfile(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={savingProfile}>
                <Save size={13} />
                <span>{savingProfile ? 'Salvando…' : 'Salvar & Recalcular'}</span>
              </button>
            </div>
          </form>
        )}
      </section>

      {/* 3. Matriz "Melhor Modelo por Agente" */}
      <section className="jarvis-settings-card">
        <div className="jarvis-settings-card-header">
          <div>
            <h3 className="jarvis-settings-card-title">Melhor Modelo por Agente</h3>
            <p className="jarvis-settings-card-desc">
              Calculado para <strong>{activeProfile?.label}</strong> ({activeProfile?.vram_gb} GB VRAM · {activeProfile?.ram_gb} GB RAM) ·{' '}
              <span className="jarvis-tabular">{localCount} local</span> · <span className="jarvis-tabular">{onlineCount} online</span>.
            </p>
          </div>
          <button
            type="button"
            data-testid="apply-all-recommendations-btn"
            className="btn btn-primary btn-sm"
            disabled={applyingRole !== null}
            onClick={() => void handleApplyAll()}
          >
            {applyingRole === '__all__' ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
            <span>Aplicar em 1 clique ({advisor.recommendations.length})</span>
          </button>
        </div>

        {!advisor.providers.huggingface_connected && (
          <div className="jarvis-callout jarvis-callout--info" role="status">
            <strong>Hugging Face desconectado:</strong> o consultor priorizou modelos locais leves no Ollama para segurança e código (compatíveis com sua GPU de {activeProfile?.vram_gb} GB VRAM) e Gemini Online para design, apresentações e pesquisa web.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {advisor.recommendations.map((rec) => {
            const mascot = getDefaultMascotForRole(rec.agent_role);
            const isApplied = Boolean(appliedRoles[rec.agent_role]);
            const isApplying = applyingRole === rec.agent_role;
            return (
              <div
                key={rec.agent_role}
                data-testid={`advisor-row-${rec.agent_role}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(200px, 1.2fr) minmax(180px, 1fr) minmax(220px, 1.5fr) auto',
                  gap: '12px',
                  alignItems: 'center',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-primary)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <MascotAvatar mascot={mascot} size={34} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {rec.proper_name} · {rec.agent_name}
                    </div>
                    <div style={{ fontSize: '0.73rem', color: FIT_COLORS[rec.fit_tier], fontWeight: 500 }}>
                      {rec.fit_label}
                      {rec.required_vram_gb > 0 ? ` · ~${rec.required_vram_gb} GB VRAM` : ' · 0 GB VRAM local'}
                    </div>
                  </div>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {rec.recommended_model}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    <span
                      style={{
                        color: rec.execution_mode === 'LOCAL' ? '#4ade80' : '#60a5fa',
                        fontWeight: 700,
                      }}
                    >
                      {rec.execution_mode}
                    </span>{' '}
                    · {rec.provider === 'ollama' ? 'Ollama' : 'Gemini'}
                  </div>
                </div>

                <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {rec.reason}
                </p>

                <button
                  type="button"
                  disabled={applyingRole !== null}
                  onClick={() => void handleApplySingle(rec.agent_role, rec.proper_name, rec.recommended_model)}
                  className={`btn btn-xs ${isApplied ? 'btn-ghost' : 'btn-secondary'}`}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {isApplying ? (
                    <Loader2 size={12} className="spin" />
                  ) : isApplied ? (
                    <Check size={12} color="#4ade80" />
                  ) : null}
                  <span>{isApplied ? 'Aplicado' : 'Aplicar'}</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
