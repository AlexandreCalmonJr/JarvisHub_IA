import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Plus, Trash2, ChevronDown, Check, MessageSquare } from 'lucide-react';
import { fetchChatSessions, deleteChatSession, fetchAgents } from '../../api';
import { AgentInfo, ChatSessionItem } from '../../types';
import {
  getLocalSessionsCatalog,
  removeSessionLocally,
  LocalSessionMeta,
  STORAGE_CATALOG_KEY,
} from './ChatHistoryDrawer';
import { getAccountStorageKey } from '../../services/accountScope';
import { resolveQuickChatAgents } from '../../services/agentSync';
import { canDeleteConversationCard, filterOutDeletedSession } from '../../services/sessionHelpers';
import { ConfirmDialog } from '../../shared/common/ConfirmDialog';
import { notify } from '../../shared/common/Toast';

export type RailAgentsMode = 'auto' | 'always' | 'never';

interface OpenBotConversationRailProps {
  activeSessionId: string;
  onSelectSession: (sessionId: string, titleHint?: string) => void;
  onNewChat: () => void;
  isCollapsed?: boolean;
}

interface DisplaySession {
  id: string;
  title: string;
  subtitle: string;
  dateStr: string;
  avatarColor: string;
}

export const OpenBotConversationRail: React.FC<OpenBotConversationRailProps> = ({
  activeSessionId,
  onSelectSession,
  onNewChat,
  isCollapsed = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [localCatalog, setLocalCatalog] = useState<LocalSessionMeta[]>([]);
  const [remoteSessions, setRemoteSessions] = useState<ChatSessionItem[]>([]);
  const [activeAgents, setActiveAgents] = useState<AgentInfo[]>([]);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadMyAgents = useCallback(async () => {
    try {
      const list = await fetchAgents();
      if (Array.isArray(list)) setActiveAgents(list);
    } catch {
      // mantém estado atual
    }
  }, []);

  useEffect(() => {
    void loadMyAgents();
    const onUpdated = () => {
      void loadMyAgents();
    };
    window.addEventListener('jarvis:agents-updated', onUpdated);
    return () => window.removeEventListener('jarvis:agents-updated', onUpdated);
  }, [loadMyAgents]);

  // 3 Modos de exibição de sugestões / especialistas:
  // 'auto': Aparecem enquanto vazio; somem ao criar primeira conversa
  // 'always': Sempre visíveis em seção separada dedicada abaixo
  // 'never': Oculta totalmente sugestões; mostra apenas conversas reais (modo limpo)
  const [agentsMode, setAgentsMode] = useState<RailAgentsMode>(() => {
    try {
      const saved = localStorage.getItem(getAccountStorageKey('jarvis_rail_agents_mode'));
      if (saved === 'auto' || saved === 'always' || saved === 'never') return saved;
      return 'auto';
    } catch {
      return 'auto';
    }
  });
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [specialistsCollapsed, setSpecialistsCollapsed] = useState(false);

  const handleSetMode = (mode: RailAgentsMode) => {
    setAgentsMode(mode);
    setShowModeMenu(false);
    try {
      localStorage.setItem(getAccountStorageKey('jarvis_rail_agents_mode'), mode);
      window.dispatchEvent(new Event('jarvis_rail_agents_mode_changed'));
    } catch {
      // Ignora falha de persistência
    }
    const labels = {
      auto: 'Modo Automático: especialistas visíveis apenas enquanto vazio.',
      always: 'Modo Separado: especialistas sempre visíveis em seção dedicada.',
      never: 'Modo Limpo: especialistas ocultados, apenas conversas reais.',
    };
    notify(labels[mode], 'info');
  };

  // Carrega histórico local e sincroniza catálogo por conta
  const refreshCatalog = () => {
    try {
      localStorage.getItem(getAccountStorageKey(STORAGE_CATALOG_KEY));
      const items = getLocalSessionsCatalog();
      setLocalCatalog(items);
    } catch (e: any) {
      console.warn('Falha ao carregar catálogo de sessões local:', e);
    }
  };

  useEffect(() => {
    refreshCatalog();
  }, [activeSessionId]);

  useEffect(() => {
    const handleModeUpdate = () => {
      try {
        const saved = localStorage.getItem(getAccountStorageKey('jarvis_rail_agents_mode'));
        if (saved === 'auto' || saved === 'always' || saved === 'never') {
          setAgentsMode(saved);
        }
      } catch {}
    };
    window.addEventListener('jarvis_rail_agents_mode_changed', handleModeUpdate);
    return () => window.removeEventListener('jarvis_rail_agents_mode_changed', handleModeUpdate);
  }, []);

  // Carrega sessões remotas via API do backend
  useEffect(() => {
    let cancelled = false;
    fetchChatSessions()
      .then((sessions) => {
        if (!cancelled && Array.isArray(sessions)) {
          setRemoteSessions(sessions);
          setHistoryError(null);
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setHistoryError(err?.message || 'Falha ao pesquisar o histórico');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  const handleDeleteConfirmed = async () => {
    if (!sessionToDelete) return;
    const sid = sessionToDelete;
    setSessionToDelete(null);

    try {
      window.dispatchEvent(new CustomEvent('jarvis:session-deleted', { detail: { sessionId: sid } }));
      if (activeSessionId === sid) {
        onNewChat();
      }
      try {
        await deleteChatSession(sid);
      } catch (backendErr) {
        console.warn('Aviso ao excluir sessão no backend:', backendErr);
      }
      removeSessionLocally(sid);
      setRemoteSessions((prev) => filterOutDeletedSession(prev, sid));
      setLocalCatalog((prev) => filterOutDeletedSession(prev, sid));
      refreshCatalog();
      notify('Conversa excluída com sucesso.', 'success');
    } catch (e: any) {
      setHistoryError(e?.message || 'Falha ao excluir a conversa');
      notify(e?.message || 'Falha ao excluir a conversa', 'error');
    }
  };

  // Lista de conversas reais do usuário
  const userSessions: DisplaySession[] = useMemo(() => {
    const list: DisplaySession[] = [];
    const seen = new Set<string>();

    localCatalog.forEach((item, idx) => {
      seen.add(item.id);
      const colors = ['#f87171', '#c084fc', '#38bdf8', '#fb923c', '#34d399', '#818cf8'];
      list.push({
        id: item.id,
        title: item.title || 'Conversa sem título',
        subtitle: `${item.messageCount || 0} mensagens`,
        dateStr: item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : 'Hoje',
        avatarColor: colors[idx % colors.length],
      });
    });

    remoteSessions.forEach((rem) => {
      if (!seen.has(rem.session_id)) {
        seen.add(rem.session_id);
        list.push({
          id: rem.session_id,
          title: rem.title || 'Sessão ' + rem.session_id.substring(0, 8),
          subtitle: rem.first_prompt || 'Sessão ativa',
          dateStr: rem.last_activity ? new Date(rem.last_activity).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : 'Recente',
          avatarColor: '#fb923c',
        });
      }
    });

    if (!searchTerm.trim()) return list;
    const q = searchTerm.toLowerCase();
    return list.filter((s) => s.title.toLowerCase().includes(q) || s.subtitle.toLowerCase().includes(q));
  }, [localCatalog, remoteSessions, searchTerm]);

  // Lista de agentes reais da equipe do usuário filtrada por busca
  const filteredSpecialists: DisplaySession[] = useMemo(() => {
    return resolveQuickChatAgents(activeAgents, searchTerm).map((ag) => ({
      id: ag.id,
      title: ag.properName,
      subtitle: ag.subtitle,
      dateStr: ag.isCustom ? 'Criado' : ag.handle,
      avatarColor: ag.color,
    }));
  }, [activeAgents, searchTerm]);

  const renderCard = (session: DisplaySession, isQuickShortcut = false) => {
    const isActive = activeSessionId === session.id;
    const initials = session.title
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || 'CH';

    const canDelete = canDeleteConversationCard({ id: session.id, isQuickShortcut });

    return (
      <div
        key={session.id}
        onClick={() => onSelectSession(session.id, session.title)}
        className={`openbot-session-card ${isActive ? 'is-active' : ''}`}
      >
        <div
          style={{
            width: '30px',
            height: '30px',
            borderRadius: '8px',
            backgroundColor: `${session.avatarColor}20`,
            border: `1px solid ${session.avatarColor}40`,
            color: session.avatarColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: '0.7rem',
            fontWeight: 700,
          }}
        >
          {initials}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
            <span
              style={{
                fontSize: '0.82rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {session.title}
            </span>
            <span className="tabular-nums" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>
              {session.dateStr}
            </span>
          </div>

          <div
            style={{
              fontSize: '0.74rem',
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginTop: '1px',
            }}
          >
            {session.subtitle}
          </div>
        </div>

        {canDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSessionToDelete(session.id);
            }}
            className="btn btn-danger-ghost btn-icon-sm openbot-card-delete-btn"
            title="Excluir conversa"
            aria-label={`Excluir conversa ${session.title}`}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <aside
        className={`openbot-conv-rail ${isCollapsed ? 'is-collapsed' : ''}`}
        aria-label="Canais e Conversas do OpenBot"
      >
        {/* Topo: Busca e Botão + Novo Chat */}
        <div style={{ padding: '12px 10px 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--bg-input)',
              borderRadius: 'var(--radius-md)',
              padding: '6px 9px',
              border: '1px solid var(--border-color)',
            }}
          >
            <Search size={13} color="var(--text-muted)" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar conversas"
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                width: '100%',
              }}
            />
          </div>

          <button
            type="button"
            onClick={onNewChat}
            className="btn btn-secondary btn-icon"
            title="Iniciar novo chat"
            aria-label="Iniciar novo chat"
          >
            <Plus size={15} />
          </button>
        </div>

        {/* Cabeçalho da Seção com Seletor das 3 Opções de Sugestões */}
        <div style={{ padding: '8px 12px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            Conversas
          </span>

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowModeMenu((prev) => !prev)}
              className="btn btn-secondary btn-xs"
              title="Configurar modo de sugestões dos especialistas"
            >
              <span>{agentsMode === 'auto' ? 'Auto' : agentsMode === 'always' ? 'Separado' : 'Limpo'}</span>
              <ChevronDown size={11} />
            </button>

            {showModeMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '28px',
                  right: 0,
                  width: '220px',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  padding: '6px',
                  zIndex: 300,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                <div style={{ padding: '4px 8px 6px', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Sugestões de Agentes
                </div>

                {([
                  { id: 'auto' as RailAgentsMode, title: 'Automático', desc: 'Some após criar conversa' },
                  { id: 'always' as RailAgentsMode, title: 'Seção Separada', desc: 'Sempre visível abaixo' },
                  { id: 'never' as RailAgentsMode, title: 'Modo Limpo', desc: 'Apenas conversas reais' },
                ]).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSetMode(opt.id)}
                    className={`btn btn-ghost btn-sm btn-block btn-between ${agentsMode === opt.id ? 'is-active' : ''}`}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                      <span style={{ fontWeight: 600 }}>{opt.title}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{opt.desc}</span>
                    </div>
                    {agentsMode === opt.id && <Check size={13} color="var(--accent-light)" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Feedback de Erro se houver */}
        {historyError && (
          <div style={{ padding: '4px 12px', fontSize: '0.70rem', color: '#f87171' }}>
            {historyError}
          </div>
        )}

        {/* Lista de Sessões e Especialistas */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 8px 12px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          {/* Se há conversas reais do usuário */}
          {userSessions.length > 0 && (
            <>
              {userSessions.map((session) => renderCard(session, false))}

              {/* Se o modo for 'always' (Seção Separada), exibe os especialistas abaixo com toggle */}
              {agentsMode === 'always' && (
                <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '8px' }}>
                  <div
                    onClick={() => setSpecialistsCollapsed((prev) => !prev)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 6px',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      marginBottom: '4px',
                    }}
                  >
                    <span style={{ fontSize: '0.68rem', color: '#737373', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Meus Agentes ({filteredSpecialists.length})
                    </span>
                    <ChevronDown
                      size={12}
                      color="#737373"
                      style={{
                        transform: specialistsCollapsed ? 'rotate(-90deg)' : 'none',
                        transition: 'transform 0.15s ease',
                      }}
                    />
                  </div>

                  {!specialistsCollapsed && filteredSpecialists.map((agent) => renderCard(agent, true))}
                </div>
              )}
            </>
          )}

          {/* Se NÃO há conversas reais do usuário ainda */}
          {userSessions.length === 0 && (
            <>
              {agentsMode === 'never' ? (
                /* Opção 3: Modo Limpo / Vazio absoluto */
                <div style={{ padding: '36px 12px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <MessageSquare size={22} color="#555555" />
                  <span style={{ fontSize: '0.76rem', color: '#8a8a8a', fontWeight: 500 }}>
                    Nenhuma conversa recente
                  </span>
                  <span style={{ fontSize: '0.68rem', color: '#666666' }}>
                    Inicie uma nova conversa para salvar no histórico
                  </span>
                  <div style={{ marginTop: '6px' }}>
                    <button
                      type="button"
                      onClick={onNewChat}
                      className="btn btn-primary btn-xs"
                    >
                      + Novo Chat
                    </button>
                  </div>
                </div>
              ) : (
                /* Opção 1 e 2: Exibe agentes reais do usuário como atalhos de inicialização */
                <>
                  <div style={{ padding: '2px 6px 6px 6px', fontSize: '0.66rem', color: '#666666' }}>
                    {agentsMode === 'auto'
                      ? `Meus Agentes ativos (${filteredSpecialists.length}) — clique para conversar:`
                      : `Meus Agentes (${filteredSpecialists.length}):`}
                  </div>
                  {filteredSpecialists.map((agent) => renderCard(agent, true))}
                </>
              )}
            </>
          )}
        </div>
      </aside>

      {/* Modal de Confirmação de Exclusão */}
      <ConfirmDialog
        isOpen={Boolean(sessionToDelete)}
        title="Excluir Conversa"
        description="Tem certeza que deseja excluir esta conversa do histórico? Esta ação é irreversível."
        confirmLabel="Excluir"
        tone="danger"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setSessionToDelete(null)}
      />
    </>
  );
};
