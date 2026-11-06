import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  CheckCircle,
  XCircle,
  Shield,
  RefreshCw,
  Search,
  Filter,
  Users,
  Layers,
  Sparkles,
  Check,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { fetchSkills, toggleSkill, fetchAgents, assignSkillAgents } from '../api';
import { SkillInfo, AgentInfo } from '../types';

export const SkillsManagerView: React.FC = () => {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'catalog' | 'matrix'>('catalog');
  const [originFilter, setOriginFilter] = useState<'all' | 'ecc' | 'internal'>('all');
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal / painel de vinculação de agentes
  const [editingSkill, setEditingSkill] = useState<SkillInfo | null>(null);
  const [selectedAgentsForSkill, setSelectedAgentsForSkill] = useState<string[]>([]);
  const [agentSearchQuery, setAgentSearchQuery] = useState('');
  const [savingAgents, setSavingAgents] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [skillsData, agentsData] = await Promise.all([fetchSkills(), fetchAgents()]);
      setSkills(skillsData);
      setAgents(agentsData);
    } catch (e) {
      console.error('Falha ao carregar catálogo ou agentes:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggle = async (skillId: string) => {
    try {
      await toggleSkill(skillId);
      await loadData();
    } catch (e) {
      console.error('Erro ao alternar status da skill:', e);
    }
  };

  const openAgentModal = (skill: SkillInfo) => {
    setEditingSkill(skill);
    setSelectedAgentsForSkill(skill.assigned_agents || []);
    setAgentSearchQuery('');
  };

  const closeAgentModal = () => {
    setEditingSkill(null);
    setSelectedAgentsForSkill([]);
    setAgentSearchQuery('');
  };

  const toggleAgentSelection = (agentRole: string) => {
    setSelectedAgentsForSkill((prev) =>
      prev.includes(agentRole) ? prev.filter((r) => r !== agentRole) : [...prev, agentRole]
    );
  };

  const saveAgentAssignment = async () => {
    if (!editingSkill) return;
    setSavingAgents(true);
    try {
      await assignSkillAgents(editingSkill.id, selectedAgentsForSkill);
      await loadData();
      closeAgentModal();
    } catch (e) {
      console.error('Falha ao associar agentes à skill:', e);
    } finally {
      setSavingAgents(false);
    }
  };

  const domains = useMemo(() => {
    const set = new Set<string>();
    skills.forEach((s) => set.add(s.domain));
    return Array.from(set).sort();
  }, [skills]);

  const filteredSkills = useMemo(() => {
    return skills.filter((s) => {
      const isEcc = s.origin.toLowerCase().includes('ecc') || s.id.startsWith('ecc_');
      if (originFilter === 'ecc' && !isEcc) return false;
      if (originFilter === 'internal' && isEcc) return false;

      if (selectedDomain !== 'all' && s.domain !== selectedDomain) return false;

      const isActive = s.is_approved && !s.is_revoked;
      if (statusFilter === 'active' && !isActive) return false;
      if (statusFilter === 'inactive' && isActive) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = s.name.toLowerCase().includes(query);
        const matchesId = s.id.toLowerCase().includes(query);
        const matchesDesc = s.description.toLowerCase().includes(query);
        const matchesDomain = s.domain.toLowerCase().includes(query);
        const matchesAgent = (s.assigned_agents || []).some((role) =>
          role.toLowerCase().includes(query)
        );
        return matchesName || matchesId || matchesDesc || matchesDomain || matchesAgent;
      }
      return true;
    });
  }, [skills, originFilter, selectedDomain, statusFilter, searchQuery]);

  const counts = useMemo(() => {
    const total = skills.length;
    const eccCount = skills.filter(
      (s) => s.origin.toLowerCase().includes('ecc') || s.id.startsWith('ecc_')
    ).length;
    const internalCount = total - eccCount;
    const activeCount = skills.filter((s) => s.is_approved && !s.is_revoked).length;
    return { total, eccCount, internalCount, activeCount };
  }, [skills]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Skills Manager & Matriz de Agentes</h2>
            <span className="badge badge-primary" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Sparkles size={12} /> {counts.eccCount} Skills ECC
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
            Catálogo completo de conhecimento especializado sob demanda, integridade SHA-256 e associação direta aos 26 agentes especializados.
          </p>
        </div>

        <button className="btn btn-secondary" onClick={loadData} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Atualizar Catálogo
        </button>
      </div>

      {/* Cartões de Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Total de Skills</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '4px', color: 'var(--accent-color)' }}>{counts.total}</div>
        </div>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Skills ECC (Importadas)</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '4px', color: '#10b981' }}>{counts.eccCount}</div>
        </div>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Skills Internas</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '4px', color: '#6366f1' }}>{counts.internalCount}</div>
        </div>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Skills Ativas</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '4px', color: '#f59e0b' }}>
            {counts.activeCount} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>/ {counts.total}</span>
          </div>
        </div>
      </div>

      {/* Navegação de Abas: Catálogo vs Matriz Agentes */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
        <button
          className={`btn ${activeTab === 'catalog' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('catalog')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
        >
          <BookOpen size={16} /> Catálogo de Skills ({filteredSkills.length})
        </button>
        <button
          className={`btn ${activeTab === 'matrix' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('matrix')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
        >
          <Users size={16} /> Matriz Agentes x Skills (26 Agentes)
        </button>
      </div>

      {/* Conteúdo Aba 1: Catálogo de Skills */}
      {activeTab === 'catalog' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Barra de Filtros e Busca */}
          <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Campo de Busca */}
              <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder="Pesquisar por nome, descrição, domínio ou agente..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 36px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              {/* Filtro de Origem: Todas / ECC / Internas */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className={`btn ${originFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                  onClick={() => setOriginFilter('all')}
                >
                  Todas ({skills.length})
                </button>
                <button
                  className={`btn ${originFilter === 'ecc' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                  onClick={() => setOriginFilter('ecc')}
                >
                  <Sparkles size={12} /> ECC ({counts.eccCount})
                </button>
                <button
                  className={`btn ${originFilter === 'internal' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                  onClick={() => setOriginFilter('internal')}
                >
                  Internas ({counts.internalCount})
                </button>
              </div>

              {/* Filtro de Status: Todas / Ativas / Inativas */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className={`btn ${statusFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                  onClick={() => setStatusFilter('all')}
                >
                  Status: Todos
                </button>
                <button
                  className={`btn ${statusFilter === 'active' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                  onClick={() => setStatusFilter('active')}
                >
                  Ativas
                </button>
                <button
                  className={`btn ${statusFilter === 'inactive' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                  onClick={() => setStatusFilter('inactive')}
                >
                  Desativadas
                </button>
              </div>
            </div>

            {/* Pílulas de Domínio */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', paddingTop: '4px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginRight: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Filter size={12} /> Domínio:
              </span>
              <button
                className={`badge ${selectedDomain === 'all' ? 'badge-primary' : 'badge-secondary'}`}
                style={{ cursor: 'pointer', border: 'none' }}
                onClick={() => setSelectedDomain('all')}
              >
                Todos
              </button>
              {domains.map((dom) => (
                <button
                  key={dom}
                  className={`badge ${selectedDomain === dom ? 'badge-primary' : 'badge-secondary'}`}
                  style={{ cursor: 'pointer', border: 'none' }}
                  onClick={() => setSelectedDomain(dom)}
                >
                  {dom}
                </button>
              ))}
            </div>
          </div>

          {/* Grid de Cards de Skills */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '16px' }}>
            {filteredSkills.map((s) => {
              const isActive = s.is_approved && !s.is_revoked;
              const isEcc = s.origin.toLowerCase().includes('ecc') || s.id.startsWith('ecc_');
              const assignedCount = (s.assigned_agents || []).length;

              return (
                <div
                  key={s.id}
                  className="card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    borderLeft: `4px solid ${isEcc ? '#10b981' : '#6366f1'}`,
                    gap: '14px',
                  }}
                >
                  <div>
                    {/* Linha de Título e Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <BookOpen size={18} color={isEcc ? '#10b981' : 'var(--accent-color)'} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{s.name}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{s.id}</div>
                        </div>
                      </div>
                      <span className={`badge ${isActive ? 'badge-success' : 'badge-danger'}`} style={{ whiteSpace: 'nowrap' }}>
                        {isActive ? 'Ativa' : 'Desativada'}
                      </span>
                    </div>

                    {/* Descrição */}
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: '12px' }}>
                      {s.description}
                    </p>

                    {/* Tags: Origem, Domínio, Versão, Licença */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                      <span className={`badge ${isEcc ? 'badge-primary' : 'badge-info'}`}>
                        {isEcc ? '✨ ECC' : 'Interna'}
                      </span>
                      <span className="badge badge-info">{s.domain}</span>
                      <span className="badge badge-secondary">v{s.version}</span>
                      <span className="badge badge-secondary" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Shield size={10} /> {s.license}
                      </span>
                    </div>

                    {/* Agentes Vinculados */}
                    <div style={{ backgroundColor: 'var(--bg-primary)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Users size={12} /> Agentes Vinculados ({assignedCount})
                        </span>
                        <button
                          onClick={() => openAgentModal(s)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-color)',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: 600,
                          }}
                        >
                          <SlidersHorizontal size={12} /> Vincular
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {assignedCount === 0 ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            Nenhum agente vinculado
                          </span>
                        ) : (
                          (s.assigned_agents || []).map((agentRole) => {
                            const agentObj = agents.find((a) => a.role === agentRole);
                            const label = agentObj ? agentObj.name : agentRole;
                            return (
                              <span
                                key={agentRole}
                                className="badge badge-secondary"
                                style={{ fontSize: '0.7rem', padding: '3px 6px' }}
                                title={agentRole}
                              >
                                {label}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Tag Criptográfica SHA-256 */}
                    <div style={{ marginTop: '10px', fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      <span style={{ color: '#10b981' }}>SHA-256:</span> {s.content_hash.slice(0, 16)}...{s.content_hash.slice(-8)}
                    </div>
                  </div>

                  {/* Rodapé do Card com Ações */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      onClick={() => openAgentModal(s)}
                    >
                      <Users size={14} /> Gerir Agentes
                    </button>
                    <button
                      className={`btn ${isActive ? 'btn-danger' : 'btn-primary'}`}
                      style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                      onClick={() => handleToggle(s.id)}
                    >
                      {isActive ? (
                        <>
                          <XCircle size={14} /> Desativar
                        </>
                      ) : (
                        <>
                          <CheckCircle size={14} /> Ativar
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Conteúdo Aba 2: Matriz Agentes x Skills */}
      {activeTab === 'matrix' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card" style={{ padding: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '6px' }}>
              Atribuição Operacional por Agente Especializado
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Selecione quais skills cada um dos 26 agentes especializados do JARVIS AI HUB deve carregar em tempo de execução para resolver tarefas de forma isolada e segura.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
            {agents.map((agent) => {
              const assignedSkills = skills.filter((s) => (s.assigned_agents || []).includes(agent.role));
              const activeAssignedSkills = assignedSkills.filter((s) => s.is_approved && !s.is_revoked);

              return (
                <div
                  key={agent.role}
                  className="card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>{agent.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          {agent.role}
                        </div>
                      </div>
                      <span className={`badge ${agent.is_read_only ? 'badge-secondary' : 'badge-primary'}`}>
                        {agent.is_read_only ? 'Read-Only' : 'Execução'}
                      </span>
                    </div>

                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                      {agent.mission}
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                      <span className="badge badge-info">Modelo: {agent.preferred_model}</span>
                      <span className="badge badge-secondary">
                        {activeAssignedSkills.length} skills ativas
                      </span>
                    </div>

                    {/* Lista de Skills atribuídas */}
                    <div style={{ backgroundColor: 'var(--bg-primary)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Layers size={12} /> Skills Carregadas ({assignedSkills.length}):
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {assignedSkills.length === 0 ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            Nenhuma skill associada
                          </span>
                        ) : (
                          assignedSkills.map((sk) => {
                            const isSkActive = sk.is_approved && !sk.is_revoked;
                            const isEcc = sk.origin.toLowerCase().includes('ecc') || sk.id.startsWith('ecc_');
                            return (
                              <span
                                key={sk.id}
                                className={`badge ${isSkActive ? (isEcc ? 'badge-primary' : 'badge-info') : 'badge-danger'}`}
                                style={{ fontSize: '0.7rem', padding: '3px 6px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                title={`${sk.name} (${sk.id})`}
                              >
                                {isEcc && <Sparkles size={10} />}
                                {sk.name.length > 25 ? `${sk.name.slice(0, 25)}...` : sk.name}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ width: '100%', fontSize: '0.8rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}
                      onClick={() => {
                        setActiveTab('catalog');
                        setSearchQuery(agent.role);
                      }}
                    >
                      <Filter size={14} /> Filtrar Skills Deste Agente no Catálogo
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal de Seleção de Agentes Vinculados */}
      {editingSkill && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={closeAgentModal}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '680px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Vincular Agentes à Skill</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                  {editingSkill.name} ({editingSkill.id})
                </p>
              </div>
              <button
                onClick={closeAgentModal}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Ações Rápidas & Busca no Modal */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder="Filtrar 26 agentes..."
                  value={agentSearchQuery}
                  onChange={(e) => setAgentSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px 6px 30px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                  }}
                />
              </div>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                onClick={() => setSelectedAgentsForSkill(agents.map((a) => a.role))}
              >
                Selecionar Todos (26)
              </button>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                onClick={() => setSelectedAgentsForSkill([])}
              >
                Limpar
              </button>
            </div>

            {/* Lista com Checkbox dos 26 Agentes */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '8px',
                padding: '4px',
                maxHeight: '380px',
              }}
            >
              {agents
                .filter(
                  (a) =>
                    !agentSearchQuery ||
                    a.name.toLowerCase().includes(agentSearchQuery.toLowerCase()) ||
                    a.role.toLowerCase().includes(agentSearchQuery.toLowerCase())
                )
                .map((agent) => {
                  const isSelected = selectedAgentsForSkill.includes(agent.role);
                  return (
                    <div
                      key={agent.role}
                      onClick={() => toggleAgentSelection(agent.role)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-primary)',
                        border: `1px solid ${isSelected ? 'var(--accent-color)' : 'var(--border-color)'}`,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '4px',
                          border: `1px solid ${isSelected ? 'var(--accent-color)' : 'var(--border-color)'}`,
                          backgroundColor: isSelected ? 'var(--accent-color)' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {isSelected && <Check size={14} color="#fff" />}
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                          {agent.name}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          {agent.role}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Rodapé do Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {selectedAgentsForSkill.length} de {agents.length} agentes selecionados
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={closeAgentModal} disabled={savingAgents}>
                  Cancelar
                </button>
                <button className="btn btn-primary" onClick={saveAgentAssignment} disabled={savingAgents} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {savingAgents ? <RefreshCw size={14} className="spin" /> : <Check size={14} />} Guardar Alterações
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
