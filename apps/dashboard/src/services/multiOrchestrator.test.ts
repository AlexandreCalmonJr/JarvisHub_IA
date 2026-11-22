import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectDeliverableKind,
  detectInvokedAgents,
  planMultiAgentExecution,
  parseWorkflowPromptToGraph,
  validateCronSchedule,
  type OrchestratorAgentRef,
} from './multiOrchestrator';

const SAMPLE_CATALOG: OrchestratorAgentRef[] = [
  { role: 'jarvis_master', name: 'JARVIS Maestro', proper_name: 'JARVIS', handle: '@jarvis' },
  { role: 'sentinel_security', name: 'Sentinela & Segurança', proper_name: 'Kira', handle: '@kira' },
  { role: 'presentation_creator', name: 'Slides & Apresentações', proper_name: 'Dante', handle: '@dante' },
  { role: 'research_analyst', name: 'Pesquisador Web', proper_name: 'Atlas', handle: '@atlas' },
  { role: 'english_tutor', name: 'Professora de Inglês', proper_name: 'Clara', handle: '@clara' },
  { role: 'ux_ui_designer', name: 'Designer UX/UI', proper_name: 'Vega', handle: '@vega' },
  { role: 'software_architect', name: 'Arquiteto de Software', proper_name: 'Orion', handle: '@orion' },
];

test('detectInvokedAgents resolves multiple specialists invoked naturally by proper name', () => {
  const found = detectInvokedAgents(
    'João, chama a Kira para checar esse PDF e o Dante para montar slides executivos',
    SAMPLE_CATALOG
  );
  const roles = found.map((a) => a.role);
  assert.deepEqual(roles, ['sentinel_security', 'presentation_creator']);
});

test('planMultiAgentExecution classifies sequential multi-agent flow and pptx deliverable', () => {
  const plan = planMultiAgentExecution(
    'Chama o Atlas para pesquisar o mercado e o Dante para montar uma apresentação PowerPoint',
    SAMPLE_CATALOG,
    'João'
  );
  assert.equal(plan.mode, 'sequential');
  assert.equal(plan.deliverable, 'pptx');
  assert.equal(plan.enable_web_search, true);
  assert.equal(plan.invoked_agents.length, 2);
});

test('planMultiAgentExecution activates roundtable mode with at least 3 specialists', () => {
  const plan = planMultiAgentExecution(
    '/debate Mesa redonda sobre arquitetura local vs nuvem',
    SAMPLE_CATALOG,
    'JARVIS'
  );
  assert.equal(plan.mode, 'roundtable');
  assert.ok(plan.invoked_agents.length >= 3);
});

test('detectDeliverableKind distinguishes pptx, pdf, and png requests cleanly', () => {
  assert.equal(detectDeliverableKind('Gere uma apresentação em slides'), 'pptx');
  assert.equal(detectDeliverableKind('Monte um relatório em PDF'), 'pdf');
  assert.equal(detectDeliverableKind('Crie uma imagem PNG de banner'), 'png');
  assert.equal(detectDeliverableKind('Explique o teorema de Pitágoras'), null);
});

test('parseWorkflowPromptToGraph extracts daily cron schedule and specialist nodes', () => {
  const draft = parseWorkflowPromptToGraph(
    'Todo dia às 8h quero que a Clara prepare uma aula curta de inglês e salve no cérebro'
  );
  assert.equal(draft.schedule_enabled, true);
  assert.equal(draft.schedule_cron, '0 8 * * *');
  assert.equal(validateCronSchedule(draft.schedule_cron), true);
  assert.equal(validateCronSchedule('invalid cron'), false);
  assert.ok(draft.nodes.some((n) => n.agentRole === 'english_tutor'));
  assert.equal(draft.connections.length, draft.nodes.length - 1);
});
