import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (relativePath) => readFileSync(resolve(import.meta.dirname, relativePath), 'utf8');
const overview = read('../src/components/Overview.tsx');
const app = read('../src/App.tsx');
const systemApi = read('../src/services/api/system.ts');
const backendSystem = read('../../api/routers/system.py');

test('overview does not present invented host specifications or unverified security guarantees', () => {
  assert.doesNotMatch(overview, /Windows 10|Intel i5|32GB RAM|Zero Bypass|Auditoria HMAC e Sandbox habilitados/);
});

test('overview distinguishes loading, unavailable data and API errors', () => {
  assert.match(overview, /healthLoading/);
  assert.match(overview, /approvalsLoading/);
  assert.match(overview, /healthError/);
  assert.match(overview, /approvalsError/);
  assert.match(overview, /role="alert"/);
});

test('dashboard preserves independent health and approval request outcomes', () => {
  assert.match(app, /Promise\.allSettled/);
  assert.match(app, /setHealthError/);
  assert.match(app, /setApprovalsError/);
  assert.match(app, /healthError=\{healthError\}/);
});

test('overview health data is backed by the real system health endpoint', () => {
  assert.match(systemApi, /\$\{API_BASE\}\/system\/health/);
  assert.match(backendSystem, /@router\.get\("\/api\/v1\/system\/health"\)/);
  assert.match(backendSystem, /"inference_queue"/);
  assert.match(backendSystem, /"model_runtime"/);
});
