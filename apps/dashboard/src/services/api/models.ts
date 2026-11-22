import { API_BASE } from './client';
import { apiFetch } from '../sessionTransport';

export async function fetchModels(): Promise<any> {
  const res = await apiFetch(`${API_BASE}/models`);
  if (!res.ok) throw new Error('Falha ao carregar modelos');
  return res.json();
}

export async function fetchHybridConfig(): Promise<any> {
  const res = await apiFetch(`${API_BASE}/models/hybrid-config`);
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
  const res = await apiFetch(`${API_BASE}/models/hybrid-config`, {
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
  const res = await apiFetch(`${API_BASE}/models/hybrid-config/test`, {
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

export async function fetchCuratedHuggingFaceModels(): Promise<any[]> {
  const res = await apiFetch(`${API_BASE}/models/huggingface/curated`);
  if (!res.ok) throw new Error('Falha ao carregar modelos curados do Hugging Face.');
  return res.json();
}

export async function searchHuggingFaceModels(q: string = '', limit: number = 10): Promise<any[]> {
  const res = await apiFetch(`${API_BASE}/models/huggingface/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  if (!res.ok) throw new Error('Falha ao pesquisar modelos no Hugging Face.');
  return res.json();
}

export async function fetchAgentModelRecommendations(): Promise<Record<string, { model: string; reason: string }>> {
  const res = await apiFetch(`${API_BASE}/models/agent-recommendations`);
  if (!res.ok) throw new Error('Falha ao carregar recomendações de modelos dos agentes.');
  return res.json();
}

export interface HardwareAdvisorPayload {
  profiles: Array<{
    id: string;
    label: string;
    owner: string;
    cpu: string;
    ram_gb: number;
    gpu_name: string;
    vram_gb: number;
    ollama_url: string;
    is_active: boolean;
  }>;
  active_profile_id: string;
  providers: {
    ollama_connected: boolean;
    huggingface_connected: boolean;
    gemini_connected: boolean;
    gemini_api_configured: boolean;
    ollama_reachable: boolean;
    ollama_latency_ms?: number;
  };
  recommendations: Array<{
    agent_role: string;
    agent_name: string;
    proper_name: string;
    recommended_model: string;
    execution_mode: 'LOCAL' | 'ONLINE';
    provider: 'ollama' | 'gemini';
    fit_tier: 'gpu_smooth' | 'cpu_ok' | 'recommend_online';
    fit_label: string;
    reason: string;
    required_vram_gb: number;
  }>;
}

export async function fetchHardwareAdvisor(): Promise<HardwareAdvisorPayload> {
  const res = await apiFetch(`${API_BASE}/models/hardware`);
  if (!res.ok) throw new Error('Falha ao consultar o Consultor de Hardware.');
  return res.json();
}

export async function saveHardwareProfile(payload: {
  active_profile_id?: string;
  profile?: {
    id: string;
    label: string;
    owner: string;
    cpu: string;
    ram_gb: number;
    gpu_name: string;
    vram_gb: number;
    ollama_url: string;
    is_active?: boolean;
  };
}): Promise<HardwareAdvisorPayload> {
  const res = await apiFetch(`${API_BASE}/models/hardware`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Falha ao atualizar perfil de hardware.');
  return res.json();
}

export async function updateProviderConnectivity(payload: {
  ollama_connected?: boolean;
  huggingface_connected?: boolean;
  gemini_connected?: boolean;
  ollama_url?: string;
}): Promise<HardwareAdvisorPayload> {
  const res = await apiFetch(`${API_BASE}/models/providers`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Falha ao atualizar provedores de IA.');
  return res.json();
}

export async function applyHardwareRecommendations(payload: {
  agent_role?: string;
  apply_all?: boolean;
}): Promise<{ applied_count: number; agents_updated: string[] }> {
  const res = await apiFetch(`${API_BASE}/models/recommendations/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Falha ao aplicar recomendações aos agentes.');
  return res.json();
}

export interface ArenaSideResult {
  model_requested: string;
  model_used: string;
  execution_mode: 'LOCAL' | 'ONLINE';
  provider: string;
  latency_ms: number;
  text: string;
  reasoning?: string;
  routing_note?: string;
  sources?: Array<{ title: string; url: string }>;
  error?: string;
}

export async function runModelArenaComparison(payload: {
  prompt: string;
  model_a: string;
  model_b: string;
  enable_web_search?: boolean;
}): Promise<{ left: ArenaSideResult; right: ArenaSideResult }> {
  const res = await apiFetch(`${API_BASE}/models/arena`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Falha ao executar comparação na Arena.' }));
    throw new Error(err.detail || 'Falha ao executar comparação na Arena.');
  }
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
  owner_user_id?: string | null;
  is_default?: boolean;
}

export async function fetchKeyVault(): Promise<KeyVaultItem[]> {
  const res = await apiFetch(`${API_BASE}/models/vault`);
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
  is_default?: boolean;
  scope?: 'account' | 'global';
}): Promise<any> {
  const res = await apiFetch(`${API_BASE}/models/vault`, {
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

export async function deleteVaultKey(key_id: string, scope: 'account' | 'global' = 'account'): Promise<any> {
  const res = await apiFetch(`${API_BASE}/models/vault/${encodeURIComponent(key_id)}?scope=${scope}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Falha ao remover chave' }));
    throw new Error(err.detail || 'Falha ao remover chave do cofre');
  }
  return res.json();
}

export async function setDefaultVaultKey(key_id: string): Promise<any> {
  const res = await apiFetch(`${API_BASE}/models/vault/${encodeURIComponent(key_id)}/default`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Falha ao definir chave predefinida' }));
    throw new Error(err.detail || 'Falha ao definir chave predefinida');
  }
  return res.json();
}

export async function testVaultKey(key_id: string, scope: 'account' | 'global' = 'account'): Promise<any> {
  const res = await apiFetch(`${API_BASE}/models/vault/${encodeURIComponent(key_id)}/test?scope=${scope}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Falha no teste' }));
    throw new Error(err.detail || 'Falha ao testar chave');
  }
  return res.json();
}
