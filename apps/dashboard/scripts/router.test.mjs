import test from 'node:test';
import assert from 'node:assert/strict';
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
