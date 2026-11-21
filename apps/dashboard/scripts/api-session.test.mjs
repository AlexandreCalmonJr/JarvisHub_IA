import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');
const client = read('../src/services/api/client.ts');

test('central API transport always uses same-origin cookie credentials by default', () => {
  assert.match(client, /credentials: init\.credentials \?\? 'same-origin'/);
  assert.match(client, /headers\.has\('Accept'\)/);
  assert.doesNotMatch(client, /X-Jarvis-Session|sessionStorage|localStorage/);
});

for (const domain of ['chat', 'agents', 'models', 'workspace']) {
  test(`${domain} API calls use the central authenticated transport`, () => {
    const source = read(`../src/services/api/${domain}.ts`);
    assert.match(source, /import[\s\S]*\bapiFetch\b[\s\S]*from ['"]\.\/client['"]/);
    assert.match(source, /\bapiFetch\(/);
    assert.doesNotMatch(source, /\bfetch\(/);
  });
}
