import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');
const router = read('../src/router.ts');
const sidebar = read('../src/components/Sidebar.tsx');
const app = read('../src/App.tsx');

const pathsBlock = router.match(/export const TAB_PATHS: Record<string, string> = \{([\s\S]*?)\n\};/)?.[1] || '';
const registeredTabs = [...pathsBlock.matchAll(/^\s*([a-z_]+):\s*'\/[^']*',?$/gm)].map((match) => match[1]);

test('every registered tab has a canonical path and a shell renderer', () => {
  assert.ok(registeredTabs.length > 0, 'TAB_PATHS must contain registered routes');
  for (const tab of registeredTabs) {
    assert.ok(pathsBlock.includes(`${tab}:`), `route ${tab} should have a canonical path`);
    assert.ok(sidebar.includes(`handleSelectTab('${tab}')`) || sidebar.includes(`id: '${tab}'`), `sidebar missing ${tab}`);
    assert.ok(app.includes(`activeTab === '${tab}'`), `dashboard shell missing ${tab}`);
  }
});

test('root, aliases and current module paths remain registered', () => {
  assert.match(router, /'': 'chat'/);
  assert.match(router, /habbo: 'office'/);
  assert.match(router, /hardware: 'advisor'/);
  assert.match(router, /'server-logs': 'server_logs'/);
  assert.match(router, /'backend-studio': 'backend_studio'/);
  assert.match(router, /'executive-report': 'executive_report'/);
});

test('unknown paths and tab query values resolve to the not-found experience', () => {
  assert.match(router, /KNOWN_TABS\.has\(tabParam\) \? tabParam : 'not_found'/);
  assert.match(router, /PATH_TABS\[path\] \|\| 'not_found'/);
  assert.match(router, /TAB_PATHS\[tab\] \|\| '\/404'/);
});

test('all dashboard modules are declared in the route registry', () => {
  for (const tab of [
    'chat', 'overview', 'workspace', 'tasks', 'agents', 'skills', 'knowledge',
    'models', 'approvals', 'security', 'advisor', 'server_logs',
    'backend_studio', 'quality', 'design', 'executive_report',
  ]) {
    assert.match(pathsBlock, new RegExp(`\\b${tab}:\\s*['"]`), `route registry missing ${tab}`);
  }
});
