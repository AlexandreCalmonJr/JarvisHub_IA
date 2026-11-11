import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');
const api = read('../src/services/api/workspace.ts');
const view = read('../src/components/ProjectWorkspaceView.tsx');
const card = read('../src/components/workspace/ProjectCard.tsx');
const memory = read('../src/components/workspace/ProjectMemoryModal.tsx');
const backend = read('../../api/routers/workspace.py');
const webhooks = read('../src/components/workspace/WebhooksModal.tsx');

test('workspace list and project memory API errors are not converted to empty arrays', () => {
  assert.match(api, /Falha ao carregar os projetos do workspace/);
  assert.match(api, /Falha ao carregar a memória do projeto/);
  assert.match(api, /Falha ao carregar o histórico Git do projeto/);
  assert.doesNotMatch(api, /if \(!res\.ok\) return \[\]/);
});

test('workspace page distinguishes loading failures from an empty project list', () => {
  assert.match(view, /loadError/);
  assert.match(view, /Os projetos não puderam ser carregados/);
  assert.match(view, /role="alert"/);
});

test('project memory modal is reachable from each project card', () => {
  assert.match(view, /onOpenMemory=\{/);
  assert.match(card, /onOpenMemory\?:/);
  assert.match(card, /<span>Memória<\/span>/);
  assert.match(memory, /Não foi possível carregar as memórias/);
});

test('workspace actions display errors through the dashboard notification system', () => {
  assert.match(view, /notify\(\`Erro ao ler arquivo:/);
  assert.match(view, /notify\(\`Erro ao excluir workspace:/);
  assert.match(memory, /notify\(\`Erro ao registrar memória:/);
});

test('workspace endpoints enforce account ownership on private project operations', () => {
  assert.ok((backend.match(/principal\s*:\s*Principal\s*=\s*Depends\(get_principal\)/g) || []).length >= 10);
  assert.match(backend, /owner_user_id=principal\.subject_id/);
  assert.match(backend, /_require_owned_project\(project_id, principal\)/);
});

test('webhook configuration failure is visible and cannot silently overwrite saved values', () => {
  assert.match(webhooks, /setLoadError/);
  assert.match(webhooks, /Não foi possível carregar as configurações atuais/);
  assert.match(webhooks, /disabled=\{saving \|\| !!loadError\}/);
});
