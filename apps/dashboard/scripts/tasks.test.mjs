import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');
const view = read('../src/components/TaskManagerView.tsx');
const api = read('../src/services/api/chat.ts');
const backend = read('../../api/routers/chat.py');

test('task manager shows loading and API failure separately from an empty history', () => {
  assert.match(view, /loadError/);
  assert.match(view, /A lista não está disponível/);
  assert.match(view, /Carregando tarefas do banco de dados/);
});

test('task API failures are propagated instead of returning fake zero results', () => {
  assert.match(api, /Falha ao carregar tarefas/);
  assert.match(api, /Falha ao limpar tarefas antigas/);
  assert.match(api, /Falha ao excluir tarefa/);
  assert.doesNotMatch(api, /return \{ purged_count: 0/);
});

test('task deletion requires an explicit confirmation in the dashboard modal', () => {
  assert.match(view, /Excluir registro de tarefa\?/);
  assert.match(view, /Excluir tarefa/);
  assert.match(view, /setConfirmDeleteId\(task\.id\)/);
});

test('empty task history does not display a 100 percent success rate', () => {
  assert.match(view, /successRate === null \? '—'/);
  assert.match(view, /: null/);
});

test('task list, delete and purge operations are owner-scoped by the backend', () => {
  assert.match(backend, /@router\.get\("\/api\/v1\/tasks"\)[\s\S]{0,180}owner_user_id=_private_owner\(principal\)/);
  assert.match(backend, /db_manager\.delete_task\(task_id, owner_user_id=_private_owner\(principal\)\)/);
  assert.match(backend, /owner_user_id=_private_owner\(principal\)/);
});
