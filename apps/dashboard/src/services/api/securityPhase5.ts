import { API_BASE, handleApiResponse } from './client';
import { apiFetch } from '../sessionTransport';
import type {
  AgentPermissionRule,
  PermissionMode,
  PermissionAction,
  ThreatScanResult,
  ThreatSeverity,
} from '../sentinelSecurity';

export interface IdeWorkspaceFile {
  path: string;
  language: string;
  content: string;
  protected?: boolean;
  updated_at: string;
}

export interface IdeCheckpointRecord {
  id: string;
  file_path: string;
  label: string;
  agent_name: string;
  previous_content: string;
  new_content: string;
  created_at: string;
}

export interface IdeProposalResponse {
  file_path: string;
  original: string;
  proposed: string;
  diff: string;
  summary: string;
  requires_approval: boolean;
  blocked_reason?: string;
}

export interface SentinelIncidentRecord {
  id: string;
  severity: ThreatSeverity;
  category: ThreatScanResult['category'];
  title: string;
  description: string;
  source: string;
  indicators: string[];
  status: 'open' | 'mitigated' | 'quarantined';
  playbook_applied?: string;
  created_at: string;
}

export interface SentinelHubState {
  vault_locked: boolean;
  kill_switch_active: boolean;
  pii_shield_enabled: boolean;
  quarantined_agents: string[];
  protected_paths: string[];
  incidents: SentinelIncidentRecord[];
  default_pin_hint: string;
}

export async function fetchIdeWorkspace(): Promise<{
  files: IdeWorkspaceFile[];
  checkpoints: IdeCheckpointRecord[];
  vault_locked: boolean;
}> {
  const res = await apiFetch(`${API_BASE}/ide/workspace`);
  return handleApiResponse(res, 'Falha ao carregar workspace da IDE.');
}

export async function proposeIdeEdit(payload: {
  file_path: string;
  instruction: string;
  current_content: string;
  agent_role?: string;
}): Promise<IdeProposalResponse> {
  const res = await apiFetch(`${API_BASE}/ide/propose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse(res, 'Falha ao gerar proposta de diff.');
}

export async function applyIdeEdit(payload: {
  file_path: string;
  content: string;
  label?: string;
  agent_name?: string;
}): Promise<{ file: IdeWorkspaceFile; checkpoint: IdeCheckpointRecord }> {
  const res = await apiFetch(`${API_BASE}/ide/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse(res, 'Falha ao aplicar alteração e criar checkpoint.');
}

export async function restoreIdeCheckpoint(checkpointId: string): Promise<{
  restored: boolean;
  file: IdeWorkspaceFile;
  checkpoint: IdeCheckpointRecord;
}> {
  const res = await apiFetch(`${API_BASE}/ide/checkpoints/${encodeURIComponent(checkpointId)}/restore`, {
    method: 'POST',
  });
  return handleApiResponse(res, 'Falha ao reverter checkpoint.');
}

export async function fetchPermissionsMatrix(): Promise<{
  rules: AgentPermissionRule[];
  vault_locked: boolean;
}> {
  const res = await apiFetch(`${API_BASE}/security/permissions-matrix`);
  return handleApiResponse(res, 'Falha ao carregar matriz de permissões.');
}

export async function updateAgentPermissionRule(
  agentRole: string,
  payload: {
    mode: PermissionMode;
    folder_scope: string;
    capabilities: Record<PermissionAction, boolean>;
  }
): Promise<AgentPermissionRule> {
  const res = await apiFetch(`${API_BASE}/security/permissions-matrix/${encodeURIComponent(agentRole)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse(res, 'Falha ao salvar política de permissões.');
}

export async function fetchSentinelState(): Promise<SentinelHubState> {
  const res = await apiFetch(`${API_BASE}/security/sentinel`);
  return handleApiResponse(res, 'Falha ao carregar Central de Incidentes Sentinela.');
}

export async function scanWithSentinel(payload: {
  content: string;
  source_name?: string;
}): Promise<{ scan: ThreatScanResult; incident: SentinelIncidentRecord | null; vault_locked: boolean }> {
  const res = await apiFetch(`${API_BASE}/security/sentinel/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse(res, 'Falha ao executar análise do Agente Sentinela.');
}

export async function executeSentinelPlaybook(
  incidentId: string,
  playbook: 'quarantine_agent' | 'lock_vault' | 'redact_and_clean' | 'dismiss',
  agentRole?: string
): Promise<{ incident: SentinelIncidentRecord; state: SentinelHubState }> {
  const res = await apiFetch(`${API_BASE}/security/sentinel/incidents/${encodeURIComponent(incidentId)}/playbook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playbook, agent_role: agentRole }),
  });
  return handleApiResponse(res, 'Falha ao executar playbook de resposta.');
}

export async function updateSentinelControls(payload: {
  action: 'lock_vault' | 'unlock_vault' | 'toggle_kill_switch' | 'toggle_pii_shield' | 'release_quarantine';
  pin?: string;
  enabled?: boolean;
  agent_role?: string;
}): Promise<SentinelHubState> {
  const res = await apiFetch(`${API_BASE}/security/sentinel/vault`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse(res, 'Falha ao atualizar controles da Sentinela.');
}
