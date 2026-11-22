import { apiFetch } from '../sessionTransport';
import { API_BASE } from './client';
import {
  CuratedGitHubExample,
  GitHubIncorporationMode,
  GitHubRepoInspection,
} from '../githubImporterEngine';

async function parseJsonOrThrow<T>(res: Response, fallbackMsg: string): Promise<T> {
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((payload as any)?.error || (payload as any)?.detail || fallbackMsg);
  }
  return payload as T;
}

export async function fetchGitHubHistoryApi(): Promise<{
  examples: CuratedGitHubExample[];
  items: GitHubRepoInspection[];
}> {
  const res = await apiFetch(`${API_BASE}/github/history`);
  return parseJsonOrThrow(res, 'Erro ao carregar histórico de repositórios do GitHub.');
}

export async function inspectGitHubRepoApi(input: {
  url: string;
  useAi?: boolean;
}): Promise<GitHubRepoInspection> {
  const res = await apiFetch(`${API_BASE}/github/inspect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(res, 'Não foi possível inspecionar este repositório do GitHub.');
}

export interface IncorporateGitHubResponse {
  mode: GitHubIncorporationMode;
  inspection: GitHubRepoInspection;
  created: Record<string, unknown>;
  message: string;
}

export async function incorporateGitHubRepoApi(input: {
  inspectionId: string;
  mode: GitHubIncorporationMode;
  approvedByUser: boolean;
  customName?: string;
  assignedAgents?: string[];
}): Promise<IncorporateGitHubResponse> {
  const res = await apiFetch(`${API_BASE}/github/incorporate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(res, 'Não foi possível incorporar este repositório ao JARVIS.');
}
