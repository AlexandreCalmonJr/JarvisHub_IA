import React, { useState, useEffect, useMemo } from 'react';
import { API_BASE } from '../../services/api/client';
import { apiFetch } from '../../services/sessionTransport';
import {
  Bot,
  Code2,
  X,
  RefreshCw,
  Key,
  Users,
  Sparkles,
  CheckCircle2,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import {
  fetchAgents,
  updateAgentConfig,
  fetchKeyVault,
  KeyVaultItem,
  fetchOfficeLiveState,
  startOfficeRoundtable,
  LiveOfficeAgentStatus,
  subscribeJarvisRealtime,
} from '../../api';
import type { RoundtableSession } from '../../../server/artifactEngine';
import { getAgentLabel, getModelLabel, humanizeLabel } from '../../types';
import type { AgentInfo } from '../../types';
import { notify } from '../../shared/common/Toast';
import { useAssistantIdentity } from '../../context/AssistantIdentityContext';
import { AgentOfficeCanvas } from './AgentOfficeCanvas';

export interface OfficeAgent {
  id: string;
  name: string;
  properName: string;
  role: string;
  department: 'command' | 'dev' | 'design' | 'infra' | 'data' | 'security';
  departmentName: string;
  mission: string;
  tools: string[];
  isReadOnly: boolean;
  preferredModel: string;
  assignedKeyId?: string;
  color: string;
}

const DEPARTMENTS: Array<{
  id: OfficeAgent['department'];
  name: string;
  color: string;
  bg: string;
  border: string;
}> = [
  { id: 'command', name: 'Comando Central', color: '#f97316', bg: 'rgba(249, 115, 22, 0.10)', border: 'rgba(249, 115, 22, 0.28)' },
  { id: 'dev', name: 'Engenharia & Código', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.10)', border: 'rgba(56, 189, 248, 0.28)' },
  { id: 'design', name: 'Design & Artefatos', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.10)', border: 'rgba(236, 72, 153, 0.28)' },
  { id: 'infra', name: 'Fluxos & DevOps', color: '#fb923c', bg: 'rgba(251, 146, 60, 0.10)', border: 'rgba(251, 146, 60, 0.28)' },
  { id: 'data', name: 'Dados & Pesquisa', color: '#22d3ee', bg: 'rgba(34, 211, 238, 0.10)', border: 'rgba(34, 211, 238, 0.28)' },
  { id: 'security', name: 'Segurança Shield', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.10)', border: 'rgba(239, 68, 68, 0.28)' },
];

const ROUNDTABLE_PRESETS = [
  'Como combinar IA local (Ollama) e Gemini online com segurança e baixo custo?',
  'Plano de lançamento de produto em 30 dias com PDF, Slides e automação',
  'Auditoria preventiva de privacidade e permissões no desktop pessoal',
];

const departmentForRole = (role: string): OfficeAgent['department'] => {
  const normalized = role.toLowerCase();
  if (/(master|orchestrat|orquestrat|project_manager|planner|coordinator|gerente)/.test(normalized)) return 'command';
  if (/(security|sentinel|privacy|compliance|red.?team|audit|incident|soc|seguran|privacidade)/.test(normalized)) return 'security';
  if (/(design|ux|ui|product|brand|accessibility|designer|presentation|document)/.test(normalized)) return 'design';
  if (/(devops|infra|network|cloud|sre|automation|flow_architect|release|platform|rede)/.test(normalized)) return 'infra';
  if (/(data|analytics|database|\bbi\b|machine_learning|research|rag|knowledge|finance|tutor|dados|pesquisa)/.test(normalized)) return 'data';
  return 'dev';
};

const toOfficeAgent = (agent: AgentInfo): OfficeAgent => {
  const department = departmentForRole(agent.role || '');
  const departmentInfo = DEPARTMENTS.find((item) => item.id === department) || DEPARTMENTS[1];
  return {
    id: agent.role,
    name: agent.name,
    properName: agent.proper_name || agent.name.split(' ')[0] || agent.role,
    role: getAgentLabel(agent.role) || agent.role,
    department,
    departmentName: departmentInfo.name,
    mission: agent.mission || 'Missão operacional configurada no catálogo.',
    tools: Array.isArray(agent.allowed_tools) ? agent.allowed_tools : [],
    isReadOnly: agent.is_read_only !== false,
    preferredModel: agent.preferred_model || 'auto_hybrid',
    assignedKeyId: agent.assigned_key_id,
    color: agent.mascot?.color || departmentInfo.color,
  };
};

interface AgentOfficeViewProps {
  onSelectForChat?: (agentId: string) => void;
}

export const AgentOfficeView: React.FC<AgentOfficeViewProps> = ({ onSelectForChat }) => {
  const { assistantName } = useAssistantIdentity();
  const [agents, setAgents] = useState<OfficeAgent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<OfficeAgent | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [vaultKeys, setVaultKeys] = useState<KeyVaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keyVaultError, setKeyVaultError] = useState<string | null>(null);
  const [canManageAgents, setCanManageAgents] = useState(false);
  const [canUseChat, setCanUseChat] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [activeKeySelection, setActiveKeySelection] = useState<string>('');
  const [officeMode, setOfficeMode] = useState<'both' | 'canvas' | 'desks'>('both');

  // Real-time office state & Mesa Redonda
  const [liveStatuses, setLiveStatuses] = useState<LiveOfficeAgentStatus[]>([]);
  const [activeRoundtable, setActiveRoundtable] = useState<RoundtableSession | null>(null);
  const [recentRoundtables, setRecentRoundtables] = useState<RoundtableSession[]>([]);
  const [roundtableTopic, setRoundtableTopic] = useState('');
  const [selectedParticipantRoles, setSelectedParticipantRoles] = useState<string[]>([
    'software_architect',
    'sentinel_security',
    'presentation_creator',
    'research_analyst',
  ]);
  const [runningRoundtable, setRunningRoundtable] = useState(false);

  const loadData = async (allowKeyManagement = canManageAgents) => {
    setLoading(true);
    setLoadError(null);
    setKeyVaultError(null);
    try {
      const [configs, liveState] = await Promise.all([
        fetchAgents(),
        fetchOfficeLiveState().catch(() => null),
      ]);
      const mapped = Array.isArray(configs) ? configs.map(toOfficeAgent) : [];
      setAgents(mapped);
      if (liveState) {
        setLiveStatuses(Array.isArray(liveState.statuses) ? liveState.statuses : []);
        if (liveState.active_roundtable) setActiveRoundtable(liveState.active_roundtable);
        setRecentRoundtables(Array.isArray(liveState.recent_roundtables) ? liveState.recent_roundtables : []);
      }
    } catch (err: any) {
      setAgents([]);
      setLoadError(err?.message || 'Não foi possível carregar o catálogo de agentes.');
    }

    if (allowKeyManagement) {
      try {
        const keys = await fetchKeyVault();
        setVaultKeys(Array.isArray(keys) ? keys : []);
      } catch (err: any) {
        setVaultKeys([]);
        setKeyVaultError(err?.message || 'Não foi possível carregar o Cofre de Chaves.');
      }
    } else {
      setVaultKeys([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API_BASE}/auth/me`)
      .then(async (response) => (response.ok ? response.json() : null))
      .then((principal) => {
        if (cancelled) return;
        const permissions = Array.isArray(principal?.permissions) ? principal.permissions : [];
        const human = principal?.kind === 'human';
        const canManage = human && permissions.includes('*');
        setCanManageAgents(canManage);
        setCanUseChat(human && (permissions.includes('*') || permissions.includes('chat:use')));
        void loadData(canManage);
      })
      .catch(() => {
        if (!cancelled) {
          setCanManageAgents(false);
          setCanUseChat(true);
          void loadData(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribe to real-time WebSocket movements and roundtable broadcasts
  useEffect(() => {
    const unsubscribe = subscribeJarvisRealtime((event) => {
      const data = event.payload || {};
      if (event.type === 'office_agent_event' && data.agent_role) {
        setLiveStatuses((prev) => {
          const next = prev.filter((s) => s.agent_role !== data.agent_role);
          next.unshift({
            agent_role: data.agent_role,
            agent_name: data.agent_name || data.agent_role,
            zone: data.zone || 'desk',
            activity: data.activity || 'Em atividade',
            mood: data.mood || 'thinking',
            updated_at: new Date().toISOString(),
          });
          return next.slice(0, 24);
        });
      } else if (event.type === 'roundtable_verdict' && (data.verdict || data.session)) {
        setActiveRoundtable((data.verdict ? data : data.session) as RoundtableSession);
      }
    });
    return unsubscribe;
  }, []);

  // Available selectable specialists for Mesa Redonda (top 8 diverse roles)
  const roundtableCandidates = useMemo(() => {
    const preferredOrder = [
      'software_architect',
      'sentinel_security',
      'presentation_creator',
      'research_analyst',
      'document_specialist',
      'ux_ui_designer',
      'finance_business',
      'flow_architect',
      'cybersecurity_engineer',
      'qa_engineer',
    ];
    const picked: OfficeAgent[] = [];
    for (const role of preferredOrder) {
      const found = agents.find((a) => a.id === role);
      if (found) picked.push(found);
    }
    if (picked.length < 6) {
      for (const ag of agents) {
        if (ag.id !== 'jarvis_master' && !picked.some((p) => p.id === ag.id)) {
          picked.push(ag);
        }
        if (picked.length >= 8) break;
      }
    }
    return picked;
  }, [agents]);

  const toggleParticipant = (role: string) => {
    setSelectedParticipantRoles((prev) => {
      if (prev.includes(role)) {
        if (prev.length <= 2) return prev;
        return prev.filter((r) => r !== role);
      }
      if (prev.length >= 6) return prev;
      return [...prev, role];
    });
  };

  const handleStartRoundtable = async (topicOverride?: string) => {
    const topicToUse = (topicOverride ?? roundtableTopic).trim();
    if (!topicToUse) {
      notify('Digite um tema para iniciar a Mesa Redonda.', 'warning');
      return;
    }
    if (topicOverride) setRoundtableTopic(topicOverride);
    setRunningRoundtable(true);
    try {
      const validRoles = selectedParticipantRoles.filter((r) => agents.some((a) => a.id === r));
      const rolesToSend =
        validRoles.length >= 2
          ? validRoles
          : roundtableCandidates.slice(0, 4).map((c) => c.id);

      const session = await startOfficeRoundtable({
        topic: topicToUse,
        participant_roles: rolesToSend,
        assistant_name: assistantName,
      });
      setActiveRoundtable(session);
      setRecentRoundtables((prev) => [session, ...prev.filter((s) => s.id !== session.id)].slice(0, 8));
      notify(`Mesa Redonda concluída e registrada no Segundo Cérebro.`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Erro ao executar Mesa Redonda.', 'error');
    } finally {
      setRunningRoundtable(false);
    }
  };

  const roundtableActiveRoles = useMemo(() => {
    if (runningRoundtable) {
      return ['jarvis_master', ...selectedParticipantRoles];
    }
    if (activeRoundtable) {
      return ['jarvis_master', ...activeRoundtable.participants.map((p) => p.role)];
    }
    return [];
  }, [runningRoundtable, activeRoundtable, selectedParticipantRoles]);

  const handleOpenDrawer = (agent: OfficeAgent) => {
    setSelectedAgent(agent);
    setActiveKeySelection(agent.assignedKeyId || '');
  };

  const handleSaveAgentKey = async () => {
    if (!canManageAgents || !selectedAgent) return;
    try {
      setSavingKey(true);
      await updateAgentConfig(selectedAgent.id, {
        preferred_model: selectedAgent.preferredModel,
        assigned_key_id: activeKeySelection || undefined,
        is_read_only: selectedAgent.isReadOnly,
      });

      setAgents((prev) =>
        prev.map((a) => (a.id === selectedAgent.id ? { ...a, assignedKeyId: activeKeySelection || undefined } : a))
      );
      setSelectedAgent((prev) => (prev ? { ...prev, assignedKeyId: activeKeySelection || undefined } : null));
      notify(`Atribuição de chave atualizada para ${selectedAgent.name}.`, 'success');
    } catch (err: any) {
      notify(`Erro ao vincular chave: ${err.message}`, 'error');
    } finally {
      setSavingKey(false);
    }
  };

  const statusMap = useMemo(() => new Map(liveStatuses.map((s) => [s.agent_role, s])), [liveStatuses]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '18px', overflowY: 'auto', paddingBottom: '28px' }}>
      {/* Cabeçalho */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          paddingBottom: '14px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
            Escritório Isométrico Vivo
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Acompanhe os especialistas se movendo em tempo real e convoque a Mesa Redonda com {assistantName}.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div className="jarvis-segmented">
            <button
              type="button"
              onClick={() => setOfficeMode('canvas')}
              className={`jarvis-segmented-btn ${officeMode === 'canvas' ? 'is-active' : ''}`}
            >
              Isométrico
            </button>
            <button
              type="button"
              onClick={() => setOfficeMode('both')}
              className={`jarvis-segmented-btn ${officeMode === 'both' ? 'is-active' : ''}`}
            >
              Completo
            </button>
            <button
              type="button"
              onClick={() => setOfficeMode('desks')}
              className={`jarvis-segmented-btn ${officeMode === 'desks' ? 'is-active' : ''}`}
            >
              Estações
            </button>
          </div>

          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="btn btn-ghost btn-icon-sm"
            title="Atualizar escritório"
            aria-label="Atualizar escritório"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loadError && agents.length === 0 && (
        <div role="alert" className="glass-panel" style={{ padding: '14px', color: 'var(--danger-color)' }}>
          {loadError}
        </div>
      )}

      {loading && agents.length === 0 && (
        <div role="status" className="glass-panel" style={{ padding: '14px', color: 'var(--text-secondary)' }}>
          Carregando especialistas do escritório…
        </div>
      )}

      {agents.length > 0 && (
        <>
          {/* Grade principal: Canvas Isométrico + Painel Mesa Redonda ao Vivo */}
          {(officeMode === 'canvas' || officeMode === 'both') && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.55fr) minmax(320px, 1fr)',
                gap: '16px',
                alignItems: 'start',
              }}
            >
              <AgentOfficeCanvas
                agents={agents}
                onSelectAgent={handleOpenDrawer}
                liveStatuses={liveStatuses}
                roundtableActiveRoles={roundtableActiveRoles}
                roundtableTopic={runningRoundtable ? roundtableTopic || 'Deliberação em andamento' : activeRoundtable?.topic || null}
                assistantName={assistantName}
              />

              {/* Painel Interativo: Mesa Redonda ao Vivo */}
              <section
                aria-label="Mesa Redonda ao Vivo"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Users size={16} color="var(--accent-light)" />
                    <h2 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Mesa Redonda ao Vivo
                    </h2>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {selectedParticipantRoles.length} especialistas
                  </span>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleStartRoundtable();
                  }}
                  style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
                >
                  <label htmlFor="roundtable-topic-input" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Pauta da deliberação
                  </label>
                  <textarea
                    id="roundtable-topic-input"
                    data-testid="roundtable-topic-input"
                    rows={2}
                    value={roundtableTopic}
                    onChange={(e) => setRoundtableTopic(e.target.value)}
                    placeholder="Ex.: Definir arquitetura segura para o aplicativo com IA híbrida e slides executivos"
                    className="jarvis-input"
                    style={{ width: '100%', resize: 'vertical', fontSize: '0.82rem', padding: '9px 11px' }}
                  />

                  {/* Presets rápidos */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Sugestões rápidas:</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {ROUNDTABLE_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setRoundtableTopic(preset)}
                          className="btn btn-ghost btn-xs btn-start"
                          style={{
                            justifyContent: 'flex-start',
                            textAlign: 'left',
                            color: 'var(--text-secondary)',
                            fontSize: '0.74rem',
                            padding: '5px 8px',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          <Sparkles size={11} color="var(--accent-light)" style={{ flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preset}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Seleção de especialistas */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Participantes convocados (2 a 6):
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
                      {roundtableCandidates.slice(0, 6).map((cand) => {
                        const checked = selectedParticipantRoles.includes(cand.id);
                        return (
                          <label
                            key={cand.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '6px 8px',
                              borderRadius: 'var(--radius-md)',
                              border: `1px solid ${checked ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
                              backgroundColor: checked ? 'var(--accent-soft)' : 'var(--bg-primary)',
                              cursor: 'pointer',
                              fontSize: '0.74rem',
                              color: checked ? 'var(--text-primary)' : 'var(--text-secondary)',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleParticipant(cand.id)}
                              style={{ accentColor: '#f97316' }}
                            />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: checked ? 600 : 400 }}>
                              {cand.properName}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="submit"
                    data-testid="start-roundtable-btn"
                    disabled={runningRoundtable}
                    className="btn btn-primary btn-block"
                  >
                    {runningRoundtable ? <Loader2 size={15} className="animate-spin" /> : <Users size={15} />}
                    <span>{runningRoundtable ? 'Deliberando na Mesa Redonda...' : 'Iniciar Mesa Redonda'}</span>
                  </button>
                </form>

                {/* Resultado da Mesa Redonda */}
                {activeRoundtable && (
                  <div
                    data-testid="roundtable-result-panel"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      borderTop: '1px solid var(--border-color)',
                      paddingTop: '12px',
                      maxHeight: '380px',
                      overflowY: 'auto',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                        Deliberações · {activeRoundtable.turns.length} pareceres
                      </strong>
                      <span style={{ fontSize: '0.7rem', color: '#4ade80', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={12} /> Salvo no Cérebro
                      </span>
                    </div>

                    {activeRoundtable.turns.map((turn) => (
                      <div
                        key={turn.id}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-md)',
                          backgroundColor: 'var(--bg-primary)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent-light)' }}>
                            {turn.agent_proper_name}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{turn.stance}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.77rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
                          {turn.key_point}
                        </p>
                        <p style={{ margin: 0, fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                          Recomendação: {turn.recommendation}
                        </p>
                      </div>
                    ))}

                    <div
                      data-testid="roundtable-verdict"
                      style={{
                        padding: '12px',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'rgba(249, 115, 22, 0.08)',
                        border: '1px solid var(--border-accent)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-light)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Veredito de {activeRoundtable.assistant_name}
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                        {activeRoundtable.verdict}
                      </p>
                      {activeRoundtable.action_items.length > 0 && (
                        <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {activeRoundtable.action_items.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                {!activeRoundtable && recentRoundtables.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Últimas deliberações</span>
                    {recentRoundtables.slice(0, 3).map((rt) => (
                      <button
                        key={rt.id}
                        type="button"
                        onClick={() => setActiveRoundtable(rt)}
                        className="btn btn-ghost btn-xs btn-start"
                        style={{ justifyContent: 'space-between', border: '1px solid var(--border-subtle)', padding: '6px 8px' }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rt.topic}</span>
                        <span className="jarvis-tabular" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          {rt.turns.length} votos
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* Filtros e Grade das Estações */}
          {(officeMode === 'desks' || officeMode === 'both') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Estações por Departamento ({agents.length})
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedDepartment('all')}
                    className={`btn btn-xs ${selectedDepartment === 'all' ? 'btn-secondary is-active' : 'btn-ghost'}`}
                  >
                    Todos ({agents.length})
                  </button>
                  {DEPARTMENTS.filter((dept) => agents.some((agent) => agent.department === dept.id)).map((dept) => (
                    <button
                      key={dept.id}
                      type="button"
                      onClick={() => setSelectedDepartment(dept.id)}
                      className={`btn btn-xs ${selectedDepartment === dept.id ? 'btn-secondary is-active' : 'btn-ghost'}`}
                    >
                      {dept.name}
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
                  gap: '14px',
                }}
              >
                {DEPARTMENTS.filter((d) => selectedDepartment === 'all' || selectedDepartment === d.id).map((dept) => {
                  const deptAgents = agents.filter((a) => a.department === dept.id);
                  if (deptAgents.length === 0) return null;
                  return (
                    <div
                      key={dept.id}
                      style={{
                        borderRadius: 'var(--radius-lg)',
                        backgroundColor: 'var(--bg-secondary)',
                        border: `1px solid ${dept.border}`,
                        padding: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderBottom: `1px solid ${dept.border}`,
                          paddingBottom: '8px',
                        }}
                      >
                        <span style={{ fontSize: '0.84rem', fontWeight: 700, color: dept.color }}>{dept.name}</span>
                        <span className="jarvis-tabular" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {deptAgents.length} agentes
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(136px, 1fr))', gap: '8px' }}>
                        {deptAgents.map((agent) => {
                          const live = statusMap.get(agent.id);
                          const isActiveNow = Boolean(live && live.mood !== 'idle');
                          return (
                            <button
                              type="button"
                              key={agent.id}
                              onClick={() => handleOpenDrawer(agent)}
                              className="jarvis-choice-card"
                              style={{ alignItems: 'center', textAlign: 'center', position: 'relative', padding: '10px 8px' }}
                            >
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '8px',
                                  right: '8px',
                                  width: '7px',
                                  height: '7px',
                                  borderRadius: '50%',
                                  backgroundColor: isActiveNow ? '#4ade80' : 'var(--text-muted)',
                                }}
                                title={live?.activity || 'Disponível'}
                              />
                              <div
                                style={{
                                  width: '36px',
                                  height: '36px',
                                  borderRadius: '10px',
                                  backgroundColor: dept.bg,
                                  border: `1px solid ${dept.border}`,
                                  color: dept.color,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  marginBottom: '6px',
                                }}
                              >
                                <Bot size={18} />
                              </div>
                              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {agent.properName}
                              </div>
                              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {live?.activity || agent.role}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Drawer Lateral de Detalhes do Especialista */}
      {selectedAgent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setSelectedAgent(null)}
        >
          <div
            style={{
              width: '380px',
              maxWidth: '90vw',
              height: '100%',
              backgroundColor: 'var(--bg-secondary)',
              borderLeft: '1px solid var(--border-color)',
              padding: '22px',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    backgroundColor: `${selectedAgent.color}22`,
                    border: `1px solid ${selectedAgent.color}55`,
                    color: selectedAgent.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Code2 size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {selectedAgent.properName} · {selectedAgent.name}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: selectedAgent.color }}>{selectedAgent.departmentName}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAgent(null)}
                className="btn btn-ghost btn-icon-sm"
                aria-label="Fechar detalhes do agente"
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '12px',
              }}
            >
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Missão Operacional
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.45 }}>
                {selectedAgent.mission}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
              <span>{selectedAgent.isReadOnly ? 'Somente leitura' : 'Leitura e escrita'}</span>
              <span>·</span>
              <span className="jarvis-tabular">{selectedAgent.tools.length} ferramentas</span>
            </div>

            {canManageAgents && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label htmlFor="office-key-select" style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Roteamento de Provedor
                </label>
                {keyVaultError && <div role="alert" style={{ color: 'var(--danger-color)', fontSize: '0.76rem' }}>{keyVaultError}</div>}
                <select
                  id="office-key-select"
                  className="jarvis-input"
                  value={activeKeySelection}
                  onChange={(e) => setActiveKeySelection(e.target.value)}
                  style={{ fontSize: '0.82rem', padding: '8px 10px' }}
                >
                  <option value="">Roteamento Híbrido Automático</option>
                  {vaultKeys.map((k) => (
                    <option key={k.key_id} value={k.key_id}>
                      {(k.provider_name || (k as any).provider || 'AI').toUpperCase()} — {k.label || humanizeLabel(k.key_id)}{' '}
                      {(k.preferred_model || (k as any).default_model) ? `(${getModelLabel(k.preferred_model || (k as any).default_model)})` : ''}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={handleSaveAgentKey} disabled={savingKey} className="btn btn-primary btn-block">
                  <Key size={14} />
                  <span>{savingKey ? 'Salvando...' : 'Salvar roteamento'}</span>
                </button>
              </div>
            )}

            {onSelectForChat && canUseChat && (
              <div style={{ marginTop: 'auto' }}>
                <button
                  type="button"
                  onClick={() => {
                    onSelectForChat(selectedAgent.id);
                    setSelectedAgent(null);
                  }}
                  className="btn btn-secondary btn-block"
                >
                  <MessageSquare size={15} />
                  <span>Conversar com {selectedAgent.properName} no Chat</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
