import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');
const backend = read('../../api/routers/skills.py');
const api = read('../src/services/api/skills.ts');
const view = read('../src/components/SkillsManagerView.tsx');

test('custom skills are listed and mutated within the authenticated owner scope', () => {
  assert.match(backend, /list_user_skills\(owner_user_id=owner\)/);
  assert.match(backend, /get_user_skill\(skill_id, owner_user_id=owner\)/);
  assert.match(backend, /save_user_skill\(skill_dict, owner_user_id=owner\)/);
  assert.match(backend, /delete_user_skill\(skill_id, owner_user_id=owner\)/);
});

test('unpaired device principals cannot use private skills', () => {
  assert.match(backend, /def _skill_owner/);
  assert.match(backend, /Dispositivo sem associação a uma conta/);
});

test('global skill and Ponytail controls remain administrator-only', () => {
  assert.match(backend, /Apenas administradores podem alterar skills globais/);
  assert.match(backend, /Apenas administradores podem alterar a política global Ponytail/);
});

test('skills API errors are not converted into empty or fabricated data', () => {
  assert.match(api, /handleApiResponse<SkillInfo\[]>/);
  assert.match(api, /Falha ao carregar política Ponytail/);
  assert.match(api, /Falha ao alterar estado da habilidade/);
  assert.doesNotMatch(api, /if \(!res\.ok\) return \[\]|level: 'senior', active: true/);
});

test('skills page keeps independent loading errors and updates category filters', () => {
  assert.match(view, /Promise\.allSettled/);
  assert.match(view, /catalogError/);
  assert.match(view, /agentsError/);
  assert.match(view, /ponytailError/);
  assert.match(view, /statusFilter, categoryTab/);
});
