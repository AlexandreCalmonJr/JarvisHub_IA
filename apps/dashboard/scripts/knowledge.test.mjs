import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');
const backend = read('../../api/routers/knowledge.py');
const api = read('../src/services/api/knowledge.ts');
const view = read('../src/components/KnowledgeVaultView.tsx');
const grid = read('../src/components/knowledge/DocumentListGrid.tsx');
const folderModal = read('../src/components/knowledge/DocumentModals.tsx');

test('knowledge documents, uploads, indexing, search and deletion use the authenticated account owner', () => {
  assert.match(backend, /list_documents\([\s\S]{0,100}owner_user_id=_private_owner\(principal\)/);
  assert.match(backend, /index_file\([\s\S]{0,120}owner_user_id=owner/);
  assert.match(backend, /index_directory\([\s\S]{0,120}owner_user_id=owner/);
  assert.match(backend, /index_text_snippet\([\s\S]{0,140}owner_user_id=owner/);
  assert.match(backend, /search\([\s\S]{0,120}owner_user_id=_private_owner\(principal\)/);
  assert.match(backend, /delete_document\([\s\S]{0,120}owner_user_id=_private_owner\(principal\)/);
});

test('unpaired device identities cannot access private knowledge', () => {
  assert.match(backend, /def _private_owner/);
  assert.match(backend, /Dispositivo sem associação a uma conta/);
});

test('knowledge API errors are not converted into empty document or search results', () => {
  assert.match(api, /handleApiResponse<any\[]>/);
  assert.match(api, /Falha ao carregar documentos do Knowledge Vault/);
  assert.match(api, /Falha ao pesquisar no Knowledge Vault/);
  assert.match(api, /credentials: 'include'/);
  assert.doesNotMatch(api, /if \(!res\.ok\) return \[\]/);
});

test('knowledge UI distinguishes request failure from an empty vault', () => {
  assert.match(view, /documentsError/);
  assert.match(view, /error=\{documentsError\}/);
  assert.match(grid, /role="alert"/);
});

test('folder indexing explains that the path belongs to the JARVIS server', () => {
  assert.match(folderModal, /Pasta no Servidor JARVIS/);
  assert.match(folderModal, /não aponta para o disco do seu computador/);
});
