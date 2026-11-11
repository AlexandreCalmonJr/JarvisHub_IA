import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');
const backend = read('../../../services/quality_studio/test_runner.py');
const router = read('../../api/routers/studios.py');
const schema = read('../../api/schemas.py');
const api = read('../src/services/api/studios.ts');
const view = read('../src/components/QualityStudioView.tsx');

test('test discovery excludes dependency, build and VCS directories and external symlinks', () => {
  assert.match(backend, /_EXCLUDED_DIRS/);
  assert.match(backend, /resolved\.relative_to\(project_dir\.resolve\(\)\)/);
  assert.match(backend, /_is_safe_project_file/);
});

test('test execution is asynchronous and uses argument arrays without shell execution', () => {
  assert.match(backend, /async def run_tests/);
  assert.match(backend, /SubprocessSandbox/);
  assert.match(backend, /\.run_command\(command, cwd=proj_dir/);
  assert.doesNotMatch(backend, /subprocess\.run\(/);
});

test('test execution accepts only discovered project-relative files', () => {
  assert.match(backend, /requested\.is_absolute\(\)/);
  assert.match(backend, /requested\.as_posix\(\) not in discovery\["test_files"\]/);
  assert.match(router, /_require_owned_project\(payload\.project_id, principal\)/);
});

test('test runner timeout is bounded at the API and service layers', () => {
  assert.match(schema, /timeout_seconds: int = Field\(default=45, ge=5, le=300/);
  assert.match(backend, /max\(5, min\(int\(timeout_seconds\), 300\)\)/);
});

test('Playwright generation escapes strings and ignores unknown actions', () => {
  assert.match(backend, /json\.dumps\(str\(step\.get\("target"/);
  assert.match(backend, /elif action == "fill"/);
  assert.doesNotMatch(backend, /subprocess\.run/);
});

test('Quality Studio UI exposes independent API errors and empty states', () => {
  assert.match(view, /projectsError/);
  assert.match(view, /discoveryError/);
  assert.match(view, /chaosError/);
  assert.match(view, /playwrightError/);
  assert.match(view, /Nenhum arquivo de teste encontrado/);
  assert.doesNotMatch(view, /alert\(/);
});

test('studio API does not fabricate empty test lists on HTTP failure', () => {
  assert.match(api, /fetchProjectTests/);
  assert.match(api, /handleApiResponse/);
  assert.doesNotMatch(api, /if \(!res\.ok\) return \{ total_tests: 0, suites: \[\] \}/);
});
