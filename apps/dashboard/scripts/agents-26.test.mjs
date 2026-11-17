import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');

const catalogFile = read('../src/data/agentsCatalog.ts');
const skillsView = read('../src/components/SkillsManagerView.tsx');
const agentDock = read('../src/components/navigation/AgentDock.tsx');
const contractsAgent = read('../../../packages/contracts/agent.py');

test('ALL_26_AGENTS catalog defines exactly 26 distinct specialists', () => {
  const matches = [...catalogFile.matchAll(/id:\s*['"]([a-z_]+)['"]/g)].map((m) => m[1]);
  assert.equal(matches.length, 26, `Catalog must define exactly 26 agents, found ${matches.length}`);
  const unique = new Set(matches);
  assert.equal(unique.size, 26, 'All 26 agent IDs must be unique');
});

test('All 26 agent roles match the backend contract in packages/contracts/agent.py', () => {
  const contractRoles = [
    'jarvis_master',
    'software_architect',
    'project_manager',
    'research_analyst',
    'project_designer_planner',
    'ux_ui_designer',
    'frontend_mobile_developer',
    'backend_developer',
    'qa_engineer',
    'code_reviewer',
    'data_scientist',
    'business_intelligence',
    'data_engineering_intelligence',
    'data_engineer_pipelines',
    'devops_engineer',
    'network_infrastructure_engineer',
    'cybersecurity_engineer',
    'automation_engineer',
    'threat_modeling_security_architect',
    'secure_code_auditor',
    'api_security_specialist',
    'identity_access_management',
    'software_supply_chain_security',
    'soc_incident_response',
    'ai_security_red_team',
    'privacy_data_protection',
  ];

  for (const role of contractRoles) {
    assert.ok(catalogFile.includes(`role: '${role}'`), `Missing role ${role} in agents catalog`);
    assert.ok(contractsAgent.includes(role.toUpperCase()), `Role ${role} must exist in backend enum`);
  }
});

test('SkillsManagerView integrates 26 agents catalog with category filters and dock pinning', () => {
  assert.ok(skillsView.includes('ALL_26_AGENTS'), 'Must import ALL_26_AGENTS in store');
  assert.ok(skillsView.includes('26 Especialistas'), 'Must display 26 Especialistas badge');
  assert.ok(skillsView.includes('togglePinDockAgent'), 'Must have dock pinning toggle');
  assert.ok(skillsView.includes('jarvis_pinned_dock_agents'), 'Must persist pinned dock agents in localStorage');
  assert.ok(skillsView.includes('jarvis:dock-updated'), 'Must dispatch dock update event');
});

test('AgentDock synchronizes dynamically with the 26 agents catalog', () => {
  assert.ok(agentDock.includes('ALL_26_AGENTS'), 'AgentDock must reference ALL_26_AGENTS');
  assert.ok(agentDock.includes('jarvis:dock-updated'), 'AgentDock must listen for jarvis:dock-updated');
  assert.ok(agentDock.includes('dockAgents.map'), 'AgentDock must render dynamic dockAgents');
});
