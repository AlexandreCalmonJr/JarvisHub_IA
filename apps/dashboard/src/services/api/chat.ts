import { TaskStateResponse, ChatSessionItem } from '../../types';
import { API_BASE, handleApiResponse } from './client';

export async function sendChatMessage(
  prompt: string,
  projectId?: string,
  sessionId?: string,
  model?: string
): Promise<TaskStateResponse> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, project_id: projectId, session_id: sessionId, model }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Erro desconhecido' }));
    throw new Error(errorData.detail || 'Erro ao processar mensagem');
  }
  return res.json();
}

export async function streamChatMessage(
  prompt: string,
  projectId?: string,
  sessionId?: string,
  onChunk?: (token: string) => void,
  onMeta?: (meta: any) => void,
  onDone?: (done: any) => void,
  onError?: (err: string) => void,
  onStatus?: (status: any) => void,
  signal?: AbortSignal,
  model?: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, project_id: projectId, session_id: sessionId, model }),
    signal,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Erro no streaming' }));
    throw new Error(errorData.detail || 'Erro ao processar mensagem em streaming');
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Streaming não suportado pelo navegador.');

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const dataStr = trimmed.slice(6);
      try {
        const payload = JSON.parse(dataStr);
        if (payload.type === 'meta' && onMeta) onMeta(payload);
        else if (payload.type === 'token' && onChunk) onChunk(payload.chunk);
        else if (payload.type === 'done' && onDone) onDone(payload);
        else if (payload.type === 'status' && onStatus) onStatus(payload);
        else if (payload.type === 'error' && onError) onError(payload.error);
      } catch (e) {
        console.warn('Erro ao processar chunk SSE:', e);
      }
    }
  }
}

export async function fetchTasks(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/tasks`);
  return handleApiResponse<any[]>(res, 'Falha ao carregar tarefas.');
}

export async function fetchChatSessions(): Promise<ChatSessionItem[]> {
  const res = await fetch(`${API_BASE}/chat/sessions`);
  return handleApiResponse<ChatSessionItem[]>(res, 'Falha ao carregar sessões de conversa.');
}

export async function fetchChatSessionTasks(sessionId: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Falha ao carregar a conversa.' }));
    throw new Error(errorData.detail || 'Falha ao carregar a conversa.');
  }
  const data = await res.json();
  return data.tasks || [];
}

export async function deleteChatSession(sessionId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/chat/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
  return handleApiResponse<any>(res, 'Falha ao excluir a conversa.');
}

export async function searchChatHistory(query: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/chat/search?query=${encodeURIComponent(query)}`);
  return handleApiResponse<any[]>(res, 'Falha ao pesquisar o histórico de conversas.');
}

export async function exportChatSessionMarkdown(sessionId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}/export`);
  if (!res.ok) throw new Error('Falha ao exportar sessão');
  return res.text();
}

export async function deleteTask(taskId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/tasks/${taskId}`, { method: 'DELETE' });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Falha ao excluir tarefa.' }));
    throw new Error(errorData.detail || 'Falha ao excluir tarefa.');
  }
  const data = await res.json();
  return !!data.deleted;
}

export async function purgeTasks(daysRetention: number = 30): Promise<{ purged_count: number; retention_days: number }> {
  const res = await fetch(`${API_BASE}/tasks/purge?days_retention=${daysRetention}`, { method: 'POST' });
  return handleApiResponse<{ purged_count: number; retention_days: number }>(res, 'Falha ao limpar tarefas antigas.');
}

export async function transcribeAudio(blob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('file', blob, 'microphone.webm');

  const res = await fetch(`${API_BASE}/voice/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Falha na transcrição' }));
    throw new Error(err.detail || 'Falha ao transcrever áudio');
  }

  const data = await res.json();
  return data.text || '';
}

