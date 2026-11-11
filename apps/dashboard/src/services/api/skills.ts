import { SkillInfo } from '../../types';
import { API_BASE, handleApiResponse } from './client';

export async function fetchSkills(): Promise<SkillInfo[]> {
  const res = await fetch(`${API_BASE}/skills`, { credentials: 'include' });
  return handleApiResponse<SkillInfo[]>(res, 'Falha ao carregar catálogo de habilidades.');
}

export async function toggleSkill(skillId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/skills/${encodeURIComponent(skillId)}/toggle`, { method: 'POST', credentials: 'include' });
  return handleApiResponse(res, 'Falha ao alterar estado da habilidade.');
}

export async function assignSkillAgents(skillId: string, agentRoles: string[]): Promise<any> {
  const res = await fetch(`${API_BASE}/skills/${encodeURIComponent(skillId)}/assign-agents`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_roles: agentRoles }),
  });
  return handleApiResponse(res, 'Falha ao associar agentes à habilidade.');
}

export async function fetchPonytailStatus(): Promise<{ level: string; active: boolean; description: string }> {
  const res = await fetch(`${API_BASE}/skills/ponytail`, { credentials: 'include' });
  return handleApiResponse(res, 'Falha ao carregar política Ponytail.');
}

export async function savePonytailLevel(level: string): Promise<any> {
  const res = await fetch(`${API_BASE}/skills/ponytail`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level }),
  });
  return handleApiResponse(res, 'Falha ao atualizar política Ponytail.');
}

export async function createUserSkill(skill: {
  id?: string;
  name: string;
  description: string;
  domain: string;
  instructions: string;
  assigned_agents?: string[];
}): Promise<any> {
  const res = await fetch(`${API_BASE}/skills/create`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(skill),
  });
  return handleApiResponse(res, 'Falha ao registrar habilidade.');
}

export async function deleteUserSkill(skillId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/skills/${encodeURIComponent(skillId)}`, { method: 'DELETE', credentials: 'include' });
  return handleApiResponse(res, 'Falha ao excluir habilidade.');
}

export async function importEccSkill(content: string): Promise<any> {
  const res = await fetch(`${API_BASE}/skills/import-ecc`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  return handleApiResponse(res, 'Falha ao importar habilidade ECC.');
}
