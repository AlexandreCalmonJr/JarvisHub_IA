import { AgentInfo, AgentMascotMeta, AgentVersionSnapshot } from '../../types';
import { API_BASE, handleApiResponse } from './client';
import { apiFetch } from '../sessionTransport';

export async function fetchAgents(): Promise<AgentInfo[]> {
  const res = await apiFetch(`${API_BASE}/agents`);
  return handleApiResponse<AgentInfo[]>(res, 'Falha ao carregar o catálogo de agentes.');
}

export async function fetchAgent(role: string): Promise<AgentInfo> {
  const res = await apiFetch(`${API_BASE}/agents/${encodeURIComponent(role)}`);
  if (!res.ok) throw new Error('Falha ao carregar especialista');
  return res.json();
}

export interface AgentUpsertPayload {
  role?: string;
  name?: string;
  proper_name?: string;
  handle?: string;
  category?: string;
  mission?: string;
  system_prompt?: string;
  preferred_model?: string;
  routing_policy?: 'auto_hybrid' | 'local_only' | 'online_only';
  autonomy_level?: 'read_only' | 'ask_approval' | 'autonomous';
  allowed_tools?: string[];
  is_read_only?: boolean;
  strict_focus?: boolean;
  strict_topic?: string;
  delegation_targets?: string[];
  assigned_key_id?: string;
  mascot?: AgentMascotMeta;
  template_id?: string;
  installed_skills?: string[];
  change_summary?: string;
}

export async function createAgent(payload: AgentUpsertPayload): Promise<AgentInfo> {
  const res = await apiFetch(`${API_BASE}/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse<AgentInfo>(res, 'Falha ao criar especialista.');
}

export async function updateAgentConfig(role: string, config: AgentUpsertPayload): Promise<AgentInfo> {
  const res = await apiFetch(`${API_BASE}/agents/${encodeURIComponent(role)}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return handleApiResponse<AgentInfo>(res, 'Falha ao atualizar configuração do agente.');
}

export async function deleteAgent(role: string): Promise<{ deleted: boolean }> {
  const res = await apiFetch(`${API_BASE}/agents/${encodeURIComponent(role)}`, {
    method: 'DELETE',
  });
  return handleApiResponse<{ deleted: boolean }>(res, 'Falha ao remover especialista.');
}

export async function updateAgentSkills(
  role: string,
  skillIds: string[]
): Promise<{ agent: AgentInfo; attached_skill_ids: string[] }> {
  const res = await apiFetch(`${API_BASE}/agents/${encodeURIComponent(role)}/skills`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skill_ids: skillIds }),
  });
  return handleApiResponse<{ agent: AgentInfo; attached_skill_ids: string[] }>(
    res,
    'Falha ao atualizar habilidades vinculadas ao agente.'
  );
}

export async function fetchAgentVersions(role: string): Promise<AgentVersionSnapshot[]> {
  const res = await apiFetch(`${API_BASE}/agents/${encodeURIComponent(role)}/versions`);
  return handleApiResponse<AgentVersionSnapshot[]>(res, 'Falha ao carregar histórico de versões.');
}

export async function rollbackAgentVersion(role: string, version: number): Promise<AgentInfo> {
  const res = await apiFetch(`${API_BASE}/agents/${encodeURIComponent(role)}/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  });
  return handleApiResponse<AgentInfo>(res, 'Falha ao reverter versão do especialista.');
}

export interface AgentRouteAssignment {
  agent_role: string;
  key_id: string;
  model: string;
  updated_at?: string;
  key_label?: string | null;
  provider?: string | null;
  key_available?: boolean;
}

export async function fetchAgentRoutes(): Promise<AgentRouteAssignment[]> {
  const res = await apiFetch(`${API_BASE}/agent-routes`);
  const data = await handleApiResponse<{ routes: AgentRouteAssignment[] }>(
    res,
    'Falha ao carregar as rotas dos especialistas.'
  );
  return data.routes;
}

export async function setAgentRoute(
  role: string,
  keyId: string,
  model?: string
): Promise<any> {
  const res = await apiFetch(`${API_BASE}/agent-routes/${encodeURIComponent(role)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key_id: keyId, model: model || undefined }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Falha ao salvar rota do especialista' }));
    throw new Error(err.detail || 'Falha ao salvar rota do especialista');
  }
  return res.json();
}

export async function deleteAgentRoute(role: string): Promise<any> {
  const res = await apiFetch(`${API_BASE}/agent-routes/${encodeURIComponent(role)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Falha ao remover rota do especialista' }));
    throw new Error(err.detail || 'Falha ao remover rota do especialista');
  }
  return res.json();
}

export async function fetchAgentMemories(role: string): Promise<any[]> {
  const res = await apiFetch(`${API_BASE}/agents/${encodeURIComponent(role)}/memories`);
  return handleApiResponse<any[]>(res, 'Falha ao carregar memórias do agente.');
}

export async function saveAgentMemory(
  role: string,
  memory: { category: string; key: string; content: string; context?: string; importance?: number }
): Promise<any> {
  const res = await apiFetch(`${API_BASE}/agents/${role}/memories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(memory),
  });
  if (!res.ok) throw new Error('Falha ao salvar memória do agente');
  return res.json();
}

export async function deleteAgentMemory(role: string, memoryId: string): Promise<any> {
  const res = await apiFetch(`${API_BASE}/agents/${encodeURIComponent(role)}/memories/${encodeURIComponent(memoryId)}`, {
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
  const res = await apiFetch(`${API_BASE}/agents/${encodeURIComponent(role)}/playground`, {
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
  const res = await apiFetch(`${API_BASE}/tools`);
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
  const res = await apiFetch(url);
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
  const res = await apiFetch(`${API_BASE}/agents/${encodeURIComponent(role)}/task`, {
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
  const res = await apiFetch(`${API_BASE}/agents/${encodeURIComponent(role)}/stream`, {
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
