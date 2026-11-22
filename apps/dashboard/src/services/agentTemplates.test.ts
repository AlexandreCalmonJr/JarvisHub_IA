import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_TEMPLATE_LIBRARY,
  buildInstallPayloadFromTemplate,
  canUninstallAgent,
  filterAgentTemplates,
  isTemplateInstalled,
} from './agentTemplates';

test('AGENT_TEMPLATE_LIBRARY unifies all 30 ready-to-use templates including formerly technical catalog roles', () => {
  assert.ok(AGENT_TEMPLATE_LIBRARY.length >= 30);

  const expectedTechnicalRoles = [
    'project_manager',
    'project_designer_planner',
    'automation_engineer',
    'data_scientist',
    'business_intelligence',
    'data_engineering_intelligence',
    'data_engineer_pipelines',
    'network_infrastructure_engineer',
    'threat_modeling_security_architect',
    'secure_code_auditor',
    'api_security_specialist',
    'identity_access_management',
    'software_supply_chain_security',
    'soc_incident_response',
    'ai_security_red_team',
    'privacy_data_protection',
  ];

  const roles = new Set(AGENT_TEMPLATE_LIBRARY.map((t) => t.role));
  for (const role of expectedTechnicalRoles) {
    assert.ok(roles.has(role), `Expected technical specialist role '${role}' in AGENT_TEMPLATE_LIBRARY`);
  }

  for (const tpl of AGENT_TEMPLATE_LIBRARY) {
    assert.ok(tpl.proper_name.length >= 2);
    assert.ok(tpl.handle.startsWith('@'));
    assert.ok(tpl.skills.length >= 2, `${tpl.proper_name} should include at least 2 skills`);
    assert.ok(tpl.examplePrompts.length >= 2, `${tpl.proper_name} should include example prompts`);
  }
});

test('isTemplateInstalled matches strictly by template_id or role without false handle collisions', () => {
  const chef = AGENT_TEMPLATE_LIBRARY.find((t) => t.templateId === 'tpl_chef_gael')!;
  assert.equal(isTemplateInstalled(chef, []), false);
  assert.equal(isTemplateInstalled(chef, [{ role: 'chef_nutricao', handle: '@other' }]), true);
  assert.equal(
    isTemplateInstalled(chef, [{ role: 'custom_2', handle: '@x', template_id: 'tpl_chef_gael' }]),
    true
  );
  // Different role sharing only handle should NOT produce a false installed match
  assert.equal(isTemplateInstalled(chef, [{ role: 'unrelated_role', handle: '@gael' }]), false);
});

test('filterAgentTemplates filters by category, skill keywords, and availability', () => {
  const financeOnly = filterAgentTemplates(AGENT_TEMPLATE_LIBRARY, { category: 'financas' });
  assert.ok(financeOnly.length >= 2);
  assert.ok(financeOnly.every((t) => t.category === 'financas'));

  const securityOnly = filterAgentTemplates(AGENT_TEMPLATE_LIBRARY, { category: 'seguranca' });
  assert.ok(securityOnly.length >= 8);

  const bySkill = filterAgentTemplates(AGENT_TEMPLATE_LIBRARY, { query: 'geladeira' });
  assert.equal(bySkill.length, 1);
  assert.equal(bySkill[0].templateId, 'tpl_chef_gael');

  const availableOnly = filterAgentTemplates(AGENT_TEMPLATE_LIBRARY, {
    query: 'geladeira',
    onlyAvailable: true,
    installedAgents: [{ role: 'chef_nutricao', handle: '@gael' }],
  });
  assert.equal(availableOnly.length, 0);
});

test('buildInstallPayloadFromTemplate embeds selected skills and tools cleanly', () => {
  const lucas = AGENT_TEMPLATE_LIBRARY.find((t) => t.templateId === 'tpl_lucas_financas')!;
  const subset = lucas.skills.slice(0, 2).map((s) => s.id);
  const payload = buildInstallPayloadFromTemplate(lucas, subset);

  assert.equal(payload.role, lucas.role);
  assert.equal(payload.proper_name, 'Lucas');
  assert.equal(payload.template_id, 'tpl_lucas_financas');
  assert.equal(payload.installed_skills?.length, 2);
  assert.equal(payload.allowed_tools?.length, 2);
  assert.ok(payload.system_prompt?.includes(lucas.skills[0].name));
});

test('canUninstallAgent protects only jarvis_master and allows uninstalling any other agent', () => {
  assert.equal(canUninstallAgent({ role: 'jarvis_master' }), false);
  assert.equal(canUninstallAgent({ role: 'sentinel_security' }), true);
  assert.equal(canUninstallAgent({ role: 'english_tutor' }), true);
  assert.equal(canUninstallAgent({ role: 'chef_nutricao' }), true);
});

test('Phase 4 templates expose Iris Excel generator, Kauan Image Studio, and Enzo Video Director', () => {
  const iris = AGENT_TEMPLATE_LIBRARY.find((t) => t.templateId === 'tpl_iris_planilhas');
  const kauan = AGENT_TEMPLATE_LIBRARY.find((t) => t.templateId === 'tpl_kauan_imagens');
  const enzo = AGENT_TEMPLATE_LIBRARY.find((t) => t.templateId === 'tpl_enzo_videos');

  assert.ok(iris, 'Iris spreadsheet template should exist');
  assert.ok(iris.skills.some((s) => s.toolId === 'generate_xlsx'));

  assert.ok(kauan, 'Kauan Image Studio template should exist');
  assert.equal(kauan.role, 'criador_imagens');
  assert.equal(kauan.recommendedModel, 'gemini-3.1-flash-lite-image');

  assert.ok(enzo, 'Enzo Video Director template should exist');
  assert.equal(enzo.role, 'diretor_videos');
  assert.equal(enzo.recommendedModel, 'gemini-omni-1.2-flash');

  const rafael = AGENT_TEMPLATE_LIBRARY.find((t) => t.templateId === 'tpl_rafael_apps');
  assert.ok(rafael, 'Rafael App Builder template should exist');
  assert.equal(rafael.role, 'construtor_apps');
  assert.ok(rafael.skills.some((s) => s.toolId === 'scaffold_android_app'));
  assert.ok(rafael.skills.some((s) => s.toolId === 'scaffold_windows_app'));
});

