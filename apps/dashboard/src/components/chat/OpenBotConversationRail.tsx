import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Trash2 } from 'lucide-react';
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

interface OpenBotConversationRailProps {
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
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
  { id: 'agent-qa', title: 'QA Tester', subtitle: 'No messages yet', dateStr: '16 de nov.', avatarColor: '#c084fc' },
  { id: 'agent-copy', title: 'Copy Editor', subtitle: 'No messages yet', dateStr: '16 de nov.', avatarColor: '#38bdf8' },
  { id: 'agent-bug', title: 'Bug Fixer', subtitle: 'No messages yet', dateStr: '16 de nov.', avatarColor: '#fb923c' },
  { id: 'agent-sec', title: 'Security Auditor', subtitle: 'No messages yet', dateStr: '16 de nov.', avatarColor: '#34d399' },
  { id: 'agent-design', title: 'Design Center', subtitle: 'No messages yet', dateStr: '16 de nov.', avatarColor: '#818cf8' },
  { id: 'agent-calmon', title: 'Calmon Dev', subtitle: 'Como está o computador?', dateStr: '16 de nov.', avatarColor: '#f87171' },
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

  // Carrega histórico local e sincroniza catálogo por conta
  const refreshCatalog = () => {
    try {
      // Garante leitura sob chave particionada por conta ativa
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
      await deleteChatSession(sid);
      removeSessionLocally(sid);
      refreshCatalog();
      setRemoteSessions((prev) => prev.filter((s) => s.session_id !== sid));
      if (activeSessionId === sid) {
        onNewChat();
      }
    } catch (e: any) {
      setHistoryError(e?.message || 'Falha ao excluir a conversa');
    }
  };

  // Monta lista de sessões combinando catálogo real + agentes padrão
  const allSessions: DisplaySession[] = useMemo(() => {
    const list: DisplaySession[] = [];
    const seen = new Set<string>();

    // 1. Sessões ativas reais locais/remotas
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

    // 2. Se a lista for pequena, adiciona os agentes padrão do OpenBot
    DEFAULT_AGENTS.forEach((agent) => {
      if (!seen.has(agent.id)) {
        list.push(agent);
      }
    });

    if (!searchTerm.trim()) return list;
    const q = searchTerm.toLowerCase();
    return list.filter((s) => s.title.toLowerCase().includes(q) || s.subtitle.toLowerCase().includes(q));
  }, [localCatalog, remoteSessions, searchTerm]);

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

        {/* Cabeçalho da Seção */}
        <div style={{ padding: '8px 12px 4px 12px', fontSize: '0.74rem', color: '#737373', fontWeight: 600 }}>
          Sem seção
        </div>

        {/* Feedback de Erro se houver */}
        {historyError && (
          <div style={{ padding: '4px 12px', fontSize: '0.70rem', color: '#f87171' }}>
            {historyError}
          </div>
        )}

        {/* Lista de Sessões / Agentes */}
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
          {allSessions.map((session) => {
            const isActive = activeSessionId === session.id;
            return (
              <div
                key={session.id}
                onClick={() => onSelectSession(session.id)}
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                    <span style={{ fontSize: '0.68rem', color: '#737373', flexShrink: 0 }}>
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
                {localCatalog.some((l) => l.id === session.id) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSessionToDelete(session.id);
                    }}
                    className="btn btn-ghost"
                    style={{
                      padding: '3px',
                      borderRadius: '4px',
                      opacity: 0.4,
                      color: '#f87171',
                    }}
                    title="Excluir conversa"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            );
          })}
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
