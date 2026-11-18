import React, { useState, useEffect, useRef, useCallback } from 'react';
import { fetchWorkspaceProjects, fetchModels, fetchChatSessionDetails } from '../api';
import { FormattedChatModel, parseChatModelOptions } from '../services/chatModels';
import { useChatStream } from '../hooks/useChatStream';
import { ArtifactCanvas, CanvasArtifact } from './chat/ArtifactCanvas';
import { MessageBubble } from './chat/MessageBubble';
import { ChatInput } from './chat/ChatInput';
import { ChatProjectModal } from './chat/ChatProjectModal';
import { getSessionMessagesLocally, saveSessionMessagesLocally } from './chat/ChatHistoryDrawer';
import { OpenBotConversationRail } from './chat/OpenBotConversationRail';
import { OpenBotChatHeader, ChatTabItem } from './chat/OpenBotChatHeader';
import { getAccountStorageKey } from '../services/accountScope';
import { ChatMessage } from '../types';

interface ChatMasterProps {
  attachedProjectId?: string | null;
  onDetachProject?: () => void;
  targetSessionId?: string | null;
}

const GREETINGS = [
  'Como posso ajudar hoje?',
  'JARVIS 3.0',
  'Engenharia & Desenvolvimento',
];

export const ChatMaster: React.FC<ChatMasterProps> = ({
  attachedProjectId: propProjectId,
  onDetachProject,
  targetSessionId,
}) => {
  const [input, setInput] = useState('');
  const [activeArtifact, setActiveArtifact] = useState<CanvasArtifact | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(propProjectId || null);
  const [availableProjects, setAvailableProjects] = useState<any[]>([]);
  const [greetingIndex, setGreetingIndex] = useState(0);
  const [isRailOpen, setIsRailOpen] = useState(true);
  const [availableModels, setAvailableModels] = useState<FormattedChatModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try {
      return localStorage.getItem(getAccountStorageKey('jarvis_selected_model')) || 'llama3.2:3b';
    } catch {
      return 'llama3.2:3b';
    }
  });
  const [tabs, setTabs] = useState<ChatTabItem[]>([{ id: 'default', title: 'JARVIS Master' }]);
  const [activeTabId, setActiveTabId] = useState('default');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sincroniza modelos disponíveis do backend
  useEffect(() => {
    let isMounted = true;
    fetchModels()
      .then((data) => {
        if (!isMounted || !data) return;
        const list = parseChatModelOptions(data);
        setAvailableModels(list);
        const saved = localStorage.getItem(getAccountStorageKey('jarvis_selected_model'));
        if (saved && list.some((m) => m.id === saved)) {
          setSelectedModel(saved);
        } else if (list.length > 0) {
          const def = list.find((m) => m.id.toLowerCase().includes('qwen') || m.id.toLowerCase().includes('llama')) || list[0];
          setSelectedModel(def.id);
        }
      })
      .catch((e) => console.warn('Falha ao listar modelos:', e));
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId);
    try {
      localStorage.setItem(getAccountStorageKey('jarvis_selected_model'), modelId);
    } catch {}
  };

  // Sincroniza propriedade de projeto externo
  useEffect(() => {
    if (propProjectId !== undefined) {
      setActiveProjectId(propProjectId);
    }
  }, [propProjectId]);

  const loadProjects = async () => {
    try {
      const data = await fetchWorkspaceProjects();
      setAvailableProjects(data);
    } catch (e) {
      console.warn('Falha ao listar projetos no chat:', e);
    }
  };

  useEffect(() => {
    loadProjects();
  }, [showProjectModal]);

  const activeProject = availableProjects.find((p) => p.id === activeProjectId);

  // Hook desacoplado de streaming e estado da conversa
  const {
    messages,
    setMessages,
    sessionId,
    setSessionId,
    loading,
    isListening,
    handleToggleVoiceInput,
    handleStopGeneration,
    handleNewChat,
    handleExportChat,
    handleSubmit: submitStream,
  } = useChatStream(
    activeProjectId,
    activeProject?.name || null,
    (art) => setActiveArtifact(art),
    () => loadProjects()
  );

  // Função central para carregar e sincronizar histórico de sessão com o SQLite do backend
  const loadSessionMessages = useCallback(async (sid: string, titleHint?: string) => {
    setSessionId(sid);
    setActiveArtifact(null);

    // 1. Tenta carregar do cache local imediatamente para exibição fluida
    const local = getSessionMessagesLocally(sid);
    if (local && local.length > 0) {
      setMessages(local);
    }

    // 2. Busca do backend (SQLite) para garantir integridade e mensagens persistidas
    try {
      const details = await fetchChatSessionDetails(sid);
      if (details) {
        let reconstructed: ChatMessage[] = [];
        if (details.messages && details.messages.length > 0) {
          reconstructed = details.messages.map((m: any) => ({
            sender: m.role === 'user' ? 'user' : 'jarvis',
            text: m.content || '',
            timestamp: m.created_at
              ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          }));
        } else if (details.tasks && details.tasks.length > 0) {
          details.tasks.forEach((t: any) => {
            const time = t.created_at
              ? new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (t.prompt) {
              reconstructed.push({ sender: 'user', text: t.prompt, timestamp: time });
            }
            const summary = t.state?.final_summary || t.final_summary;
            if (summary) {
              reconstructed.push({
                sender: 'jarvis',
                text: summary,
                taskData: t.state,
                timestamp: time,
              });
            }
          });
        }

        if (reconstructed.length > 0) {
          setMessages(reconstructed);
          saveSessionMessagesLocally(sid, reconstructed);
        } else if (!local || local.length === 0) {
          setMessages([]);
        }
      }
    } catch (e) {
      console.warn('Falha ao restaurar mensagens da sessão do backend:', e);
      if (!local || local.length === 0) {
        setMessages([]);
      }
    }

    // Atualiza aba da conversa
    const resolvedTitle = titleHint || (sid.startsWith('agent-') ? sid.replace('agent-', '').toUpperCase() : 'Chat ' + sid.substring(0, 8));
    setTabs((prev) => {
      const exists = prev.find((t) => t.id === sid);
      if (exists) {
        return titleHint && exists.title !== titleHint
          ? prev.map((t) => (t.id === sid ? { ...t, title: titleHint } : t))
          : prev;
      }
      return [...prev, { id: sid, title: resolvedTitle }];
    });
    setActiveTabId(sid);
  }, [setSessionId, setMessages]);

  // Se o App ou Sidebar solicitar carregar uma sessão específica ou iniciar nova conversa
  useEffect(() => {
    if (targetSessionId) {
      if (targetSessionId.startsWith('new_')) {
        handleOpenNewChatTab();
      } else if (targetSessionId !== sessionId) {
        loadSessionMessages(targetSessionId);
      }
    }
  }, [targetSessionId]);

  // Reidratação inicial da sessão ativa caso o banco SQLite tenha dados não sincronizados localmente
  useEffect(() => {
    if (sessionId && !messages.some((m) => m.sender === 'user') && !sessionId.startsWith('new_') && sessionId !== 'default') {
      loadSessionMessages(sessionId);
    }
  }, []);

  // Auto-scroll suave para a mensagem mais recente
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleDetachProject = () => {
    setActiveProjectId(null);
    if (onDetachProject) {
      onDetachProject();
    }
  };

  const handleSelectSession = (sid: string, titleHint?: string) => {
    loadSessionMessages(sid, titleHint);
  };

  const handleOpenNewChatTab = () => {
    const newId = handleNewChat();
    setActiveArtifact(null);
    setTabs((prev) => [...prev, { id: newId, title: 'Novo Chat' }]);
    setActiveTabId(newId);
  };

  const handleFormSubmit = (overrideText?: string, modelOverride?: string) => {
    const textToSend = overrideText || input;
    if (!textToSend.trim() || loading) return;
    if (!overrideText) {
      setInput('');
    }

    // Atualiza título da aba ativa caso ainda seja o nome genérico inicial
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabId && (t.title === 'JARVIS Master' || t.title === 'Novo Chat' || t.title === 'Calmon Dev')
          ? { ...t, title: textToSend.slice(0, 24) + (textToSend.length > 24 ? '...' : '') }
          : t
      )
    );

    submitStream(textToSend, modelOverride || selectedModel);
  };

  const hasUserMessages = messages.some((m) => m.sender === 'user');

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      {/* Sub-rail Esquerdo de Conversas (OpenBot Channel / Agent Rail) */}
      <OpenBotConversationRail
        activeSessionId={sessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleOpenNewChatTab}
        isCollapsed={!isRailOpen}
      />

      {/* Coluna Principal do Chat */}
      <div
        style={{
          flex: activeArtifact ? '0 0 50%' : '1',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
          transition: 'flex 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          borderRight: activeArtifact ? '1px solid var(--border-color)' : 'none',
        }}
      >
        {/* Header do Chat no Padrão OpenBot com Abas e Seletor de Modelo */}
        <OpenBotChatHeader
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={(tid) => {
            setActiveTabId(tid);
            handleSelectSession(tid);
          }}
          onCloseTab={(tid) => {
            if (tabs.length <= 1) return;
            const remaining = tabs.filter((t) => t.id !== tid);
            setTabs(remaining);
            if (activeTabId === tid) {
              const next = remaining[remaining.length - 1];
              setActiveTabId(next.id);
              handleSelectSession(next.id);
            }
          }}
          onNewTab={handleOpenNewChatTab}
          onToggleRail={() => setIsRailOpen((prev) => !prev)}
          isRailOpen={isRailOpen}
          selectedModel={selectedModel}
          onSelectModel={handleSelectModel}
          availableModels={availableModels}
          activeProjectId={activeProjectId}
          activeProjectName={activeProject?.name}
          onDetachProject={handleDetachProject}
          onOpenProjectModal={() => setShowProjectModal(true)}
          onExportChat={handleExportChat}
        />

        {/* Caso não haja mensagens de usuário, exibe a tela central de boas-vindas do Claude (Hero Greeting) */}
        {!hasUserMessages ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 20px',
              animation: 'fadeIn 0.3s ease-out',
            }}
          >
            {/* Título Minimalista Editorial */}
            <div
              onClick={() => setGreetingIndex((prev) => (prev + 1) % GREETINGS.length)}
              style={{
                marginBottom: '32px',
                cursor: 'pointer',
                userSelect: 'none',
                textAlign: 'center',
              }}
              title="Clique para alternar saudação"
            >
              <h1
                className="claude-serif-title"
                style={{
                  fontSize: '2.4rem',
                  margin: 0,
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  color: 'var(--text-primary)',
                }}
              >
                {GREETINGS[greetingIndex]}
              </h1>
            </div>

            {/* Cápsula Flutuante Centralizada */}
            <ChatInput
              input={input}
              onInputChange={(val) => setInput(val)}
              onSubmit={handleFormSubmit}
              loading={loading}
              onStopGeneration={handleStopGeneration}
              isListening={isListening}
              onToggleVoiceInput={() =>
                handleToggleVoiceInput((text, isLive) => {
                  if (isLive) {
                    setInput(text);
                  } else {
                    setInput((prev) => (prev ? `${prev} ${text}` : text));
                  }
                }, input)
              }
              activeProjectId={activeProjectId}
              activeProjectName={activeProject?.name}
              onDetachProject={handleDetachProject}
              onOpenProjectModal={() => setShowProjectModal(true)}
              isFloatingCenter={true}
              selectedModelId={selectedModel}
              onSelectModelId={handleSelectModel}
              availableModels={availableModels}
            />
          </div>
        ) : (
          /* Quando há mensagens na conversa */
          <>
            {/* Área de Mensagens com auto-scroll */}
            <div
              role="log"
              aria-live="polite"
              aria-relevant="additions text"
              aria-label="Mensagens da conversa"
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
              }}
            >
              {messages.map((m, idx) => (
                <MessageBubble
                  key={`${m.timestamp}-${idx}`}
                  message={m}
                  onOpenArtifact={(art) => setActiveArtifact(art)}
                />
              ))}

              <div ref={messagesEndRef} />
            </div>

            {/* Cápsula de Entrada Fixada na Base */}
            <div
              style={{
                padding: '16px 24px 20px 24px',
                backgroundColor: 'transparent',
              }}
            >
              <ChatInput
                input={input}
                onInputChange={(val) => setInput(val)}
                onSubmit={handleFormSubmit}
                loading={loading}
                onStopGeneration={handleStopGeneration}
                isListening={isListening}
                onToggleVoiceInput={() =>
                  handleToggleVoiceInput((text, isLive) => {
                    if (isLive) {
                      setInput(text);
                    } else {
                      setInput((prev) => (prev ? `${prev} ${text}` : text));
                    }
                  }, input)
                }
                activeProjectId={activeProjectId}
                activeProjectName={activeProject?.name}
                onDetachProject={handleDetachProject}
                onOpenProjectModal={() => setShowProjectModal(true)}
                isFloatingCenter={false}
                selectedModelId={selectedModel}
                onSelectModelId={handleSelectModel}
                availableModels={availableModels}
              />
            </div>
          </>
        )}
      </div>

      {/* Coluna Direita: Live Artifact Canvas (Claude Design / Codex Dual-Panel) */}
      {activeArtifact && (
        <ArtifactCanvas
          artifact={activeArtifact}
          onClose={() => setActiveArtifact(null)}
        />
      )}

      {/* Modal para Anexar / Selecionar Projeto no Chat */}
      <ChatProjectModal
        isOpen={showProjectModal}
        onClose={() => setShowProjectModal(false)}
        availableProjects={availableProjects}
        activeProjectId={activeProjectId}
        onSelectProject={(pId) => setActiveProjectId(pId)}
        onProjectsReload={loadProjects}
      />
    </div>
  );
};
