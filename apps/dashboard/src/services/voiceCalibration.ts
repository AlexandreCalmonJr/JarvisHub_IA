import { getAccountStorageKey } from './accountScope';
import { detectWakeWord } from './voiceCompanion';

export const VOICE_CALIBRATION_STORAGE_KEY = 'jarvis_voice_calibration_profile';

export interface VoiceCalibrationData {
  calibrated: boolean;
  timestamp: string;
  assistantName: string;
  samplesRecorded: number;
  averageAudioLevel?: number;
  phrases: string[];
}

export interface CalibrationStepDef {
  step: number;
  title: string;
  getPrompt: (assistantName: string) => string;
  subtext: string;
  hint: string;
}

export const CALIBRATION_STEPS: CalibrationStepDef[] = [
  {
    step: 1,
    title: 'Saudação Base',
    getPrompt: (name: string) => `Ei ${name}`,
    subtext: 'Fale de forma natural e clara para o JARVIS reconhecer sua entonação.',
    hint: 'Apenas a palavra de ativação',
  },
  {
    step: 2,
    title: 'Comando Curto',
    getPrompt: (name: string) => `Ei ${name}, como você está?`,
    subtext: 'Fale com a entonação de uma pergunta espontânea do dia a dia.',
    hint: 'Saudação + pergunta rápida',
  },
  {
    step: 3,
    title: 'Ação do Sistema',
    getPrompt: (name: string) => `Ei ${name}, abrir central de agentes`,
    subtext: 'Fale em um único fôlego para testar o acionamento de um comando completo.',
    hint: 'Saudação + comando de ação',
  },
];

/**
 * Retorna os dados de calibração armazenados para a conta ativa.
 */
export function getVoiceCalibration(): VoiceCalibrationData | null {
  try {
    const raw = localStorage.getItem(getAccountStorageKey(VOICE_CALIBRATION_STORAGE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.calibrated) {
      return parsed as VoiceCalibrationData;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Salva ou atualiza a calibração de voz da conta ativa.
 */
export function saveVoiceCalibration(data: Partial<VoiceCalibrationData>): VoiceCalibrationData {
  const existing = getVoiceCalibration();
  const updated: VoiceCalibrationData = {
    calibrated: data.calibrated ?? existing?.calibrated ?? true,
    timestamp: data.timestamp || new Date().toISOString(),
    assistantName: data.assistantName || existing?.assistantName || 'JARVIS',
    samplesRecorded: data.samplesRecorded ?? existing?.samplesRecorded ?? 3,
    averageAudioLevel: data.averageAudioLevel ?? existing?.averageAudioLevel ?? 85,
    phrases: data.phrases || existing?.phrases || [
      'Ei JARVIS',
      'Ei JARVIS, como você está?',
      'Ei JARVIS, abrir central de agentes',
    ],
  };

  try {
    localStorage.setItem(
      getAccountStorageKey(VOICE_CALIBRATION_STORAGE_KEY),
      JSON.stringify(updated)
    );
    window.dispatchEvent(new CustomEvent('jarvis:voice-calibration-updated', { detail: updated }));
  } catch {}

  return updated;
}

/**
 * Remove os dados de calibração para permitir recalibrar do zero.
 */
export function clearVoiceCalibration(): void {
  try {
    localStorage.removeItem(getAccountStorageKey(VOICE_CALIBRATION_STORAGE_KEY));
    window.dispatchEvent(new CustomEvent('jarvis:voice-calibration-updated', { detail: null }));
  } catch {}
}

/**
 * Indica se a voz já foi calibrada ao menos uma vez.
 */
export function isVoiceCalibrated(): boolean {
  return getVoiceCalibration()?.calibrated === true;
}

function stripDiacritics(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Valida se um transcript reconhecido atende à etapa atual da calibração.
 */
export function evaluateCalibrationStep(
  transcript: string,
  stepNumber: number,
  assistantName: string
): { passed: boolean; detectedPhrase: string | null; feedback: string } {
  const raw = (transcript || '').trim();
  if (!raw) {
    return { passed: false, detectedPhrase: null, feedback: 'Nenhuma fala detectada.' };
  }

  const detection = detectWakeWord(raw, assistantName);
  if (!detection.detected) {
    return {
      passed: false,
      detectedPhrase: null,
      feedback: `Não ouvimos a saudação "Ei ${assistantName}". Tente novamente falando com clareza.`,
    };
  }

  if (stepNumber === 1) {
    return {
      passed: true,
      detectedPhrase: detection.triggerPhrase,
      feedback: 'Ótimo! Saudação reconhecida com sucesso.',
    };
  }

  if (stepNumber === 2) {
    const cmd = stripDiacritics(detection.command);
    const hasIntent =
      cmd.includes('como') ||
      cmd.includes('esta') ||
      cmd.includes('voce') ||
      cmd.includes('tudo') ||
      cmd.includes('ola') ||
      cmd.length >= 3;
    return {
      passed: hasIntent,
      detectedPhrase: `${detection.triggerPhrase}${detection.command ? ', ' + detection.command : ''}`,
      feedback: hasIntent
        ? 'Excelente! Pergunta reconhecida perfeitamente.'
        : 'Ouvi a saudação, mas tente falar a frase completa: "Ei JARVIS, como você está?"',
    };
  }

  if (stepNumber === 3) {
    const cmd = stripDiacritics(detection.command);
    const hasIntent =
      cmd.includes('abrir') ||
      cmd.includes('central') ||
      cmd.includes('agente') ||
      cmd.includes('tarefa') ||
      cmd.includes('chat') ||
      cmd.length >= 4;
    return {
      passed: hasIntent,
      detectedPhrase: `${detection.triggerPhrase}${detection.command ? ', ' + detection.command : ''}`,
      feedback: hasIntent
        ? 'Perfeito! Ação completa reconhecida com sucesso.'
        : 'Ouvi a saudação! Tente concluir com o comando: "Ei JARVIS, abrir central de agentes".',
    };
  }

  return { passed: false, detectedPhrase: null, feedback: 'Etapa inválida.' };
}

/**
 * Toca sinais sonoros agradáveis via Web Audio API para guiar o usuário na calibração.
 */
export function playCalibrationSound(kind: 'step' | 'final' | 'tap' | 'error'): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (kind === 'tap') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
      setTimeout(() => void ctx.close(), 150);
      return;
    }

    if (kind === 'step') {
      // 2 notas harmônicas ascendentes (C5 -> G5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(523.25, now);
      osc1.frequency.setValueAtTime(783.99, now + 0.1);
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.exponentialRampToValueAtTime(0.12, now + 0.03);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);
      setTimeout(() => void ctx.close(), 350);
      return;
    }

    if (kind === 'final') {
      // Arpeggio triunfante (C5 -> E5 -> G5 -> C6)
      const freqs = [523.25, 659.25, 783.99, 1046.5];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + idx * 0.09;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(0.14, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.4);
      });
      setTimeout(() => void ctx.close(), 800);
      return;
    }

    if (kind === 'error') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(164.81, now + 0.18);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
      setTimeout(() => void ctx.close(), 300);
    }
  } catch {}
}

