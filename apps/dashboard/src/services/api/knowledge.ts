import { API_BASE } from './client';

export async function fetchKnowledgeDocuments(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/knowledge/documents`);
  if (!res.ok) return [];
  return res.json();
}

export async function uploadKnowledgeDocument(file: File, category: string = 'geral'): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('category', category);
  const res = await fetch(`${API_BASE}/knowledge/upload`, {
    method: 'POST',
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_path: folderPath, category }),
  });
  if (!res.ok) throw new Error('Falha ao indexar pasta local');
  return res.json();
}

export async function indexKnowledgeText(docName: string, content: string, category: string = 'anotacoes'): Promise<any> {
  const res = await fetch(`${API_BASE}/knowledge/index-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc_name: docName, content, category }),
  });
  if (!res.ok) throw new Error('Falha ao indexar anotação');
  return res.json();
}

export async function searchKnowledge(query: string, limit: number = 5): Promise<any[]> {
  const res = await fetch(`${API_BASE}/knowledge/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit }),
  });
  if (!res.ok) return [];
  return res.json();
}

export async function deleteKnowledgeDocument(docName: string): Promise<any> {
  const res = await fetch(`${API_BASE}/knowledge/documents/${encodeURIComponent(docName)}`, {
    method: 'DELETE',
  });
  return res.json();
}
