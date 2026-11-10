import { API_BASE } from './client';

export async function fetchWorkspaceProjects(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/workspace/projects`);
  if (!res.ok) return [];
  return res.json();
}

export async function deleteWorkspaceProject(projectId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/workspace/projects/${projectId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Falha ao excluir projeto');
  return res.json();
}

export async function openWorkspaceFolder(projectId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/workspace/projects/${projectId}/open-folder`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Falha ao abrir pasta local');
  return res.json();
}

export async function importExternalFolder(folderPath: string, name?: string): Promise<any> {
  const res = await fetch(`${API_BASE}/workspace/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_path: folderPath, name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro ao importar pasta' }));
    throw new Error(err.detail || 'Falha ao importar pasta');
  }
  return res.json();
}

export async function fetchProjectFile(projectId: string, path: string): Promise<string> {
  const res = await fetch(`${API_BASE}/workspace/projects/${projectId}/file?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error('Não foi possível ler o arquivo.');
  const data = await res.json();
  return data.content || '';
}

export async function writeProjectFile(
  projectId: string,
  filePath: string,
  content: string,
  reason?: string
): Promise<any> {
  const res = await fetch(`${API_BASE}/workspace/projects/${projectId}/files/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro ao gravar arquivo' }));
    throw new Error(err.detail || 'Falha ao salvar arquivo no projeto');
  }
  return res.json();
}

export async function fetchProjectMemory(projectId: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/workspace/projects/${projectId}/memory`);
  if (!res.ok) return [];
  return res.json();
}

export async function saveProjectMemory(
  projectId: string,
  memory: { category: string; key: string; content: string; sources?: string[] }
): Promise<any> {
  const res = await fetch(`${API_BASE}/workspace/projects/${projectId}/memory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(memory),
  });
  if (!res.ok) throw new Error('Falha ao salvar diretriz do projeto');
  return res.json();
}

export async function openWorkspaceRoot(): Promise<any> {
  const res = await fetch(`${API_BASE}/workspace/open-root`, { method: 'POST' });
  if (!res.ok) throw new Error('Falha ao abrir pasta de workspace');
  return res.json();
}

export async function openProjectInCode(projectId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/workspace/projects/${projectId}/open-code`, { method: 'POST' });
  if (!res.ok) throw new Error('Falha ao abrir projeto no VS Code');
  return res.json();
}

export async function rollbackWorkspaceProject(projectId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/workspace/projects/${projectId}/rollback`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro ao executar rollback' }));
    throw new Error(err.detail || 'Falha no rollback');
  }
  return res.json();
}

export async function fetchGitHistory(projectId: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/workspace/projects/${projectId}/git-history`);
  if (!res.ok) return [];
  return res.json();
}

export function getProjectPreviewUrl(projectId: string): string {
  return `${API_BASE}/workspace/projects/${projectId}/preview`;
}

export function getProjectExportZipUrl(projectId: string): string {
  return `${API_BASE}/workspace/projects/${projectId}/export-zip`;
}

export async function dockerizeWorkspaceProject(projectId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/workspace/projects/${projectId}/dockerize`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro ao dockerizar' }));
    throw new Error(err.detail || 'Falha ao dockerizar projeto');
  }
  return res.json();
}

export async function fetchWebhooksConfig(): Promise<any> {
  const res = await fetch(`${API_BASE}/system/webhooks`);
  if (!res.ok) return { enabled: false };
  return res.json();
}

export async function saveWebhooksConfig(config: any): Promise<any> {
  const res = await fetch(`${API_BASE}/system/webhooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Falha ao salvar configurações de webhook');
  return res.json();
}

export async function testWebhooksNotification(): Promise<any> {
  const res = await fetch(`${API_BASE}/system/webhooks/test`, { method: 'POST' });
  return res.json();
}
