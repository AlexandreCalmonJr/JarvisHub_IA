import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { AgentInfo } from '../../types';
import {
  AGENT_TEMPLATE_LIBRARY,
  AgentTemplate,
  AgentTemplateCategory,
  TEMPLATE_CATEGORY_TABS,
  canUninstallAgent,
  filterAgentTemplates,
  findInstalledAgentForTemplate,
} from '../../services/agentTemplates';
import { deleteAgent } from '../../services/api/agents';
import { MascotAvatar } from '../../shared/common/MascotAvatar';
import { ConfirmDialog } from '../../shared/common/ConfirmDialog';
import { notify } from '../../shared/common/Toast';
import { AgentTemplatePreviewModal } from './AgentTemplatePreviewModal';

interface AgentTemplateStoreGridProps {
  installedAgents: AgentInfo[];
  onRefreshAgents: () => Promise<void> | void;
  onOpenChat?: (agent: AgentInfo) => void;
}

export const AgentTemplateStoreGrid: React.FC<AgentTemplateStoreGridProps> = ({
  installedAgents,
  onRefreshAgents,
  onOpenChat,
}) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<AgentTemplateCategory>('all');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<AgentTemplate | null>(null);
  const [pendingUninstall, setPendingUninstall] = useState<{
    agent: AgentInfo;
    displayName: string;
  } | null>(null);
  const [uninstalling, setUninstalling] = useState(false);

  const filteredTemplates = useMemo(
    () =>
      filterAgentTemplates(AGENT_TEMPLATE_LIBRARY, {
        query: search,
        category,
        onlyAvailable,
        installedAgents,
      }),
    [search, category, onlyAvailable, installedAgents]
  );

  const installedCount = useMemo(
    () =>
      AGENT_TEMPLATE_LIBRARY.filter((tpl) =>
        Boolean(findInstalledAgentForTemplate(tpl, installedAgents))
      ).length,
    [installedAgents]
  );

  const handleConfirmUninstall = async () => {
    if (!pendingUninstall) return;
    setUninstalling(true);
    try {
      await deleteAgent(pendingUninstall.agent.role);
      notify(`${pendingUninstall.displayName} desinstalado da sua equipe.`, 'info');
      setPendingUninstall(null);
      await onRefreshAgents();
      window.dispatchEvent(new CustomEvent('jarvis:agents-updated'));
    } catch (err: any) {
      notify(err?.message || 'Não foi possível desinstalar o agente.', 'error');
    } finally {
      setUninstalling(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Faixa explicativa direta para usuários comuns */}
      <div
        className="jarvis-callout jarvis-callout--info"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 280px' }}>
          <Sparkles size={16} color="var(--accent-light)" style={{ flexShrink: 0 }} />
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>
              Prontos para usar em 1 clique:
            </strong>{' '}
            clique em <strong>Instalar</strong> para ver todas as habilidades, exemplos e ativar o
            agente sem preencher formulários. Você pode desinstalar os que não usar quando quiser.
          </span>
        </div>
        <span
          className="jarvis-tabular"
          style={{
            fontSize: '0.76rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--accent-light)',
            fontWeight: 600,
          }}
        >
          {installedAgents.length} na equipe · {AGENT_TEMPLATE_LIBRARY.length - installedCount} disponíveis na loja
        </span>
      </div>

      {/* Barra de Busca e Filtros */}
      <div className="jarvis-filter-bar">
        <div className="jarvis-search-box" style={{ flex: '1 1 240px', maxWidth: '380px' }}>
          <Search size={14} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar agente ou habilidade (ex.: geladeira, inglês, contrato, Excel...)"
            aria-label="Buscar templates de agentes prontos"
            className="jarvis-search-box__input"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="btn btn-ghost btn-icon-sm"
              aria-label="Limpar busca de templates"
              style={{ width: '22px', height: '22px', padding: 0 }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={onlyAvailable}
            onChange={(e) => setOnlyAvailable(e.target.checked)}
          />
          <span>Somente disponíveis para instalar</span>
        </label>
      </div>

      {/* Abas de Categoria */}
      <div
        className="jarvis-segmented"
        role="tablist"
        aria-label="Categorias da biblioteca de agentes prontos"
        style={{ overflowX: 'auto', flexWrap: 'nowrap', maxWidth: '100%' }}
      >
        {TEMPLATE_CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={category === tab.id}
            onClick={() => setCategory(tab.id)}
            className={`jarvis-segmented-btn ${category === tab.id ? 'is-active' : ''}`}
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Grid de Cards */}
      {filteredTemplates.length === 0 ? (
        <div className="jarvis-empty-state">
          <Sparkles size={22} color="var(--text-muted)" />
          <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
            Nenhum agente pronto encontrado com esses filtros.
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => {
              setSearch('');
              setCategory('all');
              setOnlyAvailable(false);
            }}
          >
            Mostrar todos os templates
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
            gap: '14px',
          }}
        >
          {filteredTemplates.map((tpl) => {
            const installedMatch = findInstalledAgentForTemplate(tpl, installedAgents);
            const isInstalled = Boolean(installedMatch);
            const allowUninstall = installedMatch ? canUninstallAgent(installedMatch) : false;

            return (
              <article
                key={tpl.templateId}
                className="jarvis-settings-card"
                style={{
                  justifyContent: 'space-between',
                  gap: '12px',
                  minWidth: 0,
                  borderColor: isInstalled ? 'rgba(16, 185, 129, 0.32)' : undefined,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
                  {/* Cabeçalho */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <MascotAvatar
                      mascot={tpl.mascot}
                      role={tpl.role}
                      name={tpl.proper_name}
                      size={46}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '6px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: 0 }}>
                          <h3
                            style={{
                              margin: 0,
                              fontSize: '0.96rem',
                              fontWeight: 700,
                              color: 'var(--text-primary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {tpl.proper_name}
                          </h3>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--accent-light)',
                              fontWeight: 600,
                              flexShrink: 0,
                            }}
                          >
                            {tpl.handle}
                          </span>
                        </div>

                        {isInstalled ? (
                          <span
                            style={{
                              fontSize: '0.67rem',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(16, 185, 129, 0.14)',
                              border: '1px solid rgba(16, 185, 129, 0.35)',
                              color: '#34d399',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              flexShrink: 0,
                            }}
                          >
                            <CheckCircle2 size={11} /> Instalado
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '0.66rem',
                              fontWeight: 600,
                              padding: '2px 7px',
                              borderRadius: '6px',
                              backgroundColor: 'var(--bg-tertiary)',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-muted)',
                              flexShrink: 0,
                            }}
                          >
                            {tpl.audience}
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          fontSize: '0.77rem',
                          color: 'var(--text-secondary)',
                          marginTop: '2px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {tpl.title}
                      </div>
                    </div>
                  </div>

                  {/* Descrição curta */}
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.81rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.48,
                    }}
                  >
                    {tpl.tagline}
                  </p>

                  {/* Preview rápido das Habilidades */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontFamily: 'var(--font-mono)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {tpl.skills.length} habilidades prontas
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                      {tpl.skills.slice(0, 3).map((sk) => (
                        <span
                          key={sk.id}
                          style={{
                            fontSize: '0.71rem',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: 'var(--bg-primary)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {sk.name}
                        </span>
                      ))}
                      {tpl.skills.length > 3 && (
                        <span
                          style={{
                            fontSize: '0.71rem',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: 'var(--accent-soft)',
                            border: '1px solid var(--border-accent)',
                            color: 'var(--accent-light)',
                            fontWeight: 600,
                          }}
                        >
                          +{tpl.skills.length - 3} mais
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Rodapé de Ações */}
                <div style={{ display: 'flex', gap: '8px', paddingTop: '6px' }}>
                  {!isInstalled ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => setPreviewTemplate(tpl)}
                    >
                      <Download size={13} />
                      <span>Instalar</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ flex: 1 }}
                        onClick={() => setPreviewTemplate(tpl)}
                      >
                        <Eye size={13} />
                        <span>Ver habilidades</span>
                      </button>
                      {installedMatch && allowUninstall && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{
                            color: '#f87171',
                            borderColor: 'rgba(239, 68, 68, 0.28)',
                          }}
                          aria-label={`Desinstalar ${tpl.proper_name}`}
                          onClick={() =>
                            setPendingUninstall({
                              agent: installedMatch,
                              displayName: installedMatch.proper_name || tpl.proper_name,
                            })
                          }
                        >
                          <Trash2 size={13} />
                          <span>Desinstalar</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal de Prévia de Habilidades & Instalação */}
      <AgentTemplatePreviewModal
        template={previewTemplate}
        installedAgent={
          previewTemplate
            ? findInstalledAgentForTemplate(previewTemplate, installedAgents) || null
            : null
        }
        onClose={() => setPreviewTemplate(null)}
        onChanged={onRefreshAgents}
        onOpenChat={onOpenChat}
      />

      {/* Confirmação Segura de Desinstalação */}
      <ConfirmDialog
        isOpen={Boolean(pendingUninstall)}
        title={`Desinstalar ${pendingUninstall?.displayName || 'agente'}?`}
        description={
          <>
            O especialista{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {pendingUninstall?.displayName}
            </strong>{' '}
            será removido da sua equipe ativa para manter seu hub limpo. Você poderá reinstalá-lo a
            qualquer momento na Loja de Agentes Prontos.
          </>
        }
        confirmLabel="Desinstalar agente"
        cancelLabel="Manter instalado"
        tone="danger"
        isLoading={uninstalling}
        onCancel={() => setPendingUninstall(null)}
        onConfirm={handleConfirmUninstall}
      />
    </div>
  );
};
