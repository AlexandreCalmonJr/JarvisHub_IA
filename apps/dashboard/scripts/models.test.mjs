import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');
const api = read('../src/services/api/models.ts');
const view = read('../src/components/ModelManagerView.tsx');
const backend = read('../../api/routers/models.py');

test('model manager distinguishes API and permission failures from missing data', () => {
  assert.match(view, /Promise\.allSettled/);
  assert.match(view, /loadError/);
  assert.match(view, /role="alert"/);
});

test('unavailable model catalogs and metrics are not replaced with fabricated values', () => {
  assert.doesNotMatch(backend, /"llama3\.2:3b"|"qwen2\.5-coder:7b"|"qwen2\.5:7b"/);
  assert.match(api, /Falha ao carregar métricas de inferência/);
  assert.match(api, /Falha ao carregar modelos curados/);
  assert.match(api, /Falha ao pesquisar modelos/);
  assert.doesNotMatch(api, /total_inferences: 0|return \[\]|return \{\}/);
});

test('global hybrid configuration requires admin and the KeyVault stays account-scoped', () => {
  assert.match(backend, /async def get_hybrid_config_endpoint\(principal=Depends\(require_admin\)\)/);
  assert.match(backend, /async def update_hybrid_config_endpoint\(payload: HybridConfigRequest, principal=Depends\(require_admin\)\)/);
  // O cofre privado exige sessão, mas não é exclusivo de administradores.
  assert.match(backend, /async def list_vault_keys_endpoint\(principal=Depends\(get_principal\)\)/);
  assert.match(backend, /async def save_vault_key_endpoint\(payload: KeyProfilePayload, principal=Depends\(get_principal\)\)/);
  assert.match(backend, /async def set_default_vault_key_endpoint\(key_id: str, principal=Depends\(get_principal\)\)/);
  assert.match(backend, /async def delete_vault_key_endpoint\(\s*key_id: str,\s*scope: Literal\["account", "global"\] = "account",\s*principal=Depends\(get_principal\),?\s*\)/);
  assert.match(backend, /async def test_vault_key_endpoint\(\s*key_id: str,\s*scope: Literal\["account", "global"\] = "account",\s*principal=Depends\(get_principal\),?\s*\)/);
  // Escritas globais continuam reservadas a administradores.
  assert.match(backend, /def _vault_scope_owner\(principal, scope: str\)/);
  assert.match(backend, /Apenas administradores podem gerir credenciais globais/);
  assert.match(backend, /list_keys\(owner_user_id=owner, include_global=include_global\)/);
});

test('model discovery and local installation require an authenticated or privileged account', () => {
  assert.match(backend, /async def list_models_endpoint\(principal=Depends\(get_principal\)\)/);
  assert.match(backend, /async def install_huggingface_model_endpoint\(payload: HFInstallPayload, principal=Depends\(require_admin\)\)/);
});
