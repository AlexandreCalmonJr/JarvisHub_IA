import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '../../shared/common/Modal';
import { Users, Search, Check, RefreshCw, CheckSquare, Square, X } from 'lucide-react';
import { SkillInfo, AgentInfo } from '../../types';
import { assignSkillAgents } from '../../api';
import { notify } from '../../shared/common/Toast';
import { sortAgentsCustomFirst } from '../../services/agentSync';
import { buildAgentFilterTabs, resolveAgentCategoryLabel } from '../../services/domainCatalog';

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
  agents,
  onSaved,
}) => {
  const [selectedAgents, setSelectedAgents] = useState<string[]>(skill?.assigned_agents || []);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (skill) {
      setSelectedAgents(skill.assigned_agents || []);
      setSearch('');
      setCategoryFilter('all');
    }
  }, [skill]);

  const normalizedAgents = useMemo(() => {
    return sortAgentsCustomFirst(agents || []).map((ag) => ({
      role: ag.role,
      name: ag.proper_name ? `${ag.proper_name} (${ag.name})` : ag.name,
      category: (ag.category || 'dev').trim().toLowerCase(),
      categoryLabel: resolveAgentCategoryLabel(ag.category, true),
      mission: ag.mission || '',
      color: ag.mascot?.color || '#f97316',
    }));
  }, [agents]);

  const categoryTabs = useMemo(() => buildAgentFilterTabs(normalizedAgents), [normalizedAgents]);

  if (!skill) return null;

  const toggleAgent = (role: string) => {
    setSelectedAgents((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const filteredAgents = normalizedAgents.filter((a) => {
    const q = search.toLowerCase();
    const matchSearch =
      a.name.toLowerCase().includes(q) ||
      a.role.toLowerCase().includes(q) ||
      a.categoryLabel.toLowerCase().includes(q) ||
      a.mission.toLowerCase().includes(q);

    const matchCat = categoryFilter === 'all' || a.category === categoryFilter;
    return matchSearch && matchCat;
  });

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
      notify(`Agentes vinculados com sucesso à habilidade "${skill.name}"!`, 'success');
      window.dispatchEvent(new CustomEvent('jarvis:agents-updated'));
      onSaved();
      onClose();
    } catch (e: any) {
      notify(`Erro ao vincular agentes: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Vincular Especialistas: ${skill.name}`}
      subtitle="Defina quais especialistas (padrão ou personalizados de qualquer área) terão acesso a esta habilidade"
      icon={<Users size={18} color="var(--accent-light)" />}
      maxWidth="lg"
      footer={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <span className="jarvis-tabular" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Selecionados:{' '}
            <strong style={{ color: 'var(--accent-light)' }}>{selectedAgents.length}</strong> de{' '}
            {normalizedAgents.length} especialistas
          </span>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary btn-sm"
            >
              {saving ? <RefreshCw size={14} className="spin" /> : <Check size={14} />}
              <span className="jarvis-tabular">Salvar Vinculação ({selectedAgents.length})</span>
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Busca e Filtros de Categoria */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="jarvis-search-box" style={{ width: '100%' }}>
            <Search size={15} />
            <input
              type="text"
              placeholder="Buscar por nome, papel ou especialidade do agente..."
              aria-label="Buscar especialistas"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="jarvis-search-box__input"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="btn btn-ghost btn-icon-sm"
                aria-label="Limpar busca de especialistas"
                style={{ width: '24px', height: '24px' }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <div className="jarvis-segmented" style={{ flexWrap: 'wrap' }} role="tablist" aria-label="Filtrar especialistas por categoria">
              {categoryTabs.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={categoryFilter === cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`jarvis-segmented-btn ${categoryFilter === cat.id ? 'is-active' : ''}`}
                  style={{ fontSize: '0.74rem', padding: '5px 9px' }}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="btn btn-secondary btn-xs"
              >
                <CheckSquare size={12} />
                <span>Marcar Filtrados</span>
              </button>
              <button
                type="button"
                onClick={handleDeselectAllFiltered}
                className="btn btn-secondary btn-xs"
              >
                <Square size={12} />
                <span>Desmarcar Filtrados</span>
              </button>
            </div>
          </div>
        </div>

        {/* Grid dos 26 Agentes Especialistas */}
        {filteredAgents.length === 0 ? (
          <div className="jarvis-empty-state" style={{ padding: '28px 16px' }}>
            <Users size={22} color="var(--text-muted)" />
            <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
              Nenhum especialista corresponde aos filtros atuais.
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))',
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
                  className={`jarvis-choice-card ${isSelected ? 'is-active' : ''}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
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
                      }}
                    >
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ffffff' }}>
                        {ag.name.charAt(0)}
                      </span>
                    </div>

                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <div
                        style={{
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {ag.name}
                      </div>
                      <div
                        style={{
                          fontSize: '0.7rem',
                          color: isSelected ? 'var(--accent-light)' : 'var(--text-muted)',
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
                        border: isSelected
                          ? '1px solid var(--accent-color)'
                          : '1px solid var(--border-hover)',
                        backgroundColor: isSelected ? 'var(--accent-color)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isSelected && <Check size={12} color="#ffffff" strokeWidth={3} />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};
