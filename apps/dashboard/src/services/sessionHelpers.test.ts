import test from 'node:test';
import assert from 'node:assert/strict';
import { canDeleteConversationCard, filterOutDeletedSession } from './sessionHelpers';

test('canDeleteConversationCard allows deleting any saved conversation including /debate and agent_* chats', () => {
  assert.equal(canDeleteConversationCard({ id: 'session-123', isQuickShortcut: false }), true);
  assert.equal(canDeleteConversationCard({ id: 'agent_jarvis_master', isQuickShortcut: false }), true);
  assert.equal(canDeleteConversationCard({ id: 'agent_sentinel_security', isQuickShortcut: false }), true);
  assert.equal(canDeleteConversationCard({ id: 'debate_1732000', isQuickShortcut: false }), true);
  assert.equal(canDeleteConversationCard({ id: '   ', isQuickShortcut: false }), false);
});

test('canDeleteConversationCard hides delete action only for quick-launch agent shortcuts', () => {
  assert.equal(canDeleteConversationCard({ id: 'agent_jarvis_master', isQuickShortcut: true }), false);
  assert.equal(canDeleteConversationCard({ id: 'agent_english_tutor', isQuickShortcut: true }), false);
});

test('filterOutDeletedSession removes only the deleted session ID without mutating input', () => {
  const initial = [
    { id: 'debate_1', title: '/debate Qual a melhor arquitetura?' },
    { id: 'agent_sentinel_security', title: 'Auditoria PDF' },
    { id: 'session-9', title: 'Resumo semanal' },
  ];

  const afterDebateDelete = filterOutDeletedSession(initial, 'debate_1');
  assert.equal(afterDebateDelete.length, 2);
  assert.equal(afterDebateDelete.some((s) => s.id === 'debate_1'), false);
  assert.equal(initial.length, 3);

  const afterAgentChatDelete = filterOutDeletedSession(afterDebateDelete, 'agent_sentinel_security');
  assert.deepEqual(
    afterAgentChatDelete.map((s) => s.id),
    ['session-9']
  );
});
