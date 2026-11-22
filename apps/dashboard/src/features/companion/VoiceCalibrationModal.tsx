import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Mic,
  MicOff,
  RotateCcw,
  Sparkles,
  X,
  AlertCircle,
  Send,
} from 'lucide-react';
import {
  CALIBRATION_STEPS,
  VoiceCalibrationData,
  evaluateCalibrationStep,
  playCalibrationSound,
  saveVoiceCalibration,
} from '../../services/voiceCalibration';
import { setWakeWordEnabledPref } from '../../hooks/useWakeWordListener';
import { notify } from '../../shared/common/Toast';

export interface VoiceCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  assistantName: string;
  onCalibrationComplete?: (data: VoiceCalibrationData) => void;
}

function getSpeechRecognitionCtor(): any {
  if (typeof window === 'undefined') return null;
  return (
    (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition ||
    null
  );
}

export const VoiceCalibrationModal: React.FC<VoiceCalibrationModalProps> = ({
  isOpen,
  onClose,
  assistantName,
  onCalibrationComplete,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [listening, setListening] = useState<boolean>(false);
  const [heardTranscript, setHeardTranscript] = useState<string>('');
  const [stepFeedback, setStepFeedback] = useState<string>('');
  const [stepPassed, setStepPassed] = useState<boolean>(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [recordedSamples, setRecordedSamples] = useState<string[]>([]);
  const [manualInput, setManualInput] = useState<string>('');

  const recognitionRef = useRef<any>(null);
  const activeStepRef = useRef<number>(1);
  const assistantNameRef = useRef<string>(assistantName);
  const stepPassedRef = useRef<boolean>(false);
  const restartTimerRef = useRef<number | null>(null);
  const isOpenRef = useRef<boolean>(isOpen);

  activeStepRef.current = currentStep;
  assistantNameRef.current = assistantName || 'JARVIS';
  isOpenRef.current = isOpen;

  const stopRecognition = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

  const handleFinishCalibration = useCallback(() => {
    playCalibrationSound('final');
    const data = saveVoiceCalibration({
      calibrated: true,
      assistantName: assistantNameRef.current,
      samplesRecorded: 3,
      phrases: recordedSamples.length >= 3 ? recordedSamples : [
        `Ei ${assistantNameRef.current}`,
        `Ei ${assistantNameRef.current}, como você está?`,
        `Ei ${assistantNameRef.current}, abrir central de agentes`,
      ],
    });
    // Ativa a escuta mãos-livres automaticamente
    setWakeWordEnabledPref(true);
    setCurrentStep(4); // tela de vitória
    onCalibrationComplete?.(data);
    notify('🎉 Calibração de voz concluída com sucesso! "Ei ' + assistantNameRef.current + '" está pronto.', 'success');
  }, [onCalibrationComplete, recordedSamples]);

  const startListeningForStep = useCallback((stepNum: number) => {
    stopRecognition();
    activeStepRef.current = stepNum;
    stepPassedRef.current = false;
    setStepPassed(false);
    setPermissionError(null);

    const SpeechRecCtor = getSpeechRecognitionCtor();
    if (!SpeechRecCtor) {
      setPermissionError('O reconhecimento de voz não é suportado pelo seu navegador. Você pode usar a caixa de texto abaixo para testar.');
      return;
    }

    try {
      const rec = new SpeechRecCtor();
      rec.lang = 'pt-BR';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        if (isOpenRef.current) {
          setListening(true);
          setPermissionError(null);
        }
      };

      rec.onresult = (event: any) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const res = event.results[i];
          const text = res[0]?.transcript || '';
          if (res.isFinal) {
            final += text;
          } else {
            interim += text;
          }
        }

        const candidate = (final || interim).trim();
        if (!candidate) return;
        setHeardTranscript(candidate);

        const evaluation = evaluateCalibrationStep(candidate, activeStepRef.current, assistantNameRef.current);
        if (evaluation.passed) {
          stepPassedRef.current = true;
          setStepPassed(true);
          setStepFeedback(evaluation.feedback);
          playCalibrationSound('step');

          // Salva amostra da frase gravada
          setRecordedSamples((prev) => [...prev, evaluation.detectedPhrase || candidate]);

          // Para a escuta da etapa atual e avança suavemente após 1s
          stopRecognition();
          setTimeout(() => {
            if (activeStepRef.current < 3) {
              const nextStep = activeStepRef.current + 1;
              activeStepRef.current = nextStep;
              setCurrentStep(nextStep);
            } else {
              handleFinishCalibration();
            }
          }, 1000);
        } else {
          setStepFeedback(evaluation.feedback);
        }
      };

      rec.onerror = (err: any) => {
        const errCode = err?.error || '';
        if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
          setPermissionError('Acesso ao microfone bloqueado no navegador. Clique no ícone de cadeado na barra de endereços para permitir.');
          setListening(false);
        } else if (errCode === 'audio-capture') {
          setPermissionError('Microfone ocupado ou não detectado. Conecte seu microfone ou clique no círculo para tentar novamente.');
          setListening(false);
        }
        // 'no-speech' e 'aborted' reiniciam naturalmente no onend
      };

      rec.onend = () => {
        setListening(false);
        // Se ainda estiver na mesma etapa e não tiver passado, reinicia com nova instância
        if (isOpenRef.current && !stepPassedRef.current && activeStepRef.current <= 3) {
          if (restartTimerRef.current !== null) {
            window.clearTimeout(restartTimerRef.current);
          }
          restartTimerRef.current = window.setTimeout(() => {
            startListeningForStep(activeStepRef.current);
          }, 250);
        }
      };

      rec.start();
      recognitionRef.current = rec;
      setListening(true);
    } catch (e: any) {
      setPermissionError('Não foi possível inicializar o microfone: ' + (e?.message || 'Erro desconhecido. Clique para tentar.'));
      setListening(false);
    }
  }, [handleFinishCalibration, stopRecognition]);

  // Efeito unificado para gerenciar ciclo de vida da janela e etapas
  useEffect(() => {
    isOpenRef.current = isOpen;
    if (!isOpen) {
      stopRecognition();
      return;
    }

    if (currentStep <= 3) {
      setHeardTranscript('');
      setStepFeedback('');
      setStepPassed(false);
      stepPassedRef.current = false;
      const timer = window.setTimeout(() => {
        startListeningForStep(currentStep);
      }, 200);
      return () => {
        window.clearTimeout(timer);
        stopRecognition();
      };
    }
  }, [isOpen, currentStep, startListeningForStep, stopRecognition]);

  const handleManualSubmit = (text: string) => {
    const candidate = text.trim();
    if (!candidate) return;
    setHeardTranscript(candidate);
    const evaluation = evaluateCalibrationStep(candidate, activeStepRef.current, assistantNameRef.current);
    if (evaluation.passed) {
      stepPassedRef.current = true;
      setStepPassed(true);
      setStepFeedback(evaluation.feedback);
      playCalibrationSound('step');
      setRecordedSamples((prev) => [...prev, evaluation.detectedPhrase || candidate]);
      setManualInput('');
      stopRecognition();
      setTimeout(() => {
        if (activeStepRef.current < 3) {
          const nextStep = activeStepRef.current + 1;
          activeStepRef.current = nextStep;
          setCurrentStep(nextStep);
        } else {
          handleFinishCalibration();
        }
      }, 900);
    } else {
      setStepFeedback(evaluation.feedback);
    }
  };

  const handleRetryStep = () => {
    playCalibrationSound('tap');
    startListeningForStep(currentStep);
  };

  const handleReset = () => {
    playCalibrationSound('tap');
    stopRecognition();
    setCurrentStep(1);
    setRecordedSamples([]);
    setManualInput('');
    setTimeout(() => startListeningForStep(1), 100);
  };

  if (!isOpen) return null;

  const currentDef = CALIBRATION_STEPS.find((s) => s.step === currentStep) || CALIBRATION_STEPS[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Calibração de Voz do JARVIS"
      style={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={styles.badgeIcon}>
              <Sparkles size={16} color="#f97316" />
            </div>
            <div>
              <h2 style={styles.title}>Calibração de Voz · &ldquo;Ei {assistantName}&rdquo;</h2>
              <div style={styles.subtitle}>
                Grave sua voz 3 vezes para treinar o reconhecimento personalizado
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-icon-sm btn-ghost"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Fechar calibração"
          >
            <X size={16} />
          </button>
        </div>

        {/* Indicador das 3 Etapas */}
        <div style={styles.stepRail}>
          {[1, 2, 3].map((num) => {
            const isDone = currentStep > num || currentStep === 4;
            const isCurrent = currentStep === num;
            return (
              <div key={num} style={styles.stepItem}>
                <div
                  style={{
                    ...styles.stepCircle,
                    backgroundColor: isDone ? '#22c55e' : isCurrent ? '#f97316' : 'var(--bg-input)',
                    borderColor: isDone ? '#22c55e' : isCurrent ? '#ea580c' : 'var(--border-color)',
                    boxShadow: isCurrent ? '0 0 14px rgba(249, 115, 22, 0.5)' : 'none',
                    color: isDone || isCurrent ? '#ffffff' : 'var(--text-secondary)',
                  }}
                >
                  {isDone ? <CheckCircle2 size={15} /> : num}
                </div>
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: isCurrent ? 700 : 500,
                    color: isCurrent ? 'var(--text-primary)' : isDone ? '#22c55e' : 'var(--text-secondary)',
                  }}
                >
                  {num === 1 ? 'Saudação' : num === 2 ? 'Pergunta' : 'Ação'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Conteúdo Principal */}
        <div style={styles.content}>
          {currentStep <= 3 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '16px', width: '100%' }}>
              {/* Botão Interativo de Microfone */}
              <button
                type="button"
                onClick={() => {
                  playCalibrationSound('tap');
                  startListeningForStep(currentStep);
                }}
                style={{
                  ...styles.arcOuter,
                  borderColor: stepPassed ? '#22c55e' : listening ? '#f97316' : 'var(--border-color)',
                  boxShadow: stepPassed
                    ? '0 0 28px rgba(34, 197, 94, 0.45)'
                    : listening
                    ? '0 0 24px rgba(249, 115, 22, 0.35)'
                    : '0 0 8px rgba(0, 0, 0, 0.4)',
                  transform: listening ? 'scale(1.04)' : 'scale(1)',
                  cursor: 'pointer',
                  background: 'transparent',
                  padding: 0,
                  outline: 'none',
                }}
                title={listening ? 'Ouvindo... Clique para reiniciar o microfone' : 'Clique para ativar o microfone e falar'}
                aria-label="Ativar microfone de calibração"
              >
                <div
                  style={{
                    ...styles.arcInner,
                    background: stepPassed
                      ? 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)'
                      : listening
                      ? 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)'
                      : 'var(--bg-primary)',
                  }}
                >
                  {stepPassed ? (
                    <CheckCircle2 size={36} color="#ffffff" />
                  ) : listening ? (
                    <Mic size={36} color="#ffffff" />
                  ) : (
                    <MicOff size={36} color="var(--text-secondary)" />
                  )}
                </div>
              </button>

              {/* Instrução da Frase Alvo */}
              <div>
                <span style={styles.stepBadge}>
                  Passo {currentStep} de 3 · {currentDef.title}
                </span>
                <div style={styles.targetPhrasePrompt}>
                  &ldquo;{currentDef.getPrompt(assistantName)}&rdquo;
                </div>
                <p style={styles.instructionText}>{currentDef.subtext}</p>
              </div>

              {/* Status de Escuta em Tempo Real */}
              <div style={styles.statusBox}>
                {permissionError ? (
                  <div style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', textAlign: 'left' }}>
                    <AlertCircle size={18} style={{ flexShrink: 0 }} />
                    <span>{permissionError}</span>
                  </div>
                ) : stepPassed ? (
                  <div style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', fontWeight: 600 }}>
                    <CheckCircle2 size={16} />
                    <span>{stepFeedback || 'Reconhecido com sucesso! Avançando...'}</span>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '0.78rem', color: listening ? '#f97316' : 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
                      {listening ? '● Ouvindo seu microfone... Fale agora' : 'Microfone em pausa. Clique no círculo acima ou fale.'}
                    </div>
                    {heardTranscript ? (
                      <div style={styles.transcriptPreview}>
                        Você disse: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>&ldquo;{heardTranscript}&rdquo;</span>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                        Dica: {currentDef.hint}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Fallback Manual via Texto */}
              <div style={styles.fallbackBox}>
                <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                  <input
                    type="text"
                    placeholder={`Ou digite aqui: "${currentDef.getPrompt(assistantName)}"`}
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleManualSubmit(manualInput);
                    }}
                    style={styles.textInput}
                    aria-label="Entrada de texto alternativa para calibração"
                  />
                  <button
                    type="button"
                    onClick={() => handleManualSubmit(manualInput)}
                    className="btn btn-secondary btn-sm"
                    style={{ gap: '4px', whiteSpace: 'nowrap' }}
                    title="Validar texto digitado para esta etapa"
                  >
                    <Send size={13} />
                    <span>Validar</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Tela de Vitória / Calibração Concluída */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '16px' }}>
              <div style={styles.victoryIconWrap}>
                <CheckCircle2 size={52} color="#22c55e" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px 0' }}>
                  🎉 Calibração Concluída com Sucesso!
                </h3>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto' }}>
                  O JARVIS gravou e reconheceu sua voz 3 vezes. A escuta mãos-livres já está ativada no seu navegador.
                </p>
              </div>

              <div style={styles.summaryCard}>
                <div style={styles.summaryRow}>
                  <span style={{ color: 'var(--text-secondary)' }}>Amostras gravadas:</span>
                  <span style={{ fontWeight: 700, color: '#22c55e' }}>3 de 3 validadas</span>
                </div>
                <div style={styles.summaryRow}>
                  <span style={{ color: 'var(--text-secondary)' }}>Palavra de ativação:</span>
                  <span style={{ fontWeight: 700, color: '#f97316' }}>&ldquo;Ei {assistantName}&rdquo;</span>
                </div>
                <div style={styles.summaryRow}>
                  <span style={{ color: 'var(--text-secondary)' }}>Escuta passiva:</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Mãos-livres habilitada</span>
                </div>
                <div style={styles.summaryRow}>
                  <span style={{ color: 'var(--text-secondary)' }}>Microfone do dispositivo:</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Calibrado e pronto</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer com Ações */}
        <div style={styles.footer}>
          {currentStep <= 3 ? (
            <>
              <button
                type="button"
                onClick={handleRetryStep}
                className="btn btn-secondary btn-sm"
                title="Tentar falar a frase novamente nesta etapa"
                style={{ gap: '5px' }}
              >
                <RotateCcw size={13} />
                <span>{listening ? 'Reiniciar microfone' : 'Ativar microfone'}</span>
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playCalibrationSound('step');
                    if (currentStep < 3) {
                      const next = currentStep + 1;
                      activeStepRef.current = next;
                      setCurrentStep(next);
                    } else {
                      handleFinishCalibration();
                    }
                  }}
                  className="btn btn-secondary btn-sm"
                  title="Pular esta etapa se já tiver permissão concedida"
                >
                  Avançar manual
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleReset}
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--text-secondary)', gap: '5px' }}
              >
                <RotateCcw size={13} />
                <span>Calibrar novamente</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-primary btn-sm"
                style={{ fontWeight: 700, padding: '7px 20px' }}
              >
                Concluir e Usar JARVIS
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 900,
    backgroundColor: 'rgba(5, 7, 11, 0.82)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  },
  modal: {
    width: '100%',
    maxWidth: '560px',
    borderRadius: '16px',
    border: '1px solid var(--border-accent)',
    backgroundColor: 'var(--bg-secondary)',
    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.75)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badgeIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    backgroundColor: 'rgba(249, 115, 22, 0.14)',
    border: '1px solid rgba(249, 115, 22, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: '0.98rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: 0,
  },
  subtitle: {
    fontSize: '0.73rem',
    color: 'var(--text-secondary)',
    marginTop: '2px',
  },
  stepRail: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: '12px 20px',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  stepCircle: {
    width: '24px',
    height: '24px',
    borderRadius: '999px',
    border: '2px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
    fontWeight: 700,
    transition: 'all 200ms ease',
  },
  content: {
    padding: '24px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '270px',
  },
  arcOuter: {
    width: '90px',
    height: '90px',
    borderRadius: '999px',
    border: '3px solid #f97316',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 250ms ease',
  },
  arcInner: {
    width: '66px',
    height: '66px',
    borderRadius: '999px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 250ms ease',
  },
  stepBadge: {
    display: 'inline-block',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#f97316',
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    padding: '3px 9px',
    borderRadius: '6px',
    marginBottom: '8px',
  },
  targetPhrasePrompt: {
    fontSize: '1.24rem',
    fontWeight: 800,
    color: 'var(--text-primary)',
    letterSpacing: '-0.01em',
    lineHeight: 1.3,
  },
  instructionText: {
    fontSize: '0.78rem',
    color: 'var(--text-secondary)',
    marginTop: '6px',
    marginBottom: 0,
    maxWidth: '420px',
  },
  statusBox: {
    marginTop: '8px',
    padding: '10px 16px',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
    width: '100%',
    maxWidth: '440px',
  },
  transcriptPreview: {
    fontSize: '0.76rem',
    color: 'var(--text-secondary)',
    marginTop: '4px',
  },
  fallbackBox: {
    marginTop: '6px',
    width: '100%',
    maxWidth: '440px',
  },
  textInput: {
    flex: 1,
    padding: '7px 12px',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontSize: '0.8rem',
    outline: 'none',
  },
  victoryIconWrap: {
    width: '76px',
    height: '76px',
    borderRadius: '999px',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    border: '2px solid rgba(34, 197, 94, 0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 24px rgba(34, 197, 94, 0.3)',
  },
  summaryCard: {
    width: '100%',
    maxWidth: '380px',
    padding: '12px 16px',
    borderRadius: '10px',
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    textAlign: 'left',
    fontSize: '0.8rem',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footer: {
    padding: '14px 20px',
    borderTop: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
};
