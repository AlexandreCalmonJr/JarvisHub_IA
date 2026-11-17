import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Users, Search, Check, RefreshCw, CheckSquare, Square } from 'lucide-react';
import { SkillInfo, AgentInfo } from '../../types';
import { assignSkillAgents } from '../../api';
import { notify } from '../common/Toast';
import { ALL_26_AGENTS } from '../../data/agentsCatalog';

interface SkillAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  skill: SkillInfo | null;
  agents: AgentInfo[];
  onSaved: () => void;
}

export const SkillAgentModal: React.FC<SkillAgentModalProps> = ({
  isOpen,
  onClose,
  skill,
  onSaved,
}) => {
  const [selectedAgents, setSelectedAgents] = useState<string[]>(skill?.assigned_agents || []);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'orchestration' | 'development' | 'data' | 'devops' | 'security'>('all');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (skill) {
      setSelectedAgents(skill.assigned_agents || []);
      setSearch('');
      setCategoryFilter('all');
    }
  }, [skill]);

  if (!skill) return null;

  const toggleAgent = (role: string) => {
    setSelectedAgents((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleSelectAllFiltered = () => {
    const rolesToAdd = filteredAgents.map((a) => a.role);
    setSelectedAgents((prev) => Array.from(new Set([...prev, ...rolesToAdd])));
  };

  const handleDeselectAllFiltered = () => {
    const rolesToRemove = new Set(filteredAgents.map((a) => a.role));
    setSelectedAgents((prev) => prev.filter((r) => !rolesToRemove.has(r)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await assignSkillAgents(skill.id, selectedAgents);
      notify(`Especialistas vinculados com sucesso à skill "${skill.name}"!`, 'success');
      onSaved();
      onClose();
    } catch (e: any) {
      notify(`Erro ao vincular agentes: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredAgents = ALL_26_AGENTS.filter((a) => {
    const matchSearch =
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.role.toLowerCase().includes(search.toLowerCase()) ||
      a.categoryLabel.toLowerCase().includes(search.toLowerCase()) ||
      a.mission.toLowerCase().includes(search.toLowerCase());

    const matchCat = categoryFilter === 'all' || a.category === categoryFilter;
    return matchSearch && matchCat;
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Vincular Especialistas: ${skill.name}`}
      subtitle="Defina quais dos 26 agentes de IA terão acesso às diretrizes e ferramentas desta habilidade"
      icon={<Users size={20} color="#38bdf8" />}
      maxWidth="lg"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.80rem', color: '#a1a1aa' }}>
              Selecionados: <strong style={{ color: '#38bdf8' }}>{selectedAgents.length}</strong> de {ALL_26_AGENTS.length} agentes
            </span>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '6px 14px', borderRadius: '8px' }}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary"
              style={{ fontSize: '0.82rem', padding: '6px 18px', borderRadius: '8px' }}
            >
              {saving ? <RefreshCw size={14} className="spin" /> : <Check size={14} />}
              <span>Salvar Vinculação ({selectedAgents.length})</span>
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Barra de Busca e Filtros de Categoria */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              backgroundColor: '#18181b',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <Search size={16} color="#71717a" />
            <input
              type="text"
              placeholder="Buscar por nome, papel ou especialidade do agente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1,
                backgroundColor: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#f5f5f5',
                fontSize: '0.84rem',
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '0.80rem' }}
              >
                Limpar
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            {/* Categorias Pills */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: categoryFilter === 'all' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: categoryFilter === 'all' ? '#38bdf8' : '#a1a1aa',
                }}
              >
                Todos ({ALL_26_AGENTS.length})
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('orchestration')}
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: categoryFilter === 'orchestration' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: categoryFilter === 'orchestration' ? '#38bdf8' : '#a1a1aa',
                }}
              >
                Orquestração
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('development')}
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: categoryFilter === 'development' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: categoryFilter === 'development' ? '#38bdf8' : '#a1a1aa',
                }}
              >
                Dev & QA
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('data')}
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: categoryFilter === 'data' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: categoryFilter === 'data' ? '#38bdf8' : '#a1a1aa',
                }}
              >
                Dados & BI
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('devops')}
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: categoryFilter === 'devops' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: categoryFilter === 'devops' ? '#38bdf8' : '#a1a1aa',
                }}
              >
                DevOps & Infra
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('security')}
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: categoryFilter === 'security' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: categoryFilter === 'security' ? '#38bdf8' : '#a1a1aa',
                }}
              >
                Segurança
              </button>
            </div>

            {/* Ações em lote */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.72rem',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  color: '#e4e4e7',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <CheckSquare size={12} />
                <span>Marcar Filtrados</span>
              </button>
              <button
                type="button"
                onClick={handleDeselectAllFiltered}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.72rem',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  color: '#e4e4e7',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <Square size={12} />
                <span>Desmarcar Filtrados</span>
              </button>
            </div>
          </div>
        </div>

        {/* Grid dos 26 Agentes Especialistas */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '10px',
            maxHeight: '380px',
            overflowY: 'auto',
            paddingRight: '4px',
          }}
        >
          {filteredAgents.map((ag) => {
            const isSelected = selectedAgents.includes(ag.role);
            return (
              <button
                type="button"
                key={ag.role}
                aria-pressed={isSelected}
                onClick={() => toggleAgent(ag.role)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: isSelected
                    ? '1px solid rgba(56, 189, 248, 0.5)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  backgroundColor: isSelected
                    ? 'rgba(56, 189, 248, 0.1)'
                    : 'rgba(255, 255, 255, 0.03)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* 3D Squircle Avatar */}
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: ag.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)',
                  }}
                >
                  <span style={{ fontSize: '0.80rem', fontWeight: 800, color: '#ffffff' }}>
                    {ag.name.charAt(0)}
                  </span>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: isSelected ? '#ffffff' : '#e4e4e7',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {ag.name}
                  </div>
                  <div
                    style={{
                      fontSize: '0.70rem',
                      color: isSelected ? '#38bdf8' : '#71717a',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {ag.categoryLabel}
                  </div>
                </div>

                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '5px',
                    border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.2)',
                    backgroundColor: isSelected ? '#38bdf8' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {isSelected && <Check size={12} color="#000000" strokeWidth={3} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
};
