import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Search,
  Trash2,
  MessageSquare,
  Clock,
  Database,
} from 'lucide-react';
import { fetchChatSessions, deleteChatSession, fetchChatSessionTasks } from '../../api';
import { ChatSessionItem, ChatMessage } from '../../types';

export interface LocalSessionMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export const STORAGE_CATALOG_KEY = 'jarvis_sessions_catalog_v1';

export function getLocalSessionsCatalog(): LocalSessionMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_CATALOG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Erro ao ler catálogo local de sessões:', e);
  }
  return [];
}

export function saveLocalSessionsCatalog(catalog: LocalSessionMeta[]): void {
  try {
    localStorage.setItem(STORAGE_CATALOG_KEY, JSON.stringify(catalog));
  } catch (e) {
    console.warn('Erro ao salvar catálogo local de sessões:', e);
  }
}

export function saveSessionMessagesLocally(sessionId: string, messages: ChatMessage[]): void {
  try {
    localStorage.setItem(`jarvis_session_messages_${sessionId}`, JSON.stringify(messages));
  } catch (e) {
    console.warn('Erro ao persistir mensagens da sessão:', e);
  }
}

export function getSessionMessagesLocally(sessionId: string): ChatMessage[] | null {
  try {
    const raw = localStorage.getItem(`jarvis_session_messages_${sessionId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Erro ao ler mensagens da sessão:', e);
  }
  return null;
}

export function removeSessionLocally(sessionId: string): void {
  try {
    localStorage.removeItem(`jarvis_session_messages_${sessionId}`);
    const cat = getLocalSessionsCatalog().filter((s) => s.id !== sessionId);
    saveLocalSessionsCatalog(cat);
  } catch (e) {
    console.warn('Erro ao remover sessão local:', e);
  }
}

interface ChatHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentSessionId: string;
  onSelectSession: (sessionId: string, loadedMessages?: ChatMessage[]) => void;
  onNewChat: () => void;
}

export const ChatHistoryDrawer: React.FC<ChatHistoryDrawerProps> = ({
  isOpen,
  onClose,
  currentSessionId,
  onSelectSession,
  onNewChat,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sessions, setSessions] = useState<LocalSessionMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Carrega e sincroniza sessões do backend + local
  const refreshSessions = async () => {
    setLoading(true);
    try {
      const localCat = getLocalSessionsCatalog();
      let remoteSessions: ChatSessionItem[] = [];
      try {
        remoteSessions = await fetchChatSessions();
      } catch (e) {
        console.warn('Backend offline ou erro ao carregar sessões remotas:', e);
      }

      // Combina catálogo local com tarefas persistidas no SQLite
      const map = new Map<string, LocalSessionMeta>();

      // Insere locais
      localCat.forEach((s) => {
        map.set(s.id, s);
      });

      // Insere ou complementa com os remotos
      remoteSessions.forEach((r) => {
        const existing = map.get(r.session_id);
        const title = r.title || (r.first_prompt ? r.first_prompt.slice(0, 50) : 'Conversa com Especialistas');
        if (existing) {
          map.set(r.session_id, {
            ...existing,
            title: existing.title || title,
            messageCount: Math.max(existing.messageCount, r.task_count * 2),
            updatedAt: r.last_activity || existing.updatedAt,
          });
        } else {
          map.set(r.session_id, {
            id: r.session_id,
            title,
            createdAt: r.last_activity || new Date().toISOString(),
            updatedAt: r.last_activity || new Date().toISOString(),
            messageCount: r.task_count * 2,
          });
        }
      });

      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      setSessions(merged);
      saveLocalSessionsCatalog(merged);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshSessions();
    }
  }, [isOpen]);

  const handleDelete = async (e: React.MouseEvent, sid: string) => {
    e.stopPropagation();
    if (!window.confirm('Excluir esta conversa do histórico?')) return;

    setDeletingId(sid);
    try {
      removeSessionLocally(sid);
      try {
        await deleteChatSession(sid);
      } catch {}
      setSessions((prev) => prev.filter((s) => s.id !== sid));
      if (sid === currentSessionId) {
        onNewChat();
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleSelect = async (sid: string) => {
    // Tenta primeiro carregar do localStorage
    let msgs = getSessionMessagesLocally(sid);
    if (!msgs || msgs.length === 0) {
      // Se não houver em cache local, busca as tarefas do SQLite no backend
      try {
        const tasks = await fetchChatSessionTasks(sid);
        if (tasks && tasks.length > 0) {
          const reconstructed: ChatMessage[] = [];
          tasks.forEach((t: any) => {
            const time = new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            reconstructed.push({
              sender: 'user',
              text: t.prompt,
              timestamp: time,
            });
            reconstructed.push({
              sender: 'jarvis',
              text: t.state?.final_summary || 'Tarefa concluída.',
              taskData: t.state,
              timestamp: time,
            });
          });
          msgs = reconstructed;
          saveSessionMessagesLocally(sid, reconstructed);
        }
      } catch (err) {
        console.warn('Erro ao restaurar tarefas do backend:', err);
      }
    }

    onSelectSession(sid, msgs || undefined);
    onClose();
  };

  // Filtragem de busca
  const filteredSessions = useMemo(() => {
    if (!searchTerm.trim()) return sessions;
    const q = searchTerm.toLowerCase();
    return sessions.filter(
      (s) => s.title.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
    );
  }, [sessions, searchTerm]);

  // Agrupamento temporal
  const groupedSessions = useMemo(() => {
    const today: LocalSessionMeta[] = [];
    const yesterday: LocalSessionMeta[] = [];
    const last7Days: LocalSessionMeta[] = [];
    const older: LocalSessionMeta[] = [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const startOf7Days = startOfToday - 6 * 86400000;

    filteredSessions.forEach((s) => {
      const t = new Date(s.updatedAt).getTime();
      if (t >= startOfToday) {
        today.push(s);
      } else if (t >= startOfYesterday) {
        yesterday.push(s);
      } else if (t >= startOf7Days) {
        last7Days.push(s);
      } else {
        older.push(s);
      }
    });

    return [
      { label: 'Hoje', items: today },
      { label: 'Ontem', items: yesterday },
      { label: 'Últimos 7 dias', items: last7Days },
      { label: 'Mais antigas', items: older },
    ].filter((g) => g.items.length > 0);
  }, [filteredSessions]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999,
        display: 'flex',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Drawer Panel */}
      <div
        style={{
          position: 'relative',
          width: '360px',
          maxWidth: '85vw',
          height: '100%',
          backgroundColor: '#070a12',
          borderRight: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '10px 0 35px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1000,
        }}
      >
        {/* Top Header */}
        <div
          style={{
            padding: '16px 18px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(15, 23, 42, 0.8)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={18} color="#818cf8" />
            <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
              Histórico de Conversas
            </h3>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ padding: '5px', borderRadius: '6px' }}
            title="Fechar histórico"
          >
            <X size={16} />
          </button>
        </div>

        {/* Action: Nova Conversa */}
        <div style={{ padding: '14px 18px 10px' }}>
          <button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="btn btn-primary"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px 14px',
              borderRadius: '10px',
              fontWeight: 600,
              fontSize: '0.86rem',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
            }}
          >
            <Plus size={16} />
            <span>Nova Conversa</span>
          </button>
        </div>

        {/* Search Bar */}
        <div style={{ padding: '0 18px 12px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '7px 12px',
            }}
          >
            <Search size={14} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Pesquisar conversas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Sessions List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 12px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {loading && sessions.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
              Carregando histórico...
            </div>
          ) : groupedSessions.length === 0 ? (
            <div
              style={{
                padding: '36px 16px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.84rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <MessageSquare size={28} color="rgba(255, 255, 255, 0.2)" />
              <span>Nenhuma conversa encontrada.</span>
            </div>
          ) : (
            groupedSessions.map((group) => (
              <div key={group.label}>
                <div
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--text-muted)',
                    padding: '4px 10px 8px',
                  }}
                >
                  {group.label}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {group.items.map((item) => {
                    const isActive = item.id === currentSessionId;
                    const isDeleting = deletingId === item.id;

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelect(item.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          backgroundColor: isActive ? 'rgba(99, 102, 241, 0.16)' : 'transparent',
                          border: isActive
                            ? '1px solid rgba(99, 102, 241, 0.35)'
                            : '1px solid transparent',
                          transition: 'all 0.15s ease',
                          gap: '8px',
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                          <MessageSquare
                            size={16}
                            color={isActive ? '#818cf8' : 'var(--text-muted)'}
                            style={{ flexShrink: 0 }}
                          />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                fontSize: '0.84rem',
                                fontWeight: isActive ? 600 : 500,
                                color: isActive ? '#f8fafc' : 'var(--text-secondary)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {item.title}
                            </div>
                            <div
                              style={{
                                fontSize: '0.7rem',
                                color: 'var(--text-muted)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                marginTop: '2px',
                              }}
                            >
                              <span>
                                {new Date(item.updatedAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              {item.messageCount > 0 && (
                                <>
                                  <span>•</span>
                                  <span>{item.messageCount} msgs</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Botão de Excluir */}
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, item.id)}
                          disabled={isDeleting}
                          className="btn btn-ghost"
                          style={{
                            padding: '4px',
                            color: 'var(--text-muted)',
                            opacity: 0.6,
                            borderRadius: '4px',
                            flexShrink: 0,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = '1';
                            e.currentTarget.style.color = '#f87171';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = '0.6';
                            e.currentTarget.style.color = 'var(--text-muted)';
                          }}
                          title="Excluir conversa"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Info */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Database size={13} color="#818cf8" />
            <span>Persistência Local SQLite</span>
          </div>
          <span>{sessions.length} conversas</span>
        </div>
      </div>
    </div>
  );
};