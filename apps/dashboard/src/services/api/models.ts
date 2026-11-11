import { API_BASE } from './client';

export async function fetchModels(): Promise<any> {
  const res = await fetch(`${API_BASE}/models`);
  if (!res.ok) throw new Error('Falha ao carregar modelos');
  return res.json();
}

export async function fetchHybridConfig(): Promise<any> {
  const res = await fetch(`${API_BASE}/models/hybrid-config`);
  if (!res.ok) throw new Error('Falha ao carregar configuração do gateway híbrido');
  return res.json();
}

export async function saveHybridConfig(config: {
  provider_name: string;
  enabled: boolean;
  api_key?: string;
  base_url?: string;
  default_model?: string;
  max_budget_usd: number;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/models/hybrid-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro ao salvar configuração' }));
    throw new Error(err.detail || 'Erro ao salvar configuração híbrida');
  }
  return res.json();
}

export async function testHybridConnection(payload: {
  provider_name: string;
  api_key?: string;
  base_url?: string;
  default_model?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/models/hybrid-config/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Falha no teste de conexão' }));
    throw new Error(err.detail || 'Falha no teste de conexão');
  }
  return res.json();
}

export async function fetchModelMetrics(): Promise<any> {
  const res = await fetch(`${API_BASE}/system/model-metrics`);
  if (!res.ok) throw new Error('Falha ao carregar métricas de inferência.');
  return res.json();
}

export async function fetchCuratedHuggingFaceModels(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/models/huggingface/curated`);
  if (!res.ok) throw new Error('Falha ao carregar modelos curados do Hugging Face.');
  return res.json();
}

export async function searchHuggingFaceModels(q: string = '', limit: number = 10): Promise<any[]> {
  const res = await fetch(`${API_BASE}/models/huggingface/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  if (!res.ok) throw new Error('Falha ao pesquisar modelos no Hugging Face.');
  return res.json();
}

export async function fetchAgentModelRecommendations(): Promise<Record<string, { model: string; reason: string }>> {
  const res = await fetch(`${API_BASE}/models/agent-recommendations`);
  if (!res.ok) throw new Error('Falha ao carregar recomendações de modelos dos agentes.');
  return res.json();
}

export interface KeyVaultItem {
  key_id: string;
  label?: string;
  provider_name?: string;
  provider?: string;
  masked_key: string;
  base_url?: string;
  preferred_model?: string;
  default_model?: string;
  assigned_agents?: string[];
  is_active: boolean;
}

export async function fetchKeyVault(): Promise<KeyVaultItem[]> {
  const res = await fetch(`${API_BASE}/models/vault`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Falha ao carregar o KeyVault.' }));
    throw new Error(err.detail || 'Falha ao carregar o KeyVault.');
  }
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.keys)) return data.keys;
  throw new Error('Resposta inválida recebida do KeyVault.');
}

export async function registerVaultKey(payload: {
  key_id: string;
  label: string;
  provider: string;
  api_key: string;
  base_url?: string;
  default_model?: string;
  is_active?: boolean;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/models/vault`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Falha ao salvar chave' }));
    throw new Error(err.detail || 'Falha ao cadastrar chave no cofre');
  }
  return res.json();
}

export async function deleteVaultKey(key_id: string): Promise<any> {
  const res = await fetch(`${API_BASE}/models/vault/${encodeURIComponent(key_id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Falha ao remover chave' }));
    throw new Error(err.detail || 'Falha ao remover chave do cofre');
  }
  return res.json();
}

export async function testVaultKey(key_id: string): Promise<any> {
  const res = await fetch(`${API_BASE}/models/vault/${encodeURIComponent(key_id)}/test`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Falha no teste' }));
    throw new Error(err.detail || 'Falha ao testar chave');
  }
  return res.json();
}
