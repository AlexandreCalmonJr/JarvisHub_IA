import test from 'node:test';
import assert from 'node:assert/strict';
import { isKnownTab, pathForTab, tabFromLocation, TAB_PATHS } from './router';

test('all domain tabs round-trip between tab id and canonical URL path', () => {
  for (const [tab, expectedPath] of Object.entries(TAB_PATHS)) {
    assert.equal(isKnownTab(tab), true, `Expected ${tab} to be known`);
    assert.equal(pathForTab(tab), expectedPath);
    assert.equal(tabFromLocation(expectedPath), tab);
  }
});

test('legacy query parameters and path aliases resolve to expected domain tabs', () => {
  assert.equal(tabFromLocation('/', ''), 'overview');
  assert.equal(tabFromLocation('/apps/dashboard', ''), 'overview');
  assert.equal(tabFromLocation('/', '?tab=coding'), 'coding');
  assert.equal(tabFromLocation('/', '?tab=settings'), 'settings');
  assert.equal(tabFromLocation('/code'), 'coding');
  assert.equal(tabFromLocation('/help'), 'learning');
  assert.equal(tabFromLocation('/config'), 'settings');
  assert.equal(tabFromLocation('/marketplace'), 'store');
  assert.equal(tabFromLocation('/vault'), 'knowledge');
});

test('unknown paths and tabs return not_found and /404', () => {
  assert.equal(isKnownTab('nonexistent'), false);
  assert.equal(pathForTab('nonexistent'), '/404');
  assert.equal(tabFromLocation('/does-not-exist'), 'not_found');
  assert.equal(tabFromLocation('/', '?tab=invalid_tab'), 'not_found');
});
