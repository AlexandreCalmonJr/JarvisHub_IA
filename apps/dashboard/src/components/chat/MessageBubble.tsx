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
} from 'lucide-react';
import { TaskStateResponse, getAgentLabel } from '../../types';
import { CanvasArtifact } from './ArtifactCanvas';
import { MarkdownMessage } from './MarkdownMessage';
import { openWorkspaceFolder } from '../../services/api/workspace';
import { getUserProfile } from '../common/UserProfileModal';
import { fetchTaskInferenceTelemetry, submitInferenceFeedback, InferenceTelemetryRecord } from '../../services/api/system';

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
  const task = message.taskData;
  const userProfile = getUserProfile();

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

    if (diffContent || codeContent || projectId) {
      return {
        title: projectId ? `Projeto: ${projectId}` : 'Artefato de Código',
        projectId,
        content: codeContent,
        diffContent,
        htmlContent: codeContent && codeContent.includes('<html') ? codeContent : undefined,
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
      {/* Avatar JARVIS com Glow Terracota Clássico */}
      {isJarvis && (
        <div
          style={{
            width: '26px',
            height: '26px',
            borderRadius: '50%',
            backgroundColor: 'rgba(217, 119, 87, 0.16)',
            border: '1px solid rgba(217, 119, 87, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: '2px',
            fontSize: '0.72rem',
            fontWeight: 700,
            color: 'var(--accent-color)',
            boxShadow: '0 0 10px rgba(217, 119, 87, 0.2)',
          }}
        >
          J
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
            gap: '8px',
            marginBottom: '6px',
            fontSize: '0.74rem',
            color: 'var(--text-muted)',
            justifyContent: isJarvis ? 'flex-start' : 'flex-end',
            width: '100%',
          }}
        >
          {isJarvis ? (
            <>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>JARVIS Maestro</span>
              <span
                style={{
                  fontSize: '0.68rem',
                  padding: '1px 8px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(217, 119, 87, 0.12)',
                  color: 'var(--accent-color)',
                  border: '1px solid rgba(217, 119, 87, 0.3)',
                  fontWeight: 600,
                }}
              >
                Multi-Agent v1.0
              </span>
              <span>·</span>
              <span>{message.timestamp}</span>

              {typeof window !== 'undefined' && 'speechSynthesis' in window && displayText && (
                <button
                  type="button"
                  onClick={handleToggleSpeech}
                  className="btn btn-ghost"
                  style={{
                    padding: '1px 6px',
                    fontSize: '0.68rem',
                    color: isSpeaking ? 'var(--text-primary)' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginLeft: '4px',
                  }}
                  title={isSpeaking ? 'Parar leitura da resposta' : 'Ouvir resposta em voz alta (Offline)'}
                >
                  {isSpeaking ? <VolumeX size={11} /> : <Volume2 size={11} />}
                  <span>{isSpeaking ? 'Parar' : 'Ouvir'}</span>
                </button>
              )}
            </>
          ) : (
            <>
              <span>{message.timestamp}</span>
              <span>·</span>
              <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Você</span>
            </>
          )}
        </div>

        {/* Message Bubble Card */}
        <div
          style={{
            backgroundColor: isJarvis ? 'transparent' : 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            padding: isJarvis ? '4px 0 10px 0' : '10px 16px',
            borderRadius: isJarvis ? '0' : '18px 18px 4px 18px',
            border: isJarvis ? 'none' : '1px solid var(--border-color)',
            boxShadow: isJarvis ? 'none' : '0 4px 14px rgba(0, 0, 0, 0.25)',
            width: isJarvis ? '100%' : 'fit-content',
            maxWidth: '100%',
          }}
        >
          {/* Painel de Raciocínio & Especialistas (Manus / Claude Style) */}
          {isJarvis && task && (task.classified_intent || (task.plan_steps && task.plan_steps.length > 0)) && (
            <div
              style={{
                marginBottom: '12px',
                paddingBottom: '10px',
                borderBottom: '1px solid var(--border-color)',
              }}
            >
              <button
                type="button"
                onClick={() => setShowReasoning(!showReasoning)}
                className="btn btn-ghost"
                style={{
                  padding: '3px 8px',
                  fontSize: '0.72rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: 'var(--text-secondary)',
                }}
              >
                <span>
                  {showReasoning ? 'Ocultar Raciocínio' : 'Ver Raciocínio'}
                </span>
                {showReasoning ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>

              {showReasoning && (
                <div
                  style={{
                    marginTop: '8px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    fontSize: '0.76rem',
                  }}
                >
                  {task.classified_intent && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Intenção:</span>
                      <span className="badge badge-info" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                        {INTENT_LABELS[task.classified_intent] || task.classified_intent}
                      </span>
                    </div>
                  )}

                  {task.selected_agents && task.selected_agents.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <Users size={12} color="var(--text-muted)" />
                      <span style={{ color: 'var(--text-muted)' }}>Especialistas selecionados:</span>
                      {task.selected_agents.map((ag: string) => (
                        <span
                          key={ag}
                          className="badge badge-info"
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 500,
                            padding: '1px 6px',
                          }}
                        >
                          {getAgentLabel(ag)}
                        </span>
                      ))}
                    </div>
                  )}

                  {task.plan_steps && task.plan_steps.length > 0 && (
                    <div style={{ marginTop: '4px' }}>
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
                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>
                        Deliberações dos Especialistas:
                      </span>
                      {task.agent_outputs.map((out: any, idx: number) => (
                        <div
                          key={idx}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(0, 0, 0, 0.25)',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
                            <span style={{ fontWeight: 600, color: 'var(--accent-color)' }}>
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
                          {out.evidence && out.evidence.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                              {out.evidence.slice(0, 3).map((ev: string, eIdx: number) => (
                                <span key={eIdx} style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>
                                  • {ev}
                                </span>
                              ))}
                            </div>
                          )}
                          {out.blockers && out.blockers.length > 0 && (
                            <div style={{ marginTop: '4px', color: 'var(--danger-color, #ef4444)', fontSize: '0.68rem' }}>
                              {out.blockers.map((blocker: string, bIdx: number) => (
                                <div key={bIdx}>Bloqueio: {blocker}</div>
                              ))}
                            </div>
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
                    backgroundColor: 'rgba(217, 119, 87, 0.08)',
                    border: '1px solid rgba(217, 119, 87, 0.2)',
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
                        backgroundColor: '#f6ad92',
                        animation: 'pulse 1.2s infinite ease-in-out 0.2s',
                      }}
                    />
                    <div
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        backgroundColor: '#fed7aa',
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
                        {record.model_name} · {record.provider}
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
                            title={`Avaliar com ${rating} de 5`}
                            aria-label={`Avaliar ${record.model_name} com ${rating} de 5`}
                            style={{
                              border: '1px solid var(--border-color)',
                              borderRadius: '6px',
                              background: 'transparent',
                              color: 'var(--text-secondary)',
                              cursor: feedbackLoadingId === record.id ? 'wait' : 'pointer',
                              padding: '5px 7px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              fontSize: '0.70rem',
                            }}
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

          {/* Card de Entrega Limpo do Projeto para o Usuário Final */}
          {projectSlug && (
            <div
              style={{
                marginTop: '16px',
                padding: '14px 18px',
                borderRadius: '12px',
                backgroundColor: 'rgba(217, 119, 87, 0.08)',
                border: '1px solid rgba(217, 119, 87, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(217, 119, 87, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent-color)',
                  }}
                >
                  <Sparkles size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.90rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Aplicativo Pronto: {projectSlug}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Arquivos salvos em seu computador: <code>workspace/{projectSlug}</code>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (artifact) {
                      onOpenArtifact(artifact);
                    } else {
                      window.open(`/api/v1/workspace/projects/${projectSlug}/preview`, '_blank');
                    }
                  }}
                  className="btn btn-primary"
                  style={{
                    fontSize: '0.80rem',
                    padding: '7px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: 'var(--accent-color)',
                    color: '#fff',
                    boxShadow: '0 2px 8px rgba(217, 119, 87, 0.3)',
                  }}
                >
                  <Globe size={15} />
                  <span>Visualizar no Navegador</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenFolder(projectSlug)}
                  className="btn btn-secondary"
                  style={{
                    fontSize: '0.80rem',
                    padding: '7px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  title="Abre o Windows Explorer com foco na pasta deste projeto"
                >
                  <FolderOpen size={15} color="#38bdf8" />
                  <span>Pegar Arquivos no Meu PC</span>
                </button>
              </div>
            </div>
          )}

          {/* Banner de Aprovação Pendente */}
          {task?.approval_required && (
            <div
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                padding: '10px 14px',
                borderRadius: '8px',
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
                <strong>Aprovação Humana Requerida:</strong> A alteração no disco está pendente de autorização no{' '}
                <b>Approval Center</b>.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Avatar Usuário Terracota Clássico */}
      {!isJarvis && (
        <div
          style={{
            width: '26px',
            height: '26px',
            borderRadius: '50%',
            backgroundColor: 'var(--accent-color)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: '2px',
            fontWeight: 600,
            fontSize: '0.72rem',
            boxShadow: '0 2px 8px rgba(217, 119, 87, 0.35)',
          }}
        >
          {userProfile?.displayName ? userProfile.displayName.charAt(0).toUpperCase() : 'V'}
        </div>
      )}
    </div>
  );
});
