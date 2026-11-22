import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDualModeServerArtifacts,
  createDefaultBrainProfiles,
  validateBrainProfileUrl,
  validateJarvisBrainPack,
} from './brainArchitectureEngine.ts';

test('validateBrainProfileUrl allows HTTPS remotely and local LAN/mDNS HTTP while blocking external HTTP and metadata IPs', () => {
  const httpsRes = validateBrainProfileUrl('https://meu-jarvis.ts.net/');
  assert.equal(httpsRes.valid, true);
  assert.equal(httpsRes.normalizedUrl, 'https://meu-jarvis.ts.net');
  assert.equal(httpsRes.isLocalLan, false);

  const lanRes = validateBrainProfileUrl('http://192.168.1.50:3000/');
  assert.equal(lanRes.valid, true);
  assert.equal(lanRes.normalizedUrl, 'http://192.168.1.50:3000');
  assert.equal(lanRes.isLocalLan, true);

  const mdnsRes = validateBrainProfileUrl('http://jarvis-casa.local:3000');
  assert.equal(mdnsRes.valid, true);
  assert.equal(mdnsRes.isLocalLan, true);

  const extHttp = validateBrainProfileUrl('http://example.com:3000');
  assert.equal(extHttp.valid, false);

  const metadata = validateBrainProfileUrl('http://169.254.169.254/latest/meta-data');
  assert.equal(metadata.valid, false);

  const creds = validateBrainProfileUrl('https://user:pass@meu-jarvis.ts.net');
  assert.equal(creds.valid, false);
});

test('createDefaultBrainProfiles provides active local SQLite brain plus Docker and remote templates', () => {
  const profiles = createDefaultBrainProfiles('http://localhost:3000');
  assert.equal(profiles.length, 3);
  assert.equal(profiles[0].mode, 'local_sqlite');
  assert.equal(profiles[0].isLocalCurrent, true);
  assert.equal(profiles[1].mode, 'docker_postgres');
  assert.equal(profiles[2].mode, 'cloud');
});

test('validateJarvisBrainPack validates and sanitizes valid .jarvis-pack exports while rejecting malformed payloads', () => {
  const bad = validateJarvisBrainPack({ format: 'wrong', schemaVersion: '0.1' });
  assert.equal(bad.valid, false);

  const good = validateJarvisBrainPack({
    schemaVersion: '1.0',
    format: 'jarvis-brain-pack',
    exportedAt: '2026-11-21T12:00:00.000Z',
    sourceBrain: {
      name: 'Cérebro Notebook',
      mode: 'local_sqlite',
      databaseEngine: 'SQLite WAL',
      version: '3.8.0',
    },
    agents: [
      {
        role: 'fiscal_helper',
        name: 'Contador Express',
        handle: '@contador',
        description: 'Ajuda com notas e impostos.',
        system_prompt: 'Seja claro em português.',
        installed_skills: ['Planilhas Excel'],
        is_custom: true,
      },
    ],
    skills: [
      {
        id: 'skill_fiscal',
        name: 'Análise de Notas',
        description: 'Extrai impostos e totais.',
        domain: 'financas',
        assigned_agents: ['fiscal_helper'],
      },
    ],
    workflows: [
      {
        id: 'wf_1',
        title: 'Resumo Semanal',
        description: 'Compila gastos toda sexta.',
        schedule_cron: '0 18 * * 5',
        schedule_enabled: true,
      },
    ],
    knowledge: [
      {
        name: 'manual-interno.md',
        category: 'docs',
        content: '# Regras\nSempre confirmar valores.',
      },
    ],
  });

  assert.equal(good.valid, true);
  assert.equal(good.pack?.agents.length, 1);
  assert.equal(good.pack?.skills.length, 1);
  assert.equal(good.pack?.workflows.length, 1);
  assert.equal(good.pack?.knowledge.length, 1);
});

test('buildDualModeServerArtifacts generates polyglot server files (Node + Python + Go) without hardcoded secrets', () => {
  const files = buildDualModeServerArtifacts({
    brainName: 'Cérebro Casa',
    mode: 'docker_postgres',
    port: 3000,
    enableOllama: true,
    enableRemoteGateway: true,
    enablePythonWorker: true,
    enableGoGateway: true,
    postgresDb: 'jarvis_casa',
    assistantName: 'JARVIS',
  });

  assert.equal(files.length, 14);
  const paths = files.map((f) => f.path);
  assert.ok(paths.includes('docker-compose.yml'));
  assert.ok(paths.includes('Dockerfile'));
  assert.ok(paths.includes('.env.example'));
  assert.ok(paths.includes('src/db/schema.ts'));
  assert.ok(paths.includes('src/db/driver.ts'));
  assert.ok(paths.includes('scripts/start-local-brain.sh'));
  assert.ok(paths.includes('Caddyfile'));
  assert.ok(paths.includes('README_CEREBRO_DUAL_MODE.md'));
  assert.ok(paths.includes('services/go-gateway/go.mod'));
  assert.ok(paths.includes('services/go-gateway/main.go'));
  assert.ok(paths.includes('services/go-gateway/Dockerfile'));
  assert.ok(paths.includes('services/python-worker/worker.py'));
  assert.ok(paths.includes('services/python-worker/requirements.txt'));
  assert.ok(paths.includes('services/python-worker/Dockerfile'));

  const compose = files.find((f) => f.path === 'docker-compose.yml')!.content;
  assert.ok(compose.includes('pgvector/pgvector:pg16'));
  assert.ok(compose.includes('redis:7-alpine'));
  assert.ok(compose.includes('ollama/ollama:latest'));
  assert.ok(compose.includes('caddy:2-alpine'));
  assert.ok(compose.includes('jarvis-python-worker'));
  assert.ok(compose.includes('jarvis-go-gateway'));
  assert.ok(compose.includes('POSTGRES_PASSWORD:?'));
  assert.ok(compose.includes('JWT_SECRET:?'));

  const goSource = files.find((f) => f.path === 'services/go-gateway/main.go')!.content;
  assert.ok(goSource.includes('isPublicHTTPTarget'));
  assert.ok(goSource.includes('/gateway/crawl'));

  const envFile = files.find((f) => f.path === '.env.example')!.content;
  assert.ok(envFile.includes('POSTGRES_PASSWORD=\n'));
  assert.ok(envFile.includes('GEMINI_API_KEY=\n'));

  const minimalFiles = buildDualModeServerArtifacts({
    enablePythonWorker: false,
    enableGoGateway: false,
  });
  assert.equal(minimalFiles.length, 8);
});
