import { useState, useEffect, useRef } from 'react';
import {
  sendChatMessage,
  streamChatMessage,
  savePonytailLevel,
  rollbackWorkspaceProject,
  exportChatSessionMarkdown,
  transcribeAudio,
} from '../api';
import { ChatMessage } from '../types';
import { notify } from '../components/common/Toast';
import { CanvasArtifact } from '../components/chat/ArtifactCanvas';
import {
  saveSessionMessagesLocally,
  getLocalSessionsCatalog,
  saveLocalSessionsCatalog,
} from '../components/chat/ChatHistoryDrawer';

const STORAGE_MESSAGES_KEY = 'jarvis_chat_messages_v1';
const STORAGE_SESSION_KEY = 'jarvis_chat_session_id_v1';

export const INITIAL_GREETING: ChatMessage = {
  sender: 'jarvis',
  text: 'Olá! Sou o JARVIS Master. Posso orquestrar 26 especialistas locais para criar projetos completos (Python, Java, C#, Go, Kotlin, Flutter ou Web), analisar arquitetura, auditar vulnerabilidades e aplicar alterações físicas no computador.',
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
};

export function generateSessionId(): string {
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
}

export function useChatStream(
  activeProjectId: string | null,
  activeProjectName: string | null,
  onArtifactDetected?: (artifact: CanvasArtifact) => void,
  onProjectsNeedRefresh?: () => void
) {
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamTrackRef = useRef<MediaStreamTrack[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const vadTimerRef = useRef<any>(null);
  const isListeningRef = useRef<boolean>(false);

  // Mensagens carregadas do localStorage ou boas-vindas
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_MESSAGES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Falha ao ler mensagens do localStorage:', e);
    }
    return [INITIAL_GREETING];
  });

  // Session ID ativo
  const [sessionId, setSessionId] = useState<string>(() => {
    try {
      const savedSession = localStorage.getItem(STORAGE_SESSION_KEY);
      if (savedSession) return savedSession;
    } catch (e) {
      console.warn('Falha ao ler sessionId do localStorage:', e);
    }
    const newId = generateSessionId();
    try {
      localStorage.setItem(STORAGE_SESSION_KEY, newId);
    } catch {}
    return newId;
  });

  // Persistência automática otimizada (apenas quando inativo para não bloquear a thread em streaming)
  useEffect(() => {
    if (loading) return;
    try {
      localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(messages));
      saveSessionMessagesLocally(sessionId, messages);
    } catch (e) {
      console.warn('Falha ao salvar mensagens no localStorage:', e);
    }
  }, [messages, sessionId, loading]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SESSION_KEY, sessionId);
    } catch (e) {
      console.warn('Falha ao salvar sessionId no localStorage:', e);
    }
  }, [sessionId]);

  // Limpeza de recursos de áudio do microfone e analisador de silêncio
  const cleanupAudio = () => {
    if (vadTimerRef.current) {
      clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    streamTrackRef.current.forEach((t) => {
      try {
        t.stop();
      } catch {}
    });
    streamTrackRef.current = [];
    isListeningRef.current = false;
    setIsListening(false);
  };

  // Entrada por Voz Inteligente (100% nativa via Whisper Groq/LPU - Sem dependência do Google Speech)
  const handleToggleVoiceInput = async (onTranscript: (text: string) => void) => {
    // Se já estiver gravando, para e transcreve imediatamente
    if (isListeningRef.current) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      } else {
        cleanupAudio();
      }
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      notify('Microfone requer contexto seguro. Acesse o painel pelo endereço http://127.0.0.1:8000.', 'warning');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamTrackRef.current = stream.getTracks();
      audioChunksRef.current = [];

      let mimeType = '';
      const candidateTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/wav',
      ];
      for (const candidate of candidateTypes) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(candidate)) {
          mimeType = candidate;
          break;
        }
      }

      const recorderOptions: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        cleanupAudio();

        if (audioChunksRef.current.length === 0) return;

        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType || 'audio/webm',
        });

        if (audioBlob.size < 600) {
          notify('Áudio muito curto. Clique no microfone e fale seu comando.', 'info');
          return;
        }

        notify('Transcrevendo sua fala com Whisper ultra-rápido...', 'info');
        try {
          const text = await transcribeAudio(audioBlob);
          if (text && text.trim()) {
            onTranscript(text.trim());
            notify(`Comando de voz capturado: "${text.trim()}"`, 'success');
          } else {
            notify('Nenhuma fala audível detectada. Tente falar mais próximo ao microfone.', 'warning');
          }
        } catch (err: any) {
          notify(`Falha ao transcrever: ${err.message}`, 'error');
        }
      };

      // Inicia captura de áudio com fatias de 200ms
      mediaRecorder.start(200);
      isListeningRef.current = true;
      setIsListening(true);
      notify('Microfone ativado! Fale agora... (transcrição automática ao pausar ou clique para enviar)', 'info');

      // Detecção de Silêncio Inteligente (VAD via Web Audio API)
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);

          const pcmData = new Uint8Array(analyser.frequencyBinCount);
          let hasSpoken = false;
          let silenceStartTime = Date.now();

          vadTimerRef.current = setInterval(() => {
            if (!isListeningRef.current || !mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
              return;
            }
            analyser.getByteFrequencyData(pcmData);
            let sum = 0;
            for (let i = 0; i < pcmData.length; i++) {
              sum += pcmData[i];
            }
            const avgVolume = sum / pcmData.length;

            if (avgVolume > 14) {
              hasSpoken = true;
              silenceStartTime = Date.now();
            } else if (hasSpoken && Date.now() - silenceStartTime > 1800) {
              // Pausa de 1.8 segundos após a fala: finaliza gravação automaticamente
              if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
              }
            }
          }, 150);
        }
      } catch (vadErr) {
        console.warn('VAD não suportado, usando modo clique-para-parar:', vadErr);
      }
    } catch (mediaErr: any) {
      cleanupAudio();
      const errName = mediaErr.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        notify('Acesso ao microfone negado. Clique no ícone de permissão na barra do navegador (127.0.0.1) e permita o microfone.', 'warning');
        return;
      }
      if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        notify('Nenhum microfone detectado no seu computador.', 'warning');
        return;
      }
      console.warn('Erro ao acessar microfone:', mediaErr);
      notify(`Erro ao acessar microfone: ${mediaErr.message || 'Verifique as permissões de áudio.'}`, 'warning');
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
    setMessages((prev) => {
      const next = [...prev];
      const lastIdx = next.length - 1;
      if (lastIdx >= 0 && next[lastIdx].sender === 'jarvis') {
        const cur = next[lastIdx].text;
        next[lastIdx] = {
          ...next[lastIdx],
          text: cur ? `${cur}\n\n*(Geração interrompida pelo usuário)*` : 'Geração interrompida pelo usuário.',
        };
      }
      return next;
    });
  };

  const handleNewChat = () => {
    const newSession = generateSessionId();
    setSessionId(newSession);
    setMessages([INITIAL_GREETING]);
  };

  const handleExportChat = async () => {
    try {
      if (messages.length === 0) {
        notify('Nenhuma mensagem na conversa para exportar', 'info');
        return;
      }
      let mdText = '';
      try {
        mdText = await exportChatSessionMarkdown(sessionId);
      } catch {
        mdText = `# 📜 Conversa JARVIS AI Hub\n**Sessão:** \`${sessionId}\`\n\n---\n\n` +
          messages.map((m) => `### ${m.sender === 'user' ? '👤 Usuário' : '🤖 JARVIS'} (${m.timestamp}):\n${m.text}\n`).join('\n---\n\n');
      }

      const blob = new Blob([mdText], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `conversa-jarvis-${sessionId.slice(0, 8)}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notify('Histórico exportado com sucesso em .md!', 'success');
    } catch (err: any) {
      notify(`Erro ao exportar chat: ${err.message}`, 'error');
    }
  };

  const handleSubmit = async (promptToSend: string, modelOverride?: string) => {
    const trimmed = promptToSend.trim();
    if (!trimmed || loading) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const lowerCmd = trimmed.toLowerCase();

    // --- INTERCEPTOR DE COMANDOS RÁPIDOS LOCAIS ---
    if (lowerCmd === '/export') {
      handleExportChat();
      return;
    }

    if (lowerCmd === '/clear') {
      setMessages([INITIAL_GREETING]);
      notify('Histórico da conversa limpo!', 'info');
      return;
    }

    if (lowerCmd.startsWith('/ponytail')) {
      const parts = lowerCmd.split(' ');
      const sub = parts[1] || 'senior';
      let targetLevel = 'senior';
      if (['off', 'desligado', 'desativar'].includes(sub)) targetLevel = 'off';
      else if (['lite', 'leve'].includes(sub)) targetLevel = 'lite';
      else if (['ultra', 'minimo'].includes(sub)) targetLevel = 'ultra';

      try {
        await savePonytailLevel(targetLevel);
        notify(`Modo Ponytail atualizado para '${targetLevel.toUpperCase()}'!`, 'success');
      } catch (e) {
        // ignora
      }

      setMessages((prev) => [
        ...prev,
        { sender: 'user', text: trimmed, timestamp: timeStr },
        {
          sender: 'jarvis',
          text: `🌿 **Modo Ponytail Atualizado: ${targetLevel.toUpperCase()}**\n\n` +
            (targetLevel === 'off'
              ? 'O modo Ponytail foi desativado. Os agentes operarão em modo de criação livre.'
              : `A **Escada da Preguiça Técnica** (Ladder of Laziness) foi ativada com nível **${targetLevel}**.\n\n` +
                '1. **YAGNI Estrito**: Não crie código que não seja estritamente necessário.\n' +
                '2. **Reaproveitamento**: Reutilize funções e classes já existentes no repositório.\n' +
                '3. **Standard Library**: Prefira recursos nativos da linguagem ou plataforma (evite instalar pacotes redundantes).\n' +
                '4. **Menor Código Possível**: Entregue soluções limpas, concisas e fáceis de manter.'),
          timestamp: timeStr,
        },
      ]);
      return;
    }

    if (lowerCmd.startsWith('/model')) {
      const parts = trimmed.split(' ');
      const requestedModel = parts.slice(1).join(' ').trim();
      if (!requestedModel) {
        setMessages((prev) => [
          ...prev,
          { sender: 'user', text: trimmed, timestamp: timeStr },
          {
            sender: 'jarvis',
            text: '🦙 **Comando /model:**\n\n' +
              'Uso: `/model <nome_do_modelo>`\n\n' +
              'Modelos locais disponíveis no ecossistema:\n' +
              '- `llama3.2:3b` (Ultra leve e rápido para respostas curtas)\n' +
              '- `qwen2.5-coder:7b` (Especialista em geração e refatoração de código)\n' +
              '- `qwen2.5:7b` (Raciocínio geral e arquitetura)\n\n' +
              '*Exemplo:* `/model qwen2.5-coder:7b`',
            timestamp: timeStr,
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { sender: 'user', text: trimmed, timestamp: timeStr },
        {
          sender: 'jarvis',
          text: `🦙 **Modelo de Inferência Configurado: \`${requestedModel}\`**\n\n` +
            `O JARVIS Master agora priorizará o modelo **${requestedModel}** para as próximas gerações e orquestrações de código.`,
          timestamp: timeStr,
        },
      ]);
      notify(`Modelo de inferência alterado para: ${requestedModel}`, 'success');
      return;
    }

    if (lowerCmd === '/rollback' || lowerCmd === '/undo' || lowerCmd === '/desfazer') {
      if (!activeProjectId) {
        setMessages((prev) => [
          ...prev,
          { sender: 'user', text: trimmed, timestamp: timeStr },
          {
            sender: 'jarvis',
            text: '⚠️ **Nenhum projeto anexado ao Chat.**\n\n' +
              'Para desfazer uma alteração de código via Git rollback, anexe um projeto ao chat clicando no botão **"Anexar Projeto"** no topo.',
            timestamp: timeStr,
          },
        ]);
        return;
      }

      try {
        notify(`Executando rollback Git no projeto '${activeProjectName || activeProjectId}'...`, 'info');
        const res = await rollbackWorkspaceProject(activeProjectId);
        setMessages((prev) => [
          ...prev,
          { sender: 'user', text: trimmed, timestamp: timeStr },
          {
            sender: 'jarvis',
            text: `↩ **Rollback Git Executado:**\n\n` +
              (res.status === 'cannot_rollback'
                ? `ℹ️ *${res.message}*`
                : `✅ **${res.message}**\n\n- **Commit revertido**: \`${res.undone_commit}\`\n- **Estado atual do HEAD**: \`${res.current_head}\``),
            timestamp: timeStr,
          },
        ]);
        notify(res.message || 'Rollback concluído!', 'success');
      } catch (err: any) {
        notify(`Falha no rollback: ${err.message}`, 'error');
      }
      return;
    }

    if (lowerCmd === '/help' || lowerCmd === '/comandos') {
      setMessages((prev) => [
        ...prev,
        { sender: 'user', text: trimmed, timestamp: timeStr },
        {
          sender: 'jarvis',
          text: '🛠️ **Comandos Rápidos Disponíveis no JARVIS Studio:**\n\n' +
            '- `🌿 /ponytail [senior|lite|ultra|off]`: Ajusta a disciplina de código limpo e YAGNI.\n' +
            '- `🦙 /model <nome>`: Altera o modelo de inferência (ex: /model qwen2.5-coder:7b).\n' +
            '- `🏛️ /debate`: Aciona a Mesa Redonda Técnica entre Arquiteto, Cibersegurança e Revisor.\n' +
            '- `↩ /rollback`: Desfaz a última alteração de código via Git no projeto ativo.\n' +
            '- `🛡️ /audit`: Dispara auditoria profunda de segurança OWASP no projeto atual.\n' +
            '- `🧪 /test`: O Especialista em QA elabora a suíte completa de testes unitários.\n' +
            '- `📖 /doc`: O Arquiteto de Software documenta a arquitetura e gera Swagger/OpenAPI.\n' +
            '- `📥 /export`: Exporta o histórico da conversa em arquivo Markdown (.md).\n' +
            '- `🧹 /clear`: Limpa o histórico de mensagens da conversa atual.\n\n' +
            '*Você também pode clicar nos atalhos rápidos logo acima do campo de envio.*',
          timestamp: timeStr,
        },
      ]);
      return;
    }

    let finalPrompt = trimmed;
    if (lowerCmd === '/debate' || lowerCmd === '/mesaredonda' || lowerCmd === '/consenso') {
      finalPrompt = 'Realizem uma Mesa Redonda Técnica com Arquiteto, Cibersegurança e Revisor de Código para analisar a melhor abordagem arquitetural e de segurança para o projeto atual.';
    } else if (lowerCmd === '/audit') {
      finalPrompt = 'Atue como o Engenheiro de Cibersegurança e realize uma auditoria estrita de segurança no projeto atual, verificando vulnerabilidades OWASP Top 10, sanitização de inputs e mitigação de riscos.';
    } else if (lowerCmd === '/test') {
      finalPrompt = 'Atue como o Engenheiro de QA e elabore a suíte completa de testes unitários e de integração para o projeto atual, incluindo casos de borda e asserções claras.';
    } else if (lowerCmd === '/doc') {
      finalPrompt = 'Atue como o Arquiteto de Software e gere uma documentação técnica completa contendo visão geral, arquitetura, dependências e guia de execução.';
    }

    // Atualiza catálogo de sessões locais
    const catalog = getLocalSessionsCatalog();
    const existingIdx = catalog.findIndex((s) => s.id === sessionId);
    const title = finalPrompt.length > 50 ? finalPrompt.slice(0, 50) + '...' : finalPrompt;
    if (existingIdx >= 0) {
      catalog[existingIdx].updatedAt = new Date().toISOString();
      catalog[existingIdx].messageCount = messages.length + 2;
    } else {
      catalog.unshift({
        id: sessionId,
        title,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 2,
      });
    }
    saveLocalSessionsCatalog(catalog);

    setMessages((prev) => [
      ...prev,
      { sender: 'user', text: finalPrompt, timestamp: timeStr },
      { sender: 'jarvis', text: '', timestamp: timeStr },
    ]);
    setLoading(true);

    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    let accumulatedText = '';
    let metaInfo: any = null;

    try {
      await streamChatMessage(
        finalPrompt,
        activeProjectId || undefined,
        sessionId,
        (() => {
          let rafId: number | null = null;
          return (token: string) => {
            accumulatedText += token;
            if (rafId === null) {
              rafId = requestAnimationFrame(() => {
                rafId = null;
                setMessages((prev) => {
                  const next = [...prev];
                  const lastIdx = next.length - 1;
                  if (lastIdx >= 0 && next[lastIdx].sender === 'jarvis') {
                    next[lastIdx] = {
                      ...next[lastIdx],
                      text: accumulatedText,
                      taskData: metaInfo ? { ...metaInfo, final_summary: accumulatedText } : undefined,
                    };
                  }
                  return next;
                });
              });
            }
          };
        })(),
        (meta: any) => {
          metaInfo = meta;
        },
        (done: any) => {
          const finalText = done.final_summary || accumulatedText || 'Tarefa concluída.';
          setMessages((prev) => {
            const next = [...prev];
            const lastIdx = next.length - 1;
            if (lastIdx >= 0 && next[lastIdx].sender === 'jarvis') {
              next[lastIdx] = {
                ...next[lastIdx],
                text: finalText,
                taskData: {
                  ...metaInfo,
                  final_summary: finalText,
                  is_completed: done.is_completed,
                  approval_required: done.approval_required,
                  approval_id: done.approval_id,
                },
              };
            }
            return next;
          });

          // Detecta se a resposta contém payload JSON estruturado ou projeto/diff
          let parsedArtPayload = false;
          try {
            const trimmedFinal = finalText.trim();
            let jsonStr = '';
            if (trimmedFinal.startsWith('{') && trimmedFinal.endsWith('}')) {
              jsonStr = trimmedFinal;
            } else {
              const m = trimmedFinal.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
              if (m) jsonStr = m[1];
            }
            if (jsonStr) {
              const parsed = JSON.parse(jsonStr);
              if (parsed.artifact_payload && parsed.artifact_payload.code) {
                parsedArtPayload = true;
                if (onArtifactDetected) {
                  onArtifactDetected({
                    title: parsed.artifact_payload.title || 'Artefato de Código',
                    content: parsed.artifact_payload.code,
                    htmlContent: parsed.artifact_payload.language === 'html' ? parsed.artifact_payload.code : undefined,
                    mode: parsed.active_agent_mode,
                    planStatus: parsed.ui_layout_instructions?.plan_status,
                  });
                }
              }
            }
          } catch {}

          // Detecta projeto ou diff para abrir Canvas (caso não tenha vindo via JSON)
          if (!parsedArtPayload) {
            const prjMatch = finalText.match(/workspace[\\/]([a-zA-Z0-9_-]+)/i);
            const diffMatch = finalText.match(/```diff\n([\s\S]*?)\n```/);
            if (prjMatch || diffMatch) {
              if (onArtifactDetected) {
                onArtifactDetected({
                  title: prjMatch ? `Projeto: ${prjMatch[1]}` : 'Diff de Alterações',
                  projectId: prjMatch ? prjMatch[1] : undefined,
                  diffContent: diffMatch ? diffMatch[1] : undefined,
                  content: finalText,
                });
              }
              if (onProjectsNeedRefresh) {
                onProjectsNeedRefresh();
              }
            }
          }
        },
        (errStr: string) => {
          setMessages((prev) => {
            const next = [...prev];
            const lastIdx = next.length - 1;
            if (lastIdx >= 0 && next[lastIdx].sender === 'jarvis') {
              next[lastIdx] = {
                ...next[lastIdx],
                text: `[Erro no processamento]: ${errStr}`,
              };
            }
            return next;
          });
        },
        (statusPayload: any) => {
          setMessages((prev) => {
            const next = [...prev];
            const lastIdx = next.length - 1;
            if (lastIdx >= 0 && next[lastIdx].sender === 'jarvis') {
              next[lastIdx] = {
                ...next[lastIdx],
                statusMessage: statusPayload.message || 'JARVIS Maestro coordenando os especialistas...',
              };
            }
            return next;
          });
        },
        abortCtrl.signal,
        modelOverride
      );
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return;
      }
      // Fallback em bloco
      try {
        const response = await sendChatMessage(finalPrompt, activeProjectId || undefined, sessionId, modelOverride);
        const finalText = response.final_summary || 'Tarefa concluída pelo orquestrador.';
        setMessages((prev) => {
          const next = [...prev];
          const lastIdx = next.length - 1;
          if (lastIdx >= 0 && next[lastIdx].sender === 'jarvis') {
            next[lastIdx] = {
              sender: 'jarvis',
              text: finalText,
              taskData: response,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
          }
          return next;
        });

        let fallbackArtPayload = false;
        try {
          const trimmedFallback = finalText.trim();
          let jsonStr = '';
          if (trimmedFallback.startsWith('{') && trimmedFallback.endsWith('}')) {
            jsonStr = trimmedFallback;
          } else {
            const m = trimmedFallback.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
            if (m) jsonStr = m[1];
          }
          if (jsonStr) {
            const parsed = JSON.parse(jsonStr);
            if (parsed.artifact_payload && parsed.artifact_payload.code) {
              fallbackArtPayload = true;
              if (onArtifactDetected) {
                onArtifactDetected({
                  title: parsed.artifact_payload.title || 'Artefato de Código',
                  content: parsed.artifact_payload.code,
                  htmlContent: parsed.artifact_payload.language === 'html' ? parsed.artifact_payload.code : undefined,
                  mode: parsed.active_agent_mode,
                  planStatus: parsed.ui_layout_instructions?.plan_status,
                });
              }
            }
          }
        } catch {}

        if (!fallbackArtPayload) {
          const prjMatch = finalText.match(/workspace\/([a-zA-Z0-9_-]+)/);
          const diffMatch = finalText.match(/```diff\n([\s\S]*?)\n```/);
          if (prjMatch || diffMatch) {
            if (onArtifactDetected) {
              onArtifactDetected({
                title: prjMatch ? `Projeto: ${prjMatch[1]}` : 'Diff de Alterações',
                projectId: prjMatch ? prjMatch[1] : undefined,
                diffContent: diffMatch ? diffMatch[1] : undefined,
                content: finalText,
              });
            }
            if (onProjectsNeedRefresh) {
              onProjectsNeedRefresh();
            }
          }
        }
      } catch (fallbackErr: any) {
        setMessages((prev) => {
          const next = [...prev];
          const lastIdx = next.length - 1;
          if (lastIdx >= 0 && next[lastIdx].sender === 'jarvis') {
            next[lastIdx] = {
              sender: 'jarvis',
              text: `[Erro]: ${fallbackErr.message || 'Falha ao conectar com o backend'}`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
          }
          return next;
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return {
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
    handleSubmit,
  };
}
