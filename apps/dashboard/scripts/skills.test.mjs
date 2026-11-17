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

test('skills page integrates OpenBot UI with SkillDetailsModal and 26 specialists', () => {
  const card = read('../src/components/skills/SkillCard.tsx');
  const agentModal = read('../src/components/skills/SkillAgentModal.tsx');
  const detailsModal = read('../src/components/skills/SkillDetailsModal.tsx');
  const createModal = read('../src/components/skills/CreateSkillModal.tsx');

  // View integrates SkillDetailsModal and OpenBot headers
  assert.match(view, /SkillDetailsModal/);
  assert.match(view, /Habilidades dos Agentes/);
  assert.match(view, /ALL_26_AGENTS/);

  // SkillCard displays agent avatars and prompt directives
  assert.match(card, /ALL_26_AGENTS/);
  assert.match(card, /onViewInstructions/);
  assert.match(card, /Diretrizes/);

  // Agent Modal supports filtering and multi-select across all 26 specialists
  assert.match(agentModal, /ALL_26_AGENTS/);
  assert.match(agentModal, /Marcar Filtrados/);

  // Details Modal provides full prompt guidelines and copy action
  assert.match(detailsModal, /Diretrizes de Prompt Injetadas/);
  assert.match(detailsModal, /handleCopyInstructions/);

  // Create Skill Modal offers fast templates and ECC Markdown examples
  assert.match(createModal, /SKILL_TEMPLATES/);
  assert.match(createModal, /loadEccExample/);
});
