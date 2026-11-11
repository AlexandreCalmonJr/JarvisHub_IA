import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');
const view = read('../src/components/AgentCenterView.tsx');
const api = read('../src/services/api/agents.ts');
const backend = read('../../api/routers/agents.py');

test('Agent Center does not substitute a static catalog when the API fails', () => {
  assert.doesNotMatch(view, /FALLBACK_AGENTS/);
  assert.match(view, /loadError/);
  assert.match(view, /Não foi possível carregar os agentes/);
});

test('agent catalog, memories, tools and history errors are not hidden as empty results', () => {
  assert.match(api, /Falha ao carregar o catálogo de agentes/);
  assert.match(api, /Falha ao carregar memórias do agente/);
  assert.match(api, /Falha ao carregar ferramentas disponíveis/);
  assert.match(api, /Falha ao carregar histórico do especialista/);
  assert.doesNotMatch(api, /if \(!res\.ok\) return \[\]/);
});

test('agent catalog reads require an authenticated principal and config writes remain admin-only', () => {
  assert.ok((backend.match(/principal: Principal = Depends\(get_principal\)/g) || []).length >= 2);
  assert.match(backend, /principal: Principal = Depends\(require_admin\)/);
});

test('agent playground reports provider failure instead of fabricating a successful answer', () => {
  assert.match(backend, /status_code=503/);
  assert.match(backend, /O provedor de IA está indisponível/);
  assert.doesNotMatch(backend, /Parecer técnico estruturado de \{profile\.name\}/);
});

test('agent memories and executions remain owner-scoped', () => {
  assert.match(backend, /owner_user_id=_private_owner\(principal\)/);
  assert.match(backend, /owner_user_id=owner_user_id/);
  assert.match(backend, /db_manager\.get_project\([\s\S]{0,100}owner_user_id=owner_user_id/);
});
