import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_CATEGORY_CATALOG,
  SKILL_DOMAIN_CATALOG,
  SKILL_QUICK_TEMPLATES,
  normalizeCustomAreaId,
  resolveAgentCategoryLabel,
  resolveSkillDomainLabel,
  buildAgentFilterTabs,
  classifySkillBroadGroup,
} from './domainCatalog';

test('catalog includes all requested non-tech, management, logistics, and IoT areas', () => {
  const required = [
    'administration',
    'business',
    'logistics',
    'iot',
    'health',
    'studies',
    'home_routine',
    'legal',
    'sales_marketing',
    'gastronomy',
  ];
  const agentIds = new Set(AGENT_CATEGORY_CATALOG.map((c) => c.id));
  const skillIds = new Set(SKILL_DOMAIN_CATALOG.map((d) => d.id));

  for (const id of required) {
    assert.equal(agentIds.has(id), true, `Missing agent category: ${id}`);
    assert.equal(skillIds.has(id), true, `Missing skill domain: ${id}`);
  }
  assert.ok(SKILL_QUICK_TEMPLATES.some((t) => t.domain === 'logistics'));
  assert.ok(SKILL_QUICK_TEMPLATES.some((t) => t.domain === 'iot'));
  assert.ok(SKILL_QUICK_TEMPLATES.some((t) => t.domain === 'administration'));
});

test('normalizeCustomAreaId and label resolvers handle Portuguese accents and custom areas cleanly', () => {
  assert.equal(normalizeCustomAreaId('Agronegócio & Café'), 'agronegocio_cafe');
  assert.equal(normalizeCustomAreaId('   '), 'personalizada');
  assert.equal(resolveAgentCategoryLabel('logistics'), 'Logística & Suprimentos');
  assert.equal(resolveAgentCategoryLabel('agronegocio_cafe'), 'Agronegocio Cafe');
  assert.equal(resolveSkillDomainLabel('iot'), 'IoT, Sensores & Automação');
  assert.equal(resolveSkillDomainLabel('arquitetura_interiores'), 'Arquitetura Interiores');
});

test('buildAgentFilterTabs surfaces active known and custom categories dynamically', () => {
  const tabs = buildAgentFilterTabs([
    { category: 'logistics' },
    { category: 'logistics' },
    { category: 'iot' },
    { category: 'agronegocio' },
  ]);
  assert.equal(tabs[0].id, 'all');
  assert.equal(tabs[0].count, 4);
  assert.ok(tabs.some((t) => t.id === 'logistics' && t.count === 2));
  assert.ok(tabs.some((t) => t.id === 'iot' && t.count === 1));
  assert.ok(tabs.some((t) => t.id === 'agronegocio' && t.count === 1));
});

test('classifySkillBroadGroup separates operations, personal, and tech domains', () => {
  assert.equal(classifySkillBroadGroup('logistics'), 'operations');
  assert.equal(classifySkillBroadGroup('administration'), 'operations');
  assert.equal(classifySkillBroadGroup('health'), 'personal');
  assert.equal(classifySkillBroadGroup('gastronomy'), 'personal');
  assert.equal(classifySkillBroadGroup('iot'), 'tech');
  assert.equal(classifySkillBroadGroup('backend'), 'tech');
});
