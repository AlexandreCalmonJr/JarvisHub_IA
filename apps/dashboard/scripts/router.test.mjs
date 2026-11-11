import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TAB_PATHS, tabFromLocation, pathForTab, isKnownTab } from '../src/router.ts';

test('every registered tab resolves from its canonical URL', () => {
  for (const [tab, path] of Object.entries(TAB_PATHS)) {
    assert.equal(tabFromLocation(path), tab, `route ${path} should resolve to ${tab}`);
    assert.equal(pathForTab(tab), path);
    assert.equal(isKnownTab(tab), true);
  }
});

test('root and legacy aliases remain compatible', () => {
  assert.equal(tabFromLocation('/'), 'chat');
  assert.equal(tabFromLocation('/habbo'), 'office');
  assert.equal(tabFromLocation('/hardware'), 'advisor');
  assert.equal(tabFromLocation('/server-logs'), 'server_logs');
  assert.equal(tabFromLocation('/?tab=chat'), 'chat');
});

test('unknown paths and tab query values are not silently redirected to chat', () => {
  assert.equal(tabFromLocation('/this-page-does-not-exist'), 'not_found');
  assert.equal(tabFromLocation('/?tab=does-not-exist'), 'not_found');
  assert.equal(pathForTab('does-not-exist'), '/404');
  assert.equal(isKnownTab('does-not-exist'), false);
});

test('every registered page is reachable from the sidebar', () => {
  const sidebar = readFileSync(resolve(import.meta.dirname, '../src/components/Sidebar.tsx'), 'utf8');
  for (const tab of Object.keys(TAB_PATHS)) {
    assert.ok(
      sidebar.includes(`handleSelectTab('${tab}')`) || sidebar.includes(`id: '${tab}'`),
      `sidebar is missing navigation for ${tab}`,
    );
  }
});

test('every registered page is reachable from the command palette', () => {
  const palette = readFileSync(resolve(import.meta.dirname, '../src/components/common/CommandPalette.tsx'), 'utf8');
  for (const tab of Object.keys(TAB_PATHS)) {
    assert.ok(palette.includes(`onNavigate('${tab}')`), `command palette is missing ${tab}`);
  }
});

test('every registered page has a rendered view in the dashboard shell', () => {
  const app = readFileSync(resolve(import.meta.dirname, '../src/App.tsx'), 'utf8');
  for (const tab of Object.keys(TAB_PATHS)) {
    assert.ok(app.includes(`activeTab === '${tab}'`), `dashboard shell is missing a view for ${tab}`);
  }
});
