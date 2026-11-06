import React, { useState } from 'react';
import { sendChatMessage } from '../api';
import { TaskStateResponse } from '../types';
import { Send, Bot, User, ShieldAlert } from 'lucide-react';

interface ChatMessage {
  sender: 'user' | 'jarvis';
  text: string;
  taskData?: TaskStateResponse;
  timestamp: string;
}

export const ChatMaster: React.FC = () => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: 'jarvis',
      text: 'Olá! Sou o JARVIS Master. Posso analisar projetos existentes, criar planos de arquitetura, auditar segurança e propor alterações rastreadas.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setMessages(prev => [...prev, { sender: 'user', text: userMsg, timestamp: timeStr }]);
    setLoading(true);

    try {
      const response = await sendChatMessage(userMsg);
      setMessages(prev => [
        ...prev,
        {
          sender: 'jarvis',
          text: response.final_summary || 'Tarefa concluída.',
          taskData: response,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          sender: 'jarvis',
          text: `[Erro]: ${err.message || 'Falha ao conectar com o backend'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 48px)',
      backgroundColor: 'var(--bg-secondary)',
      border: '1px solid var(--border-color)',
      borderRadius: '12px',
      overflow: 'hidden',
    }}>
      {/* Header do Chat */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Bot size={20} color="var(--accent-color)" />
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Conversa com JARVIS Master</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Orquestrador LangGraph com Checkpoints</span>
          </div>
        </div>
        <span className="badge badge-info">Fila CPU Ativa</span>
      </div>

      {/* Área de Mensagens */}
      <div style={{
        flex: 1,
        padding: '20px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}>
        {messages.map((m, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              gap: '12px',
              alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
            }}
          >
            {m.sender === 'jarvis' && (
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'var(--accent-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Bot size={18} color="#fff" />
              </div>
            )}

            <div style={{
              backgroundColor: m.sender === 'user' ? 'var(--accent-color)' : 'var(--bg-tertiary)',
              padding: '14px 18px',
              borderRadius: '12px',
              fontSize: '0.875rem',
              lineHeight: 1.5,
              border: m.sender === 'jarvis' ? '1px solid var(--border-color)' : 'none',
            }}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>

              {m.taskData && (
                <div style={{
                  marginTop: '12px',
                  paddingTop: '10px',
                  borderTop: '1px solid var(--border-color)',
                  fontSize: '0.8rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}>
                  {m.taskData.classified_intent && (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Intenção:</span>
                      <code>{m.taskData.classified_intent}</code>
                    </div>
                  )}

                  {m.taskData.approval_required && (
                    <div style={{
                      backgroundColor: 'rgba(245, 158, 11, 0.1)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      color: '#fbbf24',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: '6px',
                    }}>
                      <ShieldAlert size={16} />
                      <span>Operação pausada aguardando autorização no <b>Approval Center</b>.</span>
                    </div>
                  )}
                </div>
              )}

              <span style={{
                display: 'block',
                fontSize: '0.7rem',
                color: m.sender === 'user' ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)',
                marginTop: '6px',
                textAlign: 'right',
              }}>
                {m.timestamp}
              </span>
            </div>

            {m.sender === 'user' && (
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <User size={18} color="var(--text-secondary)" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'var(--accent-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Bot size={18} color="#fff" />
            </div>
            <div style={{
              padding: '12px 16px',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: '12px',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
            }}>
              JARVIS está a planear e consultar especialistas...
            </div>
          </div>
        )}
      </div>

      {/* Input de Envio */}
      <form onSubmit={handleSubmit} style={{
        padding: '16px 20px',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        gap: '12px',
        backgroundColor: 'var(--bg-secondary)',
      }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Peça uma análise, plano de arquitetura ou melhoria de código..."
          disabled={loading}
          style={{
            flex: 1,
            padding: '12px 16px',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '0.875rem',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            padding: '12px 20px',
            backgroundColor: 'var(--accent-color)',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 600,
            fontSize: '0.875rem',
          }}
        >
          <Send size={16} />
          <span>Enviar</span>
        </button>
      </form>
    </div>
  );
};
