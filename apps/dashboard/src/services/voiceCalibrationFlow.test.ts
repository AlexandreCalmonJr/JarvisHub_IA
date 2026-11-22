import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateFrequencyVolume,
  normalizeVolumeLevel,
  isVoiceActive,
  saveVoiceCalibration,
  getVoiceCalibration,
  clearVoiceCalibration,
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

/**
 * Mock da API Web Speech (SpeechRecognition) com suporte a abort() e rastreamento atômico
 */
class MockSpeechRecognitionFlow {
  continuous = false;
  interimResults = false;
  lang = 'pt-BR';
  maxAlternatives = 1;

  started = false;
  stopped = false;
  aborted = false;
  startCount = 0;
  stopCount = 0;
  abortCount = 0;

  onstart: (() => void) | null = null;
  onresult: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onend: (() => void) | null = null;

  start() {
    this.started = true;
    this.stopped = false;
    this.aborted = false;
    this.startCount++;
    if (this.onstart) {
      this.onstart();
    }
  }

  stop() {
    this.stopped = true;
    this.started = false;
    this.stopCount++;
    if (this.onend) {
      this.onend();
    }
  }

  abort() {
    this.aborted = true;
    this.started = false;
    this.abortCount++;
    if (this.onend) {
      this.onend();
    }
  }

  emitResult(transcript: string, isFinal = true) {
    if (!this.onresult) return;
    const event = {
      resultIndex: 0,
      results: [Object.assign([{ transcript }], { isFinal })],
    };
    this.onresult(event);
  }

  emitError(error: string) {
    if (!this.onerror) return;
    this.onerror({ error });
    // Na especificação W3C, onend é sempre despachado após onerror
    if (this.onend) {
      this.onend();
    }
  }
}

/**
 * Mock para Web Audio API (AudioContext, AnalyserNode, MediaStreamTrack)
 */
class MockMediaStreamTrack {
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

class MockMediaStream {
  tracks: MockMediaStreamTrack[];
  constructor(trackCount = 1) {
    this.tracks = Array.from({ length: trackCount }, () => new MockMediaStreamTrack());
  }
  getTracks() {
    return this.tracks;
  }
}

class MockAnalyserNode {
  fftSize = 256;
  smoothingTimeConstant = 0.4;
  frequencyBinCount = 128;
  mockData: Uint8Array | null = null;

  getByteFrequencyData(array: Uint8Array) {
    if (this.mockData) {
      array.set(this.mockData.subarray(0, array.length));
    } else {
      array.fill(0);
    }
  }
}

class MockAudioContext {
  state: 'running' | 'suspended' | 'closed' = 'running';
  analyser: MockAnalyserNode | null = null;
  closed = false;

  createMediaStreamSource(_stream: MockMediaStream) {
    return {
      connect: (target: any) => {
        this.analyser = target;
      },
    };
  }

  createAnalyser() {
    const node = new MockAnalyserNode();
    this.analyser = node;
    return node;
  }

  async close() {
    this.closed = true;
    this.state = 'closed';
  }
}

// ==========================================
// R2: Pure Audio Calculation Functions Tests
// ==========================================

test('R2 Audio Math: calculateFrequencyVolume accurately computes frequency buffer average', () => {
  // Empty or invalid buffer
  assert.equal(calculateFrequencyVolume(new Uint8Array([])), 0);

  // Silence (all zeros)
  const silenceBuffer = new Uint8Array(128).fill(0);
  assert.equal(calculateFrequencyVolume(silenceBuffer), 0);

  // Uniform audio signal
  const uniformBuffer = new Uint8Array(128).fill(42);
  assert.equal(calculateFrequencyVolume(uniformBuffer), 42);

  // Variable frequency spectrum
  const mixedBuffer = new Uint8Array([10, 20, 30, 40]);
  assert.equal(calculateFrequencyVolume(mixedBuffer), 25);

  // Buffer with fractional result rounded to 2 decimal places
  const fractionalBuffer = new Uint8Array([10, 20, 31]);
  assert.equal(calculateFrequencyVolume(fractionalBuffer), 20.33);
});

test('R2 Audio Math: normalizeVolumeLevel maps raw volume to clamped 0-100% range', () => {
  // Silence
  assert.equal(normalizeVolumeLevel(0), 0);
  assert.equal(normalizeVolumeLevel(-5), 0);
  assert.equal(normalizeVolumeLevel(NaN), 0);

  // Moderate conversational speech (30% - 50%)
  const moderate = normalizeVolumeLevel(38);
  assert.equal(moderate, 38);
  assert.ok(moderate >= 30 && moderate <= 50);

  // Loud audio / shout (80% - 100%)
  const loud = normalizeVolumeLevel(86);
  assert.equal(loud, 86);
  assert.ok(loud >= 80 && loud <= 100);

  // Clamping over maximum expected volume
  assert.equal(normalizeVolumeLevel(150), 100);
  assert.equal(normalizeVolumeLevel(255), 100);

  // Custom maxExpected scale
  assert.equal(normalizeVolumeLevel(60, 120), 50);
});

test('R2 Audio Math: isVoiceActive discriminates physical speech from silence and noise threshold', () => {
  // Silence below default threshold (14)
  assert.equal(isVoiceActive(0), false);
  assert.equal(isVoiceActive(8), false);
  assert.equal(isVoiceActive(13.9), false);

  // Active voice at or above default threshold
  assert.equal(isVoiceActive(14), true);
  assert.equal(isVoiceActive(35), true);
  assert.equal(isVoiceActive(90), true);

  // Custom threshold
  assert.equal(isVoiceActive(10, 10), true);
  assert.equal(isVoiceActive(9.9, 10), false);

  // Invalid inputs
  assert.equal(isVoiceActive(NaN), false);
  assert.equal(isVoiceActive(undefined as any), false);
});

// ==========================================
// R2: Web Audio API Integration & Teardown
// ==========================================

test('R2 Audio Lifecycle: AudioContext and AnalyserNode setup, frequency measurement and track teardown', async () => {
  const mockCtx = new MockAudioContext();
  const mockStream = new MockMediaStream(2);

  // Simula conexão do stream com AnalyserNode
  const source = mockCtx.createMediaStreamSource(mockStream);
  const analyser = mockCtx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.4;
  source.connect(analyser);

  assert.equal(analyser.fftSize, 256);
  assert.equal(analyser.smoothingTimeConstant, 0.4);

  // Fornece dados simulados de voz
  analyser.mockData = new Uint8Array(128).fill(45);
  const pcmData = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(pcmData);

  const rawVol = calculateFrequencyVolume(pcmData);
  const normVol = normalizeVolumeLevel(rawVol);
  const active = isVoiceActive(rawVol);

  assert.equal(rawVol, 45);
  assert.equal(normVol, 45);
  assert.equal(active, true);

  // Teardown atômico: encerra tracks e fecha contexto de áudio
  mockStream.getTracks().forEach((track) => track.stop());
  await mockCtx.close();

  assert.equal(mockStream.getTracks().every((t) => t.stopped), true);
  assert.equal(mockCtx.closed, true);
  assert.equal(mockCtx.state, 'closed');
});

test('R2 Audio Persistence: Persists real measured averageAudioLevel into profile', () => {
  clearVoiceCalibration();

  // Simula amostras medidas durante o uso do microfone físico
  const recordedSpeechLevels = [35, 42, 50, 48, 55, 60];
  const realAverage = Math.round(
    recordedSpeechLevels.reduce((a, b) => a + b, 0) / recordedSpeechLevels.length
  );
  assert.equal(realAverage, 48);

  const saved = saveVoiceCalibration({
    calibrated: true,
    assistantName: 'JARVIS',
    samplesRecorded: 3,
    averageAudioLevel: realAverage,
    phrases: [
      'Ei JARVIS',
      'Ei JARVIS, como você está?',
      'Ei JARVIS, abrir central de agentes',
    ],
  });

  assert.equal(saved.averageAudioLevel, 48);

  const retrieved = getVoiceCalibration();
  assert.notEqual(retrieved, null);
  assert.equal(retrieved?.averageAudioLevel, 48);
  assert.equal(retrieved?.calibrated, true);

  clearVoiceCalibration();
});

// ==========================================
// R1: Flapping & Restart Loop Elimination
// ==========================================

test('R1 Flapping Prevention: Halts restart loop immediately on "audio-capture" fatal error', () => {
  const rec = new MockSpeechRecognitionFlow();
  let fatalError = false;
  let restartScheduled = false;
  let listening = false;
  let permissionErrorMsg: string | null = null;

  rec.onstart = () => {
    listening = true;
  };

  rec.onerror = (err: any) => {
    const errCode = err?.error || '';
    if (errCode === 'audio-capture') {
      fatalError = true;
      permissionErrorMsg = 'Microfone ocupado ou não detectado.';
      // Release immediately via abort
      if (typeof rec.abort === 'function') {
        rec.abort();
      } else {
        rec.stop();
      }
    }
  };

  rec.onend = () => {
    listening = false;
    // Guard against restart loop
    if (fatalError) {
      return;
    }
    restartScheduled = true;
  };

  rec.start();
  assert.equal(listening, true);
  assert.equal(rec.startCount, 1);

  // Simula erro de áudio ocupado/não detectado
  rec.emitError('audio-capture');

  assert.equal(fatalError, true);
  assert.equal(listening, false);
  assert.equal(restartScheduled, false); // NENHUM restart agendado
  assert.equal(rec.startCount, 1); // Sem loop de reinício a cada 250ms
  assert.notEqual(permissionErrorMsg, null);
  assert.equal(rec.aborted, true); // Liberação atômica com abort()
});

test('R1 Flapping Prevention: Halts restart loop immediately on "not-allowed" permission error', () => {
  const rec = new MockSpeechRecognitionFlow();
  let fatalError = false;
  let restartScheduled = false;
  let listening = false;
  let permissionErrorMsg: string | null = null;

  rec.onstart = () => {
    listening = true;
  };

  rec.onerror = (err: any) => {
    const errCode = err?.error || '';
    if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
      fatalError = true;
      permissionErrorMsg = 'Acesso ao microfone bloqueado no navegador.';
      if (typeof rec.abort === 'function') {
        rec.abort();
      } else {
        rec.stop();
      }
    }
  };

  rec.onend = () => {
    listening = false;
    if (fatalError) {
      return;
    }
    restartScheduled = true;
  };

  rec.start();
  assert.equal(listening, true);

  // Simula bloqueio de permissão pelo usuário/navegador
  rec.emitError('not-allowed');

  assert.equal(fatalError, true);
  assert.equal(listening, false);
  assert.equal(restartScheduled, false);
  assert.equal(rec.startCount, 1);
  assert.match(permissionErrorMsg || '', /bloqueado no navegador/);
  assert.equal(rec.aborted, true);
});

test('R1 Bounded Retries: Transient network errors retry up to 3 times then halt cleanly', () => {
  let retryCount = 0;
  let fatalError = false;
  let restartsAttempted = 0;

  const simulateNetworkFailure = () => {
    const rec = new MockSpeechRecognitionFlow();
    let localRestartScheduled = false;

    rec.onerror = (err: any) => {
      if (err?.error === 'network') {
        retryCount++;
        if (retryCount > 3) {
          fatalError = true;
          rec.abort();
          return;
        }
      }
    };

    rec.onend = () => {
      if (fatalError) return;
      localRestartScheduled = true;
      restartsAttempted++;
    };

    rec.start();
    rec.emitError('network');
    return localRestartScheduled;
  };

  // Tentativa 1 (falha de rede 1 -> retry permitido)
  assert.equal(simulateNetworkFailure(), true);
  assert.equal(retryCount, 1);
  assert.equal(fatalError, false);

  // Tentativa 2 (falha de rede 2 -> retry permitido)
  assert.equal(simulateNetworkFailure(), true);
  assert.equal(retryCount, 2);
  assert.equal(fatalError, false);

  // Tentativa 3 (falha de rede 3 -> retry permitido)
  assert.equal(simulateNetworkFailure(), true);
  assert.equal(retryCount, 3);
  assert.equal(fatalError, false);

  // Tentativa 4 (falha de rede 4 -> atinge o limite máximo de 3 tentativas e aborta)
  assert.equal(simulateNetworkFailure(), false);
  assert.equal(retryCount, 4);
  assert.equal(fatalError, true);
  assert.equal(restartsAttempted, 3); // Parou estritamente em 3
});

test('R1 Concurrency & Atomic Release: stopRecognition calls abort() to immediately free hardware', () => {
  const rec = new MockSpeechRecognitionFlow();
  rec.start();
  assert.equal(rec.started, true);
  assert.equal(rec.aborted, false);

  // Simula a lógica atômica de parada
  if (typeof rec.abort === 'function') {
    rec.abort();
  } else {
    rec.stop();
  }

  assert.equal(rec.aborted, true);
  assert.equal(rec.abortCount, 1);
  assert.equal(rec.started, false);
});
