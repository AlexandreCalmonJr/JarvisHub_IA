import { API_BASE, handleApiResponse } from './client';

export async function fetchKnowledgeDocuments(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/knowledge/documents`, { credentials: 'include' });
  return handleApiResponse<any[]>(res, 'Falha ao carregar documentos do Knowledge Vault.');
}

export async function uploadKnowledgeDocument(file: File, category: string = 'geral'): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('category', category);
  const res = await fetch(`${API_BASE}/knowledge/upload`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro no upload' }));
    throw new Error(err.detail || 'Falha ao indexar arquivo');
  }
  return res.json();
}

export async function indexKnowledgeFolder(folderPath: string, category: string = 'projeto'): Promise<any> {
  const res = await fetch(`${API_BASE}/knowledge/index-folder`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_path: folderPath, category }),
  });
  return handleApiResponse(res, 'Falha ao indexar pasta local.');
}

export async function indexKnowledgeText(docName: string, content: string, category: string = 'anotacoes'): Promise<any> {
  const res = await fetch(`${API_BASE}/knowledge/index-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc_name: docName, content, category }),
  });
  return handleApiResponse(res, 'Falha ao indexar anotação.');
}

export async function searchKnowledge(query: string, limit: number = 5): Promise<any[]> {
  const res = await fetch(`${API_BASE}/knowledge/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit }),
  });
  return handleApiResponse<any[]>(res, 'Falha ao pesquisar no Knowledge Vault.');
}

export async function deleteKnowledgeDocument(docName: string): Promise<any> {
  const res = await fetch(`${API_BASE}/knowledge/documents/${encodeURIComponent(docName)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleApiResponse(res, 'Falha ao excluir documento do Knowledge Vault.');
}
