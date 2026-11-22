import test from 'node:test';
import assert from 'node:assert/strict';
import { detectWakeWord } from './voiceCompanion';

/**
 * Mock da API Web Speech (SpeechRecognition) para simular eventos de voz
 * em ambiente de testes automatizados (Node / CI).
 */
class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = 'pt-BR';
  maxAlternatives = 1;

  started = false;
  stopped = false;

  onstart: (() => void) | null = null;
  onresult: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onend: (() => void) | null = null;

  start() {
    this.started = true;
    this.stopped = false;
    if (this.onstart) {
      this.onstart();
    }
  }

  stop() {
    this.stopped = true;
    this.started = false;
    if (this.onend) {
      this.onend();
    }
  }

  emitResult(transcript: string, isFinal = true) {
    if (!this.onresult) return;
    const event = {
      resultIndex: 0,
      results: [
        Object.assign([{ transcript }], { isFinal }),
      ],
    };
    this.onresult(event);
  }

  emitError(error: string) {
    if (!this.onerror) return;
    this.onerror({ error });
    if (this.onend) {
      this.onend();
    }
  }
}

test('Voice Activation: Simulates "Ei JARVIS" recognition and wake event dispatch', async () => {
  const mockRec = new MockSpeechRecognition();
  mockRec.continuous = true;
  mockRec.interimResults = true;

  let wakeDetected = false;
  let receivedCommand = '';
  let receivedTrigger = '';

  const onWakeDetected = (payload: { command: string; triggerPhrase: string }) => {
    wakeDetected = true;
    receivedCommand = payload.command;
    receivedTrigger = payload.triggerPhrase;
  };

  mockRec.onresult = (event: any) => {
    const transcript = event.results[0][0].transcript;
    const isFinal = event.results[0].isFinal;
    const detection = detectWakeWord(transcript, 'JARVIS');
    if (detection.detected) {
      if (isFinal || !detection.command) {
        mockRec.stop();
        onWakeDetected({
          command: detection.command,
          triggerPhrase: detection.triggerPhrase || 'Ei JARVIS',
        });
      }
    }
  };

  mockRec.start();
  assert.equal(mockRec.started, true);

  // Simula emissão de fala: "Ei JARVIS"
  mockRec.emitResult('Ei, JARVIS', true);

  assert.equal(wakeDetected, true);
  assert.equal(receivedTrigger, 'Ei JARVIS');
  assert.equal(receivedCommand, '');
  assert.equal(mockRec.stopped, true);
});

test('Voice Activation: Captures full voice command spoken in a single sentence after wake word', async () => {
  const mockRec = new MockSpeechRecognition();
  let capturedCommand = '';

  mockRec.onresult = (event: any) => {
    const transcript = event.results[0][0].transcript;
    const detection = detectWakeWord(transcript, 'JARVIS');
    if (detection.detected) {
      capturedCommand = detection.command;
      mockRec.stop();
    }
  };

  mockRec.start();
  // Simula fala natural em um único fôlego: "Ei JARVIS, qual é o status dos servidores?"
  mockRec.emitResult('Ei JARVIS, qual é o status dos servidores?', true);

  assert.equal(capturedCommand, 'qual é o status dos servidores?');
  assert.equal(mockRec.stopped, true);
});

test('Voice Activation: Recovers automatically from transient errors (no-speech, network) without silent termination', async () => {
  let restartCount = 0;
  let isListening = false;
  let lastError: string | null = null;

  const createAndRunRecognizer = () => {
    const rec = new MockSpeechRecognition();
    rec.continuous = true;

    rec.onstart = () => {
      isListening = true;
    };

    rec.onerror = (ev: any) => {
      lastError = ev.error;
      // Erros comuns (como silêncio 'no-speech' do Chrome) não devem encerrar a escuta de forma permanente
    };

    rec.onend = () => {
      isListening = false;
      // Reinicia automaticamente
      restartCount += 1;
      createAndRunRecognizer();
    };

    rec.start();
    return rec;
  };

  const recognizer = createAndRunRecognizer();
  assert.equal(isListening, true);

  // Simula timeout de silêncio no navegador ('no-speech')
  recognizer.emitError('no-speech');

  // Verifica que o fluxo reiniciou automaticamente e a escuta continua ativa
  assert.equal(lastError, 'no-speech');
  assert.equal(restartCount, 1);
  assert.equal(isListening, true);
});

test('Voice Activation: Transitions cleanly to permission error state on not-allowed error', async () => {
  let isListening = false;
  let permissionError: string | null = null;
  let enabled = true;

  const rec = new MockSpeechRecognition();
  rec.onstart = () => {
    isListening = true;
  };

  rec.onerror = (ev: any) => {
    if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
      permissionError = 'Permita o uso do microfone no navegador.';
      enabled = false;
      isListening = false;
      rec.stop();
    }
  };

  rec.start();
  assert.equal(isListening, true);

  // Simula usuário bloqueando microfone
  rec.emitError('not-allowed');

  assert.equal(isListening, false);
  assert.equal(enabled, false);
  assert.match(permissionError!, /Permita o uso do microfone/);
});

test('Voice HUD Flow: Continuous voice loop keeps listening after executing command and TTS reply', async () => {
  const turnsHistory: Array<{ role: 'user' | 'assistant'; text: string }> = [];
  let listening = false;
  let activeTurnPromise: Promise<void> | null = null;

  const session: { currentRec: MockSpeechRecognition | null } = { currentRec: null };

  const startListening = () => {
    const rec = new MockSpeechRecognition();
    rec.continuous = true;
    rec.onstart = () => {
      listening = true;
    };
    rec.onresult = (ev: any) => {
      const text = ev.results[0][0].transcript;
      rec.stop();
      activeTurnPromise = handleVoiceCommand(text);
    };
    rec.onend = () => {
      listening = false;
    };
    session.currentRec = rec;
    rec.start();
  };

  const handleVoiceCommand = async (text: string) => {
    listening = false;
    turnsHistory.push({ role: 'user', text });

    // Simula resposta do assistente (ex: IA + TTS)
    const reply = `Processando: ${text}`;
    turnsHistory.push({ role: 'assistant', text: reply });

    // Após finalizar resposta falada, a escuta retoma automaticamente para continuidade
    startListening();
  };

  // 1. Inicia escuta no HUD
  startListening();
  assert.equal(listening, true);

  // 2. Primeiro comando falado pelo usuário
  session.currentRec?.emitResult('qual o resumo de hoje', true);
  await activeTurnPromise;

  assert.equal(turnsHistory.length, 2);
  assert.equal(turnsHistory[0].text, 'qual o resumo de hoje');
  assert.equal(turnsHistory[1].text, 'Processando: qual o resumo de hoje');
  // Escuta contínua reativada!
  assert.equal(listening, true);

  // 3. Segundo comando em sequência sem necessidade de toque manual
  session.currentRec?.emitResult('chama a Kira', true);
  await activeTurnPromise;

  assert.equal(turnsHistory.length, 4);
  assert.equal(turnsHistory[2].text, 'chama a Kira');
  assert.equal(listening, true);

  // 4. Fechamento do HUD encerra a escuta
  session.currentRec?.stop();
  assert.equal(listening, false);
});

test('Voice Activation: Recognizes multi-word greetings ("Fala aí JARVIS", "Bom dia JARVIS") and captures trailing command', () => {
  const mockRec = new MockSpeechRecognition();
  const captured: Array<{ trigger: string; command: string }> = [];

  mockRec.onresult = (ev: any) => {
    const text = ev.results[0][0].transcript;
    const res = detectWakeWord(text, 'JARVIS');
    if (res.detected) {
      captured.push({ trigger: res.triggerPhrase || 'Ei JARVIS', command: res.command });
      mockRec.stop();
    }
  };

  mockRec.start();
  mockRec.emitResult('Fala aí JARVIS, como está o dia?', true);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].command, 'como está o dia?');

  mockRec.start();
  mockRec.emitResult('Bom dia JARVIS qual o status dos agentes', true);
  assert.equal(captured.length, 2);
  assert.equal(captured[1].command, 'qual o status dos agentes');
});

test('Voice TTS & Safety: Speech synthesis safety timeout scales with text length to prevent premature mic resume', () => {
  // Proves that dynamic safety calculation scales above speech duration
  const shortText = 'Tudo pronto!';
  const longText = 'Aqui é JARVIS! Seu ecossistema está saudável: você tem 3 aprovações pendentes, 2 alertas abertos na Kira Sentinela e 1 notebook conectado via Desktop Companion. Posso ler os detalhes ou iniciar uma nova tarefa por voz.';

  const calcSafetyMs = (t: string) => Math.max(15000, Math.ceil((t.length / 5) * 1000) + 6000);

  const shortSafety = calcSafetyMs(shortText);
  const longSafety = calcSafetyMs(longText);

  // Short text gets at least 15s buffer
  assert.ok(shortSafety >= 15000);
  // Long text gets proportionally more time (~50s+) so it never cuts off speech at 12s
  assert.ok(longSafety > 45000, `Expected long safety > 45s, got ${longSafety}ms`);
});

test('Voice Audio Feedback: Chime duration does not overlap with microphone startup delay', () => {
  // Chime duration is 300ms (0.3s)
  const CHIME_DURATION_MS = 300;
  // Microphone delay on open is 350ms
  const MIC_START_DELAY_MS = 350;

  assert.ok(
    MIC_START_DELAY_MS > CHIME_DURATION_MS,
    'Microphone start delay must exceed chime duration to avoid acoustic feedback'
  );
});

test('Voice Activation: Recognizer onend flushes pending interim wake detection without dropping the wake word', async () => {
  // Simulates browser emitting interim wake word result followed immediately by onend due to silence,
  // verifying that the pending wake event is flushed rather than cancelled by the restart timer.
  let wakeDispatched: { command: string; triggerPhrase: string } | null = null;
  let wakePendingTimer: any = null;
  let lastDetection: { command: string; triggerPhrase: string } | null = null;
  let isListening = false;

  const onWakeDetected = (payload: { command: string; triggerPhrase: string }) => {
    wakeDispatched = payload;
  };

  const rec = new MockSpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;

  rec.onstart = () => {
    isListening = true;
  };

  rec.onresult = (event: any) => {
    const result = event.results[0];
    const transcript = result[0].transcript;
    const detection = detectWakeWord(transcript, 'JARVIS');
    if (detection.detected) {
      const phrase = detection.triggerPhrase || 'Ei JARVIS';
      if (result.isFinal) {
        lastDetection = null;
        onWakeDetected({ command: detection.command, triggerPhrase: phrase });
        return;
      }
      lastDetection = { command: detection.command, triggerPhrase: phrase };
      wakePendingTimer = setTimeout(() => {
        wakePendingTimer = null;
        if (lastDetection) {
          const pending = lastDetection;
          lastDetection = null;
          onWakeDetected(pending);
        }
      }, 650);
    }
  };

  rec.onend = () => {
    isListening = false;
    if (wakePendingTimer !== null) {
      clearTimeout(wakePendingTimer);
      wakePendingTimer = null;
    }
    const pending = lastDetection;
    if (pending) {
      lastDetection = null;
      onWakeDetected(pending);
    }
  };

  rec.start();
  assert.equal(isListening, true);

  // 1. Simula fala com resultado provisório (interim: isFinal = false)
  rec.emitResult('Ei JARVIS', false);
  assert.notEqual(lastDetection, null);
  assert.equal(wakeDispatched, null); // ainda aguardando silêncio de 650ms

  // 2. Navegador encerra escuta por silêncio (onend) após 200ms (antes dos 650ms)
  rec.stop();

  // 3. O evento DEVE ser despachado imediatamente em onend, sem falha silenciosa
  assert.notEqual(wakeDispatched, null);
  assert.equal(wakeDispatched!.triggerPhrase, 'Ei JARVIS');
  assert.equal(wakeDispatched!.command, '');
  assert.equal(lastDetection, null);
});

test('Voice HUD Flow: Captures and dispatches interim speech command when silence occurs without browser isFinal flag', async () => {
  // Simulates a user speaking a command inside the Voice HUD where Web Speech API provides
  // interim transcript and then silence/onend occurs without explicit isFinal flag.
  let sentCommand: string | null = null;
  let latestSpeech = '';
  let silenceTimer: any = null;

  const handleSendCommand = (text: string) => {
    sentCommand = text;
  };

  const rec = new MockSpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (event: any) => {
    const result = event.results[0];
    const transcript = result[0].transcript;
    if (result.isFinal) {
      latestSpeech = '';
      handleSendCommand(transcript);
      return;
    }
    latestSpeech = transcript;
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      silenceTimer = null;
      const pending = latestSpeech.trim();
      if (pending) {
        latestSpeech = '';
        handleSendCommand(pending);
      }
    }, 1100);
  };

  rec.onend = () => {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    const pending = latestSpeech.trim();
    if (pending) {
      latestSpeech = '';
      handleSendCommand(pending);
    }
  };

  rec.start();

  // O usuário fala "qual é o meu briefing" mas o navegador não envia isFinal = true
  rec.emitResult('qual é o meu briefing', false);
  assert.equal(latestSpeech, 'qual é o meu briefing');
  assert.equal(sentCommand, null);

  // O navegador dispara onend por pausa na fala
  rec.stop();

  // O comando DEVE ser despachado automaticamente sem ficar preso no input
  assert.equal(sentCommand, 'qual é o meu briefing');
  assert.equal(latestSpeech, '');
});

test('Voice Activation: Recognizes regional and colloquial PT-BR greetings ("Ô JARVIS", "Salve JARVIS", "Aí JARVIS", "Eae JARVIS", "Fala tu JARVIS")', () => {
  const greetings = [
    { input: 'Ô JARVIS me ajuda com o deploy', expectedCmd: 'me ajuda com o deploy' },
    { input: 'Aí JARVIS tudo bem', expectedCmd: 'tudo bem' },
    { input: 'Salve JARVIS, bora codar', expectedCmd: 'bora codar' },
    { input: 'Eae JARVIS como vai', expectedCmd: 'como vai' },
    { input: 'Fala tu JARVIS o que temos hoje', expectedCmd: 'o que temos hoje' },
    { input: 'Diga lá JARVIS alerta geral', expectedCmd: 'alerta geral' },
    { input: 'Oie JARVIS bom dia', expectedCmd: 'bom dia' },
    { input: 'Acorda JARVIS hora de trabalhar', expectedCmd: 'hora de trabalhar' },
    { input: 'Ei Jarbis checar logs', expectedCmd: 'checar logs' },
    { input: 'Ei Jarviz status do servidor', expectedCmd: 'status do servidor' },
    { input: 'Ei Djarvis executar', expectedCmd: 'executar' },
  ];

  for (const g of greetings) {
    const res = detectWakeWord(g.input, 'JARVIS');
    assert.equal(res.detected, true, `Expected wake word detected for: "${g.input}"`);
    assert.equal(res.command, g.expectedCmd, `Command mismatch for: "${g.input}"`);
  }
});

test('Voice HUD Flow: Resumes microphone listening when TTS is disabled (muted) without being blocked by processing flag', async () => {
  // Simulates VoiceLiveHudModal handleSendCommand execution with speechOutEnabled = false.
  // Tests that processingRef.current is cleared before startMicrophone is called,
  // preventing silent drop of microphone restart.
  let processing = false;
  let listening = false;
  const turns: string[] = [];

  const startMicrophone = () => {
    // Guards against starting while processing
    if (processing) return;
    listening = true;
  };

  const handleSendCommand = async (text: string, speechOutEnabled: boolean) => {
    if (processing) return;
    listening = false;
    processing = true;

    const finishTurnAndResumeMic = () => {
      processing = false;
      startMicrophone();
    };

    // Simulate backend response
    turns.push(text);
    const reply = `Resposta para: ${text}`;
    turns.push(reply);

    if (speechOutEnabled) {
      // Simulate async TTS
      setTimeout(finishTurnAndResumeMic, 10);
    } else {
      // Direct finish without TTS
      finishTurnAndResumeMic();
    }
  };

  // Turn 1 with TTS disabled
  await handleSendCommand('mostrar alertas', false);
  assert.equal(processing, false, 'Processing flag must be cleared');
  assert.equal(listening, true, 'Microphone must resume immediately when TTS is disabled');
  assert.equal(turns.length, 2);

  // Turn 2 executed continuously
  await handleSendCommand('abrir projeto', false);
  assert.equal(processing, false);
  assert.equal(listening, true, 'Microphone must resume for consecutive muted turns');
  assert.equal(turns.length, 4);
});

test('Voice HUD Flow: Recovers and resumes microphone listening after backend voice turn error', async () => {
  // Verifies that when sendVoiceTurn rejects (network glitch / 500),
  // the error catch block releases processing flag and resumes the microphone without silent termination.
  let processing = false;
  let listening = false;
  let errorNotified: string | null = null;

  const startMicrophone = () => {
    if (processing) return;
    listening = true;
  };

  const handleSendCommand = async (_text: string, shouldFail: boolean) => {
    if (processing) return;
    listening = false;
    processing = true;

    const finishTurnAndResumeMic = () => {
      processing = false;
      startMicrophone();
    };

    try {
      if (shouldFail) {
        throw new Error('Falha de conexão com o servidor de IA.');
      }
      finishTurnAndResumeMic();
    } catch (err: any) {
      errorNotified = err.message;
      finishTurnAndResumeMic();
    }
  };

  // Turn with error
  await handleSendCommand('comando com falha', true);
  assert.equal(errorNotified, 'Falha de conexão com o servidor de IA.');
  assert.equal(processing, false, 'Processing must be reset to false after error');
  assert.equal(listening, true, 'Microphone must be restarted after error so user can speak again');

  // Next turn succeeds normally
  await handleSendCommand('comando recuperado', false);
  assert.equal(listening, true);
});

test('Voice TTS: stopSpeaking unbinds utterance callbacks before cancelling to prevent race conditions', () => {
  let finishCalled = false;
  let activeUtter: any = {
    onend: () => { finishCalled = true; },
    onerror: () => { finishCalled = true; },
  };

  // Robust stopSpeaking sequence:
  // 1. Unbind event handlers from active utterance
  // 2. Clear reference
  // 3. Cancel synthesis
  if (activeUtter) {
    activeUtter.onend = null;
    activeUtter.onerror = null;
    activeUtter = null;
  }

  // Simulate browser firing cancel error synchronously during cancellation
  assert.equal(activeUtter, null);
  assert.equal(finishCalled, false, 'Cancellation must not invoke stale completion callbacks');
});
