import { API_BASE } from './client';

export async function fetchHardwareProfile(): Promise<any> {
  const res = await fetch(`${API_BASE}/system/hardware-profile`);
  if (!res.ok) throw new Error('Falha ao coletar perfil de hardware');
  return res.json();
}

export async function applyHardwareOptimizations(): Promise<any> {
  const res = await fetch(`${API_BASE}/system/apply-hardware-optimizations`, { method: 'POST' });
  if (!res.ok) throw new Error('Falha ao aplicar otimizações de hardware');
  return res.json();
}

export async function fetchPerformanceMode(): Promise<any> {
  const res = await fetch(`${API_BASE}/hardware/performance-mode`);
  if (!res.ok) return { mode: 'auto', effective_mode: 'balanced', logical_cores: 4 };
  return res.json();
}

export async function setPerformanceMode(mode: string, cpuThreads?: number, ecoModel?: string): Promise<any> {
  const res = await fetch(`${API_BASE}/hardware/performance-mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, cpu_threads: cpuThreads, eco_model: ecoModel }),
  });
  if (!res.ok) throw new Error('Falha ao definir modo de desempenho');
  return res.json();
}
