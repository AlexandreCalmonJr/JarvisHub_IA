import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');
const modal = read('../src/components/common/UserProfileModal.tsx');
const scope = read('../src/services/accountScope.ts');
const api = read('../src/services/api/profile.ts');
const backend = read('../../api/routers/system.py');
const schemas = read('../../api/schemas.py');

test('profile preferences and experience mode are isolated by account in browser storage', () => {
  assert.match(modal, /getAccountStorageKey\('jarvis_experience_mode'\)/);
  assert.match(modal, /getAccountStorageKey\('jarvis_chat_messages_v1'\)/);
  assert.match(modal, /getAccountStorageKey\('jarvis_sessions_catalog_v1'\)/);
  assert.match(scope, /jarvis_active_account_v1/);
});

test('profile API uses authenticated account endpoints and server-side owner scope', () => {
  assert.match(api, /credentials: 'include'/);
  assert.match(api, /\$\{API_BASE\}\/user\/profile/);
  assert.match(backend, /get_user_profile\(owner_user_id=principal\.subject_id\)/);
  assert.match(backend, /set_user_profile\(profile_dict, owner_user_id=principal\.subject_id\)/);
});

test('profile API does not send API credentials to the general profile endpoint', () => {
  assert.match(api, /customInstructions/);
  assert.doesNotMatch(api, /huggingfaceToken|groqApiKey|geminiApiKey/);
  assert.match(schemas, /class UserProfilePayload/);
});

test('credential entry remains unavailable until the private credential vault exists', () => {
  assert.match(modal, /Cofre privado por conta em implementação/);
  assert.match(modal, /não envia nem armazena tokens de API/);
  assert.doesNotMatch(modal, /value=\{profile\.huggingfaceToken/);
  assert.doesNotMatch(modal, /value=\{profile\.groqApiKey/);
  assert.doesNotMatch(modal, /value=\{profile\.geminiApiKey/);
});

test('export and history cleanup operate only on the active account keys', () => {
  assert.match(modal, /localStorage\.getItem\(getAccountStorageKey\('jarvis_chat_messages_v1'\)\)/);
  assert.match(modal, /localStorage\.removeItem\(getAccountStorageKey\('jarvis_chat_messages_v1'\)\)/);
});
