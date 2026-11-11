import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');
const view = read('../src/components/ApprovalCenter.tsx');
const app = read('../src/App.tsx');
const api = read('../src/services/api/security.ts');
const backend = read('../../api/routers/security.py');

test('approval center receives loading and error state from the dashboard shell', () => {
  assert.match(app, /approvalsLoading=\{approvalsLoading\}/);
  assert.match(app, /approvalsError=\{approvalsError\}/);
  assert.match(view, /A carregar pedidos de aprovação/);
  assert.match(view, /Não foi possível consultar as aprovações/);
});

test('approval decision failures are surfaced and do not change the queue optimistically', () => {
  assert.match(view, /setErrorMessage/);
  assert.match(view, /await decideApproval/);
  assert.match(api, /Falha ao listar aprovações/);
});

test('approval listing and decisions are scoped to the authenticated account', () => {
  assert.match(backend, /@router\.get\(\"\/api\/v1\/approvals\"\)[\s\S]{0,180}owner_user_id=owner/);
  assert.match(backend, /get_request\([\s\S]{0,120}owner_user_id=owner/);
  assert.match(backend, /approve_request\([\s\S]{0,160}owner_user_id=owner/);
  assert.match(backend, /reject_request\([\s\S]{0,300}owner_user_id=owner/);
});

test('approval identity is derived from the server session', () => {
  assert.match(backend, /actor = principal\.display_id/);
  assert.doesNotMatch(api, /decided_by/);
});
