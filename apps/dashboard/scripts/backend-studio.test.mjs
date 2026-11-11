import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');
const router = read('../../api/routers/studios.py');
const mockService = read('../../../services/backend_studio/mock_server.py');
const sqlService = read('../../../services/backend_studio/sql_playground.py');
const api = read('../src/services/api/studios.ts');
const mockView = read('../src/components/studios/backend/MockServerSection.tsx');
const sqlView = read('../src/components/studios/backend/SqlPlaygroundSection.tsx');

test('mock endpoints are migrated and queried by authenticated account owner', () => {
  assert.match(mockService, /ALTER TABLE mock_endpoints ADD COLUMN owner_user_id TEXT/);
  assert.match(mockService, /WHERE owner_user_id = \?/);
  assert.match(mockService, /owner_user_id, method, path/);
  assert.match(mockService, /WHERE mock_endpoints\.owner_user_id = excluded\.owner_user_id/);
  assert.match(mockService, /owner_user_id: str/);
  assert.match(router, /mock_server_service\.list_endpoints\(owner_id\)/);
  assert.match(router, /match_and_serve\([\s\S]*principal\.subject_id/);
});

test('legacy mocks are not automatically assigned to the first authenticated account', () => {
  assert.match(mockService, /Registros legados sem owner_user_id permanecem/);
  assert.doesNotMatch(mockService, /UPDATE mock_endpoints SET owner_user_id/);
});

test('SQL playground rejects absolute paths and project directory traversal', () => {
  assert.match(sqlService, /requested\.is_absolute\(\)/);
  assert.match(sqlService, /target\.relative_to\(project_dir\)/);
  assert.match(sqlService, /project_id/);
  assert.match(router, /_require_owned_project\(payload\.project_id, principal\)/);
});

test('SQL playground uses a read-only SQLite connection and bounded results', () => {
  assert.match(sqlService, /mode=ro/);
  assert.match(sqlService, /max\(1, min\(int\(limit\), 1000\)\)/);
  assert.match(sqlService, /read_only.*True/);
  assert.doesNotMatch(sqlService, /conn\.commit\(\)/);
});

test('project-scoped studio endpoints verify ownership before reading or running code', () => {
  assert.match(router, /db_manager\.get_project\(project_id, owner_user_id=owner_id\)/);
  assert.match(router, /discover_project_tests_endpoint[\s\S]*?_require_owned_project\(project_id, principal\)/);
  assert.match(router, /run_project_tests_endpoint[\s\S]*?_require_owned_project\(payload\.project_id, principal\)/);
  assert.match(router, /analyze_project_tech_debt_endpoint[\s\S]*?_require_owned_project\(project_id, principal\)/);
});

test('global intelligence endpoints remain administrator-only', () => {
  assert.match(router, /Métricas globais de produtividade estão disponíveis apenas para administradores/);
  assert.match(router, /Relatórios globais estão disponíveis apenas para administradores/);
});

test('studio API requests preserve authentication and surface HTTP failures', () => {
  assert.match(api, /credentials: 'include'/);
  assert.match(api, /handleApiResponse/);
  assert.doesNotMatch(api, /if \(!res\.ok\) return \[\]|return \{\}/);
});

test('Backend Studio pages show loading and error states without native confirm dialogs', () => {
  assert.match(mockView, /mockError/);
  assert.match(mockView, /Carregando endpoints/);
  assert.match(mockView, /confirmDeleteId/);
  assert.doesNotMatch(mockView, /window\.confirm/);
  assert.match(sqlView, /projectsError/);
  assert.match(sqlView, /databasesError/);
  assert.match(sqlView, /somente leitura/);
});
