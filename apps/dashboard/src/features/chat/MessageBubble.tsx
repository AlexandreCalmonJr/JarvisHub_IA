import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Users,
  Sparkles,
  Volume2,
  VolumeX,
  Globe,
  FolderOpen,
  Star,
  Loader2,
  Check,
  ExternalLink,
  Brain,
} from 'lucide-react';
import { TaskStateResponse, getAgentLabel, getModelLabel, humanizeLabel } from '../../types';
import { CanvasArtifact } from './ArtifactCanvas';
import { MarkdownMessage } from './MarkdownMessage';
import { openWorkspaceFolder } from '../../services/api/workspace';
import { getUserProfile } from '../../shared/common/UserProfileModal';
import { fetchTaskInferenceTelemetry, submitInferenceFeedback } from '../../services/api/system';
import type { InferenceTelemetryRecord } from '../../services/api/system';
import { useAssistantIdentity } from '../../context/AssistantIdentityContext';
import { MascotAvatar } from '../../shared/common/MascotAvatar';
import { getDefaultMascotForRole } from '../../services/mascots';
import { distillToBrain } from '../../services/api/brain';
import { notify } from '../../shared/common/Toast';

const INTENT_LABELS: Record<string, string> = {
  conversation: 'Conversação & Assistente',
  code_explanation: 'Consultoria Técnica & Aprendizado',
  project_creation: 'Criação de Projeto Web/Mobile',
  code_modification: 'Modificação de Código',
  architecture_analysis: 'Análise de Arquitetura',
  security_audit: 'Auditoria de Segurança & DevSecOps',
  qa_testing: 'Garantia de Qualidade & Testes',
  general_planning: 'Planejamento Geral',
};

interface ChatMessage {
  sender: 'user' | 'jarvis';
  text: string;
  taskData?: TaskStateResponse;
  timestamp: string;
  statusMessage?: string;
}

interface MessageBubbleProps {
  message: ChatMessage;
  onOpenArtifact: (artifact: CanvasArtifact) => void;
}

function parseJsonPayload(rawText: string): any | null {
  if (!rawText) return null;
  const trimmed = rawText.trim();
  let jsonCandidate = '';
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    jsonCandidate = trimmed;
  } else {
    const match = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (match) {
      jsonCandidate = match[1];
    }
  }

  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate);
      return parsed;
    } catch {}
  }
  return null;
}

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({ message, onOpenArtifact }) => {
  const isJarvis = message.sender === 'jarvis';
  const [showReasoning, setShowReasoning] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [inferenceRecords, setInferenceRecords] = useState<InferenceTelemetryRecord[]>([]);
  const [feedbackLoadingId, setFeedbackLoadingId] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [savingToBrain, setSavingToBrain] = useState(false);
  const [savedToBrain, setSavedToBrain] = useState(false);
  const task = message.taskData;
  const userProfile = getUserProfile();
  const { assistantName } = useAssistantIdentity();
  const activeAgentMeta = task?.agent_meta;
  const isSpecialistResponse = Boolean(activeAgentMeta && activeAgentMeta.role && activeAgentMeta.role !== 'jarvis_master');
  const speakerLabel = isSpecialistResponse
    ? `${activeAgentMeta?.proper_name || activeAgentMeta?.name} · ${activeAgentMeta?.name}`
    : assistantName;
  const speakerMascot =
    activeAgentMeta?.mascot || getDefaultMascotForRole(activeAgentMeta?.role || 'jarvis_master');

  useEffect(() => {
    let active = true;
    if (!isJarvis || !task?.task_id) {
      setInferenceRecords([]);
      return () => { active = false; };
    }
    fetchTaskInferenceTelemetry(task.task_id)
      .then((records) => {
        if (active) setInferenceRecords(records.filter((record) => record.status === 'success'));
      })
      .catch((error) => {
        if (active) console.warn('Não foi possível carregar avaliações da inferência:', error);
      });
    return () => { active = false; };
  }, [isJarvis, task?.task_id]);

  const handleInferenceRating = async (inferenceId: string, rating: number) => {
    setFeedbackLoadingId(inferenceId);
    setFeedbackError(null);
    try {
      await submitInferenceFeedback(inferenceId, rating);
      setInferenceRecords((current) =>
        current.map((record) => record.id === inferenceId ? { ...record, feedback_rating: rating } : record)
      );
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : 'Não foi possível registrar a avaliação.');
    } finally {
      setFeedbackLoadingId(null);
    }
  };

  const parsedJson = isJarvis ? parseJsonPayload(message.text) : null;
  const displayText = parsedJson?.chat_response || message.text;
  const agentMode = parsedJson?.active_agent_mode;

  const handleToggleSpeech = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    const cleanText = displayText
      .replace(/```[\s\S]*?```/g, 'Bloco de código omitido da leitura.')
      .replace(/[*#_`>]/g, '')
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.05;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleSaveToBrain = async () => {
    if (!displayText?.trim() || savingToBrain || savedToBrain) return;
    setSavingToBrain(true);
    try {
      await distillToBrain({
        prompt: task?.plan_steps?.[0] || `Insight de ${speakerLabel}`,
        answer: displayText,
        agent_role: activeAgentMeta?.role || 'jarvis_master',
        agent_name: activeAgentMeta?.proper_name || assistantName,
        layer: activeAgentMeta?.role && activeAgentMeta.role !== 'jarvis_master' ? 'agent' : 'private',
        sources: task?.sources,
      });
      setSavedToBrain(true);
      notify('Resposta destilada e salva no Segundo Cérebro.', 'success');
    } catch (err: any) {
      notify(err?.message || 'Não foi possível salvar no Segundo Cérebro.', 'error');
    } finally {
      setSavingToBrain(false);
    }
  };

  // Extrai possíveis arquivos, artefatos JSON ou diffs do texto para abrir no Canvas
  const extractArtifactInfo = (): CanvasArtifact | null => {
    if (parsedJson?.artifact_payload && parsedJson.artifact_payload.code) {
      const art = parsedJson.artifact_payload;
      return {
        title: art.title || 'Artefato de Código',
        content: art.code,
        htmlContent: art.language === 'html' ? art.code : undefined,
        mode: agentMode,
        planStatus: parsedJson.ui_layout_instructions?.plan_status,
      };
    }

    const text = message.text;
    const prjMatch = text.match(/workspace[\\/]([a-zA-Z0-9_-]+)/i);
    const projectId = prjMatch ? prjMatch[1] : undefined;
    const diffMatch = text.match(/```diff\n([\s\S]*?)\n```/);
    const diffContent = diffMatch ? diffMatch[1] : undefined;
    const codeMatch = text.match(/```(?:html|dart|javascript|typescript|tsx|jsx)?\n([\s\S]*?)\n```/);
    const codeContent = codeMatch ? codeMatch[1] : undefined;

    const isHtmlOrVisual = codeContent && (
      codeContent.toLowerCase().includes('<html') ||
      codeContent.toLowerCase().includes('<!doctype') ||
      codeContent.toLowerCase().includes('<svg') ||
      codeContent.toLowerCase().includes('<canvas') ||
      codeContent.toLowerCase().includes('<div')
    );

    if (diffContent || codeContent || projectId) {
      return {
        title: projectId ? `Projeto: ${projectId}` : 'Artefato de Código / Canvas',
        projectId,
        content: codeContent,
        diffContent,
        htmlContent: isHtmlOrVisual ? codeContent : undefined,
      };
    }
    return null;
  };

  const artifact = isJarvis ? extractArtifactInfo() : null;

  const extractProjectSlug = (): string | null => {
    if (parsedJson?.project_id) return parsedJson.project_id;
    if (parsedJson?.artifact_payload?.identifier) return parsedJson.artifact_payload.identifier;
    if (task?.project_id) return task.project_id;
    if (artifact?.projectId) return artifact.projectId;
    const match = message.text.match(/workspace[\\/]([a-zA-Z0-9_-]+)/i);
    if (match) return match[1];
    return null;
  };
  const projectSlug = isJarvis ? extractProjectSlug() : null;

  const handleOpenFolder = async (slug: string) => {
    try {
      await openWorkspaceFolder(slug);
    } catch (err) {
      console.warn('Erro ao abrir pasta:', err);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: '12px',
        alignSelf: isJarvis ? 'flex-start' : 'flex-end',
        maxWidth: isJarvis ? '94%' : '80%',
        width: isJarvis ? '100%' : 'fit-content',
        marginLeft: isJarvis ? '0' : 'auto',
        animation: 'fadeIn 0.25s ease-out',
      }}
    >
      {isJarvis && (
        <div style={{ flexShrink: 0, marginTop: '2px' }}>
          <MascotAvatar mascot={speakerMascot} size={32} />
        </div>
      )}

      <div
        style={{
          flex: isJarvis ? 1 : 'initial',
          display: 'flex',
          flexDirection: 'column',
          alignItems: isJarvis ? 'flex-start' : 'flex-end',
          width: isJarvis ? '100%' : 'fit-content',
        }}
      >
        {/* Meta Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '6px',
            marginBottom: '6px',
            fontSize: '0.74rem',
            color: 'var(--text-muted)',
            justifyContent: isJarvis ? 'flex-start' : 'flex-end',
            width: '100%',
          }}
        >
          {isJarvis ? (
            <>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{speakerLabel}</span>
              {task?.execution_mode && (
                <>
                  <span>·</span>
                  <span
                    data-testid="message-execution-mode"
                    style={{
                      fontWeight: 700,
                      color: task.execution_mode === 'LOCAL' ? '#4ade80' : '#60a5fa',
                    }}
                  >
                    {task.execution_mode}
                  </span>
                </>
              )}
              {task?.model_used && (
                <>
                  <span>·</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                    {task.model_used}
                  </span>
                </>
              )}
              {typeof task?.latency_ms === 'number' && task.latency_ms > 0 && (
                <>
                  <span>·</span>
                  <span className="jarvis-tabular">{task.latency_ms} ms</span>
                </>
              )}
              <span>·</span>
              <span className="tabular-nums">{message.timestamp}</span>

              {typeof window !== 'undefined' && 'speechSynthesis' in window && displayText && (
                <button
                  type="button"
                  onClick={handleToggleSpeech}
                  className={`btn btn-ghost btn-xs ${isSpeaking ? 'is-active' : ''}`}
                  title={isSpeaking ? 'Parar leitura da resposta' : 'Ouvir resposta em voz alta (Offline)'}
                >
                  {isSpeaking ? <VolumeX size={12} /> : <Volume2 size={12} />}
                  <span>{isSpeaking ? 'Parar' : 'Ouvir'}</span>
                </button>
              )}

              {displayText && displayText.trim().length > 0 && (
                <button
                  type="button"
                  data-testid="save-to-brain-btn"
                  disabled={savingToBrain || savedToBrain}
                  onClick={handleSaveToBrain}
                  className="btn btn-ghost btn-xs"
                  title="Destilar e salvar esta resposta no Segundo Cérebro"
                  style={{ color: savedToBrain ? '#4ade80' : undefined }}
                >
                  {savingToBrain ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : savedToBrain ? (
                    <Check size={12} />
                  ) : (
                    <Brain size={12} />
                  )}
                  <span>{savedToBrain ? 'Salvo no Cérebro' : 'Salvar no Cérebro'}</span>
                </button>
              )}
            </>
          ) : (
            <>
              <span className="tabular-nums">{message.timestamp}</span>
              <span>·</span>
              <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Você</span>
            </>
          )}
        </div>

        {/* Message Bubble Card */}
        <div
          className={!isJarvis ? 'openbot-coral-bubble' : ''}
          style={{
            backgroundColor: isJarvis ? 'transparent' : 'var(--accent-color)',
            color: isJarvis ? 'var(--text-primary)' : '#ffffff',
            padding: isJarvis ? '2px 0 8px 0' : '11px 16px',
            borderRadius: isJarvis ? '0' : '14px 14px 4px 14px',
            width: isJarvis ? '100%' : 'fit-content',
            maxWidth: '100%',
          }}
        >
          {/* Gaveta expansível "Ver raciocínio" (estilo DeepSeek) & Etapas */}
          {isJarvis &&
            task &&
            (task.reasoning ||
              task.routing_note ||
              task.classified_intent ||
              (task.plan_steps && task.plan_steps.length > 0)) && (
              <div
                style={{
                  marginBottom: '12px',
                  paddingBottom: '4px',
                }}
              >
                <button
                  type="button"
                  data-testid="toggle-reasoning-btn"
                  onClick={() => setShowReasoning(!showReasoning)}
                  className="btn btn-ghost btn-xs"
                  style={{
                    color: 'var(--text-secondary)',
                    padding: '4px 8px',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <Brain size={12} color="var(--accent-light)" />
                  <span>{showReasoning ? 'Ocultar raciocínio' : 'Ver raciocínio'}</span>
                  {task.plan_steps && task.plan_steps.length > 0 && (
                    <span className="jarvis-tabular" style={{ color: 'var(--text-muted)' }}>
                      · {task.plan_steps.length} etapas
                    </span>
                  )}
                  {showReasoning ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>

                {showReasoning && (
                  <div
                    data-testid="reasoning-drawer"
                    style={{
                      marginTop: '8px',
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      fontSize: '0.77rem',
                    }}
                  >
                    {task.routing_note && (
                      <div style={{ color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Roteamento:</strong> {task.routing_note}
                      </div>
                    )}

                    {task.reasoning && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Cadeia de raciocínio:</strong>
                        <div
                          style={{
                            color: 'var(--text-secondary)',
                            lineHeight: 1.55,
                          }}
                        >
                          <MarkdownMessage content={task.reasoning} />
                        </div>
                      </div>
                    )}

                    {task.classified_intent && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Intenção:</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                          {INTENT_LABELS[task.classified_intent] || humanizeLabel(task.classified_intent)}
                        </span>
                      </div>
                    )}

                    {task.selected_agents && task.selected_agents.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <Users size={12} color="var(--text-muted)" />
                        <span style={{ color: 'var(--text-muted)' }}>Especialistas:</span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {task.selected_agents.map((ag: string) => getAgentLabel(ag)).join(' · ')}
                        </span>
                      </div>
                    )}

                    {task.plan_steps && task.plan_steps.length > 0 && (
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                          Etapas planejadas:
                        </span>
                        {task.plan_steps.map((st: string, idx: number) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                            <ChevronRight size={12} color="var(--text-muted)" />
                            <span>{st}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {task.agent_outputs && task.agent_outputs.length > 0 && (
                      <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>
                          Deliberações dos Especialistas:
                        </span>
                        {task.agent_outputs.map((out: any, idx: number) => (
                          <div
                            key={idx}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '6px',
                              backgroundColor: 'var(--bg-primary)',
                              border: '1px solid var(--border-subtle)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--accent-light)' }}>
                                {getAgentLabel(out.agent_role || out.role)}
                              </span>
                              {out.objective && (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.70rem' }}>
                                  {out.objective}
                                </span>
                              )}
                            </div>
                            {out.summary && (
                              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.74rem', whiteSpace: 'pre-wrap' }}>
                                {out.summary.length > 300 ? out.summary.slice(0, 300) + '...' : out.summary}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          {/* Texto Principal da Mensagem com Detecção de Thinking e Markdown */}
          <div
            style={{
              fontSize: isJarvis ? '0.90rem' : '0.92rem',
              lineHeight: isJarvis ? '1.65' : '1.55',
              wordBreak: 'break-word',
            }}
          >
            {isJarvis ? (
              (!displayText || displayText.trim() === '') ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--accent-soft)',
                    border: '1px solid var(--border-accent)',
                  }}
                >
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <div
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--accent-color)',
                        animation: 'pulse 1.2s infinite ease-in-out',
                      }}
                    />
                    <div
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--accent-light)',
                        animation: 'pulse 1.2s infinite ease-in-out 0.2s',
                      }}
                    />
                    <div
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        backgroundColor: '#93c5fd',
                        animation: 'pulse 1.2s infinite ease-in-out 0.4s',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.84rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                      {message.statusMessage || 'JARVIS Maestro processando a solicitação...'}
                    </span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      Aguardando o resultado real do processamento.
                    </span>
                  </div>
                </div>
              ) : (
                <MarkdownMessage content={displayText} />
              )
            ) : (
              <div style={{ whiteSpace: 'pre-wrap' }}>{displayText}</div>
            )}
          </div>

          {/* Fontes consultadas na Web (Google Search Grounding) */}
          {isJarvis && Array.isArray(task?.sources) && task.sources.length > 0 && (
            <div
              data-testid="message-web-sources"
              style={{
                marginTop: '12px',
                paddingTop: '10px',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                <Globe size={12} color="#60a5fa" />
                <span>Fontes consultadas na web</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {task.sources.map((src, sIdx) => (
                  <a
                    key={`${src.url}-${sIdx}`}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '0.76rem',
                      color: 'var(--accent-light)',
                      textDecoration: 'none',
                    }}
                  >
                    <ExternalLink size={11} />
                    <span>{src.title || src.url}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {isJarvis && inferenceRecords.length > 0 && (
            <div
              style={{
                width: '100%',
                marginTop: '12px',
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-secondary, var(--bg-tertiary))',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' }}>
                <Star size={13} color="var(--accent-color)" />
                <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Avalie as inferências que contribuíram para esta resposta
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                {inferenceRecords.map((record) => (
                  <div key={record.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '0.73rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {record.agent_role ? getAgentLabel(record.agent_role) : 'Especialista'}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {getModelLabel(record.model_name)} · {record.provider}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      {record.feedback_rating ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--success-color, #22c55e)', fontSize: '0.70rem' }}>
                          <Check size={13} /> Avaliado: {record.feedback_rating}/5
                        </span>
                      ) : (
                        [1, 2, 3, 4, 5].map((rating) => (
                          <button
                            key={rating}
                            type="button"
                            disabled={feedbackLoadingId === record.id}
                            onClick={() => handleInferenceRating(record.id, rating)}
                            className="btn btn-secondary btn-xs"
                            title={`Avaliar com ${rating} de 5`}
                            aria-label={`Avaliar ${getModelLabel(record.model_name)} com ${rating} de 5`}
                          >
                            {feedbackLoadingId === record.id ? <Loader2 size={11} className="animate-spin" /> : <Star size={11} />}
                            {rating}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {feedbackError && (
                <div role="alert" style={{ marginTop: '8px', fontSize: '0.70rem', color: 'var(--danger-color, #ef4444)' }}>
                  {feedbackError}
                </div>
              )}
            </div>
          )}

          {/* Card de Artefato Real Gerado (.PPTX, .PDF, .PNG) */}
          {isJarvis && task?.artifact_payload && (
            <div
              data-testid="message-deliverable-card"
              style={{
                marginTop: '14px',
                padding: '12px 16px',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <div className="jarvis-page-header-icon">
                  <Sparkles size={16} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {task.artifact_payload.title}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Entregável pronto em <strong style={{ color: 'var(--accent-light)', fontFamily: 'var(--font-mono)' }}>.{task.artifact_payload.kind.toUpperCase()}</strong>
                    {task.artifact_payload.slides ? ` · ${task.artifact_payload.slides.length} slides` : ''}
                    {task.artifact_payload.sections ? ` · ${task.artifact_payload.sections.length} seções` : ''}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  onOpenArtifact({
                    title: task.artifact_payload!.title,
                    structuredArtifact: task.artifact_payload!,
                    studioMode: true,
                  })
                }
                className="btn btn-primary btn-sm"
              >
                <Sparkles size={14} />
                <span>Abrir & Baixar .{task.artifact_payload.kind.toUpperCase()}</span>
              </button>
            </div>
          )}

          {/* Card de Entrega Limpo do Projeto para o Usuário Final */}
          {projectSlug && (
            <div
              style={{
                marginTop: '16px',
                padding: '14px 18px',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="jarvis-page-header-icon">
                  <Sparkles size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Aplicativo Pronto: {projectSlug}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Arquivos salvos em <code>workspace/{projectSlug}</code>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    onOpenArtifact(
                      artifact || {
                        title: `Projeto: ${projectSlug}`,
                        projectId: projectSlug,
                      }
                    );
                  }}
                  className="btn btn-primary btn-sm"
                >
                  <Globe size={15} />
                  <span>Abrir visualização</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenFolder(projectSlug)}
                  className="btn btn-secondary btn-sm"
                  title="Abre o explorador de arquivos na pasta deste projeto"
                >
                  <FolderOpen size={15} color="var(--accent-light)" />
                  <span>Abrir pasta</span>
                </button>
              </div>
            </div>
          )}

          {task?.approval_required && (
            <div
              style={{
                backgroundColor: 'var(--warning-soft)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                color: '#fbbf24',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginTop: '12px',
                fontSize: '0.82rem',
              }}
            >
              <ShieldAlert size={18} />
              <div>
                <strong>Aprovação humana requerida:</strong> A alteração no disco está pendente de autorização na{' '}
                <b>Central de Aprovações</b>.
              </div>
            </div>
          )}
        </div>
      </div>

      {!isJarvis && (
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: '2px',
            fontWeight: 600,
            fontSize: '0.74rem',
          }}
        >
          {userProfile?.displayName ? userProfile.displayName.charAt(0).toUpperCase() : 'V'}
        </div>
      )}
    </div>
  );
});
