import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { ALL_26_AGENTS } from '../../data/agentsCatalog';
import { getAccountStorageKey } from '../../services/accountScope';

export interface DockAgent {
  id: string;
  name: string;
  role: string;
  color: string;
  shape?: 'squircle' | 'round' | 'diamond';
  expression?: 'happy' | 'focused' | 'grumpy' | 'calm';
}

interface AgentDockProps {
  activeAgentId?: string;
  onSelectAgent: (agentId: string) => void;
  onAddAgent?: () => void;
}

const DEFAULT_AGENTS: DockAgent[] = [
  { id: 'qa_tester', name: 'QA Tester', role: 'Validador de Qualidade', color: '#f472b6', shape: 'squircle', expression: 'happy' },
  { id: 'copy_editor', name: 'Copy Editor', role: 'Redator & Revisor', color: '#60a5fa', shape: 'round', expression: 'calm' },
  { id: 'bug_fixer', name: 'Bug Fixer', role: 'Depurador de Código', color: '#fb923c', shape: 'squircle', expression: 'grumpy' },
  { id: 'security_specialist', name: 'Security', role: 'Guardião de Segurança', color: '#34d399', shape: 'diamond', expression: 'focused' },
];

export const AgentDock: React.FC<AgentDockProps> = ({
  activeAgentId = 'bug_fixer',
  onSelectAgent,
  onAddAgent,
}) => {
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);
  const [dockAgents, setDockAgents] = useState<DockAgent[]>(() => {
    try {
      const raw = localStorage.getItem(getAccountStorageKey('jarvis_pinned_dock_agents'));
      if (raw) {
        const ids: string[] = JSON.parse(raw);
        const mapped: DockAgent[] = ids.map((id) => {
          const found26 = ALL_26_AGENTS.find((a) => a.id === id || a.role === id);
          if (found26) {
            return {
              id: found26.id,
              name: found26.name,
              role: found26.categoryLabel,
              color: found26.color,
              shape: found26.shape,
              expression: found26.expression,
            };
          }
          const foundDef = DEFAULT_AGENTS.find((a) => a.id === id);
          return foundDef || { id, name: id, role: 'Especialista', color: '#38bdf8' };
        });
        if (mapped.length > 0) return mapped;
      }
    } catch {}
    return DEFAULT_AGENTS;
  });

  useEffect(() => {
    const handleSync = () => {
      try {
        const raw = localStorage.getItem(getAccountStorageKey('jarvis_pinned_dock_agents'));
        if (raw) {
          const ids: string[] = JSON.parse(raw);
          const mapped: DockAgent[] = ids.map((id) => {
            const found26 = ALL_26_AGENTS.find((a) => a.id === id || a.role === id);
            if (found26) {
              return {
                id: found26.id,
                name: found26.name,
                role: found26.categoryLabel,
                color: found26.color,
                shape: found26.shape,
                expression: found26.expression,
              };
            }
            const foundDef = DEFAULT_AGENTS.find((a) => a.id === id);
            return foundDef || { id, name: id, role: 'Especialista', color: '#38bdf8' };
          });
          if (mapped.length > 0) setDockAgents(mapped);
        }
      } catch {}
    };

    window.addEventListener('jarvis:dock-updated', handleSync);
    return () => window.removeEventListener('jarvis:dock-updated', handleSync);
  }, []);

  return (
    <aside
      className="openbot-agent-dock"
      aria-label="Dock de Agentes"
      style={{
        position: 'fixed',
        right: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 8px',
        backgroundColor: '#121215',
        borderRadius: '28px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 16px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(16px)',
      }}
    >
      {dockAgents.map((agent) => {
        const isActive = activeAgentId === agent.id;
        const isHovered = hoveredAgentId === agent.id;

        return (
          <div
            key={agent.id}
            style={{ position: 'relative' }}
            onMouseEnter={() => setHoveredAgentId(agent.id)}
            onMouseLeave={() => setHoveredAgentId(null)}
          >
            <button
              type="button"
              onClick={() => onSelectAgent(agent.id)}
              aria-label={`Selecionar agente ${agent.name}`}
              className={`agent-dock-bubble ${isActive ? 'is-active' : ''}`}
              style={{
                width: '38px',
                height: '38px',
                borderRadius: agent.shape === 'diamond' ? '12px' : agent.shape === 'round' ? '50%' : '14px',
                backgroundColor: agent.color,
                border: isActive ? '2px solid #ffffff' : '2px solid transparent',
                boxShadow: isActive
                  ? `0 0 14px ${agent.color}, 0 4px 12px rgba(0, 0, 0, 0.4)`
                  : '0 3px 8px rgba(0, 0, 0, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                transform: isHovered || isActive ? 'scale(1.12)' : 'scale(1)',
                outline: 'none',
              }}
            >
              {/* Olhinhos fofos dos avatares 3D do OpenBot */}
              <div
                style={{
                  display: 'flex',
                  gap: '4px',
                  alignItems: 'center',
                  transform: agent.expression === 'grumpy' ? 'rotate(-6deg)' : 'none',
                }}
              >
                <span
                  style={{
                    width: '3.5px',
                    height: agent.expression === 'grumpy' ? '2.5px' : '4px',
                    borderRadius: '50%',
                    backgroundColor: '#18181b',
                  }}
                />
                <span
                  style={{
                    width: '3.5px',
                    height: agent.expression === 'grumpy' ? '2.5px' : '4px',
                    borderRadius: '50%',
                    backgroundColor: '#18181b',
                  }}
                />
              </div>
            </button>

            {/* Tooltip flutuante à esquerda */}
            {isHovered && (
              <div
                style={{
                  position: 'absolute',
                  right: '48px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  backgroundColor: '#18181b',
                  color: '#ffffff',
                  padding: '6px 12px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  pointerEvents: 'none',
                  zIndex: 60,
                }}
              >
                <div style={{ fontWeight: 600 }}>{agent.name}</div>
                <div style={{ fontSize: '11px', color: '#a1a1aa' }}>{agent.role}</div>
              </div>
            )}
          </div>
        );
      })}

      {/* Botão de Adicionar Agente (+) */}
      <button
        type="button"
        onClick={onAddAgent}
        aria-label="Adicionar novo agente"
        className="agent-dock-add-btn"
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 255, 255, 0.07)',
          border: '1px dashed rgba(255, 255, 255, 0.25)',
          color: '#a1a1aa',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          outline: 'none',
        }}
        title="Novo Agente ou Conectar"
      >
        <Plus size={15} />
      </button>
    </aside>
  );
};
