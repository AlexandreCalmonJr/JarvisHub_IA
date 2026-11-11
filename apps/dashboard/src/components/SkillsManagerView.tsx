import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  RefreshCw,
  Search,
  Filter,
} from 'lucide-react';
import { fetchSkills, toggleSkill, fetchAgents, fetchPonytailStatus, savePonytailLevel, deleteUserSkill } from '../api';
import { SkillInfo, AgentInfo } from '../types';
import { SkillCard } from './skills/SkillCard';
import { SkillAgentModal } from './skills/SkillAgentModal';
import { CreateSkillModal } from './skills/CreateSkillModal';
import { notify } from './common/Toast';

export const SkillsManagerView: React.FC = () => {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [ponytailError, setPonytailError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryTab, setCategoryTab] = useState<'all' | 'arch' | 'sec' | 'qa' | 'custom'>('all');
  const [domainFilter, setDomainFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [editingSkill, setEditingSkill] = useState<SkillInfo | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Estado do Modo Ponytail (Senior YAGNI)
  const [ponytailLevel, setPonytailLevel] = useState<string>('senior');
  const [savingPonytail, setSavingPonytail] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    const [skillsResult, agentsResult, ponytailResult] = await Promise.allSettled([
      fetchSkills(),
      fetchAgents(),
      fetchPonytailStatus(),
    ]);
    if (skillsResult.status === 'fulfilled') {
      setSkills(skillsResult.value);
      setCatalogError(null);
    } else {
      setCatalogError(skillsResult.reason instanceof Error ? skillsResult.reason.message : 'Falha ao carregar catálogo de habilidades.');
    }
    if (agentsResult.status === 'fulfilled') {
      setAgents(agentsResult.value);
      setAgentsError(null);
    } else {
      setAgentsError(agentsResult.reason instanceof Error ? agentsResult.reason.message : 'Falha ao carregar agentes disponíveis.');
    }
    if (ponytailResult.status === 'fulfilled') {
      setPonytailLevel(ponytailResult.value.level);
      setPonytailError(null);
    } else {
      setPonytailError(ponytailResult.reason instanceof Error ? ponytailResult.reason.message : 'Falha ao carregar política Ponytail.');
    }
    setLoading(false);
  };

  const handleDeleteSkill = async (skillId: string, skillName: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir a habilidade "${skillName}"?`)) {
      return;
    }
    try {
      const result = await deleteUserSkill(skillId);
      if (result?.status !== 'deleted') throw new Error('A habilidade não foi encontrada na sua conta.');
      notify(`Habilidade "${skillName}" excluída com sucesso!`, 'success');
      await loadData();
    } catch (err: any) {
      notify(`Erro ao excluir habilidade: ${err.message}`, 'error');
    }
  };

  const handlePonytailChange = async (newLevel: string) => {
    setSavingPonytail(true);
    try {
      await savePonytailLevel(newLevel);
      setPonytailLevel(newLevel);
      notify(`Modo Ponytail atualizado para '${newLevel.toUpperCase()}'!`, 'success');
    } catch (err: any) {
      notify(`Erro ao alterar modo Ponytail: ${err.message}`, 'error');
    } finally {
      setSavingPonytail(false);
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
      notify(`Não foi possível alterar a habilidade: ${e instanceof Error ? e.message : 'erro desconhecido'}`, 'error');
    }
  };

  const domains = useMemo(() => {
    const set = new Set<string>();
    skills.forEach((s) => set.add(s.domain));
    return Array.from(set).sort();
  }, [skills]);

  const filteredSkills = useMemo(() => {
    return skills.filter((s) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q);

      const matchDomain = domainFilter === 'all' || s.domain === domainFilter;

      let matchCategory = true;
      if (categoryTab === 'arch') {
        matchCategory = ['web', 'backend', 'flutter', 'architecture', 'mobile'].includes(s.domain.toLowerCase());
      } else if (categoryTab === 'sec') {
        matchCategory = ['security', 'cve', 'devsecops', 'auth'].includes(s.domain.toLowerCase()) || s.id.includes('sec');
      } else if (categoryTab === 'qa') {
        matchCategory = ['qa', 'testing', 'test', 'tdd'].includes(s.domain.toLowerCase()) || s.id.includes('test');
      } else if (categoryTab === 'custom') {
        matchCategory = s.origin === 'user_created' || s.origin?.includes('imported') || s.id.startsWith('user_');
      }

      const isAct = s.is_approved && !s.is_revoked;
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && isAct) ||
        (statusFilter === 'inactive' && !isAct);

      return matchSearch && matchDomain && matchStatus && matchCategory;
    });
  }, [skills, searchQuery, domainFilter, statusFilter]);

  const activeCount = skills.filter((s) => s.is_approved && !s.is_revoked).length;

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
            Skills Manager & Catálogo ECC
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Habilidades técnicas ativas ({activeCount}/{skills.length}), versionadas e com injeção automática no prompt.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
            style={{
              fontSize: '0.82rem',
              padding: '7px 14px',
              borderRadius: '8px',
            }}
          >
            <span>Nova Habilidade ECC</span>
          </button>

          <button onClick={loadData} className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '7px 12px', borderRadius: '8px' }}>
            <span>{loading ? 'Atualizando...' : 'Atualizar'}</span>
          </button>
        </div>
      </div>

      {catalogError && <div role="alert" style={{ padding: '12px 14px', border: '1px solid var(--danger-color)', borderRadius: '8px', color: 'var(--danger-color)', fontSize: '0.84rem' }}>{catalogError}</div>}
      {agentsError && <div role="alert" style={{ padding: '12px 14px', border: '1px solid var(--warning-color)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>Agentes indisponíveis: {agentsError}</div>}
      {ponytailError && <div role="alert" style={{ padding: '12px 14px', border: '1px solid var(--warning-color)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>Política Ponytail indisponível: {ponytailError}</div>}

      {/* Banner de Controle do Modo Ponytail (Senior YAGNI & Clean Code) */}
      <div
        className="glass-card"
        style={{
          padding: '16px 20px',
          borderRadius: '12px',
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="claude-serif-title" style={{ fontSize: '1.05rem', fontWeight: 500, color: 'var(--text-primary)' }}>
              Modo Ponytail (The Laziest Senior Developer)
            </span>
            <span
              style={{
                fontSize: '0.68rem',
                padding: '2px 8px',
                borderRadius: '999px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                fontWeight: 500,
              }}
            >
              {ponytailLevel !== 'off' ? 'YAGNI Ativo' : 'Desativado'}
            </span>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '3px 0 0 0' }}>
            Força os 26 especialistas a seguirem a Escada da Preguiça Técnica: reaproveitar código existente, usar standard library e nunca instalar pacotes redundantes.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.80rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Nível:</span>
          <select
            value={ponytailLevel}
            disabled={savingPonytail}
            onChange={(e) => handlePonytailChange(e.target.value)}
            style={{
              padding: '6px 12px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '0.82rem',
              fontWeight: 500,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="off">Desativado (Criação Livre)</option>
            <option value="lite">Ponytail Leve (Evita Pacotes)</option>
            <option value="senior">Ponytail Sênior (YAGNI & DRY Padrão)</option>
            <option value="ultra">Ponytail Ultra (Minimalismo Radical)</option>
          </select>
        </div>
      </div>

      {/* Submenu de Categorias de Habilidades */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '4px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <button
          type="button"
          onClick={() => setCategoryTab('all')}
          style={{
            padding: '7px 14px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.84rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: categoryTab === 'all' ? 'rgba(217, 119, 87, 0.15)' : 'transparent',
            color: categoryTab === 'all' ? 'var(--accent-color)' : 'var(--text-secondary)',
            borderBottom: categoryTab === 'all' ? '2px solid var(--accent-color)' : '2px solid transparent',
            transition: 'all 0.15s ease',
          }}
        >
          Todas as Habilidades ({skills.length})
        </button>

        <button
          type="button"
          onClick={() => setCategoryTab('arch')}
          style={{
            padding: '7px 14px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.84rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: categoryTab === 'arch' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
            color: categoryTab === 'arch' ? '#38bdf8' : 'var(--text-secondary)',
            borderBottom: categoryTab === 'arch' ? '2px solid #38bdf8' : '2px solid transparent',
            transition: 'all 0.15s ease',
          }}
        >
          Arquitetura & Clean Code
        </button>

        <button
          type="button"
          onClick={() => setCategoryTab('sec')}
          style={{
            padding: '7px 14px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.84rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: categoryTab === 'sec' ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
            color: categoryTab === 'sec' ? '#f87171' : 'var(--text-secondary)',
            borderBottom: categoryTab === 'sec' ? '2px solid #f87171' : '2px solid transparent',
            transition: 'all 0.15s ease',
          }}
        >
          Cibersegurança & OWASP
        </button>

        <button
          type="button"
          onClick={() => setCategoryTab('qa')}
          style={{
            padding: '7px 14px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.84rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: categoryTab === 'qa' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
            color: categoryTab === 'qa' ? '#fbbf24' : 'var(--text-secondary)',
            borderBottom: categoryTab === 'qa' ? '2px solid #fbbf24' : '2px solid transparent',
            transition: 'all 0.15s ease',
          }}
        >
          QA & Testes
        </button>

        <button
          type="button"
          onClick={() => setCategoryTab('custom')}
          style={{
            padding: '7px 14px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.84rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: categoryTab === 'custom' ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
            color: categoryTab === 'custom' ? '#c084fc' : 'var(--text-secondary)',
            borderBottom: categoryTab === 'custom' ? '2px solid #c084fc' : '2px solid transparent',
            transition: 'all 0.15s ease',
          }}
        >
          Criadas pelo Usuário
        </button>
      </div>

      {/* Barra de Filtros e Busca */}
      <div
        className="glass-panel"
        style={{
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          backgroundColor: 'var(--bg-tertiary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
          <Search size={18} color="var(--text-secondary)" />
          <input
            type="text"
            placeholder="Buscar por nome, ID ou descrição da skill..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '0.88rem',
            }}
          />
        </div>

        {/* Filtro de Domínio */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Filter size={15} color="var(--text-secondary)" />
          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            style={{
              padding: '6px 10px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontSize: '0.82rem',
              outline: 'none',
            }}
          >
            <option value="all">Todos os Domínios</option>
            {domains.map((dom) => (
              <option key={dom} value={dom}>
                {dom.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro de Status */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          style={{
            padding: '6px 10px',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            color: 'var(--text-primary)',
            fontSize: '0.82rem',
            outline: 'none',
          }}
        >
          <option value="all">Todos os Status</option>
          <option value="active">Apenas Ativas</option>
          <option value="inactive">Apenas Desativadas</option>
        </select>
      </div>

      {/* Grid de Skills */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
          Carregando catálogo de skills e vinculações...
        </div>
      ) : filteredSkills.length === 0 ? (
        <div
          className="glass-panel"
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            color: 'var(--text-secondary)',
          }}
        >
          <BookOpen size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Nenhuma skill encontrada com os filtros selecionados
          </h3>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '16px' }}>
          {filteredSkills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onToggle={handleToggle}
              onEditAgents={(s) => setEditingSkill(s)}
              onDelete={handleDeleteSkill}
            />
          ))}
        </div>
      )}

      {/* Modal de Vinculação de Agentes */}
      {editingSkill && (
        <SkillAgentModal
          isOpen={true}
          onClose={() => setEditingSkill(null)}
          skill={editingSkill}
          agents={agents}
          onSaved={loadData}
        />
      )}

      {/* Modal de Criação / Importação de Skill ECC */}
      {showCreateModal && (
        <CreateSkillModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          agents={agents}
          onSkillCreated={loadData}
        />
      )}
    </div>
  );
};
