import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Users, Search, Check, RefreshCw } from 'lucide-react';
import { SkillInfo, AgentInfo, getAgentLabel } from '../../types';
import { assignSkillAgents } from '../../api';

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
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (skill) {
      setSelectedAgents(skill.assigned_agents || []);
    }
  }, [skill]);

  if (!skill) return null;

  const toggleAgent = (role: string) => {
    setSelectedAgents((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await assignSkillAgents(skill.id, selectedAgents);
      onSaved();
      onClose();
    } catch (e: any) {
      alert(`Erro ao vincular agentes: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const filteredAgents = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Vincular Especialistas: ${skill.name}`}
      subtitle="Defina quais dos 26 agentes terão acesso a esta habilidade e instruções no prompt"
      icon={<Users size={20} />}
      maxWidth="lg"
      footer={
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} className="btn btn-secondary">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? <RefreshCw size={14} className="spin" /> : <Check size={14} />}
            Salvar Vinculação ({selectedAgents.length})
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: 'var(--bg-primary)',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
          }}
        >
          <Search size={16} color="var(--text-secondary)" />
          <input
            type="text"
            placeholder="Filtrar por nome ou papel do agente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '0.84rem',
            }}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '10px',
            maxHeight: '400px',
            overflowY: 'auto',
            paddingRight: '4px',
          }}
        >
          {filteredAgents.map((ag) => {
            const isSelected = selectedAgents.includes(ag.role);
            return (
              <div
                key={ag.role}
                onClick={() => toggleAgent(ag.role)}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: isSelected
                    ? '1px solid rgba(99, 102, 241, 0.5)'
                    : '1px solid var(--border-color)',
                  backgroundColor: isSelected
                    ? 'rgba(99, 102, 241, 0.12)'
                    : 'rgba(255, 255, 255, 0.03)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s ease',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {ag.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#a5b4fc', fontWeight: 500 }}>
                    {getAgentLabel(ag.role)}
                  </div>
                </div>

                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '4px',
                    border: isSelected
                      ? '1px solid #6366f1'
                      : '1px solid var(--border-color)',
                    backgroundColor: isSelected ? '#6366f1' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isSelected && <Check size={12} color="#fff" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
};
