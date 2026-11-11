import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');
const hook = read('../src/hooks/useChatStream.ts');
const history = read('../src/components/chat/ChatHistoryDrawer.tsx');
const api = read('../src/services/api/chat.ts');
const auth = read('../src/components/AuthGate.tsx');
const backend = read('../../api/routers/chat.py');

test('active chat messages and session ID are partitioned by authenticated account', () => {
  assert.match(hook, /getAccountStorageKey\(STORAGE_MESSAGES_KEY\)/);
  assert.match(hook, /getAccountStorageKey\(STORAGE_SESSION_KEY\)/);
});

test('local history catalog and per-session messages are partitioned by account', () => {
  assert.match(history, /getAccountStorageKey\(STORAGE_CATALOG_KEY\)/);
  assert.match(history, /getAccountStorageKey\(\`jarvis_session_messages_\$\{sessionId\}\`\)/);
  assert.match(auth, /setActiveAccountScope\(accountId\)/);
  assert.match(auth, /clearActiveAccountScope\(\)/);
});

test('chat history API failures are surfaced instead of converted into empty results', () => {
  assert.match(api, /handleApiResponse<ChatSessionItem\[]>/);
  assert.match(api, /Falha ao carregar a conversa/);
  assert.match(api, /Falha ao pesquisar o histórico/);
  assert.match(api, /Falha ao excluir a conversa/);
});

test('chat history deletion only removes local cache after backend confirms success', () => {
  const deleteIndex = history.indexOf('await deleteChatSession(sid)');
  const cacheIndex = history.indexOf('removeSessionLocally(sid)');
  assert.ok(deleteIndex >= 0 && cacheIndex > deleteIndex);
  assert.match(history, /setHistoryError/);
});

test('chat endpoints use authenticated principals and owner-scoped persistence', () => {
  assert.ok((backend.match(/principal\s*:\s*Principal/g) || []).length >= 8);
  assert.ok((backend.match(/owner_user_id/g) || []).length >= 8);
});
