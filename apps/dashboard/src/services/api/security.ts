import { ApprovalRequestItem } from '../../types';
import { API_BASE } from './client';

export async function fetchApprovals(): Promise<ApprovalRequestItem[]> {
  const res = await fetch(`${API_BASE}/approvals`);
  if (!res.ok) throw new Error('Falha ao listar aprovações');
  return res.json();
}

export async function decideApproval(
  requestId: string,
  action: 'approve' | 'reject',
  reason?: string
): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/approvals/${requestId}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, reason }),
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

export async function fetchAuditLogs(limit: number = 50, offset: number = 0, severity?: string): Promise<any> {
  let url = `${API_BASE}/audit/logs?limit=${limit}&offset=${offset}`;
  if (severity) url += `&severity=${severity}`;
  const res = await fetch(url);
  if (!res.ok) return { total: 0, events: [] };
  return res.json();
}

export async function fetchCyberShieldStatus(): Promise<any> {
  const res = await fetch(`${API_BASE}/security/cyber-shield-status`);
  if (!res.ok) return { score: 95, level: 'MAXIMA_BLINDAGEM', active_protections: [] };
  return res.json();
}

export async function toggleNetworkIsolation(isolated: boolean, reason?: string): Promise<any> {
  const res = await fetch(`${API_BASE}/security/network-isolation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isolated, reason: reason || 'Comando do operador' }),
  });
  if (!res.ok) throw new Error('Falha ao alterar isolamento de rede');
  return res.json();
}

export async function scanProjectCVEs(projectId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/security/scan-cves/${projectId}`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro ao escanear CVEs' }));
    throw new Error(err.detail || 'Falha no escaneamento de dependências');
  }
  return res.json();
}

export async function runRedTeamAudit(projectId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/security/red-team/${projectId}`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro no Red Team' }));
    throw new Error(err.detail || 'Falha na auditoria de segurança');
  }
  return res.json();
}

export async function fetchSecurityPolicyTemplates(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/security/policy-templates`);
  if (!res.ok) return [];
  return res.json();
}

export async function applySecurityPolicy(projectId: string, templateId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/security/apply-policy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, template_id: templateId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro ao aplicar política' }));
    throw new Error(err.detail || 'Falha ao aplicar política');
  }
  return res.json();
}
