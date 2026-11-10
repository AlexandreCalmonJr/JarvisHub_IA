import { SkillInfo } from '../../types';
import { API_BASE } from './client';

export async function fetchSkills(): Promise<SkillInfo[]> {
  const res = await fetch(`${API_BASE}/skills`);
  if (!res.ok) return [];
  return res.json();
}

export async function toggleSkill(skillId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/skills/${skillId}/toggle`, { method: 'POST' });
  return res.json();
}

export async function assignSkillAgents(skillId: string, agentRoles: string[]): Promise<any> {
  const res = await fetch(`${API_BASE}/skills/${skillId}/assign-agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_roles: agentRoles }),
  });
  if (!res.ok) throw new Error('Falha ao associar agentes à skill');
  return res.json();
}

export async function fetchPonytailStatus(): Promise<{ level: string; active: boolean; description: string }> {
  const res = await fetch(`${API_BASE}/skills/ponytail`);
  if (!res.ok) return { level: 'senior', active: true, description: '' };
  return res.json();
}

export async function savePonytailLevel(level: string): Promise<any> {
  const res = await fetch(`${API_BASE}/skills/ponytail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level }),
  });
  if (!res.ok) throw new Error('Falha ao atualizar nível Ponytail');
  return res.json();
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(skill),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro ao criar skill' }));
    throw new Error(err.detail || 'Falha ao registrar skill');
  }
  return res.json();
}

export async function deleteUserSkill(skillId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/skills/${skillId}`, { method: 'DELETE' });
  return res.json();
}

export async function importEccSkill(content: string): Promise<any> {
  const res = await fetch(`${API_BASE}/skills/import-ecc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro ao importar skill ECC' }));
    throw new Error(err.detail || 'Falha ao importar habilidade');
  }
  return res.json();
}
