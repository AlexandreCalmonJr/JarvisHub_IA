import { API_BASE, handleApiResponse } from './client';
import { apiFetch } from '../sessionTransport';
import type {
  ContextSetRecord,
  FigmaDesignTokenPack,
  IntegrationConnectorRecord,
  IntegrationProviderId,
} from '../integrationsCatalog';

export interface IntegrationsHubPayload {
  connectors: IntegrationConnectorRecord[];
  context_sets: ContextSetRecord[];
}

export async function fetchIntegrationsHub(): Promise<IntegrationsHubPayload> {
  const res = await apiFetch(`${API_BASE}/integrations`);
  return handleApiResponse<IntegrationsHubPayload>(res, 'Falha ao carregar integrações e Context Sets.');
}

export async function saveIntegrationConnector(
  providerId: IntegrationProviderId,
  payload: {
    connected?: boolean;
    token?: string;
    target_ref?: string;
    allowed_agents?: string[];
  }
): Promise<IntegrationConnectorRecord> {
  const res = await apiFetch(`${API_BASE}/integrations/${encodeURIComponent(providerId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse<IntegrationConnectorRecord>(res, 'Falha ao salvar configuração da integração.');
}

export async function inspectGitHubRepo(repo: string, token?: string): Promise<any> {
  const res = await apiFetch(`${API_BASE}/integrations/github/inspect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo, token }),
  });
  return handleApiResponse(res, 'Falha ao inspecionar repositório no GitHub.');
}

export async function importGitHubSkillPack(payload: {
  repo: string;
  allowed_agents?: string[];
  as_context_set?: boolean;
}): Promise<{ skill?: any; context_set?: ContextSetRecord; inspection: any }> {
  const res = await apiFetch(`${API_BASE}/integrations/github/import-skill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse(res, 'Falha ao importar pacote do GitHub.');
}

export async function syncFigmaTokens(payload: {
  file_url: string;
  token?: string;
  allowed_agents?: string[];
}): Promise<{ pack: FigmaDesignTokenPack; context_set: ContextSetRecord; connector: IntegrationConnectorRecord }> {
  const res = await apiFetch(`${API_BASE}/integrations/figma/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse(res, 'Falha ao sincronizar tokens do Figma.');
}

export async function createContextSet(payload: {
  name: string;
  description: string;
  source_type?: 'markdown' | 'pdf' | 'github' | 'figma' | 'docs';
  source_ref?: string;
  content: string;
  allowed_agents?: string[];
  tags?: string[];
}): Promise<ContextSetRecord> {
  const res = await apiFetch(`${API_BASE}/integrations/context-sets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse<ContextSetRecord>(res, 'Falha ao criar Context Set.');
}

export async function updateContextSetAgents(
  id: string,
  allowedAgents: string[]
): Promise<ContextSetRecord> {
  const res = await apiFetch(`${API_BASE}/integrations/context-sets/${encodeURIComponent(id)}/agents`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allowed_agents: allowedAgents }),
  });
  return handleApiResponse<ContextSetRecord>(res, 'Falha ao atualizar acesso dos agentes.');
}

export async function deleteContextSet(id: string): Promise<{ deleted: boolean }> {
  const res = await apiFetch(`${API_BASE}/integrations/context-sets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return handleApiResponse<{ deleted: boolean }>(res, 'Falha ao remover Context Set.');
}
