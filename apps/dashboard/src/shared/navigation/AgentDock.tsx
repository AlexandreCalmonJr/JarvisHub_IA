import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, PanelRightClose, PanelRightOpen, X, Trash2, Search } from 'lucide-react';
import { fetchAgents, deleteAgent } from '../../api';
import { AgentInfo } from '../../types';
import { getAccountStorageKey } from '../../services/accountScope';
import { resolveDockAgents, UnifiedDockAgent } from '../../services/agentSync';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { notify } from '../common/Toast';

export type DockAgent = UnifiedDockAgent;

interface AgentDockProps {
  activeAgentId?: string;
  onSelectAgent: (agentId: string) => void;
  onAddAgent?: () => void;
  onHideDock?: () => void;
}

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

export const AgentDock: React.FC<AgentDockProps> = ({
  activeAgentId,
  onSelectAgent,
  onAddAgent,
  onHideDock,
}) => {
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(getAccountStorageKey('jarvis_agent_dock_expanded')) === 'true';
    } catch {
      return false;
    }
  });

  const [installedAgents, setInstalledAgents] = useState<AgentInfo[]>([]);
  const [pendingUninstall, setPendingUninstall] = useState<DockAgent | null>(null);
  const [uninstalling, setUninstalling] = useState(false);

  const loadDockAgents = useCallback(async () => {
    try {
      const realAgents = await fetchAgents();
      if (Array.isArray(realAgents)) {
        setInstalledAgents(realAgents);
      }
    } catch {
      // mantém estado atual caso o backend ainda esteja inicializando
    }
  }, []);

  useEffect(() => {
    void loadDockAgents();
    const handleSync = () => {
      void loadDockAgents();
    };
    window.addEventListener('jarvis:dock-updated', handleSync);
    window.addEventListener('jarvis:agents-updated', handleSync);
    return () => {
      window.removeEventListener('jarvis:dock-updated', handleSync);
      window.removeEventListener('jarvis:agents-updated', handleSync);
    };
  }, [loadDockAgents]);

  const dockAgents = useMemo(
    () => resolveDockAgents(installedAgents, isExpanded ? searchTerm : ''),
    [installedAgents, searchTerm, isExpanded]
  );

  const toggleExpanded = () => {
    setIsExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(getAccountStorageKey('jarvis_agent_dock_expanded'), String(next));
      } catch {}
      return next;
    });
  };

  const handleConfirmUninstall = async () => {
    if (!pendingUninstall) return;
    setUninstalling(true);
    try {
      await deleteAgent(pendingUninstall.role);
      notify(`${pendingUninstall.properName} foi desinstalado da sua equipe.`, 'info');
      setPendingUninstall(null);
      await loadDockAgents();
      window.dispatchEvent(new CustomEvent('jarvis:agents-updated'));
    } catch (err: any) {
      notify(err?.message || 'Não foi possível desinstalar este agente.', 'error');
    } finally {
      setUninstalling(false);
    }
  };

  return (
    <>
      <aside
        className={`jarvis-dock-rail openbot-agent-dock hide-tablet ${isExpanded ? 'is-expanded' : ''}`}
        aria-label="Meus agentes instalados"
      >
        {/* Header do Dock */}
        <div
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isExpanded ? 'space-between' : 'center',
            gap: '4px',
            paddingBottom: '6px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          {isExpanded && (
            <span
              className="jarvis-tabular"
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                letterSpacing: '0.02em',
              }}
            >
              Meus Agentes ({installedAgents.length})
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <button
              type="button"
              onClick={toggleExpanded}
              className="btn btn-ghost btn-icon-sm"
              title={isExpanded ? 'Recolher painel de agentes' : 'Expandir lista de agentes'}
              aria-label={isExpanded ? 'Recolher painel de agentes' : 'Expandir lista de agentes'}
            >
              {isExpanded ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
            </button>
            {isExpanded && onHideDock && (
              <button
                type="button"
                onClick={onHideDock}
                className="btn btn-ghost btn-icon-sm"
                title="Ocultar painel de agentes"
                aria-label="Ocultar painel de agentes"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Busca rápida quando expandido */}
        {isExpanded && installedAgents.length > 5 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              padding: '5px 8px',
              marginTop: '4px',
            }}
          >
            <Search size={12} color="var(--text-muted)" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar agentes..."
              aria-label="Filtrar agentes instalados no dock"
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: '0.76rem',
                width: '100%',
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="Limpar filtro do dock"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'inline-flex',
                }}
              >
                <X size={11} />
              </button>
            )}
          </div>
        )}

        {/* Lista Exclusiva dos Agentes Instalados do Usuário */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: isExpanded ? 'stretch' : 'center',
            gap: isExpanded ? '4px' : '8px',
            flex: 1,
            overflowY: 'auto',
            overflowX: 'visible',
            padding: '4px 0',
          }}
        >
          {dockAgents.length === 0 && isExpanded && (
            <div
              style={{
                padding: '16px 8px',
                textAlign: 'center',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
              }}
            >
              Nenhum agente encontrado.
            </div>
          )}

          {dockAgents.map((agent) => {
            const isActive = activeAgentId === agent.id;
            const isHovered = hoveredAgentId === agent.id;

            if (isExpanded) {
              return (
                <div
                  key={agent.id}
                  className={`agent-dock-row ${isActive ? 'is-active' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 8px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onSelectAgent(agent.id)}
                    aria-label={`Conversar com ${agent.properName}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '9px',
                      flex: 1,
                      minWidth: 0,
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      textAlign: 'left',
                      cursor: 'pointer',
                      color: 'inherit',
                    }}
                  >
                    <span
                      style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '8px',
                        backgroundColor: `${agent.color}20`,
                        color: agent.color,
                        border: `1px solid ${isActive ? agent.color : `${agent.color}40`}`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {getInitials(agent.properName)}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {agent.properName}
                      </div>
                      <div
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {agent.subtitle}
                      </div>
                    </div>
                  </button>

                  {agent.canUninstall && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingUninstall(agent);
                      }}
                      className="btn btn-danger-ghost btn-icon-sm"
                      title={`Desinstalar ${agent.properName}`}
                      aria-label={`Desinstalar ${agent.properName}`}
                      style={{
                        width: '26px',
                        height: '26px',
                        flexShrink: 0,
                        color: '#f87171',
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              );
            }

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
                  aria-label={`Conversar com ${agent.properName} (${agent.subtitle})`}
                  title={`${agent.properName} (${agent.handle}) — ${agent.subtitle}`}
                  className={`agent-dock-bubble ${isActive ? 'is-active' : ''}`}
                  style={{
                    backgroundColor: `${agent.color}20`,
                    color: agent.color,
                    borderColor: isActive ? agent.color : `${agent.color}40`,
                  }}
                >
                  {getInitials(agent.properName)}
                </button>

                {isHovered && (
                  <div
                    style={{
                      position: 'fixed',
                      right: '66px',
                      transform: 'translateY(-36px)',
                      backgroundColor: 'var(--bg-elevated)',
                      color: 'var(--text-primary)',
                      padding: '7px 11px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.78rem',
                      whiteSpace: 'nowrap',
                      boxShadow: 'var(--shadow-lg)',
                      border: '1px solid var(--border-color)',
                      pointerEvents: 'none',
                      zIndex: 120,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>
                      {agent.properName}{' '}
                      <span style={{ color: 'var(--accent-light)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                        {agent.handle}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{agent.subtitle}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onAddAgent}
          aria-label="Gerenciar agentes e habilidades"
          className="agent-dock-add-btn"
          title="Gerenciar agentes e vincular habilidades"
        >
          <Plus size={15} />
          {isExpanded && <span>Gerenciar agentes</span>}
        </button>
      </aside>

      <ConfirmDialog
        isOpen={Boolean(pendingUninstall)}
        title={`Desinstalar ${pendingUninstall?.properName || 'agente'}?`}
        description={
          <>
            O agente{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {pendingUninstall?.properName}
            </strong>{' '}
            será removido da sua equipe e do painel lateral. Você pode reinstalá-lo a qualquer momento na Biblioteca de Agentes Prontos.
          </>
        }
        confirmLabel="Desinstalar"
        cancelLabel="Manter"
        tone="danger"
        isLoading={uninstalling}
        onConfirm={handleConfirmUninstall}
        onCancel={() => setPendingUninstall(null)}
      />
    </>
  );
};
