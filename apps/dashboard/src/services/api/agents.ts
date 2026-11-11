import { AgentInfo } from '../../types';
import { API_BASE, handleApiResponse } from './client';

export async function fetchAgents(): Promise<AgentInfo[]> {
  const res = await fetch(`${API_BASE}/agents`);
  return handleApiResponse<AgentInfo[]>(res, 'Falha ao carregar o catálogo de agentes.');
}

export async function fetchAgent(role: string): Promise<AgentInfo> {
  const res = await fetch(`${API_BASE}/agents/${encodeURIComponent(role)}`);
  if (!res.ok) throw new Error('Falha ao carregar especialista');
  return res.json();
}

export async function updateAgentConfig(
  role: string,
  config: {
    system_prompt?: string;
    preferred_model?: string;
    allowed_tools?: string[];
    is_read_only?: boolean;
    assigned_key_id?: string;
  }
): Promise<any> {
  const res = await fetch(`${API_BASE}/agents/${encodeURIComponent(role)}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Falha ao atualizar configuração do agente');
  return res.json();
}

export async function fetchAgentMemories(role: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/agents/${encodeURIComponent(role)}/memories`);
  return handleApiResponse<any[]>(res, 'Falha ao carregar memórias do agente.');
}

export async function saveAgentMemory(
  role: string,
  memory: { category: string; key: string; content: string; context?: string; importance?: number }
): Promise<any> {
  const res = await fetch(`${API_BASE}/agents/${role}/memories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(memory),
  });
  if (!res.ok) throw new Error('Falha ao salvar memória do agente');
  return res.json();
}

export async function deleteAgentMemory(role: string, memoryId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/agents/${encodeURIComponent(role)}/memories/${encodeURIComponent(memoryId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Falha ao remover memória do agente');
  return res.json();
}

export async function runAgentPlayground(
  role: string,
  prompt: string,
  projectId?: string
): Promise<{ agent_role: string; agent_name: string; response: string; model_used: string; tokens_prompt: number; tokens_completion: number }> {
  const res = await fetch(`${API_BASE}/agents/${encodeURIComponent(role)}/playground`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, project_id: projectId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro no playground' }));
    throw new Error(err.detail || 'Falha ao executar especialista no playground');
  }
  return res.json();
}

export async function fetchTools(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/tools`);
  return handleApiResponse<any[]>(res, 'Falha ao carregar ferramentas disponíveis.');
}

export interface AutonomousAgentEvent {
  type: 'start' | 'thinking' | 'assistant' | 'tool_call' | 'tool_result' | 'approval_required' | 'output_contract' | 'final' | 'error';
  [key: string]: any;
}

export async function fetchAgentHistory(
  role: string,
  sessionId?: string
): Promise<{ agent_role: string; session_id: string; messages: any[] }> {
  const url = sessionId
    ? `${API_BASE}/agents/${encodeURIComponent(role)}/history?session_id=${encodeURIComponent(sessionId)}`
    : `${API_BASE}/agents/${encodeURIComponent(role)}/history`;
  const res = await fetch(url);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Falha ao carregar histórico do especialista.' }));
    throw new Error(errorData.detail || 'Falha ao carregar histórico do especialista.');
  }
  return res.json();
}

export async function runAutonomousAgentTask(
  role: string,
  payload: { prompt: string; project_id?: string; session_id?: string; mode?: string }
): Promise<any> {
  const res = await fetch(`${API_BASE}/agents/${encodeURIComponent(role)}/task`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro na tarefa do especialista' }));
    throw new Error(err.detail || 'Falha ao executar tarefa do especialista');
  }
  return res.json();
}

export async function runAutonomousAgentStream(
  role: string,
  payload: { prompt: string; project_id?: string; session_id?: string; mode?: string },
  onEvent: (event: AutonomousAgentEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE}/agents/${encodeURIComponent(role)}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro ao iniciar o especialista' }));
    throw new Error(err.detail || 'Erro ao iniciar o especialista');
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Streaming não suportado pelo navegador.');

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() || '';
    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(trimmed.slice(6)) as AutonomousAgentEvent;
        onEvent(event);
      } catch (err) {
        console.warn('Evento SSE inválido do especialista:', err);
      }
    }
  }
}
