import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccountStorageKey } from '../services/accountScope';
import { detectWakeWord } from '../services/voiceCompanion';
import { notify } from '../shared/common/Toast';

export const WAKE_WORD_PREF_KEY = 'jarvis_pref_wake_word_enabled';
export const VOICE_AUTO_SPEAK_PREF_KEY = 'jarvis_pref_voice_auto_speak';

export function getWakeWordEnabledPref(): boolean {
  try {
    const raw = localStorage.getItem(getAccountStorageKey(WAKE_WORD_PREF_KEY));
    return raw !== null ? raw !== 'false' : true;
  } catch {
    return true;
  }
}

export function setWakeWordEnabledPref(enabled: boolean): void {
  try {
    localStorage.setItem(getAccountStorageKey(WAKE_WORD_PREF_KEY), String(enabled));
    window.dispatchEvent(new Event('jarvis_voice_prefs_changed'));
  } catch {}
}

export function getVoiceAutoSpeakPref(): boolean {
  try {
    const raw = localStorage.getItem(getAccountStorageKey(VOICE_AUTO_SPEAK_PREF_KEY));
    return raw !== null ? raw !== 'false' : true;
  } catch {
    return true;
  }
}

export function setVoiceAutoSpeakPref(enabled: boolean): void {
  try {
    localStorage.setItem(getAccountStorageKey(VOICE_AUTO_SPEAK_PREF_KEY), String(enabled));
    window.dispatchEvent(new Event('jarvis_voice_prefs_changed'));
  } catch {}
}

export interface UseWakeWordListenerOptions {
  assistantName: string;
  paused: boolean;
  onWakeDetected: (payload: { command: string; triggerPhrase: string }) => void;
}

export interface UseWakeWordListenerReturn {
  enabled: boolean;
  supported: boolean;
  listening: boolean;
  permissionError: string | null;
  setEnabled: (next: boolean) => void;
  toggle: () => void;
}

function getSpeechRecognitionCtor(): any {
  if (typeof window === 'undefined') return null;
  return (
    (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition ||
    null
  );
}

/**
 * Escuta passiva por palavra de ativação ("Ei JARVIS", "Oi Luna", etc.).
 * Pausa automaticamente quando o HUD de voz está aberto para evitar conflito de microfone.
 */
export function useWakeWordListener({
  assistantName,
  paused,
  onWakeDetected,
}: UseWakeWordListenerOptions): UseWakeWordListenerReturn {
  const [enabled, setEnabledState] = useState<boolean>(() => getWakeWordEnabledPref());
  const [listening, setListening] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const supported = Boolean(getSpeechRecognitionCtor());
  const recognitionRef = useRef<any>(null);
  const restartTimerRef = useRef<number | null>(null);
  const wakePendingTimerRef = useRef<number | null>(null);
  const lastDetectionRef = useRef<{ command: string; triggerPhrase: string } | null>(null);
  const onWakeRef = useRef(onWakeDetected);
  const assistantNameRef = useRef(assistantName);
  const enabledRef = useRef(enabled);
  const pausedRef = useRef(paused);

  onWakeRef.current = onWakeDetected;
  assistantNameRef.current = assistantName;
  enabledRef.current = enabled;
  pausedRef.current = paused;

  useEffect(() => {
    const sync = () => setEnabledState(getWakeWordEnabledPref());
    window.addEventListener('jarvis_voice_prefs_changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('jarvis_voice_prefs_changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const stopRecognizer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (wakePendingTimerRef.current !== null) {
      window.clearTimeout(wakePendingTimerRef.current);
      wakePendingTimerRef.current = null;
    }
    lastDetectionRef.current = null;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        if (typeof recognitionRef.current.abort === 'function') {
          recognitionRef.current.abort();
        } else {
          recognitionRef.current.stop();
        }
      } catch {}
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

  useEffect(() => {
    if (!enabled || paused) {
      stopRecognizer();
      return;
    }

    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    if (!SpeechRecognitionCtor) {
      setListening(false);
      setPermissionError('Reconhecimento contínuo indisponível neste navegador.');
      return;
    }

    let cancelled = false;

    const startRecognizer = () => {
      if (cancelled || !enabledRef.current || pausedRef.current) return;
      stopRecognizer();
      try {
        const rec = new SpeechRecognitionCtor();
        rec.lang = 'pt-BR';
        rec.continuous = true;
        rec.interimResults = true;
        rec.maxAlternatives = 1;

        rec.onstart = () => {
          if (!cancelled) {
            setListening(true);
            setPermissionError(null);
          }
        };

        rec.onresult = (event: any) => {
          if (cancelled || pausedRef.current) return;
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const result = event.results[i];
            const transcript = result?.[0]?.transcript || '';
            if (!transcript.trim()) continue;
            const detection = detectWakeWord(transcript, assistantNameRef.current);
            if (detection.detected) {
              const phrase = detection.triggerPhrase || `Ei ${assistantNameRef.current}`;
              // Se o navegador já marcou o trecho como final, dispara imediatamente
              if (result.isFinal) {
                if (wakePendingTimerRef.current !== null) {
                  window.clearTimeout(wakePendingTimerRef.current);
                  wakePendingTimerRef.current = null;
                }
                lastDetectionRef.current = null;
                stopRecognizer();
                onWakeRef.current({
                  command: detection.command,
                  triggerPhrase: phrase,
                });
                return;
              }

              // Se o resultado ainda for provisório (interim), aguarda breve silêncio (650ms)
              // para capturar o comando completo sem truncar a fala do usuário
              lastDetectionRef.current = {
                command: detection.command,
                triggerPhrase: phrase,
              };

              if (wakePendingTimerRef.current !== null) {
                window.clearTimeout(wakePendingTimerRef.current);
              }

              wakePendingTimerRef.current = window.setTimeout(() => {
                wakePendingTimerRef.current = null;
                if (cancelled || pausedRef.current || !enabledRef.current) return;
                const pending = lastDetectionRef.current;
                if (pending) {
                  lastDetectionRef.current = null;
                  stopRecognizer();
                  onWakeRef.current(pending);
                }
              }, 650);
            }
          }
        };

        rec.onerror = (event: any) => {
          const errCode = event?.error || '';
          if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
            setPermissionError('Permita o uso do microfone no navegador para ativação por voz.');
            setWakeWordEnabledPref(false);
            setEnabledState(false);
            stopRecognizer();
            notify('Permissão de microfone bloqueada pelo navegador.', 'warning');
            return;
          }
          // 'no-speech', 'aborted' e oscilações de rede são esperados na escuta passiva.
          // O fluxo se recupera automaticamente em onend sem desativar a escuta.
        };

        rec.onend = () => {
          setListening(false);
          // Se havia uma detecção de wake word pendente aguardando silêncio (interim),
          // o evento onend confirma o encerramento da fala e deve despachar o evento imediatamente,
          // evitando que o timer de reinício silencie a ativação por voz.
          if (wakePendingTimerRef.current !== null) {
            window.clearTimeout(wakePendingTimerRef.current);
            wakePendingTimerRef.current = null;
          }
          const pending = lastDetectionRef.current;
          if (pending && !cancelled && enabledRef.current && !pausedRef.current) {
            lastDetectionRef.current = null;
            stopRecognizer();
            onWakeRef.current(pending);
            return;
          }
          if (!cancelled && enabledRef.current && !pausedRef.current) {
            if (restartTimerRef.current !== null) {
              window.clearTimeout(restartTimerRef.current);
            }
            restartTimerRef.current = window.setTimeout(startRecognizer, 250);
          }
        };

        recognitionRef.current = rec;
        rec.start();
      } catch {
        setListening(false);
        if (!cancelled && enabledRef.current && !pausedRef.current) {
          if (restartTimerRef.current !== null) {
            window.clearTimeout(restartTimerRef.current);
          }
          restartTimerRef.current = window.setTimeout(startRecognizer, 500);
        }
      }
    };

    // Pequeno atraso para liberar microfone caso outro componente estivesse ativo
    const initTimer = window.setTimeout(startRecognizer, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(initTimer);
      stopRecognizer();
    };
  }, [enabled, paused, assistantName, stopRecognizer]);

  const setEnabled = useCallback(
    (next: boolean) => {
      if (next && !getSpeechRecognitionCtor()) {
        setWakeWordEnabledPref(false);
        setEnabledState(false);
        notify(
          `A escuta contínua por microfone depende do Chrome/Edge com permissão de áudio. Você ainda pode clicar em "Ei ${assistantName}" a qualquer momento.`,
          'info'
        );
        return;
      }
      setPermissionError(null);
      setWakeWordEnabledPref(next);
      setEnabledState(next);
      notify(
        next
          ? `Escuta ativa: diga "Ei ${assistantName}" a qualquer momento.`
          : `Escuta por palavra de ativação pausada.`,
        'info'
      );
    },
    [assistantName]
  );

  const toggle = useCallback(() => {
    setEnabled(!enabled);
  }, [enabled, setEnabled]);

  return {
    enabled,
    supported,
    listening,
    permissionError,
    setEnabled,
    toggle,
  };
}
