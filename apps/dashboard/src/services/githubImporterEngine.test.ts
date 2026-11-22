import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGitHubKnowledgeMarkdown,
  buildStaticRepoInspection,
  parseGitHubRepoInput,
} from './githubImporterEngine.ts';

test('parseGitHubRepoInput parses full GitHub URLs, .git URLs, tree paths, and owner/repo shorthand', () => {
  assert.deepEqual(parseGitHubRepoInput('https://github.com/tiangolo/fastapi'), {
    owner: 'tiangolo',
    repo: 'fastapi',
    fullName: 'tiangolo/fastapi',
    canonicalUrl: 'https://github.com/tiangolo/fastapi',
  });

  assert.equal(
    parseGitHubRepoInput('https://github.com/n8n-io/n8n.git').fullName,
    'n8n-io/n8n'
  );

  assert.equal(
    parseGitHubRepoInput('https://github.com/shadcn-ui/ui/tree/main/apps').fullName,
    'shadcn-ui/ui'
  );

  assert.equal(parseGitHubRepoInput('vercel/ai').canonicalUrl, 'https://github.com/vercel/ai');
});

test('parseGitHubRepoInput blocks non-GitHub hosts, private/metadata IPs, credentials, and traversal', () => {
  assert.throws(() => parseGitHubRepoInput('http://127.0.0.1:3000/admin/test'));
  assert.throws(() => parseGitHubRepoInput('http://169.254.169.254/latest/meta-data'));
  assert.throws(() => parseGitHubRepoInput('https://evil.com/owner/repo'));
  assert.throws(() => parseGitHubRepoInput('https://user:pass@github.com/owner/repo'));
  assert.throws(() => parseGitHubRepoInput('github.com/../etc/passwd'));
  assert.throws(() => parseGitHubRepoInput('javascript:alert(1)'));
});

test('buildStaticRepoInspection detects capabilities, scripts, category, and generates PT-BR summary', () => {
  const inspection = buildStaticRepoInspection({
    owner: 'n8n-io',
    repo: 'n8n',
    canonicalUrl: 'https://github.com/n8n-io/n8n',
    description: 'Fair-code workflow automation platform with native AI capabilities',
    defaultBranch: 'master',
    stars: 50000,
    forks: 12000,
    language: 'TypeScript',
    languages: { TypeScript: 900000, JavaScript: 50000 },
    topics: ['workflow', 'automation', 'api'],
    license: 'Sustainable Use License',
    updatedAt: '2026-11-20T00:00:00Z',
    files: [
      { name: 'package.json', path: 'package.json', type: 'file' },
      { name: 'Dockerfile', path: 'Dockerfile', type: 'file' },
      { name: 'packages', path: 'packages', type: 'dir' },
    ],
    readmeText: '# n8n\nWorkflow automation tool for teams.\n```bash\nnpx n8n\n```',
    packageJson: {
      name: 'n8n',
      scripts: { build: 'turbo build', start: 'n8n start', test: 'jest' },
      dependencies: { express: '^4.19.0', axios: '^1.7.0' },
    },
  });

  assert.equal(inspection.suggestedCategory, 'business');
  assert.equal(inspection.suggestedSkillName, 'GitHub · N8n');
  assert.equal(inspection.suggestedAgentHandle, '@n8n');
  assert.ok(inspection.detectedCapabilities.some((c) => c.id === 'cap_node_js'));
  assert.ok(inspection.detectedCapabilities.some((c) => c.id === 'cap_docker'));
  assert.ok(inspection.detectedCapabilities.some((c) => c.id === 'cap_api_sdk'));
  assert.deepEqual(inspection.detectedScripts, ['build', 'start', 'test']);

  const md = buildGitHubKnowledgeMarkdown(inspection);
  assert.ok(md.includes('# Repositório GitHub: n8n-io/n8n'));
  assert.ok(md.includes('https://github.com/n8n-io/n8n'));
  assert.ok(md.includes('## Capacidades e Funções Detectadas'));
});
