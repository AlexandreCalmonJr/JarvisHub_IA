import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, RefreshCw, Search, Sparkles, X } from 'lucide-react';
import { Modal } from '../../shared/common/Modal';
import { AgentInfo, SkillInfo } from '../../types';
import { fetchSkills } from '../../api';
import { updateAgentSkills } from '../../services/api/agents';
import { notify } from '../../shared/common/Toast';

interface AgentSkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: AgentInfo | null;
  onSaved: () => Promise<void> | void;
}

export const AgentSkillsModal: React.FC<AgentSkillsModalProps> = ({
  isOpen,
  onClose,
  agent,
  onSaved,
}) => {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !agent) return;
    let cancelled = false;
    setLoading(true);
    setSearch('');
    fetchSkills()
      .then((list) => {
        if (cancelled) return;
        const safeList = Array.isArray(list) ? list : [];
        setSkills(safeList);
        const initialIds = safeList
          .filter((sk) => Array.isArray(sk.assigned_agents) && sk.assigned_agents.includes(agent.role))
          .map((sk) => sk.id);
        setSelectedSkillIds(initialIds);
      })
      .catch(() => {
        if (!cancelled) setSkills([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, agent]);

  const filteredSkills = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(
      (sk) =>
        sk.name.toLowerCase().includes(q) ||
        (sk.description || '').toLowerCase().includes(q) ||
        (sk.domain || '').toLowerCase().includes(q)
    );
  }, [skills, search]);

  if (!agent) return null;

  const displayName = agent.proper_name || agent.name;

  const toggleSkillId = (id: string) => {
    setSelectedSkillIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAgentSkills(agent.role, selectedSkillIds);
      notify(`Habilidades de ${displayName} atualizadas (${selectedSkillIds.length} ativas).`, 'success');
      window.dispatchEvent(new CustomEvent('jarvis:agents-updated'));
      await onSaved();
      onClose();
    } catch (err: any) {
      notify(err?.message || 'Não foi possível atualizar as habilidades deste agente.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Habilidades de ${displayName}`}
      subtitle="Anexe ou remova habilidades disponíveis no seu hub para este agente usar nas conversas"
      icon={<BookOpen size={18} color="var(--accent-light)" />}
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
            Vinculadas:{' '}
            <strong style={{ color: 'var(--accent-light)' }}>{selectedSkillIds.length}</strong> de{' '}
            {skills.length} habilidades
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="btn btn-primary btn-sm"
            >
              {saving ? <RefreshCw size={14} className="spin" /> : <Check size={14} />}
              <span className="jarvis-tabular">Salvar habilidades ({selectedSkillIds.length})</span>
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div className="jarvis-search-box" style={{ width: '100%' }}>
          <Search size={15} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar habilidade por nome, função ou área..."
            aria-label="Buscar habilidades para vincular ao agente"
            className="jarvis-search-box__input"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="btn btn-ghost btn-icon-sm"
              aria-label="Limpar busca de habilidades"
              style={{ width: '24px', height: '24px' }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {loading ? (
          <div className="jarvis-empty-state" style={{ padding: '32px 16px' }}>
            <RefreshCw size={20} className="spin" color="var(--text-muted)" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Carregando habilidades do hub...
            </span>
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="jarvis-empty-state" style={{ padding: '28px 16px' }}>
            <Sparkles size={22} color="var(--text-muted)" />
            <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
              Nenhuma habilidade encontrada para essa busca.
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
              gap: '10px',
              maxHeight: '380px',
              overflowY: 'auto',
              paddingRight: '4px',
            }}
          >
            {filteredSkills.map((sk) => {
              const isSelected = selectedSkillIds.includes(sk.id);
              return (
                <button
                  key={sk.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggleSkillId(sk.id)}
                  className={`jarvis-choice-card ${isSelected ? 'is-active' : ''}`}
                  style={{ textAlign: 'left', alignItems: 'flex-start' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
                    <div
                      style={{
                        width: '18px',
                        height: '18px',
                        marginTop: '2px',
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

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '0.83rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {sk.name}
                      </div>
                      <div
                        style={{
                          fontSize: '0.73rem',
                          color: 'var(--text-secondary)',
                          marginTop: '2px',
                          lineHeight: 1.4,
                        }}
                      >
                        {sk.description}
                      </div>
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
