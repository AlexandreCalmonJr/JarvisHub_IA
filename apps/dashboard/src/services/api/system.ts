import { SystemHealth } from '../../types';
import { API_BASE } from './client';

export async function fetchHealth(): Promise<SystemHealth> {
  const res = await fetch(`${API_BASE}/system/health`);
  if (!res.ok) throw new Error('Falha ao obter status do sistema');
  return res.json();
}

export async function fetchResources(): Promise<any> {
  const res = await fetch(`${API_BASE}/system/resources`);
  if (!res.ok) throw new Error("Falha ao obter métricas de recursos do sistema");
  return res.json();
}

export async function fetchServerLogs(
  limit: number = 200,
  level?: string,
  search?: string
): Promise<{ total: number; logs: any[] }> {
  let url = `${API_BASE}/system/server-logs?limit=${limit}`;
  if (level && level !== 'ALL') url += `&level=${encodeURIComponent(level)}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Falha ao carregar logs do servidor" }));
    throw new Error(err.detail || "Falha ao carregar logs do servidor");
  }
  return res.json();
}

export async function clearServerLogs(): Promise<void> {
  const res = await fetch(`${API_BASE}/system/server-logs/clear`, { method: 'POST', credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Falha ao limpar logs do servidor" }));
    throw new Error(err.detail || "Falha ao limpar logs do servidor");
  }
}

export async function createSystemBackup(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/system/backup`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error('Apenas administradores podem criar backups do sistema.');
    }
    throw new Error('Não foi possível gerar o backup. Verifique as permissões e tente novamente.');
  }
  const result = await res.json();
  return { status: result.status || 'created' };
}


export interface InferenceTelemetryRecord {
  id: string;
  task_id?: string | null;
  agent_role?: string | null;
  model_name: string;
  provider: string;
  status: 'success' | 'failed';
  feedback_rating?: number | null;
}

export async function fetchTaskInferenceTelemetry(taskId: string): Promise<InferenceTelemetryRecord[]> {
  const res = await fetch(
    `${API_BASE}/system/inference-telemetry?limit=100&task_id=${encodeURIComponent(taskId)}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Falha ao carregar avaliações da tarefa.' }));
    throw new Error(err.detail || 'Falha ao carregar avaliações da tarefa.');
  }
  const data = await res.json();
  return Array.isArray(data.records) ? data.records : [];
}

export async function submitInferenceFeedback(inferenceId: string, rating: number): Promise<void> {
  const res = await fetch(`${API_BASE}/system/inference-feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inference_id: inferenceId, rating }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Falha ao registrar avaliação.' }));
    throw new Error(err.detail || 'Falha ao registrar avaliação.');
  }
}


export interface ModelQualitySummary {
  model_name: string;
  provider: string;
  agent_role?: string | null;
  feedback_count: number;
  average_rating: number;
  sample_sufficient: boolean;
}

export async function fetchModelQualitySummary(): Promise<ModelQualitySummary[]> {
  const res = await fetch(`${API_BASE}/system/inference-telemetry?limit=1`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Falha ao carregar qualidade dos modelos.' }));
    throw new Error(err.detail || 'Falha ao carregar qualidade dos modelos.');
  }
  const data = await res.json();
  return Array.isArray(data.model_quality) ? data.model_quality : [];
}
