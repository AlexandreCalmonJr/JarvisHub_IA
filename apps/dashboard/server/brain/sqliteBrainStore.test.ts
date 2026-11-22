import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLocalSqliteBrainStore } from './sqliteBrainStore.ts';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('LocalSqliteBrainStore bootstraps WAL SQLite database on disk with all 12 core tables and persists across reopen', () => {
  const tempDir = makeTempDir('jarvis-brain-sqlite-');
  try {
    const store1 = createLocalSqliteBrainStore({
      dataDir: tempDir,
      brainName: 'Cérebro Teste Local',
      assistantName: 'JARVIS',
    });

    const health = store1.getDatabaseHealth();
    assert.equal(health.ok, true);
    assert.equal(health.journalMode, 'wal');
    assert.ok(health.dbSizeBytes > 0);
    assert.equal(fs.existsSync(store1.dbPath), true);

    const tables = store1.getTableStats();
    assert.equal(tables.length, 20);
    assert.ok(tables.some((t) => t.table === 'brain_identity' && t.rows === 1));
    assert.ok(tables.some((t) => t.table === 'brain_profiles' && t.rows === 3));
    assert.ok(tables.some((t) => t.table === 'agent_workspaces' && t.rows === 1));
    assert.ok(tables.some((t) => t.table === 'mcp_servers' && t.rows === 2));

    const added = store1.addBrainProfile({
      name: 'Docker Escritório',
      baseUrl: 'http://192.168.1.88:3000',
      mode: 'docker_postgres',
      description: 'Container com pgvector',
    });
    assert.equal(added.profiles.length, 4);
    store1.setActiveBrainProfile(added.created.id);
    store1.close();

    // Reabre o mesmo arquivo SQLite do disco para provar persistência real
    const store2 = createLocalSqliteBrainStore({ dataDir: tempDir });
    const reopened = store2.listBrainProfiles();
    assert.equal(reopened.profiles.length, 4);
    assert.equal(reopened.activeProfileId, added.created.id);
    assert.equal(store2.getIdentity().name, 'Cérebro Teste Local');
    store2.close();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('LocalSqliteBrainStore syncs workspace models, exports .jarvis-pack, imports transactionally, and creates valid SQLite backups', () => {
  const dirA = makeTempDir('jarvis-brain-a-');
  const dirB = makeTempDir('jarvis-brain-b-');
  try {
    const storeA = createLocalSqliteBrainStore({ dataDir: dirA, brainName: 'Cérebro Origem' });
    storeA.syncWorkspaceSnapshot({
      agents: [
        {
          role: 'iris_excel',
          name: 'Iris Planilhas',
          handle: '@iris',
          description: 'Gera planilhas Excel reais.',
          system_prompt: 'Crie planilhas organizadas.',
          installed_skills: ['Excel Avançado'],
          is_custom: true,
        },
      ],
      skills: [
        {
          id: 'skill_excel_adv',
          name: 'Excel Avançado',
          domain: 'planilhas',
          description: 'Fórmulas e gráficos.',
          assigned_agents: ['iris_excel'],
        },
      ],
      workflows: [
        {
          id: 'wf_fechamento',
          title: 'Fechamento Mensal',
          description: 'Consolida despesas.',
          schedule_cron: '0 9 1 * *',
          schedule_enabled: true,
          nodes: [{ id: 'n1', label: 'Coletar' }],
          edges: [],
        },
      ],
      knowledge: [
        {
          name: 'guia-financeiro.md',
          category: 'financas',
          content: '# Guia\nSempre categorizar gastos fixos e variáveis.',
        },
      ],
    });

    const pack = storeA.exportJarvisPack();
    assert.equal(pack.format, 'jarvis-brain-pack');
    assert.equal(pack.agents.length, 1);
    assert.equal(pack.skills.length, 1);
    assert.deepEqual(pack.skills[0].assigned_agents, ['iris_excel']);
    assert.equal(pack.workflows.length, 1);
    assert.equal(pack.knowledge.length, 1);

    // Backup real SQLite (VACUUM INTO) e validação do cabeçalho binário "SQLite format 3"
    const backup = storeA.createSqliteBackup();
    assert.ok(backup.size_bytes > 4096);
    const header = fs.readFileSync(backup.path).subarray(0, 15).toString('utf8');
    assert.equal(header, 'SQLite format 3');
    assert.equal(storeA.listBackups().length, 1);
    storeA.close();

    // Importa o pacote .jarvis-pack em um segundo banco SQLite totalmente limpo
    const storeB = createLocalSqliteBrainStore({ dataDir: dirB, brainName: 'Cérebro Destino' });
    const importedRes = storeB.importJarvisPack(pack);
    assert.deepEqual(importedRes.imported, {
      agents: 1,
      skills: 1,
      workflows: 1,
      knowledge: 1,
    });
    const exportedB = storeB.exportJarvisPack();
    assert.equal(exportedB.agents[0].role, 'iris_excel');
    assert.equal(exportedB.knowledge[0].name, 'guia-financeiro.md');
    storeB.close();
  } finally {
    fs.rmSync(dirA, { recursive: true, force: true });
    fs.rmSync(dirB, { recursive: true, force: true });
  }
});
