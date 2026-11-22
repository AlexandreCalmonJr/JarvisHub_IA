/**
 * Testes integrados da Arquitetura Poliglota do Cérebro:
 *   - Perfis isolados com SQLite WAL + FTS5 + arquivos Markdown confinados (SOUL/MEMORY/USER.md)
 *   - Escritor único e filas seriais FIFO por sessão (SessionLaneQueue)
 *   - Worker Python 3.11 ao vivo (ping, chunk_and_vectorize, hybrid_search RRF, extract_facts Hermes)
 *   - Gateway MCP nativo (aprovação, registro seguro e auditoria)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLocalSqliteBrainStore } from './sqliteBrainStore.ts';
import { SessionLaneQueue } from './sessionLaneQueue.ts';
import { createPythonWorkerBridge } from './pythonWorkerBridge.ts';
import { resolveConfinedPath } from './workspaceMemoryStore.ts';

test('SessionLaneQueue executes same-session jobs strictly in FIFO order', async () => {
  const queue = new SessionLaneQueue();
  const order: number[] = [];

  const p1 = queue.enqueue({
    sessionId: 'sess-alpha',
    workspaceSlug: 'default',
    jobType: 'step-1',
    task: async () => {
      await new Promise((r) => setTimeout(r, 35));
      order.push(1);
      return 'one';
    },
  });
  const p2 = queue.enqueue({
    sessionId: 'sess-alpha',
    workspaceSlug: 'default',
    jobType: 'step-2',
    task: async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push(2);
      return 'two';
    },
  });
  const p3 = queue.enqueue({
    sessionId: 'sess-alpha',
    workspaceSlug: 'default',
    jobType: 'step-3',
    task: () => {
      order.push(3);
      return 'three';
    },
  });

  const results = await Promise.all([p1, p2, p3]);
  assert.deepEqual(order, [1, 2, 3]);
  assert.equal(results[0].job.status, 'completed');
  assert.equal(queue.getSnapshot().total_executed, 3);
  assert.equal(queue.getSnapshot().pending_jobs, 0);
});

test('resolveConfinedPath blocks directory traversal outside workspace root', () => {
  const base = path.resolve(os.tmpdir(), 'jarvis-confined-test');
  const safe = resolveConfinedPath(base, 'default', 'MEMORY.md');
  assert.ok(safe.startsWith(base + path.sep));
  assert.throws(() => resolveConfinedPath(base, '..', '..', 'etc', 'passwd'));
});

test('Isolated workspaces, live Python 3.11 hybrid FTS5+Vector RRF search, Hermes facts, and MCP registry', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-polyglot-'));
  const store = createLocalSqliteBrainStore({ dataDir: tmpDir });
  const py = createPythonWorkerBridge();

  try {
    // 1. Live Python 3.11 ping
    const ping = await py.ping();
    assert.equal(ping.status, 'online');
    assert.equal(ping.fts5_available, true);
    assert.ok(ping.python_version.startsWith('3.'));

    // 2. Create isolated workspace & verify separate state.db + SOUL/MEMORY/USER.md
    const createdWs = store.createWorkspace({ name: 'Engenharia Labs', description: 'Perfil técnico isolado' });
    assert.equal(createdWs.created.slug, 'engenharia-labs');
    store.activateWorkspace('engenharia-labs');
    const wsStore = store.getActiveWorkspaceStore();
    assert.ok(fs.existsSync(wsStore.dbPath));
    assert.ok(fs.existsSync(path.join(wsStore.workspaceDir, 'MEMORY.md')));

    // 3. Save Markdown + chunk & vectorize via Python 3.11 + hybrid search RRF
    const customMd = `# Protocolos Internos\n\n## Telemetria Quântica\nProtocolo Delta-99 ativo no nó SQLite WAL com índice híbrido FTS5 e vetores locais.\n`;
    wsStore.saveMarkdownFile('MEMORY.md', customMd);
    const vecRes = await py.chunkAndVectorize({ text: customMd, source_ref: 'MEMORY.md' });
    assert.ok(vecRes.chunks.length >= 1);
    wsStore.replaceChunksForSource(
      'markdown',
      'MEMORY.md',
      vecRes.chunks.map((c) => ({
        heading: c.heading,
        content: c.content,
        content_hash: c.content_hash,
        token_estimate: c.token_estimate,
        vector: c.vector,
      }))
    );

    const search = await py.hybridSearch({
      db_path: wsStore.dbPath,
      workspace_slug: wsStore.slug,
      query: 'Delta-99 SQLite WAL',
      limit: 5,
    });
    assert.ok(search.hits.length >= 1);
    assert.equal(search.hits[0].source_ref, 'MEMORY.md');
    assert.ok(search.hits[0].rrf_score > 0);
    assert.ok(search.hits[0].bm25_score > 0 || search.hits[0].vector_score > 0);

    // 4. Hermes fact extraction (memory vs user scopes)
    const extracted = await py.extractFacts(
      'Eu prefiro respostas diretas em português do Brasil pela manhã. O servidor roda SQLite WAL na porta 3000 com backup automático.'
    );
    assert.ok(extracted.facts.some((f) => f.scope === 'user'));
    assert.ok(extracted.facts.some((f) => f.scope === 'memory'));

    // 5. Native MCP server registry + approval policy + audit log
    const customMcp = store.addMcpServer({
      name: 'Crawler Go Interno',
      transport: 'http',
      endpoint: 'https://meu-gateway.ts.net',
    });
    assert.equal(customMcp.is_approved, false);
    const approved = store.toggleMcpServerApproval(customMcp.id, true);
    assert.equal(approved.is_approved, true);
    assert.throws(() =>
      store.addMcpServer({
        name: 'Bad Shell',
        transport: 'stdio',
        endpoint: 'node; rm -rf /',
      })
    );
  } finally {
    py.close();
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
