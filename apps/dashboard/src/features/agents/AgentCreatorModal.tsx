import React, { useEffect, useState } from 'react';
import {
  History,
  Palette,
  RotateCcw,
  Save,
  Sliders,
  Trash2,
  X,
} from 'lucide-react';
import { AgentInfo, AgentVersionSnapshot } from '../../types';
import {
  createAgent,
  deleteAgent,
  fetchAgentVersions,
  rollbackAgentVersion,
  updateAgentConfig,
} from '../../api';
import {
  MASCOT_ACCESSORY_LABELS,
  MASCOT_CATALOG,
  MASCOT_COLOR_PALETTE,
  MASCOT_MOOD_LABELS,
  MascotAccessory,
  MascotId,
  MascotMood,
  getDefaultMascotForRole,
} from '../../services/mascots';
import { MascotAvatar } from '../../shared/common/MascotAvatar';
import { notify } from '../../shared/common/Toast';
import { canUninstallAgent } from '../../services/agentTemplates';

interface AgentCreatorModalProps {
  isOpen: boolean;
  editingAgent: AgentInfo | null;
  allAgents: AgentInfo[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

const MODEL_CHOICES = [
  { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen (Online · Pesquisa Web)' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (Online · Ultra Rápido)' },
  { id: 'llama3.1:8b', label: 'Llama 3.1 8B (Local Ollama · Privacidade)' },
  { id: 'qwen2.5-coder:7b', label: 'Qwen 2.5 Coder 7B (Local Ollama · Código)' },
  { id: 'llama3.2:3b', label: 'Llama 3.2 3B (Local Ollama · Leve)' },
  { id: 'auto_hybrid', label: 'Híbrido Automático (Local + Gemini)' },
];

const CATEGORY_CHOICES = [
  { id: 'studies', label: 'Estudos & Pesquisa' },
  { id: 'creative', label: 'Criativo, Slides & PDFs' },
  { id: 'security', label: 'Segurança & Auditoria' },
  { id: 'business', label: 'Finanças & Negócios' },
  { id: 'dev', label: 'Engenharia & Código' },
  { id: 'orchestration', label: 'Orquestração & Fluxos' },
];

export const AgentCreatorModal: React.FC<AgentCreatorModalProps> = ({
  isOpen,
  editingAgent,
  allAgents,
  onClose,
  onSaved,
}) => {
  const isEditing = Boolean(editingAgent);
  const [activeTab, setActiveTab] = useState<'identity' | 'behavior' | 'versions'>('identity');

  const initialMascot = editingAgent?.mascot
    ? editingAgent.mascot
    : getDefaultMascotForRole(editingAgent?.role || 'studies');

  const [properName, setProperName] = useState(editingAgent?.proper_name || '');
  const [name, setName] = useState(editingAgent?.name || '');
  const [handle, setHandle] = useState(editingAgent?.handle || '');
  const [category, setCategory] = useState(editingAgent?.category || 'studies');
  const [mission, setMission] = useState(editingAgent?.mission || '');
  const [systemPrompt, setSystemPrompt] = useState(editingAgent?.system_prompt || '');

  const [mascotId, setMascotId] = useState<MascotId>((initialMascot.id as MascotId) || 'scholar_fox');
  const [mascotColor, setMascotColor] = useState(initialMascot.color || '#f97316');
  const [mascotAccessory, setMascotAccessory] = useState<MascotAccessory>(
    (initialMascot.accessory as MascotAccessory) || 'glasses'
  );
  const [mascotMood, setMascotMood] = useState<MascotMood>((initialMascot.mood as MascotMood) || 'idle');

  const [preferredModel, setPreferredModel] = useState(editingAgent?.preferred_model || 'gemini-4-hydrogen');
  const [routingPolicy, setRoutingPolicy] = useState<'auto_hybrid' | 'local_only' | 'online_only'>(
    editingAgent?.routing_policy || 'auto_hybrid'
  );
  const [autonomyLevel, setAutonomyLevel] = useState<'read_only' | 'ask_approval' | 'autonomous'>(
    editingAgent?.autonomy_level || (editingAgent?.is_read_only ? 'read_only' : 'ask_approval')
  );
  const [strictFocus, setStrictFocus] = useState(Boolean(editingAgent?.strict_focus));
  const [strictTopic, setStrictTopic] = useState(editingAgent?.strict_topic || '');
  const [delegationTargets, setDelegationTargets] = useState<string[]>(editingAgent?.delegation_targets || []);
  const [changeSummary, setChangeSummary] = useState('');

  const [versions, setVersions] = useState<AgentVersionSnapshot[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !editingAgent) return;
    setLoadingVersions(true);
    fetchAgentVersions(editingAgent.role)
      .then((list) => setVersions(list))
      .catch(() => setVersions([]))
      .finally(() => setLoadingVersions(false));
  }, [isOpen, editingAgent]);

  if (!isOpen) return null;

  const autoHandle = (inputName: string) => {
    const clean = inputName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
    return clean ? `@${clean}` : '';
  };

  const toggleDelegation = (role: string) => {
    setDelegationTargets((prev) =>
      prev.includes(role) ? prev.filter((item) => item !== role) : [...prev, role]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanProper = properName.trim();
    const cleanName = name.trim() || cleanProper;
    if (!cleanProper || cleanProper.length < 2) {
      setError('Informe um nome próprio para o especialista (ex.: Luna, Kira, Pedro).');
      setActiveTab('identity');
      return;
    }

    setSaving(true);
    setError(null);
    const finalHandle = (handle.trim() || autoHandle(cleanProper)).replace(/\s+/g, '');
    const payload = {
      proper_name: cleanProper,
      name: cleanName,
      handle: finalHandle.startsWith('@') ? finalHandle : `@${finalHandle}`,
      category,
      mission: mission.trim() || `Especialista ${cleanProper} focado em ${cleanName}.`,
      system_prompt:
        systemPrompt.trim() ||
        `Você é ${cleanProper} (${cleanName}). Atue com clareza, precisão e foco na sua missão.`,
      preferred_model: preferredModel,
      routing_policy: routingPolicy,
      autonomy_level: autonomyLevel,
      is_read_only: autonomyLevel === 'read_only',
      strict_focus: strictFocus,
      strict_topic: strictTopic.trim(),
      delegation_targets: delegationTargets,
      mascot: {
        id: mascotId,
        color: mascotColor,
        accessory: mascotAccessory,
        mood: mascotMood,
      },
      change_summary: changeSummary.trim() || (isEditing ? 'Ajuste de identidade e comportamento' : 'Criação inicial'),
    };

    try {
      if (isEditing && editingAgent) {
        await updateAgentConfig(editingAgent.role, payload);
        notify(`Especialista ${cleanProper} atualizado (nova versão salva).`, 'success');
      } else {
        await createAgent(payload);
        notify(`Especialista ${cleanProper} (${payload.handle}) criado com sucesso!`, 'success');
      }
      await onSaved();
      onClose();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar especialista.');
    } finally {
      setSaving(false);
    }
  };

  const handleRollback = async (version: number) => {
    if (!editingAgent) return;
    setSaving(true);
    setError(null);
    try {
      await rollbackAgentVersion(editingAgent.role, version);
      notify(`Versão v${version} de ${editingAgent.proper_name || editingAgent.name} restaurada!`, 'success');
      await onSaved();
      onClose();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Falha ao reverter versão.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingAgent || !canUninstallAgent(editingAgent)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteAgent(editingAgent.role);
      notify(`Especialista ${editingAgent.proper_name || editingAgent.name} desinstalado.`, 'info');
      await onSaved();
      onClose();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Não foi possível desinstalar este especialista.');
    } finally {
      setSaving(false);
    }
  };

  const previewMascot = {
    id: mascotId,
    color: mascotColor,
    accessory: mascotAccessory,
    mood: mascotMood,
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        backgroundColor: 'rgba(5, 7, 11, 0.78)',
        backdropFilter: 'blur(6px)',
        display: 'grid',
        placeItems: 'center',
        padding: '18px',
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-creator-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(760px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          borderRadius: '16px',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          padding: '22px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        {/* Header with live Mascot preview */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
            <MascotAvatar
              mascot={previewMascot}
              name={properName || name || 'Especialista'}
              size={52}
            />
            <div style={{ minWidth: 0 }}>
              <h2
                id="agent-creator-title"
                style={{ margin: 0, fontSize: '1.12rem', fontWeight: 700, color: 'var(--text-primary)' }}
              >
                {isEditing ? `Editar ${editingAgent?.proper_name || editingAgent?.name}` : 'Criar Novo Especialista'}
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {properName || 'Novo nome'} · {handle || autoHandle(properName) || '@especialista'} ·{' '}
                {MASCOT_MOOD_LABELS[mascotMood]}
                {isEditing && editingAgent?.version ? ` · v${editingAgent.version}` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-icon"
            aria-label="Fechar editor de especialista"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation tabs */}
        <div role="tablist" aria-label="Abas do criador de agente" className="jarvis-segmented">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'identity'}
            onClick={() => setActiveTab('identity')}
            className={`jarvis-segmented-btn ${activeTab === 'identity' ? 'is-active' : ''}`}
          >
            <Palette size={13} />
            <span>Identidade & Mascote</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'behavior'}
            onClick={() => setActiveTab('behavior')}
            className={`jarvis-segmented-btn ${activeTab === 'behavior' ? 'is-active' : ''}`}
          >
            <Sliders size={13} />
            <span>Modelo, Foco & Delegação</span>
          </button>
          {isEditing && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'versions'}
              onClick={() => setActiveTab('versions')}
              className={`jarvis-segmented-btn ${activeTab === 'versions' ? 'is-active' : ''}`}
            >
              <History size={13} />
              <span>Versões ({versions.length})</span>
            </button>
          )}
        </div>

        {error && (
          <div role="alert" className="jarvis-error-banner">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {activeTab === 'identity' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
                <div>
                  <label htmlFor="ag-proper-name" className="jarvis-field-label">
                    Nome próprio (como você vai chamar)
                  </label>
                  <input
                    id="ag-proper-name"
                    value={properName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setProperName(val);
                      if (!isEditing && !handle) {
                        // preview stays reactive
                      }
                    }}
                    placeholder="Ex: Kira, Luna, Pedro, Sofia"
                    className="jarvis-input"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="ag-handle" className="jarvis-field-label">
                    Atalho no chat (@handle)
                  </label>
                  <input
                    id="ag-handle"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder={autoHandle(properName) || '@luna'}
                    className="jarvis-input mono"
                  />
                </div>
                <div>
                  <label htmlFor="ag-category" className="jarvis-field-label">
                    Área / Categoria
                  </label>
                  <select
                    id="ag-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="jarvis-input"
                  >
                    {CATEGORY_CHOICES.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="ag-role-title" className="jarvis-field-label">
                  Função / Especialidade
                </label>
                <input
                  id="ag-role-title"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Tutora de Biologia e Revisão de Provas"
                  className="jarvis-input"
                  required
                />
              </div>

              <div>
                <label htmlFor="ag-mission" className="jarvis-field-label">
                  Missão principal
                </label>
                <textarea
                  id="ag-mission"
                  rows={2}
                  value={mission}
                  onChange={(e) => setMission(e.target.value)}
                  placeholder="Descreva o que este agente faz de melhor..."
                  className="jarvis-input"
                />
              </div>

              {/* Estúdio de Mascotes */}
              <div
                style={{
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Estúdio de Mascotes
                  </span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Escolha o bichinho, cor do destaque e acessório
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: '10px',
                  }}
                >
                  {MASCOT_CATALOG.map((preset) => {
                    const selected = mascotId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setMascotId(preset.id);
                          setMascotColor(preset.defaultColor);
                          setMascotAccessory(preset.defaultAccessory);
                        }}
                        className={`jarvis-choice-card ${selected ? 'is-active' : ''}`}
                        style={{
                          alignItems: 'center',
                          textAlign: 'center',
                          padding: '10px 8px',
                          gap: '8px',
                        }}
                      >
                        <MascotAvatar
                          mascot={{ id: preset.id, color: preset.defaultColor, accessory: 'none' }}
                          name={preset.name}
                          size={48}
                          showAccessory={false}
                        />
                        <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {preset.name}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div>
                    <span className="jarvis-field-label">Cor de destaque</span>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                      {MASCOT_COLOR_PALETTE.map((swatch) => (
                        <button
                          key={swatch.value}
                          type="button"
                          onClick={() => setMascotColor(swatch.value)}
                          title={swatch.label}
                          aria-label={swatch.label}
                          aria-pressed={mascotColor === swatch.value}
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '8px',
                            backgroundColor: swatch.value,
                            border: mascotColor === swatch.value ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                            cursor: 'pointer',
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="ag-accessory" className="jarvis-field-label">
                      Acessório
                    </label>
                    <select
                      id="ag-accessory"
                      value={mascotAccessory}
                      onChange={(e) => setMascotAccessory(e.target.value as MascotAccessory)}
                      className="jarvis-input"
                    >
                      {Object.entries(MASCOT_ACCESSORY_LABELS).map(([k, lbl]) => (
                        <option key={k} value={k}>
                          {lbl}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="ag-mood" className="jarvis-field-label">
                      Estado padrão
                    </label>
                    <select
                      id="ag-mood"
                      value={mascotMood}
                      onChange={(e) => setMascotMood(e.target.value as MascotMood)}
                      className="jarvis-input"
                    >
                      {Object.entries(MASCOT_MOOD_LABELS).map(([k, lbl]) => (
                        <option key={k} value={k}>
                          {lbl}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'behavior' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                <div>
                  <label htmlFor="ag-model" className="jarvis-field-label">
                    Modelo de IA preferido
                  </label>
                  <select
                    id="ag-model"
                    value={preferredModel}
                    onChange={(e) => setPreferredModel(e.target.value)}
                    className="jarvis-input"
                  >
                    {MODEL_CHOICES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="ag-routing" className="jarvis-field-label">
                    Política Local ↔ Online
                  </label>
                  <select
                    id="ag-routing"
                    value={routingPolicy}
                    onChange={(e) => setRoutingPolicy(e.target.value as any)}
                    className="jarvis-input"
                  >
                    <option value="auto_hybrid">Automático Híbrido (Local com fallback Gemini)</option>
                    <option value="local_only">Somente Local (Ollama no notebook)</option>
                    <option value="online_only">Somente Online (Gemini + Pesquisa Web)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="ag-autonomy" className="jarvis-field-label">
                    Nível de Autonomia
                  </label>
                  <select
                    id="ag-autonomy"
                    value={autonomyLevel}
                    onChange={(e) => setAutonomyLevel(e.target.value as any)}
                    className="jarvis-input"
                  >
                    <option value="read_only">Somente Leitura & Análise</option>
                    <option value="ask_approval">Pedir Aprovação antes de agir</option>
                    <option value="autonomous">Autônomo no Workspace</option>
                  </select>
                </div>
              </div>

              {/* Foco Estrito */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={strictFocus}
                    onChange={(e) => setStrictFocus(e.target.checked)}
                  />
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Ativar Foco Estrito no domínio
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      O especialista recusa gentilmente assuntos fora do tema escolhido (ex.: só Matemática ou só Segurança).
                    </div>
                  </div>
                </label>

                {strictFocus && (
                  <input
                    value={strictTopic}
                    onChange={(e) => setStrictTopic(e.target.value)}
                    placeholder="Tema exclusivo (ex.: Matemática e Estatística)"
                    className="jarvis-input"
                  />
                )}
              </div>

              <div>
                <label htmlFor="ag-prompt" className="jarvis-field-label">
                  Instruções de personalidade e comportamento (System Prompt)
                </label>
                <textarea
                  id="ag-prompt"
                  rows={4}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Explique como este agente deve responder, tom de voz, formato preferido..."
                  className="jarvis-input"
                />
              </div>

              {/* Delegação entre agentes */}
              <div>
                <span className="jarvis-field-label">Pode delegar tarefas para outros especialistas</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                  {allAgents
                    .filter((a) => a.role !== editingAgent?.role)
                    .slice(0, 12)
                    .map((other) => {
                      const active = delegationTargets.includes(other.role);
                      return (
                        <button
                          key={other.role}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleDelegation(other.role)}
                          className={`btn btn-xs ${active ? 'btn-secondary is-active' : 'btn-ghost'}`}
                        >
                          <span>{other.proper_name || other.name}</span>
                        </button>
                      );
                    })}
                </div>
              </div>

              {isEditing && (
                <div>
                  <label htmlFor="ag-change-note" className="jarvis-field-label">
                    Nota desta versão (opcional, para histórico de rollback)
                  </label>
                  <input
                    id="ag-change-note"
                    value={changeSummary}
                    onChange={(e) => setChangeSummary(e.target.value)}
                    placeholder="Ex.: Ajustei modelo para Gemini Online e ativei foco estrito"
                    className="jarvis-input"
                  />
                </div>
              )}
            </>
          )}

          {activeTab === 'versions' && isEditing && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {loadingVersions ? (
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Carregando histórico de versões...
                </p>
              ) : versions.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Nenhuma versão anterior registrada ainda.
                </p>
              ) : (
                versions.map((ver, index) => (
                  <div
                    key={`${ver.version}-${index}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      backgroundColor: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        <span className="jarvis-tabular" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-light)' }}>
                          v{ver.version}
                        </span>{' '}
                        · {ver.summary}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                        {new Date(ver.saved_at).toLocaleString('pt-BR')} · Modelo: {ver.snapshot.preferred_model}
                      </div>
                    </div>
                    {index === 0 ? (
                      <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#4ade80', whiteSpace: 'nowrap' }}>
                        Versão atual
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleRollback(ver.version)}
                        className="btn btn-secondary btn-xs"
                      >
                        <RotateCcw size={12} />
                        <span>Restaurar</span>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Footer actions */}
          {activeTab !== 'versions' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                borderTop: '1px solid var(--border-subtle)',
                paddingTop: '14px',
              }}
            >
              <div>
                {editingAgent && canUninstallAgent(editingAgent) && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleDelete()}
                    className="btn btn-ghost btn-sm"
                    style={{ color: '#f87171' }}
                  >
                    <Trash2 size={14} />
                    <span>Desinstalar</span>
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
                  <Save size={14} />
                  <span>{saving ? 'Salvando...' : isEditing ? 'Salvar nova versão' : 'Criar especialista'}</span>
                </button>
              </div>
            </div>
          )}
        </form>
      </section>
    </div>
  );
};
