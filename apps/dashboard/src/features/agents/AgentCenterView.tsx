import React, { useState, useEffect, useMemo } from 'react';
import { BookOpen, Bot, GitBranch, Play, Plus, RefreshCw, Search, SlidersHorizontal, Sparkles, Store, Trash2, X } from 'lucide-react';
import { AgentInfo, getAgentLabel, getModelLabel } from '../../types';
import { deleteAgent, fetchAgents, updateAgentConfig } from '../../api';
import { notify } from '../../shared/common/Toast';
import { ConfirmDialog } from '../../shared/common/ConfirmDialog';
import { AgentActionsModal } from './AgentActionsModal';
import { AgentCreatorModal } from './AgentCreatorModal';
import { AgentPlayground } from './AgentPlayground';
import { AgentRouteModal } from './AgentRouteModal';
import { AgentSkillsModal } from './AgentSkillsModal';
import { AgentTemplateStoreGrid } from './AgentTemplateStoreGrid';
import { PageHeader } from '../../shared/layout/PageHeader';
import { MascotAvatar } from '../../shared/common/MascotAvatar';
import { useAssistantIdentity } from '../../context/AssistantIdentityContext';
import { AGENT_TEMPLATE_LIBRARY, canUninstallAgent } from '../../services/agentTemplates';

type AgentCategory = 'all' | 'studies' | 'creative' | 'security' | 'business' | 'dev';
type AgentCenterSection = 'installed' | 'store';

interface AgentCenterViewProps {
  onOpenGitHubImport?: () => void;
}

export const AgentCenterView: React.FC<AgentCenterViewProps> = ({ onOpenGitHubImport }) => {
  const { assistantName, experienceMode } = useAssistantIdentity();
  const isSimpleMode = experienceMode === 'simple';
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [section, setSection] = useState<AgentCenterSection>('installed');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AgentCategory>('all');

  const [creatorOpen, setCreatorOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentInfo | null>(null);
  const [selectedPlaygroundAgent, setSelectedPlaygroundAgent] = useState<AgentInfo | null>(null);
  const [selectedActionsAgent, setSelectedActionsAgent] = useState<AgentInfo | null>(null);
  const [selectedRouteAgent, setSelectedRouteAgent] = useState<AgentInfo | null>(null);
  const [selectedSkillsAgent, setSelectedSkillsAgent] = useState<AgentInfo | null>(null);
  const [pendingUninstall, setPendingUninstall] = useState<AgentInfo | null>(null);
  const [uninstalling, setUninstalling] = useState(false);

  const handleConfirmUninstall = async () => {
    if (!pendingUninstall) return;
    setUninstalling(true);
    try {
      const label = pendingUninstall.proper_name || pendingUninstall.name || getAgentLabel(pendingUninstall.role);
      await deleteAgent(pendingUninstall.role);
      notify(`${label} foi desinstalado da sua equipe.`, 'info');
      setPendingUninstall(null);
      await loadAgents();
      window.dispatchEvent(new CustomEvent('jarvis:agents-updated'));
    } catch (err: any) {
      notify(err?.message || 'Não foi possível desinstalar este agente.', 'error');
    } finally {
      setUninstalling(false);
    }
  };

  const handleResetAgentToHybrid = async (role: string) => {
    try {
      await updateAgentConfig(role, {
        preferred_model: 'gemini-4-hydrogen',
        routing_policy: 'auto_hybrid',
        change_summary: 'Restaurado para Modo Híbrido padrão',
      });
      notify(`Especialista '${getAgentLabel(role)}' restaurado para o Modo Híbrido.`, 'success');
      await loadAgents();
    } catch (err: any) {
      notify(`Erro ao restaurar especialista: ${err.message}`, 'error');
    }
  };

  const loadAgents = async () => {
    setLoading(true);
    try {
      const data = await fetchAgents();
      setAgents(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Falha ao carregar o catálogo de agentes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAgents();
    const onAgentsUpdated = () => {
      void loadAgents();
    };
    window.addEventListener('jarvis:agents-updated', onAgentsUpdated);
    return () => window.removeEventListener('jarvis:agents-updated', onAgentsUpdated);
  }, []);

  const filteredAgents = useMemo(() => {
    return agents.filter((ag) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        (ag.proper_name || '').toLowerCase().includes(q) ||
        (ag.handle || '').toLowerCase().includes(q) ||
        ag.name.toLowerCase().includes(q) ||
        ag.role.toLowerCase().includes(q) ||
        getAgentLabel(ag.role).toLowerCase().includes(q) ||
        ag.mission.toLowerCase().includes(q);

      if (!matchSearch) return false;
      if (categoryFilter === 'all') return true;
      return (ag.category || 'dev') === categoryFilter;
    });
  }, [agents, search, categoryFilter]);

  const openCreateModal = () => {
    setEditingAgent(null);
    setCreatorOpen(true);
  };

  const openEditModal = (agent: AgentInfo) => {
    setEditingAgent(agent);
    setCreatorOpen(true);
  };

  return (
    <div className="jarvis-page-shell">
      <PageHeader
        icon={<Bot size={18} />}
        title={isSimpleMode ? `Equipe de ${assistantName}` : 'Central de Agentes & Loja de Templates'}
        subtitle={
          isSimpleMode
            ? `Instale agentes prontos com habilidades configuradas em 1 clique ou remova os que você não usa — sem precisar preencher formulários.`
            : 'Instale templates prontos com habilidades pré-configuradas, desinstale agentes que não usa ou crie especialistas sob medida com mascote e roteamento.'
        }
        meta={[
          `${agents.length} especialista(s) instalados`,
          `${AGENT_TEMPLATE_LIBRARY.length} templates prontos na loja`,
        ]}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={loadAgents}
              disabled={loading}
              className="btn btn-secondary btn-sm"
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              <span>{loading ? 'Atualizando…' : 'Atualizar'}</span>
            </button>
            <button type="button" onClick={openCreateModal} className="btn btn-secondary btn-sm">
              <Plus size={14} />
              <span>Criar do zero</span>
            </button>
            {onOpenGitHubImport && (
              <button type="button" onClick={onOpenGitHubImport} className="btn btn-secondary btn-sm">
                <GitBranch size={14} />
                <span>Importar do GitHub</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSection(section === 'store' ? 'installed' : 'store')}
              className="btn btn-primary btn-sm"
            >
              <Store size={14} />
              <span>
                {section === 'store' ? 'Ver meus instalados' : 'Loja de Agentes Prontos'}
              </span>
            </button>
          </div>
        }
      />

      {/* Alternador Principal: Meus Agentes Instalados vs Loja de Agentes Prontos */}
      <div
        className="jarvis-segmented"
        role="tablist"
        aria-label="Seções da central de agentes"
        style={{ alignSelf: 'flex-start' }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={section === 'installed'}
          onClick={() => setSection('installed')}
          className={`jarvis-segmented-btn ${section === 'installed' ? 'is-active' : ''}`}
        >
          <Bot size={13} />
          <span>Meus Agentes Instalados ({agents.length})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'store'}
          onClick={() => setSection('store')}
          className={`jarvis-segmented-btn ${section === 'store' ? 'is-active' : ''}`}
        >
          <Sparkles size={13} />
          <span>Loja de Agentes Prontos ({AGENT_TEMPLATE_LIBRARY.length})</span>
        </button>
      </div>

      {loadError && (
        <div role="alert" className="jarvis-error-banner" style={{ justifyContent: 'space-between' }}>
          <span>Não foi possível carregar os agentes: {loadError}</span>
          <button type="button" onClick={loadAgents} className="btn btn-ghost btn-xs">
            Tentar novamente
          </button>
        </div>
      )}

      {section === 'store' ? (
        <AgentTemplateStoreGrid
          installedAgents={agents}
          onRefreshAgents={loadAgents}
          onOpenChat={(ag) => {
            window.dispatchEvent(
              new CustomEvent('jarvis:open-agent-chat', {
                detail: { agentId: ag.role, agentName: ag.proper_name || ag.name },
              })
            );
          }}
        />
      ) : (
        <>
          {/* Barra Unificada de Busca e Categorias */}
          <div className="jarvis-filter-bar">
            <div className="jarvis-search-box" style={{ flex: '1 1 240px', maxWidth: '380px' }}>
              <Search size={14} />
              <input
                type="text"
                placeholder="Buscar por nome próprio (Kira, Clara, Newton...), @handle ou missão..."
                aria-label="Filtrar especialistas"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="jarvis-search-box__input"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="btn btn-ghost btn-icon-sm"
                  aria-label="Limpar busca"
                  style={{ width: '22px', height: '22px', padding: 0 }}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="jarvis-segmented" role="tablist" aria-label="Categorias de agentes" style={{ flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: `Todos (${agents.length})` },
                { id: 'studies', label: 'Estudos & Pesquisa' },
                { id: 'creative', label: 'Criativo & Docs' },
                { id: 'security', label: 'Segurança' },
                { id: 'business', label: 'Finanças' },
                { id: 'dev', label: 'Engenharia' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={categoryFilter === cat.id}
                  onClick={() => setCategoryFilter(cat.id as AgentCategory)}
                  className={`jarvis-segmented-btn ${categoryFilter === cat.id ? 'is-active' : ''}`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {filteredAgents.length === 0 && !loading && !loadError && (
            <div role="status" className="jarvis-empty-state">
              <Bot size={22} color="var(--text-muted)" />
              <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
                {agents.length === 0
                  ? 'Nenhum especialista encontrado.'
                  : 'Nenhum especialista corresponde aos filtros selecionados.'}
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setCategoryFilter('all');
                  }}
                  className="btn btn-secondary btn-xs"
                >
                  Limpar filtros
                </button>
                <button
                  type="button"
                  onClick={() => setSection('store')}
                  className="btn btn-primary btn-xs"
                >
                  Explorar Loja de Agentes Prontos
                </button>
              </div>
            </div>
          )}

          {/* Grid de Especialistas com Mascotes */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
              gap: '14px',
            }}
          >
        {filteredAgents.map((agent) => {
          const isOnlineModel =
            agent.routing_policy === 'online_only' ||
            (agent.preferred_model || '').toLowerCase().startsWith('gemini-');
          const modeLabel =
            agent.routing_policy === 'local_only'
              ? 'LOCAL · Ollama'
              : isOnlineModel
                ? 'ONLINE · Gemini'
                : 'HÍBRIDO · Local/Gemini';
          const modelDisplay = getModelLabel(agent.preferred_model);
          const properName = agent.proper_name || getAgentLabel(agent.role);
          const handleLabel = agent.handle || `@${agent.role.split('_')[0]}`;

          return (
            <article
              key={agent.role}
              className="jarvis-settings-card"
              style={{
                justifyContent: 'space-between',
                gap: '14px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                  <MascotAvatar
                    mascot={agent.mascot}
                    role={agent.role}
                    name={properName}
                    size={46}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                      <h3
                        style={{
                          fontSize: '1rem',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          margin: 0,
                        }}
                      >
                        {properName}
                      </h3>
                      <span
                        style={{
                          fontSize: '0.74rem',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--accent-light)',
                          fontWeight: 600,
                        }}
                      >
                        {handleLabel}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '0.78rem',
                        color: 'var(--text-secondary)',
                        marginTop: '2px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {agent.name || getAgentLabel(agent.role)}
                    </div>
                  </div>
                </div>

                <p
                  style={{
                    fontSize: '0.82rem',
                    color: 'var(--text-secondary)',
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {agent.mission}
                </p>

                {(() => {
                  const matchedTpl = AGENT_TEMPLATE_LIBRARY.find(
                    (t) =>
                      t.templateId === agent.template_id ||
                      t.role === agent.role ||
                      t.handle.toLowerCase() === handleLabel.toLowerCase()
                  );
                  const skillLabels =
                    agent.installed_skills && agent.installed_skills.length > 0
                      ? agent.installed_skills
                      : matchedTpl
                        ? matchedTpl.skills.map((sk) => sk.name)
                        : [];
                  if (skillLabels.length === 0) return null;
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '10px' }}>
                      {skillLabels.slice(0, 3).map((label) => (
                        <span
                          key={label}
                          style={{
                            fontSize: '0.7rem',
                            padding: '2px 7px',
                            borderRadius: '6px',
                            backgroundColor: 'var(--bg-primary)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {label}
                        </span>
                      ))}
                      {skillLabels.length > 3 && (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            padding: '2px 7px',
                            borderRadius: '6px',
                            backgroundColor: 'var(--accent-soft)',
                            border: '1px solid var(--border-accent)',
                            color: 'var(--accent-light)',
                            fontWeight: 600,
                          }}
                        >
                          +{skillLabels.length - 3} habilidades
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div
                style={{
                  paddingTop: '12px',
                  borderTop: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  fontSize: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Motor</span>
                  <span
                    style={{
                      color: isOnlineModel ? '#38bdf8' : '#4ade80',
                      fontWeight: 600,
                    }}
                  >
                    {modeLabel}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Modelo</span>
                  <span
                    style={{
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.73rem',
                      textAlign: 'right',
                    }}
                  >
                    {modelDisplay}
                  </span>
                </div>

                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '2px' }}>
                  <span>{agent.strict_focus ? 'Foco estrito' : 'Escopo flexível'}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{agent.is_read_only ? 'Somente leitura' : 'Pode propor ações'}</span>
                  <span aria-hidden="true"> · </span>
                  <span className="jarvis-tabular" style={{ fontFamily: 'var(--font-mono)' }}>
                    v{agent.version || 1}
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  paddingTop: '2px',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ flex: '1 1 88px' }}
                  onClick={() => setSelectedSkillsAgent(agent)}
                >
                  <BookOpen size={13} />
                  <span>Habilidades</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ flex: '1 1 78px' }}
                  onClick={() => openEditModal(agent)}
                >
                  <SlidersHorizontal size={13} />
                  <span>Editar</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ flex: '1 1 78px' }}
                  onClick={() => setSelectedPlaygroundAgent(agent)}
                >
                  <Play size={13} />
                  <span>Testar</span>
                </button>
                {canUninstallAgent(agent) && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon-sm"
                    style={{
                      color: '#f87171',
                      borderColor: 'rgba(239, 68, 68, 0.28)',
                      flexShrink: 0,
                    }}
                    title={`Desinstalar ${properName}`}
                    aria-label={`Desinstalar ${properName}`}
                    onClick={() => setPendingUninstall(agent)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
        </>
      )}

      <ConfirmDialog
        isOpen={Boolean(pendingUninstall)}
        title={`Desinstalar ${pendingUninstall?.proper_name || pendingUninstall?.name || 'agente'}?`}
        description={
          <>
            O especialista{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {pendingUninstall?.proper_name || pendingUninstall?.name}
            </strong>{' '}
            será removido da sua equipe ativa. Se quiser usar novamente depois, basta reinstalá-lo em
            1 clique na aba <strong>Loja de Agentes Prontos</strong>.
          </>
        }
        confirmLabel="Desinstalar agente"
        cancelLabel="Cancelar"
        tone="danger"
        isLoading={uninstalling}
        onCancel={() => setPendingUninstall(null)}
        onConfirm={handleConfirmUninstall}
      />

      {creatorOpen && (
        <AgentCreatorModal
          isOpen={creatorOpen}
          editingAgent={editingAgent}
          allAgents={agents}
          onClose={() => {
            setCreatorOpen(false);
            setEditingAgent(null);
          }}
          onSaved={loadAgents}
        />
      )}

      {selectedActionsAgent && (
        <AgentActionsModal
          isOpen={true}
          agent={selectedActionsAgent}
          onClose={() => setSelectedActionsAgent(null)}
          onOpenConfig={() => openEditModal(selectedActionsAgent)}
          onOpenPlayground={() => setSelectedPlaygroundAgent(selectedActionsAgent)}
          onResetToHybridDefault={() => handleResetAgentToHybrid(selectedActionsAgent.role)}
        />
      )}

      {selectedPlaygroundAgent && (
        <AgentPlayground
          isOpen={true}
          agent={selectedPlaygroundAgent}
          onClose={() => setSelectedPlaygroundAgent(null)}
        />
      )}

      {selectedRouteAgent && (
        <AgentRouteModal
          isOpen={true}
          agent={selectedRouteAgent}
          onClose={() => setSelectedRouteAgent(null)}
          onSaved={loadAgents}
        />
      )}

      {selectedSkillsAgent && (
        <AgentSkillsModal
          isOpen={true}
          agent={selectedSkillsAgent}
          onClose={() => setSelectedSkillsAgent(null)}
          onSaved={loadAgents}
        />
      )}
    </div>
  );
};
