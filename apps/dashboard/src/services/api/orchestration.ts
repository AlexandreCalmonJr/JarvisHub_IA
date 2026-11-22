import { API_BASE, handleApiResponse } from './client';
import { apiFetch } from '../sessionTransport';
import type { RoundtableSession, StructuredArtifactPayload } from '../../../server/artifactEngine';
import type { GeneratedWorkflowConnection, GeneratedWorkflowNode } from '../multiOrchestrator';

export interface LiveOfficeAgentStatus {
  agent_role: string;
  agent_name: string;
  zone: 'desk' | 'roundtable' | 'coffee' | 'research';
  activity: string;
  mood: 'idle' | 'thinking' | 'researching' | 'creating' | 'debating' | 'celebrating';
  updated_at: string;
}

export interface OfficeLiveState {
  statuses: LiveOfficeAgentStatus[];
  active_roundtable: RoundtableSession | null;
  recent_roundtables: RoundtableSession[];
}

export interface SavedWorkflowRecord {
  id: string;
  title: string;
  description: string;
  schedule_cron: string;
  schedule_label: string;
  schedule_enabled: boolean;
  nodes: GeneratedWorkflowNode[];
  connections: GeneratedWorkflowConnection[];
  last_run_at?: string | null;
  last_run_status?: 'idle' | 'running' | 'success' | 'error';
  created_at: string;
  updated_at: string;
}

export interface WorkflowRunRecord {
  id: string;
  workflow_id: string;
  workflow_title: string;
  status: 'running' | 'success' | 'error';
  steps: Array<{
    node_id: string;
    title: string;
    status: 'success' | 'error';
    output: string;
    duration_ms: number;
  }>;
  summary: string;
  started_at: string;
  finished_at: string;
}

export interface WorkflowTemplateItem {
  id: string;
  name: string;
  category: string;
  description: string;
  schedule_cron: string;
  schedule_label: string;
  prompt_seed: string;
}

export async function fetchOfficeLiveState(): Promise<OfficeLiveState> {
  const res = await apiFetch(`${API_BASE}/office/state`);
  return handleApiResponse<OfficeLiveState>(res, 'Falha ao carregar estado ao vivo do Escritório.');
}

export async function startOfficeRoundtable(payload: {
  topic: string;
  participant_roles?: string[];
  assistant_name?: string;
}): Promise<RoundtableSession> {
  const res = await apiFetch(`${API_BASE}/office/roundtable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse<RoundtableSession>(res, 'Falha ao iniciar Mesa Redonda.');
}

export async function fetchWorkflowsHub(): Promise<{
  workflows: SavedWorkflowRecord[];
  runs: WorkflowRunRecord[];
  templates: WorkflowTemplateItem[];
}> {
  const res = await apiFetch(`${API_BASE}/workflows`);
  return handleApiResponse(res, 'Falha ao carregar fluxos e execuções.');
}

export async function generateWorkflowFromPrompt(prompt: string): Promise<SavedWorkflowRecord> {
  const res = await apiFetch(`${API_BASE}/workflows/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  return handleApiResponse<SavedWorkflowRecord>(res, 'Falha ao gerar fluxo com Flow Architect.');
}

export async function saveWorkflowRecord(
  workflow: Partial<SavedWorkflowRecord> & { id?: string; title: string }
): Promise<SavedWorkflowRecord> {
  const method = workflow.id ? 'PUT' : 'POST';
  const url = workflow.id
    ? `${API_BASE}/workflows/${encodeURIComponent(workflow.id)}`
    : `${API_BASE}/workflows`;
  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workflow),
  });
  return handleApiResponse<SavedWorkflowRecord>(res, 'Falha ao salvar fluxo.');
}

export async function deleteWorkflowRecord(id: string): Promise<{ deleted: boolean }> {
  const res = await apiFetch(`${API_BASE}/workflows/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return handleApiResponse<{ deleted: boolean }>(res, 'Falha ao remover fluxo.');
}

export async function executeWorkflowNow(id: string): Promise<WorkflowRunRecord> {
  const res = await apiFetch(`${API_BASE}/workflows/${encodeURIComponent(id)}/run`, {
    method: 'POST',
  });
  return handleApiResponse<WorkflowRunRecord>(res, 'Falha ao executar fluxo.');
}

export async function generateDeliverableArtifact(payload: {
  kind: 'pptx' | 'pdf' | 'png';
  topic: string;
  context?: string;
  assistant_name?: string;
}): Promise<StructuredArtifactPayload> {
  const res = await apiFetch(`${API_BASE}/artifacts/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse<StructuredArtifactPayload>(res, 'Falha ao gerar artefato.');
}
