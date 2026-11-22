import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ASSISTANT_NAME,
  normalizeAssistantName,
  getAssistantInitial,
  getTimeBasedGreeting,
  formatAssistantPlaceholder,
  isTabVisibleInMode,
  normalizeExperienceMode,
} from './assistantIdentity';

test('normalizeAssistantName defaults to JARVIS and trims/caps at 40 chars', () => {
  assert.equal(normalizeAssistantName(''), DEFAULT_ASSISTANT_NAME);
  assert.equal(normalizeAssistantName('   '), DEFAULT_ASSISTANT_NAME);
  assert.equal(normalizeAssistantName('  Maria  '), 'Maria');
  assert.equal(normalizeAssistantName('João\nSilva'), 'João Silva');
  assert.equal(normalizeAssistantName('A'.repeat(60)).length, 40);
});

test('getAssistantInitial extracts uppercase first grapheme', () => {
  assert.equal(getAssistantInitial('Maria'), 'M');
  assert.equal(getAssistantInitial('joão'), 'J');
  assert.equal(getAssistantInitial(''), 'J');
});

test('getTimeBasedGreeting adapts to hour of day and assistant name', () => {
  const morning = getTimeBasedGreeting('Maria', 'Ana Clara', 9);
  assert.equal(morning.headline, 'Bom dia, Ana');
  assert.match(morning.subtitle, /Maria/);

  const afternoon = getTimeBasedGreeting('João', 'Alexandre', 15);
  assert.equal(afternoon.headline, 'Boa tarde, Alexandre');
  assert.match(afternoon.subtitle, /João/);

  const evening = getTimeBasedGreeting('JARVIS', '', 21);
  assert.equal(evening.headline, 'Boa noite');
  assert.match(evening.subtitle, /JARVIS/);
});

test('formatAssistantPlaceholder reflects assistant name and mode', () => {
  const simpleText = formatAssistantPlaceholder('Maria', 'simple');
  assert.match(simpleText, /Maria/);
  assert.match(simpleText, /resumo/i);

  const engText = formatAssistantPlaceholder('João', 'engineering');
  assert.match(engText, /João/);
  assert.match(engText, /@/);
});

test('isTabVisibleInMode hides technical engineering tabs in simple mode', () => {
  assert.equal(isTabVisibleInMode('overview', 'simple'), true);
  assert.equal(isTabVisibleInMode('chat', 'simple'), true);
  assert.equal(isTabVisibleInMode('knowledge', 'simple'), true);
  assert.equal(isTabVisibleInMode('tasks', 'simple'), true);
  assert.equal(isTabVisibleInMode('server_logs', 'simple'), false);
  assert.equal(isTabVisibleInMode('backend_studio', 'simple'), false);
  assert.equal(isTabVisibleInMode('coding', 'simple'), false);

  assert.equal(isTabVisibleInMode('server_logs', 'engineering'), true);
  assert.equal(isTabVisibleInMode('coding', 'engineering'), true);
});

test('normalizeExperienceMode maps legacy essential mode to simple', () => {
  assert.equal(normalizeExperienceMode('simple'), 'simple');
  assert.equal(normalizeExperienceMode('essential'), 'simple');
  assert.equal(normalizeExperienceMode('technical'), 'engineering');
  assert.equal(normalizeExperienceMode('advanced'), 'engineering');
  assert.equal(normalizeExperienceMode(undefined), 'engineering');
});
