/**
 * Ambiente isolado da suite E2E.
 *
 * O Playwright carrega este módulo antes de arrancar os `webServer`, por isso a
 * preparação dos diretórios temporários acontece aqui. Os workers importam o
 * mesmo módulo mais tarde e apenas reutilizam o estado já preparado (marcador
 * `.ready`), sem apagar dados nem gerar um novo token.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(here, '..', '..', '..');
export const tmpRoot = path.join(repoRoot, 'tmp', 'e2e');
const dataDir = path.join(tmpRoot, 'data');
const workspaceDir = path.join(tmpRoot, 'workspace');
const importRoot = path.join(tmpRoot, 'import-root');
const tokenPath = path.join(tmpRoot, 'admin-token.txt');
const passwordPath = path.join(tmpRoot, 'admin-password.txt');

const fixtures = {
  workspace: path.join(importRoot, 'workspace-fixture'),
  coding: path.join(importRoot, 'coding-fixture'),
  approval: path.join(importRoot, 'approval-fixture'),
};

function createSqliteFixture(directory: string, tables: string[]): void {
  fs.mkdirSync(directory, { recursive: true });
  const database = new DatabaseSync(path.join(directory, 'app.db'));
  try {
    for (const statement of tables) database.exec(statement);
  } finally {
    database.close();
  }
  fs.writeFileSync(
    path.join(directory, 'README.md'),
    `# Fixture E2E ${path.basename(directory)}\n\nProjeto descartável usado pela suite Playwright.\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(directory, 'main.py'),
    'def main() -> str:\n    return "fixture e2e"\n',
    'utf8',
  );
  fs.writeFileSync(path.join(directory, 'requirements.txt'), 'fastapi\nuvicorn\n', 'utf8');
}

function bootstrap(): void {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.mkdirSync(importRoot, { recursive: true });

  createSqliteFixture(fixtures.workspace, [
    'CREATE TABLE tasks (id INTEGER PRIMARY KEY, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0);',
    "INSERT INTO tasks (id, title, done) VALUES (1, 'Preparar workspace', 1);",
    "INSERT INTO tasks (id, title, done) VALUES (2, 'Validar fluxo E2E', 0);",
  ]);
  createSqliteFixture(fixtures.coding, [
    'CREATE TABLE scripts (id INTEGER PRIMARY KEY, name TEXT NOT NULL);',
    "INSERT INTO scripts (id, name) VALUES (1, 'e2e-coding-ok');",
  ]);
  createSqliteFixture(fixtures.approval, [
    'CREATE TABLE audits (id INTEGER PRIMARY KEY, label TEXT NOT NULL);',
    "INSERT INTO audits (id, label) VALUES (1, 'APPROVAL_FLOW');",
  ]);

  fs.writeFileSync(tokenPath, crypto.randomBytes(24).toString('base64url'), 'utf8');
  fs.writeFileSync(passwordPath, crypto.randomBytes(18).toString('base64url'), 'utf8');
}

// O processo principal prepara um estado limpo por execução; os workers apenas
// reutilizam os ficheiros gerados (TEST_WORKER_INDEX só existe nos workers).
if (process.env.TEST_WORKER_INDEX === undefined) bootstrap();

if (!fs.existsSync(passwordPath)) {
  fs.writeFileSync(passwordPath, crypto.randomBytes(18).toString('base64url'), 'utf8');
}

export const ADMIN_TOKEN = fs.readFileSync(tokenPath, 'utf8').trim();
export const ADMIN_PASSWORD = fs.readFileSync(passwordPath, 'utf8').trim();

export const E2E = {
  repoRoot,
  tmpRoot,
  dataDir,
  workspaceDir,
  importRoot,
  fixtures,
  dashboardUrl: 'http://127.0.0.1:3100',
  backendUrl: 'http://127.0.0.1:8020',
  ollamaUrl: 'http://127.0.0.1:11435',
  adminToken: ADMIN_TOKEN,
  adminPassword: ADMIN_PASSWORD,
  backendEnv: {
    JARVIS_DATA_DIR: dataDir,
    JARVIS_WORKSPACE_DIR: workspaceDir,
    JARVIS_WORKSPACE_IMPORT_ROOTS: importRoot,
    JARVIS_ADMIN_TOKEN: ADMIN_TOKEN,
    JARVIS_OLLAMA_BASE_URL: 'http://127.0.0.1:11435',
    JARVIS_OLLAMA_WARMUP: '0',
    JARVIS_ENVIRONMENT: 'test',
    JARVIS_ALLOWED_ORIGINS: 'http://127.0.0.1:3100',
  },
};
