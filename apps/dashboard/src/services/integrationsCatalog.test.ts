import test from 'node:test';
import assert from 'node:assert/strict';
import {
  maskSecret,
  parseGitHubRepoRef,
  parseFigmaFileKey,
  parseSkillMarkdown,
  canAgentAccessResource,
} from './integrationsCatalog.ts';

test('parseGitHubRepoRef handles full URLs and owner/repo shorthand', () => {
  assert.deepEqual(parseGitHubRepoRef('https://github.com/vercel/next.js.git'), {
    owner: 'vercel',
    repo: 'next.js',
  });
  assert.deepEqual(parseGitHubRepoRef('facebook/react'), {
    owner: 'facebook',
    repo: 'react',
  });
  assert.equal(parseGitHubRepoRef('not a repo'), null);
});

test('parseFigmaFileKey extracts key from design/file URLs and raw keys', () => {
  assert.equal(
    parseFigmaFileKey('https://www.figma.com/design/AbCdEf123456789/JARVIS-UI?node-id=1-2'),
    'AbCdEf123456789'
  );
  assert.equal(parseFigmaFileKey('XyZ9876543210aBc'), 'XyZ9876543210aBc');
  assert.equal(parseFigmaFileKey('short'), null);
});

test('parseSkillMarkdown parses YAML frontmatter and body cleanly', () => {
  const md = `---
name: Auditoria OWASP Express
description: Regras práticas para revisar endpoints Express e cookies seguros.
domain: security
---

# Regras
1. Verificar autenticação em todas as rotas.
2. Nunca vazar stack traces.`;

  const parsed = parseSkillMarkdown(md);
  assert.equal(parsed.name, 'Auditoria OWASP Express');
  assert.equal(parsed.domain, 'security');
  assert.ok(parsed.instructions.includes('Verificar autenticação'));
});

test('maskSecret hides middle characters and canAgentAccessResource enforces allowlist', () => {
  assert.equal(maskSecret('ghp_1234567890abcdef'), 'ghp_••••••cdef');
  assert.equal(canAgentAccessResource(['ux_ui_designer', 'frontend_mobile_developer'], 'ux_ui_designer'), true);
  assert.equal(canAgentAccessResource(['ux_ui_designer'], 'sentinel_security'), false);
  assert.equal(canAgentAccessResource(['*'], 'sentinel_security'), true);
});
