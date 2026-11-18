import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Trash2, ChevronDown, Check, MessageSquare } from 'lucide-react';
import { fetchChatSessions, deleteChatSession } from '../../api';
import { ChatSessionItem } from '../../types';
import {
  getLocalSessionsCatalog,
  removeSessionLocally,
  LocalSessionMeta,
  STORAGE_CATALOG_KEY,
} from './ChatHistoryDrawer';
import { getAccountStorageKey } from '../../services/accountScope';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { notify } from '../common/Toast';

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

const DEFAULT_AGENTS = [
  { id: 'agent-qa', title: 'QA Tester', subtitle: 'Testes e Validações', dateStr: 'Especialista', avatarColor: '#c084fc' },
  { id: 'agent-bug', title: 'Bug Fixer', subtitle: 'Correção de Erros', dateStr: 'Especialista', avatarColor: '#fb923c' },
  { id: 'agent-sec', title: 'Security Auditor', subtitle: 'Auditoria de Segurança', dateStr: 'Especialista', avatarColor: '#34d399' },
  { id: 'agent-copy', title: 'Copy Editor', subtitle: 'Revisão Técnica', dateStr: 'Especialista', avatarColor: '#38bdf8' },
  { id: 'agent-design', title: 'Design Center', subtitle: 'Design & Interfaces', dateStr: 'Especialista', avatarColor: '#818cf8' },
];

export const OpenBotConversationRail: React.FC<OpenBotConversationRailProps> = ({
  activeSessionId,
  onSelectSession,
  onNewChat,
  isCollapsed = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [localCatalog, setLocalCatalog] = useState<LocalSessionMeta[]>([]);
  const [remoteSessions, setRemoteSessions] = useState<ChatSessionItem[]>([]);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

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
      try {
        await deleteChatSession(sid);
      } catch (backendErr) {
        console.warn('Aviso ao excluir sessão no backend:', backendErr);
      }
      removeSessionLocally(sid);
      refreshCatalog();
      setRemoteSessions((prev) => prev.filter((s) => s.session_id !== sid));
      setLocalCatalog((prev) => prev.filter((s) => s.id !== sid));
      if (activeSessionId === sid) {
        onNewChat();
      }
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

  // Lista de especialistas filtrada por busca
  const filteredSpecialists = useMemo(() => {
    if (!searchTerm.trim()) return DEFAULT_AGENTS;
    const q = searchTerm.toLowerCase();
    return DEFAULT_AGENTS.filter((s) => s.title.toLowerCase().includes(q) || s.subtitle.toLowerCase().includes(q));
  }, [searchTerm]);

  const renderCard = (session: DisplaySession) => {
    const isActive = activeSessionId === session.id;
    return (
      <div
        key={session.id}
        onClick={() => onSelectSession(session.id, session.title)}
        className={`openbot-session-card ${isActive ? 'is-active' : ''}`}
      >
        {/* 3D Squircle Avatar */}
        <div
          style={{
            width: '30px',
            height: '30px',
            borderRadius: '9px',
            backgroundColor: session.avatarColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: `0 3px 8px ${session.avatarColor}44`,
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
            <div style={{ width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#ffffff' }} />
            <div style={{ width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#ffffff' }} />
          </div>
        </div>

        {/* Textos da Sessão */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
            <span
              style={{
                fontSize: '0.82rem',
                fontWeight: 600,
                color: isActive ? '#ffffff' : '#d4d4d4',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {session.title}
            </span>
            <span style={{ fontSize: '0.66rem', color: '#737373', flexShrink: 0 }}>
              {session.dateStr}
            </span>
          </div>

          <div
            style={{
              fontSize: '0.72rem',
              color: '#8a8a8a',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginTop: '1px',
            }}
          >
            {session.subtitle}
          </div>
        </div>

        {/* Botão de Excluir Sessão sob Demanda */}
        {!session.id.startsWith('agent-') && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSessionToDelete(session.id);
            }}
            className="btn btn-ghost openbot-card-delete-btn"
            style={{
              padding: '5px',
              borderRadius: '6px',
              color: '#f87171',
              flexShrink: 0,
            }}
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
        <div style={{ padding: '12px 10px 8px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '8px',
              padding: '6px 8px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <Search size={13} color="#888888" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar"
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#ededed',
                fontSize: '0.80rem',
                width: '100%',
              }}
            />
          </div>

          <button
            type="button"
            onClick={onNewChat}
            className="btn btn-ghost"
            style={{
              padding: '6px 8px',
              borderRadius: '8px',
              color: '#d4d4d4',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
            }}
            title="Iniciar novo chat (+)"
          >
            <Plus size={15} />
          </button>
        </div>

        {/* Cabeçalho da Seção com Seletor das 3 Opções de Sugestões */}
        <div style={{ padding: '8px 12px 4px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          <span style={{ fontSize: '0.70rem', color: '#737373', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Sem seção
          </span>

          {/* Menu Dropdown de Modos (Auto | Separado | Limpo) */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowModeMenu((prev) => !prev)}
              className="btn btn-ghost"
              style={{
                fontSize: '0.64rem',
                color: '#8a8a8a',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
              }}
              title="Configurar modo de sugestões dos especialistas"
            >
              <span>{agentsMode === 'auto' ? 'Auto' : agentsMode === 'always' ? 'Separado' : 'Limpo'}</span>
              <ChevronDown size={10} />
            </button>

            {showModeMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '24px',
                  right: 0,
                  width: '215px',
                  backgroundColor: 'rgba(22, 22, 25, 0.98)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.7)',
                  padding: '6px',
                  zIndex: 300,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                <div style={{ padding: '4px 6px 2px 6px', fontSize: '0.64rem', color: '#737373', fontWeight: 700, textTransform: 'uppercase' }}>
                  Sugestões de Agentes
                </div>

                <button
                  type="button"
                  onClick={() => handleSetMode('auto')}
                  className="btn btn-ghost"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    backgroundColor: agentsMode === 'auto' ? 'rgba(217, 119, 87, 0.14)' : 'transparent',
                    color: agentsMode === 'auto' ? 'var(--accent-color)' : '#d4d4d4',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={{ fontWeight: 600 }}>1. Automático</span>
                    <span style={{ fontSize: '0.62rem', color: '#888888' }}>Some após criar conversa</span>
                  </div>
                  {agentsMode === 'auto' && <Check size={12} />}
                </button>

                <button
                  type="button"
                  onClick={() => handleSetMode('always')}
                  className="btn btn-ghost"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    backgroundColor: agentsMode === 'always' ? 'rgba(217, 119, 87, 0.14)' : 'transparent',
                    color: agentsMode === 'always' ? 'var(--accent-color)' : '#d4d4d4',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={{ fontWeight: 600 }}>2. Seção Separada</span>
                    <span style={{ fontSize: '0.62rem', color: '#888888' }}>Sempre visível abaixo</span>
                  </div>
                  {agentsMode === 'always' && <Check size={12} />}
                </button>

                <button
                  type="button"
                  onClick={() => handleSetMode('never')}
                  className="btn btn-ghost"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    backgroundColor: agentsMode === 'never' ? 'rgba(217, 119, 87, 0.14)' : 'transparent',
                    color: agentsMode === 'never' ? 'var(--accent-color)' : '#d4d4d4',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={{ fontWeight: 600 }}>3. Modo Limpo</span>
                    <span style={{ fontSize: '0.62rem', color: '#888888' }}>Apenas conversas reais</span>
                  </div>
                  {agentsMode === 'never' && <Check size={12} />}
                </button>
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
              {userSessions.map((session) => renderCard(session))}

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
                      Especialistas Rápidos
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

                  {!specialistsCollapsed && filteredSpecialists.map((agent) => renderCard(agent))}
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
                  <button
                    type="button"
                    onClick={onNewChat}
                    className="btn btn-primary"
                    style={{ fontSize: '0.72rem', padding: '5px 12px', borderRadius: '6px', marginTop: '6px' }}
                  >
                    + Novo Chat
                  </button>
                </div>
              ) : (
                /* Opção 1 e 2: Exibe especialistas como atalhos de inicialização */
                <>
                  <div style={{ padding: '2px 6px 6px 6px', fontSize: '0.66rem', color: '#666666' }}>
                    {agentsMode === 'auto'
                      ? 'Atalhos para iniciar (somem após a primeira mensagem):'
                      : 'Especialistas disponíveis para atendimento rápido:'}
                  </div>
                  {filteredSpecialists.map((agent) => renderCard(agent))}
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
