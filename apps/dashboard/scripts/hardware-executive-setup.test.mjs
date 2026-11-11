import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');
const hardwareRouter = read('../../api/routers/hardware.py');
const hardwareApi = read('../src/services/api/hardware.ts');
const hardwareView = read('../src/components/HardwareAdvisorView.tsx');
const intelligence = read('../../../services/engineering_intelligence/tech_debt_analyzer.py');
const studiosRouter = read('../../api/routers/studios.py');
const executiveView = read('../src/components/ExecutiveReportView.tsx');
const setupView = read('../src/components/common/SetupWizardModal.tsx');
const app = read('../src/App.tsx');

test('host hardware diagnostics and global tuning require administrator role', () => {
  assert.equal((hardwareRouter.match(/Depends\(require_admin\)/g) || []).length, 4);
  assert.match(hardwareRouter, /from apps\.api\.auth import Principal, require_admin/);
});

test('hardware API preserves 403 responses instead of fabricating defaults', () => {
  assert.match(hardwareApi, /handleApiResponse/);
  assert.doesNotMatch(hardwareApi, /return \{ mode: 'auto'/);
  assert.match(hardwareView, /Promise\.allSettled/);
  assert.match(hardwareView, /loadError/);
  assert.doesNotMatch(hardwareView, /alert\(/);
});

test('executive project reports receive the authenticated owner identity', () => {
  assert.match(studiosRouter, /owner_user_id=principal\.subject_id if project_id else None/);
  assert.match(intelligence, /calculate_productivity_and_roi\(owner_user_id=owner_user_id\)/);
  assert.match(intelligence, /list_tasks\(limit=100, owner_user_id=owner_user_id\)/);
  assert.match(intelligence, /if project_id and not owner_user_id/);
});

test('technical debt analysis does not follow symlinks outside the project', () => {
  assert.match(intelligence, /f\.is_symlink\(\)/);
  assert.match(intelligence, /f\.resolve\(\)\.relative_to\(p_dir\)/);
});

test('executive report UI distinguishes loading and access errors from empty data', () => {
  assert.match(executiveView, /projectsError/);
  assert.match(executiveView, /roiError/);
  assert.match(executiveView, /debtError/);
  assert.match(executiveView, /reportError/);
  assert.match(executiveView, /Promise\.allSettled/);
  assert.doesNotMatch(executiveView, /catch\(\) => \[\]/);
});

test('setup wizard does not collect or save shared provider API keys', () => {
  assert.match(setupView, /getAccountStorageKey\('jarvis_setup_completed'\)/);
  assert.doesNotMatch(setupView, /apiKey|saveHybridConfig|testHybridConnection|fetchHybridConfig/);
  assert.match(setupView, /Cofre Privado por Conta/);
  assert.match(app, /getAccountStorageKey\('jarvis_setup_completed'\)/);
});
