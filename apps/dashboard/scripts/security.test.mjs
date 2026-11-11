import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');
const auth = read('../../api/auth.py');
const backend = read('../../api/routers/security.py');
const api = read('../src/services/api/security.ts');
const auditView = read('../src/components/security/ContainmentAuditSection.tsx');

const agentsRouter = read('../../api/routers/agents.py');
const toolGateway = read('../../../services/tool_gateway/gateway.py');

test('tool execution is authenticated, permission-checked and owner-scoped', () => {
  assert.match(agentsRouter, /execute_tool_endpoint[\s\S]*?Depends\(require_permission\("coding:use"\)\)/);
  assert.match(agentsRouter, /get_project\(request\.project_id, owner_user_id=owner_user_id\)/);
  assert.match(agentsRouter, /owner_user_id=owner_user_id, actor_role=principal\.role/);
  assert.match(auth, /\/api\/v1\/tools\/execute[\s\S]{0,80}coding:use/);
  assert.match(toolGateway, /get_request\(request\.approval_id, owner_user_id=owner_user_id\)/);
  assert.match(toolGateway, /owner_user_id=owner_user_id/);
});

test('global vector indexes and unsandboxed code execution are not exposed to regular accounts', () => {
  assert.match(toolGateway, /Busca vetorial indisponível até a conclusão do isolamento/);
  assert.match(toolGateway, /request\.tool_name in \{"run_tests", "run_linter", "duckdb_query"\}/);
  assert.match(toolGateway, /actor_role != "admin"/);
});

test('developer and auditor roles can read only their own audit trail', () => {
  assert.match(auth, /"audit:read"/);
  assert.match(backend, /Depends\(require_permission\("audit:read"\)\)/);
  assert.match(backend, /allowed_actors = \{principal\.subject_id, principal\.display_id\}/);
  assert.match(backend, /getattr\(event, "user_id", None\) in allowed_actors/);
});

test('global network isolation is restricted to administrators', () => {
  assert.match(backend, /toggle_network_isolation_endpoint\([\s\S]{0,180}Depends\(require_admin\)/);
});

test('security API errors are not replaced by fabricated healthy or empty data', () => {
  assert.match(api, /Falha ao carregar trilha de auditoria/);
  assert.match(api, /Falha ao consultar estado de segurança/);
  assert.match(api, /Operação de contenção negada/);
  assert.doesNotMatch(api, /MAXIMA_BLINDAGEM|return \{ total: 0, events: \[\] \}/);
});

test('audit page distinguishes a failed request from an empty audit trail', () => {
  assert.match(auditView, /logsError/);
  assert.match(auditView, /role="alert"/);
});
