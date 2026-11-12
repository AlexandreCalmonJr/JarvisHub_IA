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

test('per-agent routes are account-scoped and require a valid vault key', () => {
  assert.match(backend, /@router\.get\("\/api\/v1\/agent-routes"\)/);
  assert.match(backend, /@router\.put\("\/api\/v1\/agent-routes\/\{role\}"\)/);
  assert.match(backend, /@router\.delete\("\/api\/v1\/agent-routes\/\{role\}"\)/);
  assert.match(backend, /_account_owner\(principal\)/);
  assert.match(
    backend,
    /key_vault\.get_key\(payload\.key_id[\s\S]{0,120}owner_user_id\)/
  );
  assert.doesNotMatch(backend, /get_key_for_request\(payload\.key_id/);
  assert.match(backend, /db_manager\.set_agent_route\(/);
  assert.match(backend, /db_manager\.delete_agent_route\(/);
});

test('agent playground uses the account route key and model', () => {
  assert.match(backend, /resolve_account_agent_route\(/);
  assert.match(backend, /key_id=route\.key_id/);
  assert.match(backend, /model_name=route\.model or profile\.preferred_model/);
});

test('Agent Center exposes a per-account route editor without admin-only gating', () => {
  const routeModal = read('../src/components/agents/AgentRouteModal.tsx');
  assert.match(view, /AgentRouteModal/);
  assert.match(view, /Configurar Rota da Conta/);
  assert.doesNotMatch(view, /Consulta disponível · gestão restrita/);
  assert.match(api, /fetchAgentRoutes/);
  assert.match(api, /setAgentRoute/);
  assert.match(api, /deleteAgentRoute/);
  assert.match(routeModal, /fetchKeyVault/);
  assert.match(routeModal, /key\.owner_user_id/);
  assert.match(routeModal, /Cofre de Chaves/);
  assert.match(routeModal, /Usar perfil global/);
  assert.match(routeModal, /já não está disponível/);
});
