import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../common/Modal';
import { AgentInfo, getAgentLabel } from '../../types';
import {
  fetchAgentHistory,
  runAutonomousAgentStream,
  AutonomousAgentEvent,
} from '../../services/api/agents';
import { fetchWorkspaceProjects } from '../../services/api/workspace';
import { MarkdownMessage } from '../chat/MarkdownMessage';
import {
  Sparkles,
  Send,
  Bot,
  User,
  RefreshCw,
  Cpu,
  FolderGit2,
  Wrench,
  CheckCircle2,
  Square,
} from 'lucide-react';

interface AgentPlaygroundProps {
  isOpen: boolean;
  onClose: () => void;
  agent: AgentInfo;
  projectId?: string;
}

interface TimelineItem {
  id: string;
  sender: 'user' | 'agent' | 'tool' | 'contract';
  text?: string;
  modelUsed?: string;
  toolName?: string;
  toolArguments?: Record<string, any>;
  toolSuccess?: boolean;
  toolOutput?: string;
  toolError?: string;
  contract?: any;
  timestamp: string;
}

export const AgentPlayground: React.FC<AgentPlaygroundProps> = ({
  isOpen,
  onClose,
  agent,
  projectId: initialProjectId,
}) => {
  const [messages, setMessages] = useState<TimelineItem[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [mode, setMode] = useState<'plan' | 'ask' | 'auto'>('ask');
  const [selectedProject, setSelectedProject] = useState<string>(initialProjectId || '');
  const [projects, setProjects] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [currentAssistantText, setCurrentAssistantText] = useState('');
  const [currentToolStatus, setCurrentToolStatus] = useState<string | null>(null);

  const sessionIdRef = useRef<string>(`ses-${agent.role}-${Date.now()}`);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Carrega projetos do workspace e histórico ao abrir
  useEffect(() => {
    if (!isOpen) return;

    fetchWorkspaceProjects()
      .then((projs) => {
        setProjects(projs || []);
        if (!selectedProject && projs && projs.length > 0) {
          setSelectedProject(projs[0].id);
        }
      })
      .catch(() => {});

    // Carrega histórico prévio da sessão
    fetchAgentHistory(agent.role, sessionIdRef.current)
      .then((res) => {
        if (res && res.messages && res.messages.length > 0) {
          const loaded: TimelineItem[] = res.messages.map((m: any, idx: number) => ({
            id: `hist-${idx}`,
            sender: m.role === 'user' ? 'user' : m.role === 'tool' ? 'tool' : 'agent',
            text: m.content,
            toolName: m.tool_name,
            timestamp: m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
          }));
          setMessages(loaded);
        }
      })
      .catch(() => {});
  }, [isOpen, agent.role]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentAssistantText, currentToolStatus]);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setRunning(false);
    setCurrentToolStatus(null);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim() || running) return;

    const userText = inputPrompt.trim();
    setInputPrompt('');

    const userItem: TimelineItem = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userItem]);
    setRunning(true);
    setCurrentAssistantText('');
    setCurrentToolStatus('Iniciando raciocínio ReAct...');

    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    let accumulatedText = '';

    try {
      await runAutonomousAgentStream(
        agent.role,
        {
          prompt: userText,
          project_id: selectedProject || undefined,
          session_id: sessionIdRef.current,
          mode,
        },
        (event: AutonomousAgentEvent) => {
          if (event.type === 'thinking') {
            setCurrentToolStatus(`Iteração ${event.iteration}: Avaliando próximo passo...`);
          } else if (event.type === 'assistant') {
            accumulatedText = (event.content as string) || '';
            setCurrentAssistantText(accumulatedText);
          } else if (event.type === 'tool_call') {
            setCurrentToolStatus(`Executando ferramenta: ${event.name}...`);
            const toolCallItem: TimelineItem = {
              id: `tc-${Date.now()}-${Math.random()}`,
              sender: 'tool',
              toolName: event.name as string,
              toolArguments: event.arguments as Record<string, any>,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
            setMessages((prev) => [...prev, toolCallItem]);
          } else if (event.type === 'tool_result') {
            setCurrentToolStatus(null);
            const toolResultItem: TimelineItem = {
              id: `tr-${Date.now()}-${Math.random()}`,
              sender: 'tool',
              toolName: event.name as string,
              toolSuccess: Boolean(event.success),
              toolOutput: (event.output as string) || '',
              toolError: (event.error as string) || undefined,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
            setMessages((prev) => [...prev, toolResultItem]);
          } else if (event.type === 'output_contract' && event.contract) {
            const contractItem: TimelineItem = {
              id: `cnt-${Date.now()}`,
              sender: 'contract',
              contract: event.contract,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
            setMessages((prev) => [...prev, contractItem]);
          } else if (event.type === 'final') {
            if (accumulatedText) {
              const finalAssistantItem: TimelineItem = {
                id: `ast-${Date.now()}`,
                sender: 'agent',
                text: accumulatedText,
                modelUsed: (event.model as string) || agent.preferred_model,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              };
              setMessages((prev) => [...prev, finalAssistantItem]);
              setCurrentAssistantText('');
            }
            setCurrentToolStatus(null);
          } else if (event.type === 'error') {
            const errItem: TimelineItem = {
              id: `err-${Date.now()}`,
              sender: 'agent',
              text: `⚠️ Erro: ${event.error}`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
            setMessages((prev) => [...prev, errItem]);
            setCurrentToolStatus(null);
          }
        },
        abortCtrl.signal
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            sender: 'agent',
            text: `Erro de comunicação: ${err.message || 'Falha ao conectar ao runtime do especialista.'}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } finally {
      setRunning(false);
      setCurrentAssistantText('');
      setCurrentToolStatus(null);
      abortControllerRef.current = null;
    }
  };

  const handleClear = () => {
    setMessages([]);
    setCurrentAssistantText('');
    sessionIdRef.current = `ses-${agent.role}-${Date.now()}`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sparkles size={18} color="#818cf8" />
          <span>Console do Especialista: {getAgentLabel(agent.role)}</span>
          <span
            style={{
              fontSize: '0.72rem',
              padding: '2px 8px',
              borderRadius: '6px',
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              color: '#818cf8',
              fontFamily: 'monospace',
            }}
          >
            {agent.preferred_model}
          </span>
          {agent.is_read_only ? (
            <span
              style={{
                fontSize: '0.70rem',
                padding: '2px 8px',
                borderRadius: '6px',
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                color: '#fbbf24',
              }}
            >
              Leitura Pura
            </span>
          ) : (
            <span
              style={{
                fontSize: '0.70rem',
                padding: '2px 8px',
                borderRadius: '6px',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399',
              }}
            >
              Autônomo (ReAct)
            </span>
          )}
        </div>
      }
      subtitle={`Ambiente de execução autônoma soberana com o especialista ${agent.name}`}
      maxWidth="xl"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button type="button" className="btn btn-secondary" onClick={handleClear} disabled={messages.length === 0}>
              Limpar Sessão
            </button>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
              Ferramentas permitidas: {agent.allowed_tools?.length || 0}
            </span>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fechar Console
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '580px', gap: '12px' }}>
        {/* Barra de Controles (Modo Operacional e Projeto do Workspace) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            borderRadius: '8px',
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid var(--border-color)',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          {/* Seletor de Modo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Modo:</span>
            <div style={{ display: 'inline-flex', borderRadius: '6px', padding: '2px', backgroundColor: 'rgba(0,0,0,0.3)' }}>
              <button
                type="button"
                onClick={() => setMode('plan')}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.76rem',
                  borderRadius: '5px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: mode === 'plan' ? '#6366f1' : 'transparent',
                  color: mode === 'plan' ? '#fff' : 'var(--text-secondary)',
                  fontWeight: mode === 'plan' ? 600 : 400,
                }}
                title="Modo Planejamento: somente leitura e arquitetura"
              >
                📋 Plano
              </button>
              <button
                type="button"
                onClick={() => setMode('ask')}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.76rem',
                  borderRadius: '5px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: mode === 'ask' ? '#6366f1' : 'transparent',
                  color: mode === 'ask' ? '#fff' : 'var(--text-secondary)',
                  fontWeight: mode === 'ask' ? 600 : 400,
                }}
                title="Modo Assistido: solicita aprovação para operações críticas"
              >
                🛡️ Assistido
              </button>
              <button
                type="button"
                onClick={() => setMode('auto')}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.76rem',
                  borderRadius: '5px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: mode === 'auto' ? '#6366f1' : 'transparent',
                  color: mode === 'auto' ? '#fff' : 'var(--text-secondary)',
                  fontWeight: mode === 'auto' ? 600 : 400,
                }}
                title="Modo Autônomo: executa ferramentas no sandbox de forma contínua"
              >
                ⚡ Autônomo
              </button>
            </div>
          </div>

          {/* Seletor de Projeto */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderGit2 size={14} color="#818cf8" />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Workspace:</span>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            >
              <option value="">Nenhum (Global / Pesquisa)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Timeline e Mensagens */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            borderRadius: '10px',
            backgroundColor: 'rgba(7, 10, 18, 0.75)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {messages.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--text-secondary)',
                gap: '10px',
                textAlign: 'center',
              }}
            >
              <Bot size={40} color="#818cf8" style={{ opacity: 0.85 }} />
              <strong style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                {agent.name} está pronto para operar
              </strong>
              <p style={{ fontSize: '0.85rem', maxWidth: '480px', margin: 0, lineHeight: 1.5 }}>
                {agent.mission}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', maxWidth: '500px', marginTop: '6px' }}>
                {agent.allowed_tools?.slice(0, 8).map((tool) => (
                  <span
                    key={tool}
                    style={{
                      fontSize: '0.72rem',
                      fontFamily: 'monospace',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      color: '#94a3b8',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    {tool}
                  </span>
                ))}
                {(agent.allowed_tools?.length || 0) > 8 && (
                  <span style={{ fontSize: '0.72rem', color: '#64748b', alignSelf: 'center' }}>
                    +{(agent.allowed_tools?.length || 0) - 8} ferramentas
                  </span>
                )}
              </div>
            </div>
          ) : (
            messages.map((item) => {
              if (item.sender === 'user') {
                return (
                  <div key={item.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      <span>Você</span>
                      <User size={12} />
                      <span>• {item.timestamp}</span>
                    </div>
                    <div
                      style={{
                        maxWidth: '85%',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        fontSize: '0.88rem',
                        lineHeight: '1.5',
                        backgroundColor: 'rgba(99, 102, 241, 0.25)',
                        border: '1px solid rgba(99, 102, 241, 0.45)',
                        color: 'var(--text-primary)',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {item.text}
                    </div>
                  </div>
                );
              }

              if (item.sender === 'tool') {
                return (
                  <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '90%', alignSelf: 'flex-start' }}>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.74rem',
                        fontFamily: 'monospace',
                        backgroundColor: item.toolSuccess === false ? 'rgba(239, 68, 68, 0.15)' : 'rgba(30, 41, 59, 0.7)',
                        border: `1px solid ${item.toolSuccess === false ? 'rgba(239, 68, 68, 0.4)' : 'rgba(100, 116, 139, 0.25)'}`,
                        color: item.toolSuccess === false ? '#f87171' : '#94a3b8',
                      }}
                    >
                      <Wrench size={12} color={item.toolSuccess === false ? '#ef4444' : '#818cf8'} />
                      <strong>{item.toolName}</strong>
                      {item.toolSuccess !== undefined && (
                        <span>{item.toolSuccess ? '✓ Sucesso' : '✗ Falha'}</span>
                      )}
                    </div>
                    {item.toolOutput && (
                      <div
                        style={{
                          fontSize: '0.78rem',
                          fontFamily: 'monospace',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(0, 0, 0, 0.4)',
                          border: '1px solid var(--border-color)',
                          color: '#cbd5e1',
                          maxHeight: '160px',
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {item.toolOutput}
                      </div>
                    )}
                  </div>
                );
              }

              if (item.sender === 'contract' && item.contract) {
                const c = item.contract;
                return (
                  <div
                    key={item.id}
                    style={{
                      maxWidth: '92%',
                      alignSelf: 'flex-start',
                      padding: '14px 18px',
                      borderRadius: '10px',
                      backgroundColor: 'rgba(15, 23, 42, 0.85)',
                      border: '1px solid rgba(99, 102, 241, 0.35)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#818cf8', fontWeight: 600, fontSize: '0.84rem' }}>
                        <CheckCircle2 size={16} color="#34d399" />
                        <span>Parecer Executivo Formal ({getAgentLabel(c.agent_role)})</span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>
                        {c.resource_usage?.model_name || agent.preferred_model} • {Math.round(c.resource_usage?.duration_ms || 0)}ms
                      </span>
                    </div>

                    <div style={{ fontSize: '0.86rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                      <MarkdownMessage content={c.summary} />
                    </div>

                    {c.actions_taken && c.actions_taken.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '4px' }}>
                        {c.actions_taken.map((a: string, idx: number) => (
                          <span
                            key={idx}
                            style={{
                              fontSize: '0.70rem',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(52, 211, 153, 0.12)',
                              color: '#34d399',
                              border: '1px solid rgba(52, 211, 153, 0.25)',
                            }}
                          >
                            ✓ {a}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div key={item.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    <Bot size={12} color="#818cf8" />
                    <span style={{ color: '#818cf8', fontWeight: 600 }}>{agent.name}</span>
                    {item.modelUsed && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontFamily: 'monospace' }}>
                        <Cpu size={10} />
                        {item.modelUsed}
                      </span>
                    )}
                    <span>• {item.timestamp}</span>
                  </div>
                  <div
                    style={{
                      maxWidth: '88%',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      fontSize: '0.88rem',
                      lineHeight: '1.5',
                      backgroundColor: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <MarkdownMessage content={item.text || ''} />
                  </div>
                </div>
              );
            })
          )}

          {/* Texto em streaming ao vivo */}
          {currentAssistantText && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                <Bot size={12} color="#818cf8" />
                <span style={{ color: '#818cf8', fontWeight: 600 }}>{agent.name}</span>
                <span style={{ fontSize: '0.70rem', color: '#34d399' }}>(digitando ao vivo...)</span>
              </div>
              <div
                style={{
                  maxWidth: '88%',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  fontSize: '0.88rem',
                  lineHeight: '1.5',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  color: 'var(--text-primary)',
                }}
              >
                <MarkdownMessage content={currentAssistantText} />
              </div>
            </div>
          )}

          {/* Status de execução e ferramentas */}
          {running && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#818cf8', fontSize: '0.82rem', padding: '4px 0' }}>
              <RefreshCw size={14} className="spin" />
              <span>{currentToolStatus || `${agent.name} está raciocinando...`}</span>
            </div>
          )}
        </div>

        {/* Formulário de Input */}
        <form onSubmit={handleSend} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder={`Envie uma instrução autônoma para ${agent.name}...`}
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            disabled={running}
            style={{
              flex: 1,
              padding: '11px 16px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '0.88rem',
              outline: 'none',
            }}
          />

          {running ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleStop}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', color: '#ef4444' }}
              title="Interromper execução"
            >
              <Square size={14} />
              Parar
            </button>
          ) : (
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!inputPrompt.trim()}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 18px' }}
            >
              <Send size={15} />
              Enviar
            </button>
          )}
        </form>
      </div>
    </Modal>
  );
};
