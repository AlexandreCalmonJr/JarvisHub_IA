import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContextualGreeting,
  detectWakeWord,
  validatePairingCode,
} from './voiceCompanion';

test('detectWakeWord recognizes PT-BR natural wake phrases with custom assistant names', () => {
  const r1 = detectWakeWord('Ei JARVIS, qual é o meu resumo de hoje?', 'JARVIS');
  assert.equal(r1.detected, true);
  assert.equal(r1.triggerPhrase, 'Ei JARVIS');
  assert.equal(r1.command, 'qual é o meu resumo de hoje?');

  const r2 = detectWakeWord('Oi Luna cria uma planilha de despesas', 'Luna');
  assert.equal(r2.detected, true);
  assert.equal(r2.triggerPhrase, 'Ei Luna');
  assert.equal(r2.command, 'cria uma planilha de despesas');

  const r3 = detectWakeWord('Fala João, verifica meus lembretes', 'João');
  assert.equal(r3.detected, true);
  assert.equal(r3.command, 'verifica meus lembretes');

  const r4 = detectWakeWord('Olá Maria', 'Maria');
  assert.equal(r4.detected, true);
  assert.equal(r4.command, '');
});

test('detectWakeWord handles speech recognition punctuation, Portuguese idioms and phonetic variants', () => {
  // Punctuation after prefix (Chrome Web Speech API commonly outputs commas)
  const punct1 = detectWakeWord('Ei, JARVIS', 'JARVIS');
  assert.equal(punct1.detected, true);
  assert.equal(punct1.command, '');

  const punct2 = detectWakeWord('Ei, JARVIS! Qual é a previsão do tempo?', 'JARVIS');
  assert.equal(punct2.detected, true);
  assert.equal(punct2.command, 'Qual é a previsão do tempo?');

  const punct3 = detectWakeWord('Ei, JARVIS: status do sistema', 'JARVIS');
  assert.equal(punct3.detected, true);
  assert.equal(punct3.command, 'status do sistema');

  // Common Brazilian colloquial greetings: E aí, E ai, Opa, Chama
  const eai1 = detectWakeWord('E aí JARVIS tudo bem?', 'JARVIS');
  assert.equal(eai1.detected, true);
  assert.equal(eai1.command, 'tudo bem?');

  const eai2 = detectWakeWord('E ai, JARVIS, me ajude com o código', 'JARVIS');
  assert.equal(eai2.detected, true);
  assert.equal(eai2.command, 'me ajude com o código');

  const opa = detectWakeWord('Opa JARVIS, execute o build', 'JARVIS');
  assert.equal(opa.detected, true);
  assert.equal(opa.command, 'execute o build');

  const chama = detectWakeWord('Chama o JARVIS para revisar o PR', 'JARVIS');
  assert.equal(chama.detected, true);
  assert.equal(chama.command, 'para revisar o PR');

  // Colloquial greetings without commas (Fala aí, Diga aí, Bom dia, Boa tarde, Boa noite, Beleza)
  const falaAi = detectWakeWord('Fala aí JARVIS tudo certo', 'JARVIS');
  assert.equal(falaAi.detected, true);
  assert.equal(falaAi.command, 'tudo certo');

  const digaAi = detectWakeWord('Diga aí JARVIS como vai', 'JARVIS');
  assert.equal(digaAi.detected, true);
  assert.equal(digaAi.command, 'como vai');

  const bomDia = detectWakeWord('Bom dia JARVIS qual o briefing', 'JARVIS');
  assert.equal(bomDia.detected, true);
  assert.equal(bomDia.command, 'qual o briefing');

  const boaTarde = detectWakeWord('Boa tarde JARVIS', 'JARVIS');
  assert.equal(boaTarde.detected, true);
  assert.equal(boaTarde.command, '');

  const boaNoite = detectWakeWord('Boa noite JARVIS desligar luzes', 'JARVIS');
  assert.equal(boaNoite.detected, true);
  assert.equal(boaNoite.command, 'desligar luzes');

  const beleza = detectWakeWord('Beleza JARVIS iniciar testes', 'JARVIS');
  assert.equal(beleza.detected, true);
  assert.equal(beleza.command, 'iniciar testes');

  // Brazilian vocative and regional colloquial greetings
  const oJarvis = detectWakeWord('Ô JARVIS me ajuda com o deploy', 'JARVIS');
  assert.equal(oJarvis.detected, true);
  assert.equal(oJarvis.command, 'me ajuda com o deploy');

  const aiJarvis = detectWakeWord('Aí JARVIS tudo bem', 'JARVIS');
  assert.equal(aiJarvis.detected, true);
  assert.equal(aiJarvis.command, 'tudo bem');

  const aeJarvis = detectWakeWord('Ae JARVIS qual o status', 'JARVIS');
  assert.equal(aeJarvis.detected, true);
  assert.equal(aeJarvis.command, 'qual o status');

  const salveJarvis = detectWakeWord('Salve JARVIS, bora codar', 'JARVIS');
  assert.equal(salveJarvis.detected, true);
  assert.equal(salveJarvis.command, 'bora codar');

  const eaeJarvis = detectWakeWord('Eae JARVIS como vai', 'JARVIS');
  assert.equal(eaeJarvis.detected, true);
  assert.equal(eaeJarvis.command, 'como vai');

  const falaTu = detectWakeWord('Fala tu JARVIS o que temos hoje', 'JARVIS');
  assert.equal(falaTu.detected, true);
  assert.equal(falaTu.command, 'o que temos hoje');

  const digaLa = detectWakeWord('Diga lá JARVIS alerta geral', 'JARVIS');
  assert.equal(digaLa.detected, true);
  assert.equal(digaLa.command, 'alerta geral');

  const oieJarvis = detectWakeWord('Oie JARVIS bom dia', 'JARVIS');
  assert.equal(oieJarvis.detected, true);
  assert.equal(oieJarvis.command, 'bom dia');

  const acorda = detectWakeWord('Acorda JARVIS hora de trabalhar', 'JARVIS');
  assert.equal(acorda.detected, true);
  assert.equal(acorda.command, 'hora de trabalhar');

  // Direct address without punctuation
  const directNoPunct = detectWakeWord('JARVIS qual o resumo do dia', 'JARVIS');
  assert.equal(directNoPunct.detected, true);
  assert.equal(directNoPunct.command, 'qual o resumo do dia');

  // PT-BR Web Speech API phonetic mistranscriptions of JARVIS (e.g. Jarbas, Jarves, Jarbis, Jarviz, Djarvis, Iarves, J.A.R.V.I.S.)
  const jarbas = detectWakeWord('Ei Jarbas, abre o painel', 'JARVIS');
  assert.equal(jarbas.detected, true);
  assert.equal(jarbas.command, 'abre o painel');

  const jarves = detectWakeWord('Ei Jarves qual o horário', 'JARVIS');
  assert.equal(jarves.detected, true);
  assert.equal(jarves.command, 'qual o horário');

  const jarbis = detectWakeWord('Ei Jarbis checar logs', 'JARVIS');
  assert.equal(jarbis.detected, true);
  assert.equal(jarbis.command, 'checar logs');

  const jarviz = detectWakeWord('Ei Jarviz status do servidor', 'JARVIS');
  assert.equal(jarviz.detected, true);
  assert.equal(jarviz.command, 'status do servidor');

  const djarvis = detectWakeWord('Ei Djarvis executar', 'JARVIS');
  assert.equal(djarvis.detected, true);
  assert.equal(djarvis.command, 'executar');

  const iarves = detectWakeWord('Ei Iarves conectar', 'JARVIS');
  assert.equal(iarves.detected, true);
  assert.equal(iarves.command, 'conectar');

  // PT-BR Chrome Web Speech API frequent mistranscriptions of "Ei JARVIS" as "e João" / "ei João" / "João"
  const eJoaoCmd = detectWakeWord('e João como é que tá o dia hoje', 'JARVIS');
  assert.equal(eJoaoCmd.detected, true);
  assert.equal(eJoaoCmd.triggerPhrase, 'Ei JARVIS');
  assert.equal(eJoaoCmd.command, 'como é que tá o dia hoje');

  const eJoaoSolo = detectWakeWord('e João', 'JARVIS');
  assert.equal(eJoaoSolo.detected, true);
  assert.equal(eJoaoSolo.triggerPhrase, 'Ei JARVIS');
  assert.equal(eJoaoSolo.command, '');

  const eiJoao = detectWakeWord('ei João que horas são', 'JARVIS');
  assert.equal(eiJoao.detected, true);
  assert.equal(eiJoao.command, 'que horas são');

  const joaoSolo = detectWakeWord('João', 'JARVIS');
  assert.equal(joaoSolo.detected, true);
  assert.equal(joaoSolo.command, '');

  const jarvisDots = detectWakeWord('Ei J.A.R.V.I.S. iniciar', 'JARVIS');
  assert.equal(jarvisDots.detected, true);
  assert.equal(jarvisDots.command, 'iniciar');

  const jarvys = detectWakeWord('Ei Jarvys status', 'JARVIS');
  assert.equal(jarvys.detected, true);
  assert.equal(jarvys.command, 'status');

  // Custom configured assistant name with dots/casing
  const customDots = detectWakeWord('Ei JARVIS qual o tempo', 'J.A.R.V.I.S.');
  assert.equal(customDots.detected, true);
  assert.equal(customDots.command, 'qual o tempo');
});

test('detectWakeWord detects wake phrase inside ambient speech and direct name call', () => {
  const ambient = detectWakeWord('ah sim ei jarvis abre minha agenda', 'JARVIS');
  assert.equal(ambient.detected, true);
  assert.equal(ambient.command, 'abre minha agenda');

  const direct = detectWakeWord('Atlas, me ajude com uma ideia', 'Atlas');
  assert.equal(direct.detected, true);
  assert.equal(direct.command, 'me ajude com uma ideia');

  const unrelated = detectWakeWord('hoje o tempo está ótimo', 'JARVIS');
  assert.equal(unrelated.detected, false);
  assert.equal(unrelated.command, 'hoje o tempo está ótimo');
});

test('buildContextualGreeting formats salutation by time of day', () => {
  const morning = buildContextualGreeting({
    assistantName: 'Luna',
    userName: 'Maria Silva',
    hour: 9,
    pendingApprovals: 0,
    openIncidents: 0,
    activeWorkflows: 2,
  });
  assert.match(morning.greeting, /^Bom dia, Maria! Aqui é Luna\./);
  assert.match(morning.briefingLine, /2 rotina/);

  const night = buildContextualGreeting({
    assistantName: 'JARVIS',
    userName: 'Carlos',
    hour: 21,
    pendingApprovals: 0,
    openIncidents: 0,
    activeWorkflows: 0,
  });
  assert.match(night.greeting, /^Boa noite, Carlos!/);
});

test('validatePairingCode validates XXXX-XXXX format', () => {
  assert.equal(validatePairingCode('JRVS-2026'), true);
  assert.equal(validatePairingCode('invalid'), false);
});
