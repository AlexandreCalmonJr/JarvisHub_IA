import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Brain,
  Search,
  Pin,
  PinOff,
  Home,
  Lock,
  Bot,
  Plus,
  Trash2,
  Edit3,
  ExternalLink,
  RefreshCw,
  Check,
  X,
} from 'lucide-react';
import {
  fetchBrainMemories,
  createBrainMemory,
  updateBrainMemory,
  deleteBrainMemory,
  setBrainAutoDistill,
  subscribeJarvisRealtime,
} from '../../services/api/brain';
import type { BrainLayer, BrainMemoryItem, BrainSearchHit } from '../../services/secondBrain';
import { notify } from '../../shared/common/Toast';
import { Modal } from '../../shared/common/Modal';
import { ConfirmDialog } from '../../shared/common/ConfirmDialog';

const LAYER_LABELS: Record<BrainLayer, string> = {
  private: 'Privada',
  agent: 'Por Agente',
  household: 'Compartilhada da Casa',
};

const SOURCE_KIND_LABELS: Record<string, string> = {
  chat_research: 'Conversa',
  web_search: 'Pesquisa Web',
  document: 'Documento',
  manual: 'Anotação manual',
  assistant_sync: 'Sincronia da Casa',
  integration: 'Integração',
};

const AGENT_OPTIONS = [
  { role: '', label: 'Nenhum agente específico' },
  { role: 'english_tutor', label: 'Clara · Professora & Estudos' },
  { role: 'ux_ui_designer', label: 'Vega · Designer UX/UI' },
  { role: 'frontend_mobile_developer', label: 'Neo · Engenheiro Frontend' },
  { role: 'sentinel_security', label: 'Kira · Segurança & SOC' },
  { role: 'code_reviewer', label: 'Lia · Qualidade & Revisão' },
  { role: 'software_architect', label: 'Atlas · Arquiteto de Software' },
];

export const BrainMapPanel: React.FC = () => {
  const [hits, setHits] = useState<BrainSearchHit[]>([]);
  const [counts, setCounts] = useState({ total: 0, private: 0, agent: 0, household: 0, pinned: 0 });
  const [autoDistill, setAutoDistill] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [layerFilter, setLayerFilter] = useState<BrainLayer | 'all'>('all');
  const [pinnedOnly, setPinnedOnly] = useState(false);

  // Create / Edit modal state
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [editingMemory, setEditingMemory] = useState<BrainMemoryItem | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formLayer, setFormLayer] = useState<BrainLayer>('private');
  const [formAgentRole, setFormAgentRole] = useState('');
  const [formTags, setFormTags] = useState('');
  const [formPinned, setFormPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [pendingDelete, setPendingDelete] = useState<BrainMemoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadMemories = useCallback(async (opts?: { q?: string; layer?: BrainLayer | 'all'; pinnedOnly?: boolean }) => {
    setLoading(true);
    try {
      const res = await fetchBrainMemories({
        q: opts?.q ?? appliedQuery,
        layer: opts?.layer ?? layerFilter,
        pinned_only: opts?.pinnedOnly ?? pinnedOnly,
      });
      setHits(res.memories || []);
      setCounts(res.counts || { total: 0, private: 0, agent: 0, household: 0, pinned: 0 });
      setAutoDistill(Boolean(res.auto_distill_enabled));
      setError(null);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar memórias do Segundo Cérebro.');
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, layerFilter, pinnedOnly]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  useEffect(() => {
    const unsubscribe = subscribeJarvisRealtime((event) => {
      if (event.type === 'brain_memory_updated') {
        loadMemories();
      }
    });
    return unsubscribe;
  }, [loadMemories]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedQuery(query.trim());
  };

  const handleClearSearch = () => {
    setQuery('');
    setAppliedQuery('');
  };

  const handleToggleAutoDistill = async () => {
    const next = !autoDistill;
    setAutoDistill(next);
    try {
      const res = await setBrainAutoDistill(next);
      setAutoDistill(Boolean(res.auto_distill_enabled));
      notify(
        res.auto_distill_enabled
          ? 'Auto-destilação ativada: pesquisas e respostas relevantes viram memória automaticamente.'
          : 'Auto-destilação pausada: você ainda pode salvar mensagens com 1 clique no chat.',
        'info'
      );
    } catch (err: any) {
      setAutoDistill(!next);
      notify(err?.message || 'Erro ao alterar auto-destilação.', 'error');
    }
  };

  const openCreateModal = () => {
    setEditingMemory(null);
    setFormTitle('');
    setFormContent('');
    setFormLayer(layerFilter === 'all' ? 'private' : layerFilter);
    setFormAgentRole('');
    setFormTags('');
    setFormPinned(false);
    setShowEditorModal(true);
  };

  const openEditModal = (memory: BrainMemoryItem) => {
    setEditingMemory(memory);
    setFormTitle(memory.title);
    setFormContent(memory.content);
    setFormLayer(memory.layer);
    setFormAgentRole(memory.agent_role || '');
    setFormTags((memory.tags || []).join(', '));
    setFormPinned(Boolean(memory.pinned));
    setShowEditorModal(true);
  };

  const handleSaveMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formContent.trim()) {
      notify('Informe um título e o conteúdo da memória.', 'error');
      return;
    }
    setSaving(true);
    try {
      const tags = formTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8);

      if (editingMemory) {
        await updateBrainMemory(editingMemory.id, {
          title: formTitle.trim(),
          content: formContent.trim(),
          layer: formLayer,
          pinned: formPinned,
          tags,
        });
        notify('Memória atualizada no Segundo Cérebro.', 'success');
      } else {
        const selectedAgent = AGENT_OPTIONS.find((a) => a.role === formAgentRole);
        await createBrainMemory({
          title: formTitle.trim(),
          content: formContent.trim(),
          layer: formLayer,
          agent_role: formLayer === 'agent' && formAgentRole ? formAgentRole : null,
          agent_name: formLayer === 'agent' && selectedAgent ? selectedAgent.label.split(' · ')[0] : null,
          source_kind: 'manual',
          source_label: 'Registrado manualmente',
          tags,
          pinned: formPinned,
        });
        notify('Nova memória gravada e vetorizada no Segundo Cérebro.', 'success');
      }
      setShowEditorModal(false);
      await loadMemories();
    } catch (err: any) {
      notify(err?.message || 'Erro ao salvar memória.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePin = async (memory: BrainMemoryItem) => {
    try {
      await updateBrainMemory(memory.id, { pinned: !memory.pinned });
      notify(
        !memory.pinned ? `'${memory.title}' fixada como regra permanente.` : 'Regra desafixada.',
        'success'
      );
      await loadMemories();
    } catch (err: any) {
      notify(err?.message || 'Erro ao atualizar fixação.', 'error');
    }
  };

  const handlePromoteToHousehold = async (memory: BrainMemoryItem) => {
    try {
      await updateBrainMemory(memory.id, { layer: 'household' });
      notify(`'${memory.title}' promovida para a Memória Compartilhada da Casa.`, 'success');
      await loadMemories();
    } catch (err: any) {
      notify(err?.message || 'Erro ao compartilhar memória com a casa.', 'error');
    }
  };

  const confirmDeleteMemory = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteBrainMemory(pendingDelete.id);
      notify(`Memória '${pendingDelete.title}' esquecida.`, 'success');
      setPendingDelete(null);
      await loadMemories();
    } catch (err: any) {
      notify(err?.message || 'Erro ao esquecer memória.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const layerTabs = useMemo(
    () => [
      { id: 'all' as const, label: 'Todas', count: counts.total },
      { id: 'private' as const, label: 'Privada', count: counts.private },
      { id: 'agent' as const, label: 'Por Agente', count: counts.agent },
      { id: 'household' as const, label: 'Compartilhada da Casa', count: counts.household },
    ],
    [counts]
  );

  return (
    <div data-testid="brain-map-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Toolbar: Auto-Distill + Search + New Memory */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '14px 16px',
          borderRadius: '12px',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '240px', flex: 1 }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Tudo Vira Cérebro
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Pesquisas na web, conversas relevantes e anotações são destiladas em memórias semânticas consultadas automaticamente pelos agentes.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            role="switch"
            aria-checked={autoDistill}
            onClick={handleToggleAutoDistill}
            className={`btn btn-sm ${autoDistill ? 'btn-secondary' : 'btn-ghost'}`}
            style={{
              border: autoDistill ? '1px solid var(--border-accent)' : '1px solid var(--border-color)',
              whiteSpace: 'nowrap',
            }}
          >
            <Brain size={14} color={autoDistill ? 'var(--accent-color)' : 'var(--text-muted)'} />
            <span>Auto-destilar: {autoDistill ? 'Ativo' : 'Pausado'}</span>
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="btn btn-primary btn-sm"
            style={{ whiteSpace: 'nowrap' }}
          >
            <Plus size={14} />
            <span>Nova Memória</span>
          </button>
        </div>
      </div>

      {/* Filter Segmented Bar & Semantic Search */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div
          role="tablist"
          aria-label="Camadas do Segundo Cérebro"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px',
            borderRadius: '10px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            flexWrap: 'wrap',
          }}
        >
          {layerTabs.map((tab) => {
            const active = layerFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setLayerFilter(tab.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '7px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: active ? 600 : 500,
                  whiteSpace: 'nowrap',
                  backgroundColor: active ? 'var(--bg-surface, var(--bg-tertiary))' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{tab.label}</span>
                <span className="jarvis-tabular" style={{ fontSize: '0.73rem', color: active ? 'var(--accent-color)' : 'var(--text-muted)' }}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 300px', justifyContent: 'flex-end' }}>
          <form
            onSubmit={handleSearchSubmit}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 240px', maxWidth: '420px' }}
          >
            <div style={{ position: 'relative', flex: 1 }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar no cérebro por significado..."
                aria-label="Buscar memórias no Segundo Cérebro"
                className="jarvis-input"
                style={{ paddingLeft: '32px', paddingRight: appliedQuery ? '30px' : '12px', height: '36px' }}
              />
              {appliedQuery && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  aria-label="Limpar busca semântica"
                  style={{
                    position: 'absolute',
                    right: '6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <button type="submit" className="btn btn-secondary btn-sm" style={{ height: '36px', whiteSpace: 'nowrap' }}>
              Buscar
            </button>
          </form>

          <button
            type="button"
            onClick={() => setPinnedOnly((p) => !p)}
            aria-pressed={pinnedOnly}
            className={`btn btn-sm ${pinnedOnly ? 'btn-primary' : 'btn-secondary'}`}
            style={{ height: '36px', whiteSpace: 'nowrap' }}
            title="Filtrar apenas regras fixadas"
          >
            <Pin size={13} />
            <span>Fixadas ({counts.pinned})</span>
          </button>

          <button
            type="button"
            onClick={() => loadMemories()}
            className="btn btn-ghost btn-icon"
            aria-label="Atualizar memórias"
            title="Atualizar memórias"
            style={{ height: '36px', width: '36px' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="jarvis-callout jarvis-callout--danger">
          {error}
        </div>
      )}

      {/* Memories List — Flat single-elevation cards, unboxed metadata */}
      {loading && hits.length === 0 ? (
        <div
          style={{
            padding: '32px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          Consultando camadas semânticas do Segundo Cérebro...
        </div>
      ) : hits.length === 0 ? (
        <div
          style={{
            padding: '36px 24px',
            textAlign: 'center',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            backgroundColor: 'var(--bg-secondary)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <Brain size={24} color="var(--text-muted)" />
          <div style={{ fontSize: '0.94rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Nenhuma memória encontrada neste filtro
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, maxWidth: '460px' }}>
            {appliedQuery
              ? `Nenhum registro corresponde semanticamente a "${appliedQuery}". Tente termos mais amplos ou limpe o filtro.`
              : 'Crie uma nova memória ou converse no chat para que o Segundo Cérebro destile aprendizados automaticamente.'}
          </p>
          <button type="button" onClick={openCreateModal} className="btn btn-primary btn-sm" style={{ marginTop: '4px' }}>
            <Plus size={14} />
            <span>Registrar primeira memória</span>
          </button>
        </div>
      ) : (
        <div
          data-testid="brain-memories-list"
          style={{
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            backgroundColor: 'var(--bg-secondary)',
            overflow: 'hidden',
          }}
        >
          {hits.map(({ memory, score }, idx) => {
            const relevancePct = Math.round(Math.min(0.99, Math.max(0.1, score)) * 100);
            const updatedDate = new Date(memory.updated_at).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <article
                key={memory.id}
                data-testid={`brain-memory-item-${memory.id}`}
                style={{
                  padding: '16px 20px',
                  borderTop: idx === 0 ? 'none' : '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: '1 1 360px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {memory.title}
                      </h3>
                      {memory.pinned && (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            color: 'var(--accent-color)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                        >
                          <Pin size={11} /> Regra fixa
                        </span>
                      )}
                    </div>

                    {/* Unboxed typographic metadata (Zero-Pill discipline) */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '6px',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          color:
                            memory.layer === 'household'
                              ? '#38bdf8'
                              : memory.layer === 'agent'
                                ? 'var(--accent-light)'
                                : 'var(--text-secondary)',
                          fontWeight: 500,
                        }}
                      >
                        {memory.layer === 'household' ? (
                          <Home size={11} />
                        ) : memory.layer === 'agent' ? (
                          <Bot size={11} />
                        ) : (
                          <Lock size={11} />
                        )}
                        <span>{LAYER_LABELS[memory.layer]}</span>
                      </span>
                      {memory.agent_name && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Agente {memory.agent_name}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{SOURCE_KIND_LABELS[memory.source_kind] || memory.source_label}</span>
                      <span aria-hidden="true">·</span>
                      <span className="jarvis-tabular">Relevância {relevancePct}%</span>
                      <span aria-hidden="true">·</span>
                      <span className="jarvis-tabular">{updatedDate}</span>
                    </div>
                  </div>

                  {/* Direct 1-click actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleTogglePin(memory)}
                      className="btn btn-ghost btn-xs"
                      aria-label={memory.pinned ? `Desafixar regra '${memory.title}'` : `Fixar regra '${memory.title}'`}
                      title={memory.pinned ? 'Desafixar regra permanente' : 'Fixar como regra permanente'}
                    >
                      {memory.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                      <span>{memory.pinned ? 'Desafixar' : 'Fixar'}</span>
                    </button>

                    {memory.layer !== 'household' && (
                      <button
                        type="button"
                        onClick={() => handlePromoteToHousehold(memory)}
                        className="btn btn-ghost btn-xs"
                        aria-label={`Compartilhar '${memory.title}' com a casa`}
                        title="Promover para a Memória Compartilhada da Casa"
                      >
                        <Home size={13} />
                        <span>Compartilhar c/ Casa</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => openEditModal(memory)}
                      className="btn btn-ghost btn-xs"
                      aria-label={`Editar '${memory.title}'`}
                      title="Editar memória"
                    >
                      <Edit3 size={13} />
                      <span>Editar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPendingDelete(memory)}
                      className="btn btn-ghost btn-xs"
                      style={{ color: 'var(--danger-color, #f87171)' }}
                      aria-label={`Esquecer '${memory.title}'`}
                      title="Esquecer esta memória"
                    >
                      <Trash2 size={13} />
                      <span>Esquecer</span>
                    </button>
                  </div>
                </div>

                <p
                  style={{
                    margin: 0,
                    fontSize: '0.84rem',
                    lineHeight: 1.58,
                    color: 'var(--text-secondary)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {memory.content}
                </p>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    fontSize: '0.73rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  <div>
                    {memory.tags && memory.tags.length > 0 && (
                      <span>{memory.tags.map((t) => `#${t}`).join('  ·  ')}</span>
                    )}
                  </div>
                  {memory.source_url && (
                    <a
                      href={memory.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: 'var(--accent-light)',
                        textDecoration: 'none',
                      }}
                    >
                      <ExternalLink size={11} />
                      <span>Fonte original</span>
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal: Create / Edit Brain Memory */}
      <Modal
        isOpen={showEditorModal}
        onClose={() => setShowEditorModal(false)}
        title={editingMemory ? 'Editar Memória do Cérebro' : 'Nova Memória no Segundo Cérebro'}
        subtitle="Salve preferências, pesquisas destiladas ou regras que os agentes devem lembrar."
        icon={<Brain size={18} />}
        maxWidth="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={() => setShowEditorModal(false)} className="btn btn-secondary btn-sm">
              Cancelar
            </button>
            <button
              type="submit"
              form="brain-memory-form"
              disabled={saving}
              className="btn btn-primary btn-sm"
            >
              <Check size={14} />
              <span>{saving ? 'Salvando...' : editingMemory ? 'Salvar Alterações' : 'Gravar no Cérebro'}</span>
            </button>
          </div>
        }
      >
        <form id="brain-memory-form" onSubmit={handleSaveMemory} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label htmlFor="brain-mem-title" className="user-profile-field-label">
              Título da Memória *
            </label>
            <input
              id="brain-mem-title"
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Ex.: Padrão de cores da marca ou regra de rotina da casa"
              className="jarvis-input"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div>
              <label htmlFor="brain-mem-layer" className="user-profile-field-label">
                Camada de Memória
              </label>
              <select
                id="brain-mem-layer"
                value={formLayer}
                onChange={(e) => setFormLayer(e.target.value as BrainLayer)}
                className="jarvis-input"
              >
                <option value="private">Privada (só sua conta)</option>
                <option value="agent">Por Agente (especialista)</option>
                <option value="household">Compartilhada da Casa (João ↔ Maria)</option>
              </select>
            </div>

            {formLayer === 'agent' && (
              <div>
                <label htmlFor="brain-mem-agent" className="user-profile-field-label">
                  Agente Especialista
                </label>
                <select
                  id="brain-mem-agent"
                  value={formAgentRole}
                  onChange={(e) => setFormAgentRole(e.target.value)}
                  className="jarvis-input"
                >
                  {AGENT_OPTIONS.map((opt) => (
                    <option key={opt.role} value={opt.role}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="brain-mem-content" className="user-profile-field-label">
              Conteúdo / Regra / Pesquisa Destilada *
            </label>
            <textarea
              id="brain-mem-content"
              rows={4}
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              placeholder="Escreva o fato, resumo de pesquisa ou diretriz que deve ser lembrada..."
              className="jarvis-input"
              style={{ resize: 'vertical', minHeight: '96px' }}
              required
            />
          </div>

          <div>
            <label htmlFor="brain-mem-tags" className="user-profile-field-label">
              Palavras-chave (separadas por vírgula)
            </label>
            <input
              id="brain-mem-tags"
              type="text"
              value={formTags}
              onChange={(e) => setFormTags(e.target.value)}
              placeholder="arquitetura, rotina, viagens, design"
              className="jarvis-input"
            />
          </div>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formPinned}
              onChange={(e) => setFormPinned(e.target.checked)}
            />
            <span>Fixar como regra permanente (prioridade máxima nas consultas dos agentes)</span>
          </label>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title="Esquecer memória"
        description={
          pendingDelete ? (
            <>
              Deseja apagar permanentemente <strong>{pendingDelete.title}</strong> do Segundo Cérebro?
            </>
          ) : null
        }
        confirmLabel="Esquecer"
        tone="danger"
        isLoading={deleting}
        onConfirm={confirmDeleteMemory}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};
