import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CALIBRATION_STEPS,
  evaluateCalibrationStep,
  getVoiceCalibration,
  saveVoiceCalibration,
  clearVoiceCalibration,
  isVoiceCalibrated,
  playCalibrationSound,
} from './voiceCalibration';

// Setup Mock DOM storage & window for Node environment
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    length: 0,
  };
}

if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

if (typeof (globalThis as any).CustomEvent === 'undefined') {
  (globalThis as any).CustomEvent = class CustomEvent {
    type: string;
    detail: any;
    constructor(type: string, params: any = {}) {
      this.type = type;
      this.detail = params?.detail;
    }
  };
}

test('VoiceCalibration: CALIBRATION_STEPS has exactly 3 progressive steps', () => {
  assert.equal(CALIBRATION_STEPS.length, 3);
  assert.equal(CALIBRATION_STEPS[0].step, 1);
  assert.equal(CALIBRATION_STEPS[0].getPrompt('JARVIS'), 'Ei JARVIS');
  assert.equal(CALIBRATION_STEPS[1].step, 2);
  assert.equal(CALIBRATION_STEPS[1].getPrompt('JARVIS'), 'Ei JARVIS, como você está?');
  assert.equal(CALIBRATION_STEPS[2].step, 3);
  assert.equal(CALIBRATION_STEPS[2].getPrompt('JARVIS'), 'Ei JARVIS, abrir central de agentes');
});

test('VoiceCalibration: evaluateCalibrationStep handles Step 1 (Wake Word greeting)', () => {
  const step1Exact = evaluateCalibrationStep('Ei JARVIS', 1, 'JARVIS');
  assert.equal(step1Exact.passed, true);
  assert.equal(step1Exact.detectedPhrase, 'Ei JARVIS');

  const step1Punctuation = evaluateCalibrationStep('Ei, JARVIS!', 1, 'JARVIS');
  assert.equal(step1Punctuation.passed, true);

  const step1Alternative = evaluateCalibrationStep('ei jarbas', 1, 'JARVIS');
  assert.equal(step1Alternative.passed, true);

  const step1Invalid = evaluateCalibrationStep('Bom dia amigo', 1, 'JARVIS');
  assert.equal(step1Invalid.passed, false);
  assert.match(step1Invalid.feedback, /Não ouvimos a saudação/);

  const step1Empty = evaluateCalibrationStep('', 1, 'JARVIS');
  assert.equal(step1Empty.passed, false);
  assert.equal(step1Empty.feedback, 'Nenhuma fala detectada.');
});

test('VoiceCalibration: evaluateCalibrationStep handles Step 2 (Short greeting + inquiry)', () => {
  const step2Exact = evaluateCalibrationStep('Ei JARVIS, como você está?', 2, 'JARVIS');
  assert.equal(step2Exact.passed, true);
  assert.match(step2Exact.feedback, /Excelente!/);

  const step2Diacritics = evaluateCalibrationStep('Ei JARVIS, como voce esta?', 2, 'JARVIS');
  assert.equal(step2Diacritics.passed, true);

  const step2Variant = evaluateCalibrationStep('Ei JARVIS tudo bem', 2, 'JARVIS');
  assert.equal(step2Variant.passed, true);

  const step2MissingCommand = evaluateCalibrationStep('Ei JARVIS', 2, 'JARVIS');
  assert.equal(step2MissingCommand.passed, false);
  assert.match(step2MissingCommand.feedback, /como você está/);
});

test('VoiceCalibration: evaluateCalibrationStep handles Step 3 (Full Action Command)', () => {
  const step3Exact = evaluateCalibrationStep('Ei JARVIS, abrir central de agentes', 3, 'JARVIS');
  assert.equal(step3Exact.passed, true);
  assert.match(step3Exact.feedback, /Perfeito!/);

  const step3Shortcut = evaluateCalibrationStep('Ei JARVIS abrir tarefas', 3, 'JARVIS');
  assert.equal(step3Shortcut.passed, true);

  const step3Incomplete = evaluateCalibrationStep('Ei JARVIS', 3, 'JARVIS');
  assert.equal(step3Incomplete.passed, false);
  assert.match(step3Incomplete.feedback, /abrir central de agentes/);

  const step3InvalidStep = evaluateCalibrationStep('Ei JARVIS teste', 99, 'JARVIS');
  assert.equal(step3InvalidStep.passed, false);
  assert.equal(step3InvalidStep.feedback, 'Etapa inválida.');
});

test('VoiceCalibration: Storage persistence save, get, clear, and isVoiceCalibrated', () => {
  clearVoiceCalibration();
  assert.equal(getVoiceCalibration(), null);
  assert.equal(isVoiceCalibrated(), false);

  const saved = saveVoiceCalibration({
    assistantName: 'JARVIS',
    samplesRecorded: 3,
    averageAudioLevel: 92,
    phrases: [
      'Ei JARVIS',
      'Ei JARVIS, como você está?',
      'Ei JARVIS, abrir central de agentes',
    ],
  });

  assert.equal(saved.calibrated, true);
  assert.equal(saved.assistantName, 'JARVIS');
  assert.equal(saved.samplesRecorded, 3);
  assert.equal(saved.averageAudioLevel, 92);
  assert.equal(isVoiceCalibrated(), true);

  const retrieved = getVoiceCalibration();
  assert.notEqual(retrieved, null);
  assert.equal(retrieved?.calibrated, true);
  assert.equal(retrieved?.samplesRecorded, 3);

  clearVoiceCalibration();
  assert.equal(getVoiceCalibration(), null);
  assert.equal(isVoiceCalibrated(), false);
});

test('VoiceCalibration: playCalibrationSound executes safely without throwing in headless environment', () => {
  assert.doesNotThrow(() => {
    playCalibrationSound('tap');
    playCalibrationSound('step');
    playCalibrationSound('final');
    playCalibrationSound('error');
  });
});

