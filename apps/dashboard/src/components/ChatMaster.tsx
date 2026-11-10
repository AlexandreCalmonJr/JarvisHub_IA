import React, { useState, useEffect, useRef } from 'react';
import { fetchWorkspaceProjects } from '../api';
import { useChatStream } from '../hooks/useChatStream';
import { ArtifactCanvas, CanvasArtifact } from './chat/ArtifactCanvas';
import { MessageBubble } from './chat/MessageBubble';
import { ChatHeader } from './chat/ChatHeader';
import { ChatInput } from './chat/ChatInput';
import { ChatProjectModal } from './chat/ChatProjectModal';
import { getSessionMessagesLocally } from './chat/ChatHistoryDrawer';

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

  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // Se o App ou Sidebar solicitar carregar uma sessão específica ou iniciar nova conversa
  useEffect(() => {
    if (targetSessionId) {
      if (targetSessionId.startsWith('new_')) {
        handleNewChat();
        setActiveArtifact(null);
      } else if (targetSessionId !== sessionId) {
        setSessionId(targetSessionId);
        const loaded = getSessionMessagesLocally(targetSessionId);
        if (loaded && loaded.length > 0) {
          setMessages(loaded);
        } else {
          setMessages([]);
        }
        setActiveArtifact(null);
      }
    }
  }, [targetSessionId]);

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

  const handleFormSubmit = (overrideText?: string, modelOverride?: string) => {
    const textToSend = overrideText || input;
    if (!textToSend.trim() || loading) return;
    if (!overrideText) {
      setInput('');
    }
    submitStream(textToSend, modelOverride);
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
                handleToggleVoiceInput((text) => setInput((prev) => (prev ? `${prev} ${text}` : text)))
              }
              activeProjectId={activeProjectId}
              activeProjectName={activeProject?.name}
              onDetachProject={handleDetachProject}
              onOpenProjectModal={() => setShowProjectModal(true)}
              isFloatingCenter={true}
            />
          </div>
        ) : (
          /* Quando há mensagens na conversa */
          <>
            <ChatHeader
              messagesCount={messages.length}
              activeProjectId={activeProjectId}
              activeProjectName={activeProject?.name}
              onDetachProject={handleDetachProject}
              onOpenProjectModal={() => setShowProjectModal(true)}
              onExportChat={handleExportChat}
              activeArtifact={activeArtifact}
              onToggleCanvas={() => setActiveArtifact(null)}
              onNewChat={() => {
                handleNewChat();
                setActiveArtifact(null);
              }}
            />

            {/* Área de Mensagens com auto-scroll */}
            <div
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
                  key={idx}
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
                  handleToggleVoiceInput((text) => setInput((prev) => (prev ? `${prev} ${text}` : text)))
                }
                activeProjectId={activeProjectId}
                activeProjectName={activeProject?.name}
                onDetachProject={handleDetachProject}
                onOpenProjectModal={() => setShowProjectModal(true)}
                isFloatingCenter={false}
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
