import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');
const view = read('../src/components/CodingAgentView.tsx');
const api = read('../src/services/api/coding.ts');
const backend = read('../../api/routers/coding.py');

test('Coding Agent local preferences and session cache are partitioned by account', () => {
  assert.ok((view.match(/getAccountStorageKey\(/g) || []).length >= 2);
  assert.match(view, /readAccountSetting/);
  assert.match(view, /writeAccountSetting/);
  assert.doesNotMatch(view, /localStorage\.(?:getItem|setItem|removeItem)\('jarvis_coding_(?!user)/);
});

test('approval identity is derived from the authenticated session, not a user-editable field', () => {
  assert.doesNotMatch(view, /decidedBy|Autorizador humano|local_developer/);
  assert.doesNotMatch(api, /decided_by:\s*decidedBy/);
  assert.match(backend, /actor = principal\.display_id/);
  assert.match(backend, /owner_user_id=owner_user_id/);
});

test('Coding Agent history API failures are not represented as an empty conversation', () => {
  assert.match(api, /Falha ao carregar histórico do Coding Agent/);
  assert.doesNotMatch(api, /if \(!res\.ok\) return \[\]/);
  assert.match(view, /historyError/);
});

test('Coding Agent initialization preserves independent project and tool API errors', () => {
  assert.match(view, /Promise\.allSettled/);
  assert.match(view, /Falha ao carregar ferramentas do Coding Agent/);
  assert.match(view, /Falha ao carregar projetos/);
});

test('Coding Agent history and execution are scoped to the authenticated account in the backend', () => {
  assert.ok((backend.match(/principal\s*:\s*Principal\s*=\s*Depends\(get_principal\)/g) || []).length >= 4);
  assert.match(backend, /owner_user_id=_private_owner\(principal\)/);
  assert.match(backend, /owner_user_id=owner_user_id/);
});
