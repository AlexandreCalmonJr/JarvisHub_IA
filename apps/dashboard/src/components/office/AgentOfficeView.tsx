import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../services/api/client';
import {
  Bot,
  Code2,
  X,
  RefreshCw,
  Key,
} from 'lucide-react';
import { fetchAgents, updateAgentConfig, fetchKeyVault, KeyVaultItem } from '../../api';
import type { AgentInfo } from '../../types';
import { notify } from '../common/Toast';
import { AgentOfficeCanvas } from './AgentOfficeCanvas';

export interface OfficeAgent {
  id: string;
  name: string;
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
  { id: 'command', name: 'Comando Central & Orquestração', color: '#eab308', bg: 'rgba(234, 179, 8, 0.08)', border: 'rgba(234, 179, 8, 0.25)' },
  { id: 'dev', name: 'Engenharia de Software', color: '#d97757', bg: 'rgba(217, 119, 87, 0.08)', border: 'rgba(217, 119, 87, 0.25)' },
  { id: 'design', name: 'Design, UX & Produto', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.08)', border: 'rgba(236, 72, 153, 0.25)' },
  { id: 'infra', name: 'DevOps & Automação', color: '#f97316', bg: 'rgba(249, 115, 22, 0.08)', border: 'rgba(249, 115, 22, 0.25)' },
  { id: 'data', name: 'Dados & Inteligência', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.08)', border: 'rgba(6, 182, 212, 0.25)' },
  { id: 'security', name: 'Segurança & Conformidade', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.25)' },
];

const departmentForRole = (role: string): OfficeAgent['department'] => {
  const normalized = role.toLowerCase();
  if (/(master|orchestrat|orquestrat|project_manager|planner|coordinator|gerente)/.test(normalized)) return 'command';
  if (/(security|privacy|compliance|red.?team|audit|incident|soc|seguran|privacidade)/.test(normalized)) return 'security';
  if (/(design|ux|ui|product|brand|accessibility|designer)/.test(normalized)) return 'design';
  if (/(devops|infra|network|cloud|sre|automation|release|platform|rede)/.test(normalized)) return 'infra';
  if (/(data|analytics|database|\\bbi\\b|machine_learning|research|rag|knowledge|dados|pesquisa)/.test(normalized)) return 'data';
  return 'dev';
};

const toOfficeAgent = (agent: AgentInfo): OfficeAgent => {
  const department = departmentForRole(agent.role || '');
  const departmentInfo = DEPARTMENTS.find((item) => item.id === department) || DEPARTMENTS[1];
  return {
    id: agent.role,
    name: agent.name,
    role: agent.role,
    department,
    departmentName: departmentInfo.name,
    mission: agent.mission || 'Missão não descrita no catálogo.',
    tools: Array.isArray(agent.allowed_tools) ? agent.allowed_tools : [],
    isReadOnly: agent.is_read_only !== false,
    preferredModel: agent.preferred_model || 'auto_hybrid',
    assignedKeyId: agent.assigned_key_id,
    color: departmentInfo.color,
  };
};

interface AgentOfficeViewProps {
  onSelectForChat?: (agentId: string) => void;
}

export const AgentOfficeView: React.FC<AgentOfficeViewProps> = ({ onSelectForChat }) => {
  const [agents, setAgents] = useState<OfficeAgent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<OfficeAgent | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [vaultKeys, setVaultKeys] = useState<KeyVaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keyVaultError, setKeyVaultError] = useState<string | null>(null);
  const [canManageAgents, setCanManageAgents] = useState(false);
  const [canUseChat, setCanUseChat] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [activeKeySelection, setActiveKeySelection] = useState<string>('');
  const [officeMode, setOfficeMode] = useState<'both' | 'canvas' | 'desks'>('both');

  const loadData = async (allowKeyManagement = canManageAgents) => {
    setLoading(true);
    setLoadError(null);
    setKeyVaultError(null);
    try {
      const configs = await fetchAgents();
      setAgents(Array.isArray(configs) ? configs.map(toOfficeAgent) : []);
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
    fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((principal) => {
        if (cancelled) return;
        const permissions = Array.isArray(principal?.permissions) ? principal.permissions : [];
        const human = principal?.kind === 'human';
        const canManage = human && (permissions.includes('*') || permissions.includes('agents:write'));
        setCanManageAgents(canManage);
        setCanUseChat(human && (permissions.includes('*') || permissions.includes('chat:use')));
        setRoleLoaded(true);
        void loadData(canManage);
      })
      .catch(() => {
        if (!cancelled) {
          setCanManageAgents(false);
          setCanUseChat(false);
          setRoleLoaded(true);
          void loadData(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '20px' }}>
      {!roleLoaded && <div role="status" className="glass-panel" style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>A verificar permissões do Escritório Virtual…</div>}
      {/* Topo: Cabeçalho Clean & Filtros Rápidos */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Escritório Virtual de Agentes ({agents.length})
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Visualização animada do catálogo registado; os movimentos são ilustrativos e não representam atividade em tempo real. {canManageAgents ? 'Clique numa mesa para configurar o agente.' : 'Clique numa mesa para consultar os detalhes.'}
          </p>
        </div>

        {/* Filtros por Departamento */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setSelectedDepartment('all')}
            className="btn btn-ghost"
            style={{
              fontSize: '0.75rem',
              padding: '5px 10px',
              borderRadius: '6px',
              backgroundColor: selectedDepartment === 'all' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
              color: selectedDepartment === 'all' ? 'var(--text-primary)' : 'var(--text-muted)',
              border: '1px solid var(--border-color)',
            }}
          >
            Todos ({agents.length})
          </button>
          {DEPARTMENTS.filter((dept) => agents.some((agent) => agent.department === dept.id)).map((dept) => {
            const isSel = selectedDepartment === dept.id;
            return (
              <button
                key={dept.id}
                type="button"
                onClick={() => setSelectedDepartment(dept.id)}
                className="btn btn-ghost"
                style={{
                  fontSize: '0.75rem',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  backgroundColor: isSel ? dept.bg : 'transparent',
                  color: isSel ? dept.color : 'var(--text-secondary)',
                  border: isSel ? `1px solid ${dept.border}` : '1px solid transparent',
                  transition: 'all 0.15s ease',
                }}
              >
                {dept.name.split(' ')[0]} {dept.name.split(' ')[1] || ''}
              </button>
            );
          })}

          {/* Alternador de Modo de Visualização */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              borderRadius: '8px',
              padding: '2px',
              border: '1px solid var(--border-color)',
            }}
          >
            <button
              type="button"
              onClick={() => setOfficeMode('canvas')}
              className="btn btn-ghost"
              style={{
                fontSize: '0.72rem',
                padding: '4px 8px',
                borderRadius: '6px',
                backgroundColor: officeMode === 'canvas' ? 'rgba(234, 179, 8, 0.2)' : 'transparent',
                color: officeMode === 'canvas' ? '#eab308' : 'var(--text-muted)',
              }}
              title="Exibir apenas a Planta Baixa 2.5D com Avatares"
            >
              2.5D Avatares
            </button>
            <button
              type="button"
              onClick={() => setOfficeMode('both')}
              className="btn btn-ghost"
              style={{
                fontSize: '0.72rem',
                padding: '4px 8px',
                borderRadius: '6px',
                backgroundColor: officeMode === 'both' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                color: officeMode === 'both' ? '#818cf8' : 'var(--text-muted)',
              }}
              title="Exibir Andar 2.5D com Avatares e Grade de Mesas"
            >
              Completo
            </button>
            <button
              type="button"
              onClick={() => setOfficeMode('desks')}
              className="btn btn-ghost"
              style={{
                fontSize: '0.72rem',
                padding: '4px 8px',
                borderRadius: '6px',
                backgroundColor: officeMode === 'desks' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                color: officeMode === 'desks' ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
              title="Exibir apenas a Grade de Mesas dos Departamentos"
            >
              Mesas
            </button>
          </div>

          <button
            type="button"
            onClick={() => loadData()}
            disabled={loading}
            className="btn btn-ghost"
            style={{ padding: '6px', color: 'var(--text-muted)' }}
            title="Atualizar status das mesas"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {roleLoaded && loadError && agents.length === 0 && <div role="alert" className="glass-panel" style={{ padding: '16px', color: 'var(--danger-color)' }}>{loadError}</div>}
      {loading && agents.length === 0 && <div role="status" className="glass-panel" style={{ padding: '16px', color: 'var(--text-secondary)' }}>A carregar agentes registados…</div>}
      {!loading && !loadError && agents.length === 0 && <div className="glass-panel" style={{ padding: '20px', color: 'var(--text-secondary)' }}>O catálogo da API não devolveu agentes configurados para esta instância.</div>}
      {agents.length > 0 && <>
      {/* 1. Andar 2.5D Animado com Avatares Andando pelo Escritório */}
      {(officeMode === 'canvas' || officeMode === 'both') && (
        <AgentOfficeCanvas
          agents={agents}
          onSelectAgent={handleOpenDrawer}
        />
      )}

      {/* 2. Grid Isométrico dos Departamentos */}
      {(officeMode === 'desks' || officeMode === 'both') && (
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
          paddingBottom: '24px',
        }}
      >
        {DEPARTMENTS.filter((d) => selectedDepartment === 'all' || selectedDepartment === d.id).map((dept) => {
          const deptAgents = agents.filter((a) => a.department === dept.id);
          return (
            <div
              key={dept.id}
              style={{
                borderRadius: '12px',
                backgroundColor: 'rgba(15, 23, 42, 0.55)',
                border: `1px solid ${dept.border}`,
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                backdropFilter: 'blur(8px)',
              }}
            >
              {/* Cabeçalho do Departamento */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: `1px solid ${dept.border}`,
                  paddingBottom: '8px',
                }}
              >
                <div style={{ fontSize: '0.86rem', fontWeight: 600, color: dept.color }}>
                  {dept.name}
                </div>
                <span
                  style={{
                    fontSize: '0.68rem',
                    padding: '2px 7px',
                    borderRadius: '10px',
                    backgroundColor: dept.bg,
                    color: dept.color,
                    fontWeight: 600,
                  }}
                >
                  {deptAgents.length} Especialistas
                </span>
              </div>

              {/* Mesas dos Especialistas no Departamento */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                {deptAgents.map((agent) => {
                  const hasCustomKey = !!agent.assignedKeyId;
                  return (
                    <button
                      type="button"
                      key={agent.id}
                      onClick={() => handleOpenDrawer(agent)}
                      style={{
                        borderRadius: '10px',
                        backgroundColor: 'rgba(30, 41, 59, 0.7)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        padding: '12px 10px',
                        cursor: 'pointer',
                        width: '100%',
                        font: 'inherit',
                        color: 'inherit',
                        textAlign: 'center',
                        appearance: 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        position: 'relative',
                        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-3px)';
                        e.currentTarget.style.borderColor = dept.color;
                        e.currentTarget.style.boxShadow = `0 6px 16px ${dept.bg}`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                      title={canManageAgents ? `Clique para configurar ${agent.name}` : `Consultar ${agent.name}`}
                    >
                      {/* Indicador de Status Luminoso */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--text-muted)',
                        }}
                        title="Atividade em tempo real não monitorizada"
                      />

                      {/* Estação de Trabalho / Avatar do Especialista */}
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '10px',
                          backgroundColor: dept.bg,
                          border: `1px solid ${dept.border}`,
                          color: dept.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginBottom: '8px',
                          position: 'relative',
                        }}
                      >
                        <Bot size={20} />
                        {/* Monitor Miniatura */}
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '-4px',
                            right: '-4px',
                            width: '14px',
                            height: '14px',
                            borderRadius: '3px',
                            backgroundColor: '#0f172a',
                            border: `1px solid ${dept.color}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Code2 size={8} color={dept.color} />
                        </div>
                      </div>

                      {/* Nome do Especialista */}
                      <div
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          lineHeight: 1.2,
                          maxHeight: '2.4em',
                          overflow: 'hidden',
                        }}
                      >
                        {agent.name}
                      </div>

                      {/* Cargo Resumido */}
                      <div
                        style={{
                          fontSize: '0.66rem',
                          color: 'var(--text-muted)',
                          marginTop: '3px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          width: '100%',
                        }}
                      >
                        {agent.role}
                      </div>

                      {/* Plaquinha da Chave / Provedor */}
                      <div
                        style={{
                          marginTop: '8px',
                          fontSize: '0.63rem',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backgroundColor: hasCustomKey ? 'var(--accent-glow)' : 'rgba(255, 255, 255, 0.06)',
                          color: hasCustomKey ? 'var(--accent-color)' : 'var(--text-secondary)',
                          border: `1px solid ${hasCustomKey ? 'var(--border-accent)' : 'rgba(255, 255, 255, 0.1)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        <Key size={8} />
                        <span>{hasCustomKey ? 'Chave vinculada' : 'Roteamento automático'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      )}

      </>}

      {/* Drawer Lateral de Configuração do Especialista */}
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
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.6)',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Topo do Drawer */}
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
                  <Bot size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {selectedAgent.name}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: selectedAgent.color }}>
                    {selectedAgent.departmentName}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedAgent(null)}
                className="btn btn-ghost"
                style={{ padding: '4px', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Missão do Especialista */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '12px',
              }}
            >
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Missão Operacional
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
                {selectedAgent.mission}
              </div>
            </div>

            {/* Permissões de Disco & Ferramentas */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Capacidades & Disco
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    backgroundColor: selectedAgent.isReadOnly ? 'rgba(100, 116, 139, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                    color: selectedAgent.isReadOnly ? '#94a3b8' : '#34d399',
                    border: `1px solid ${selectedAgent.isReadOnly ? 'rgba(100, 116, 139, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                  }}
                >
                  {selectedAgent.isReadOnly ? '📖 Somente Leitura' : '✍️ Escrita & Leitura Liberada'}
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  {selectedAgent.tools.length} Ferramentas
                </span>
              </div>
            </div>

            {/* Matriz Multi-Chaves: Atribuir Chave do KeyVault */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Provedor / Chave de API Atribuída
              </div>
              {canManageAgents ? <>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: 0 }}>
                Escolha qual chave do cofre este agente utilizará nas deliberações.
              </p>
              {keyVaultError && <div role="alert" style={{ color: 'var(--danger-color)', fontSize: '0.76rem' }}>{keyVaultError}</div>}
              <select
                className="input"
                value={activeKeySelection}
                onChange={(e) => setActiveKeySelection(e.target.value)}
                style={{ fontSize: '0.84rem', padding: '8px 10px', backgroundColor: 'var(--bg-primary)' }}
              >
                <option value="">(Padrão) auto_hybrid — Roteamento Inteligente</option>
                {Array.isArray(vaultKeys) && vaultKeys.map((k) => (
                  <option key={k.key_id} value={k.key_id}>
                    🔑 {(k.provider_name || (k as any).provider || 'AI').toUpperCase()} — {k.key_id} {(k.preferred_model || (k as any).default_model) ? `(${k.preferred_model || (k as any).default_model})` : ''}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleSaveAgentKey}
                disabled={savingKey}
                className="btn btn-primary"
                style={{
                  fontSize: '0.8rem',
                  padding: '8px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  backgroundColor: 'var(--accent-color)',
                  color: '#fff',
                  marginTop: '4px',
                }}
              >
                <Key size={14} />
                <span>{savingKey ? 'Salvando...' : 'Salvar Atribuição de Chave'}</span>
              </button>
              </> : <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-primary)', color: 'var(--text-muted)', fontSize: '0.78rem' }}>A atribuição de providers e chaves exige agents:write. Nenhum segredo é apresentado nesta vista.</div>}
            </div>

            {/* Botão de Ação: Abrir no Chat */}
            {onSelectForChat && canUseChat && (
              <button
                type="button"
                onClick={() => {
                  onSelectForChat(selectedAgent.id);
                  setSelectedAgent(null);
                }}
                className="btn btn-secondary"
                style={{
                  fontSize: '0.82rem',
                  padding: '9px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  color: 'var(--accent-color)',
                  borderColor: 'var(--border-accent)',
                  marginTop: 'auto',
                }}
              >
                <Bot size={15} />
                <span>Conversar com {selectedAgent.name} no Chat</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
