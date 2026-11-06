import { SystemHealth, ApprovalRequestItem, TaskStateResponse } from './types';

const API_BASE = '/api/v1';

export async function fetchHealth(): Promise<SystemHealth> {
  const res = await fetch(`${API_BASE}/system/health`);
  if (!res.ok) throw new Error('Falha ao obter status do sistema');
  return res.json();
}

export async function sendChatMessage(prompt: string, projectId?: string): Promise<TaskStateResponse> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, project_id: projectId }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Erro desconhecido' }));
    throw new Error(errorData.detail || 'Erro ao processar mensagem');
  }
  return res.json();
}

export async function fetchApprovals(): Promise<ApprovalRequestItem[]> {
  const res = await fetch(`${API_BASE}/approvals`);
  if (!res.ok) throw new Error('Falha ao listar aprovações');
  return res.json();
}

export async function decideApproval(
  requestId: string,
  action: 'approve' | 'reject',
  decidedBy: string,
  reason?: string
): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/approvals/${requestId}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, decided_by: decidedBy, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro na aprovação' }));
    throw new Error(err.detail || 'Operação negada pelo servidor');
  }
  return res.json();
}

export async function triggerKillSwitch(target: 'global' | 'task', taskId?: string): Promise<any> {
  const res = await fetch(`${API_BASE}/system/kill-switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, task_id: taskId, reason: 'Acionado pelo painel web' }),
  });
  return res.json();
}

export async function fetchTasks(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/tasks`);
  if (!res.ok) return [];
  return res.json();
}

export async function fetchModels(): Promise<any> {
  const res = await fetch(`${API_BASE}/models`);
  if (!res.ok) throw new Error('Falha ao carregar modelos');
  return res.json();
}

export async function fetchSkills(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/skills`);
  if (!res.ok) return [];
  return res.json();
}

export async function toggleSkill(skillId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/skills/${skillId}/toggle`, { method: 'POST' });
  return res.json();
}

export async function fetchResources(): Promise<any> {
  const res = await fetch(`${API_BASE}/system/resources`);
  if (!res.ok) throw new Error('Falha ao carregar recursos');
  return res.json();
}
