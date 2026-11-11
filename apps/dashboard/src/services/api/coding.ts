import { API_BASE } from './client';

const requestOptions: RequestInit = { credentials: 'include' };

export interface CodingModeInfo {
  id: 'plan' | 'ask' | 'auto';
  label: string;
  description: string;
}

export interface CodingToolInfo {
  name: string;
  description: string;
  risk: 'read' | 'write' | 'exec';
  requires_approval: boolean;
  parameters: Record<string, unknown>;
}

export interface CodingToolsResponse {
  modes: CodingModeInfo[];
  tools: CodingToolInfo[];
  provider: { name: string; model: string; local_first?: boolean; error?: string };
}

export interface CodingMessage {
  id: number;
  session_id: string;
  project_id?: string | null;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  tool_call_id?: string | null;
  tool_name?: string | null;
  created_at: string;
}

export interface CodingRunPayload {
  prompt: string;
  project_id: string;
  session_id?: string;
  task_id?: string;
  mode: 'plan' | 'ask' | 'auto';
  model?: string;
  agent_role?: string;
  max_iterations?: number;
  temperature?: number;
  max_tokens?: number;
  include_history?: boolean;
}

export type CodingEvent = {
  type:
    | 'start'
    | 'thinking'
    | 'assistant'
    | 'tool_call'
    | 'tool_result'
    | 'approval_required'
    | 'final'
    | 'error';
  [key: string]: unknown;
};

export async function fetchCodingTools(): Promise<CodingToolsResponse> {
  const res = await fetch(`${API_BASE}/coding/tools`, requestOptions);
  if (!res.ok) throw new Error('Falha ao carregar as ferramentas do Coding Agent');
  return res.json();
}

export interface McpReloadSummary {
  servers: number;
  tools: number;
  errors: Record<string, string>;
  registered: string[];
  status?: Record<string, unknown>;
}

export async function reloadMcpServers(): Promise<McpReloadSummary> {
  const res = await fetch(`${API_BASE}/mcp/reload`, { ...requestOptions, method: 'POST' });
  if (!res.ok) throw new Error('Falha ao recarregar servidores MCP');
  return res.json();
}

export async function fetchCodingMessages(sessionId: string): Promise<CodingMessage[]> {
  const res = await fetch(`${API_BASE}/coding/sessions/${encodeURIComponent(sessionId)}/messages`, requestOptions);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Falha ao carregar histórico do Coding Agent.' }));
    throw new Error(errorData.detail || 'Falha ao carregar histórico do Coding Agent.');
  }
  const data = await res.json();
  return data.messages || [];
}

export async function clearCodingMessages(sessionId: string): Promise<number> {
  const res = await fetch(`${API_BASE}/coding/sessions/${encodeURIComponent(sessionId)}/messages`, {
    ...requestOptions,
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Falha ao limpar o histórico da sessão');
  const data = await res.json();
  return data.deleted || 0;
}

export async function decideCodingApproval(
  approvalId: string,
  action: 'approve' | 'reject',
  reason?: string
): Promise<any> {
  const res = await fetch(`${API_BASE}/coding/approvals/${encodeURIComponent(approvalId)}/decide`, {
    ...requestOptions,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Falha ao decidir aprovação' }));
    throw new Error(err.detail || 'Falha ao decidir aprovação');
  }
  return res.json();
}

/**
 * Executa o agente e entrega cada evento SSE já desserializado.
 */
export async function runCodingAgentStream(
  payload: CodingRunPayload,
  onEvent: (event: CodingEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE}/coding/run/stream`, {
    ...requestOptions,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro ao iniciar o Coding Agent' }));
    throw new Error(err.detail || 'Erro ao iniciar o Coding Agent');
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Streaming não suportado pelo navegador.');

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const dispatchBlock = (block: string) => {
    const dataLine = block.split(/\r?\n/).find((line) => line.startsWith('data:'));
    if (!dataLine) return;
    try {
      const event = JSON.parse(dataLine.slice(5).trim()) as CodingEvent;
      onEvent(event);
    } catch (err) {
      console.warn('Evento SSE inválido do Coding Agent:', err);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || '';
    for (const block of blocks) dispatchBlock(block);
  }

  buffer += decoder.decode();
  if (buffer.trim()) dispatchBlock(buffer);
}
