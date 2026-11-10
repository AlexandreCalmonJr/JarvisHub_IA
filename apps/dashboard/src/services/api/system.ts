import { SystemHealth } from '../../types';
import { API_BASE } from './client';

export async function fetchHealth(): Promise<SystemHealth> {
  const res = await fetch(`${API_BASE}/system/health`);
  if (!res.ok) throw new Error('Falha ao obter status do sistema');
  return res.json();
}

export async function fetchResources(): Promise<any> {
  const res = await fetch(`${API_BASE}/system/resources`);
  if (!res.ok) return { cpu_percent: 0, ram_percent: 0, disk_free_gb: 0 };
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
  if (!res.ok) return { total: 0, logs: [] };
  return res.json();
}

export async function clearServerLogs(): Promise<void> {
  await fetch(`${API_BASE}/system/server-logs/clear`, { method: 'POST' });
}

export async function fetchUserProfileApi(): Promise<any> {
  const res = await fetch(`${API_BASE}/user/profile`);
  if (!res.ok) return {};
  return res.json();
}

export async function saveUserProfileApi(profile: any): Promise<any> {
  const res = await fetch(`${API_BASE}/user/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error('Falha ao salvar preferências');
  return res.json();
}

export async function createSystemBackup(): Promise<any> {
  const res = await fetch(`${API_BASE}/system/backup`, { method: 'POST' });
  if (!res.ok) throw new Error('Falha ao gerar backup');
  return res.json();
}
