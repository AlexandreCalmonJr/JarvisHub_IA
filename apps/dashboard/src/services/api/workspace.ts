import { API_BASE } from './client';

async function requestWithHumanApproval<T>(
  url: string,
  init: RequestInit,
  retry: (approvalId: string) => { url: string; init: RequestInit },
  impactLabel: string,
): Promise<T> {
  const parse = async (response: Response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `Falha na operação (HTTP ${response.status})`);
    return data;
  };

  const firstResponse = await fetch(url, init);
  const firstData = await parse(firstResponse);
  if (firstData.status !== 'approval_required') return firstData as T;

  const approvalId = String(firstData.approval_id || '');
  if (!approvalId) throw new Error('O servidor solicitou aprovação sem fornecer um identificador válido.');

  const previewValue = firstData.diff || firstData.path || firstData.current_head || firstData.project_id || '';
  const previewText = String(previewValue).slice(0, 3500);
  const approved = window.confirm(
    `${impactLabel}\n\nPré-visualização:\n${previewText || 'Consulte o pedido no Approval Center.'}\n\nO pedido foi registado no Approval Center. Deseja aprovar e executar agora?`,
  );
  const decision = await fetch(`${API_BASE}/approvals/${encodeURIComponent(approvalId)}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: approved ? 'approve' : 'reject',
      reason: approved ? 'Aprovado explicitamente pelo utilizador na interface.' : 'Rejeitado pelo utilizador na interface.',
    }),
  });
  await parse(decision);
  if (!approved) throw new Error('Operação cancelada. O pedido foi rejeitado e nada foi alterado.');

  const next = retry(approvalId);
  const finalResponse = await fetch(next.url, next.init);
  return parse(finalResponse) as Promise<T>;
}

export async function fetchWorkspaceProjects(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/workspace/projects`);
  if (!res.ok) return [];
  return res.json();
}

export async function deleteWorkspaceProject(projectId: string): Promise<any> {
  const url = `${API_BASE}/workspace/projects/${encodeURIComponent(projectId)}`;
  return requestWithHumanApproval(
    url,
    { method: 'DELETE' },
    (approvalId) => ({ url: `${url}?approval_id=${encodeURIComponent(approvalId)}`, init: { method: 'DELETE' } }),
    `ATENÇÃO: excluir permanentemente o projeto "${projectId}" e todos os seus ficheiros.`,
  );
}

export async function openWorkspaceFolder(projectId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/workspace/projects/${projectId}/open-folder`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Falha ao abrir pasta local');
  return res.json();
}

export async function importExternalFolder(folderPath: string, name?: string): Promise<any> {
  const url = `${API_BASE}/workspace/import`;
  const body = { folder_path: folderPath, name };
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
  return requestWithHumanApproval(
    url,
    init,
    (approvalId) => ({
      url,
      init: { ...init, body: JSON.stringify({ ...body, approval_id: approvalId }) },
    }),
    `Importar a pasta "${folderPath}" para o Workspace do JARVIS.`,
  );
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
  const url = `${API_BASE}/workspace/projects/${encodeURIComponent(projectId)}/files/write`;
  const body = { path: filePath, content, reason };
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
  return requestWithHumanApproval(
    url,
    init,
    (approvalId) => ({ url, init: { ...init, body: JSON.stringify({ ...body, approval_id: approvalId }) } }),
    `Gravar "${filePath}" no projeto "${projectId}".`,
  );
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
  const url = `${API_BASE}/workspace/projects/${encodeURIComponent(projectId)}/rollback`;
  return requestWithHumanApproval(
    url,
    { method: 'POST' },
    (approvalId) => ({ url: `${url}?approval_id=${encodeURIComponent(approvalId)}`, init: { method: 'POST' } }),
    `Reverter o último commit do projeto "${projectId}".`,
  );
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
  const url = `${API_BASE}/workspace/projects/${encodeURIComponent(projectId)}/dockerize`;
  return requestWithHumanApproval(
    url,
    { method: 'POST' },
    (approvalId) => ({ url: `${url}?approval_id=${encodeURIComponent(approvalId)}`, init: { method: 'POST' } }),
    `Gerar Dockerfile e configuração Docker no projeto "${projectId}".`,
  );
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
