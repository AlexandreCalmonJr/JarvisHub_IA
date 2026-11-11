import { API_BASE, handleApiResponse } from './client';

const requestOptions: RequestInit = { credentials: 'include' };

export async function fetchHardwareProfile(): Promise<any> {
  const res = await fetch(`${API_BASE}/system/hardware-profile`, requestOptions);
  return handleApiResponse(res, 'Falha ao coletar perfil de hardware.');
}

export async function applyHardwareOptimizations(): Promise<any> {
  const res = await fetch(`${API_BASE}/system/apply-hardware-optimizations`, {
    ...requestOptions,
    method: 'POST',
  });
  return handleApiResponse(res, 'Falha ao aplicar otimizações de hardware.');
}

export async function fetchPerformanceMode(): Promise<any> {
  const res = await fetch(`${API_BASE}/hardware/performance-mode`, requestOptions);
  return handleApiResponse(res, 'Falha ao carregar modo de desempenho.');
}

export async function setPerformanceMode(mode: string, cpuThreads?: number, ecoModel?: string): Promise<any> {
  const res = await fetch(`${API_BASE}/hardware/performance-mode`, {
    ...requestOptions,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, cpu_threads: cpuThreads, eco_model: ecoModel }),
  });
  return handleApiResponse(res, 'Falha ao definir modo de desempenho.');
}
