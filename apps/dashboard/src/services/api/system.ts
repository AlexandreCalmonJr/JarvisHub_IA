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
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Falha ao carregar logs do servidor" }));
    throw new Error(err.detail || "Falha ao carregar logs do servidor");
  }
  return res.json();
}

export async function clearServerLogs(): Promise<void> {
  const res = await fetch(`${API_BASE}/system/server-logs/clear`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Falha ao limpar logs do servidor" }));
    throw new Error(err.detail || "Falha ao limpar logs do servidor");
  }
}

export async function createSystemBackup(): Promise<any> {
  const res = await fetch(`${API_BASE}/system/backup`, { method: 'POST' });
  if (!res.ok) throw new Error('Falha ao gerar backup');
  return res.json();
}
