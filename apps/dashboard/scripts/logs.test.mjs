import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');
const backend = read('../../api/routers/system.py');
const api = read('../src/services/api/system.ts');
const view = read('../src/components/ServerLogsView.tsx');

test('server logs, streaming, clearing, backups and global webhooks require admin', () => {
  assert.match(backend, /get_server_logs_endpoint\([\s\S]{0,220}Depends\(require_admin\)/);
  assert.match(backend, /stream_server_logs_endpoint\([\s\S]{0,120}Depends\(require_admin\)/);
  assert.match(backend, /clear_server_logs_endpoint\([\s\S]{0,120}Depends\(require_admin\)/);
  assert.match(backend, /create_system_backup_endpoint\([\s\S]{0,120}Depends\(require_admin\)/);
  assert.match(backend, /get_webhooks_config_endpoint\([\s\S]{0,120}Depends\(require_admin\)/);
  assert.match(backend, /save_webhooks_config_endpoint\([\s\S]{0,150}Depends\(require_admin\)/);
  assert.match(backend, /test_webhook_endpoint\([\s\S]{0,120}Depends\(require_admin\)/);
});

test('system and log API failures are surfaced instead of becoming zero values', () => {
  assert.match(api, /Falha ao carregar logs do servidor/);
  assert.match(api, /Falha ao limpar logs do servidor/);
  assert.doesNotMatch(api, /return \{ total: 0, logs: \[\] \}|cpu_percent: 0/);
});

test('logs view exposes loading and independent logs/metrics errors', () => {
  assert.match(view, /Promise\.allSettled/);
  assert.match(view, /logsError/);
  assert.match(view, /metricsError/);
  assert.match(view, /role="alert"/);
});
