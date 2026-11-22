import { API_BASE, handleApiResponse } from './client';
import { apiFetch } from '../sessionTransport';

export interface VoiceBriefingResponse {
  assistant_name: string;
  user_name: string;
  greeting: string;
  briefing_line: string;
  pending_approvals: number;
  open_incidents: number;
  active_workflows: number;
  quick_prompts: string[];
  generated_at: string;
}

export interface VoiceConverseResponse {
  reply: string;
  detected_wake_word: boolean;
  trigger_phrase: string | null;
  command_extracted: string;
  model_used: string;
  execution_mode: 'LOCAL' | 'ONLINE';
  practice_mode: 'general' | 'english';
  attachment_acknowledged?: string;
  timestamp: string;
}

export interface PushNotificationItem {
  id: string;
  channel: 'task_completed' | 'assistant_message' | 'sentinel_alert' | 'approval_required';
  title: string;
  body: string;
  delivered_via: string[];
  created_at: string;
}

export interface PushBridgeConfig {
  web_push_enabled: boolean;
  telegram_enabled: boolean;
  telegram_chat_id: string;
  telegram_bot_masked: string;
  webhook_url: string;
  channels: {
    task_completed: boolean;
    assistant_message: boolean;
    sentinel_alert: boolean;
    approval_required: boolean;
  };
  recent_notifications: PushNotificationItem[];
}

export interface CompanionDeviceRecord {
  id: string;
  name: string;
  owner: string;
  platform: string;
  status: 'online' | 'standby' | 'offline';
  cpu_percent: number;
  ram_percent: number;
  ram_total_gb: number;
  gpu_name: string;
  vram_gb: number;
  ollama_online: boolean;
  ollama_models: string[];
  vault_locked: boolean;
  last_heartbeat: string;
}

export interface RemoteCommandRecord {
  id: string;
  device_id: string;
  device_name: string;
  command: string;
  source: 'mobile_pwa' | 'voice_hud' | 'offline_sync';
  status: 'pending_approval' | 'executed' | 'rejected';
  requires_approval: boolean;
  output?: string;
  created_at: string;
  updated_at: string;
}

export interface CompanionHubState {
  pairing_code: string;
  pairing_url: string;
  qr_payload: string;
  expires_at: string;
  devices: CompanionDeviceRecord[];
  commands: RemoteCommandRecord[];
}

export async function fetchVoiceBriefing(): Promise<VoiceBriefingResponse> {
  const res = await apiFetch(`${API_BASE}/voice/briefing`);
  return handleApiResponse(res, 'Falha ao carregar briefing diário de voz.');
}

export async function sendVoiceTurn(payload: {
  transcript: string;
  practice_mode?: 'general' | 'english';
  attachment_name?: string;
  attachment_kind?: 'camera_photo' | 'pdf';
}): Promise<VoiceConverseResponse> {
  const res = await apiFetch(`${API_BASE}/voice/converse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse(res, 'Falha ao processar comando de voz.');
}

export async function fetchPushConfig(): Promise<PushBridgeConfig> {
  const res = await apiFetch(`${API_BASE}/push/config`);
  return handleApiResponse(res, 'Falha ao carregar configuração de notificações push.');
}

export async function updatePushConfig(payload: {
  web_push_enabled?: boolean;
  telegram_enabled?: boolean;
  telegram_chat_id?: string;
  telegram_bot_token?: string;
  webhook_url?: string;
  channels?: Partial<PushBridgeConfig['channels']>;
}): Promise<PushBridgeConfig> {
  const res = await apiFetch(`${API_BASE}/push/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse(res, 'Falha ao salvar canais de push.');
}

export async function sendTestPushNotification(payload?: {
  channel?: PushNotificationItem['channel'];
  title?: string;
  body?: string;
}): Promise<{ notification: PushNotificationItem; config: PushBridgeConfig }> {
  const res = await apiFetch(`${API_BASE}/push/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  return handleApiResponse(res, 'Falha ao disparar notificação push de teste.');
}

export async function fetchCompanionState(): Promise<CompanionHubState> {
  const res = await apiFetch(`${API_BASE}/companion/state`);
  return handleApiResponse(res, 'Falha ao carregar estado do Desktop Companion.');
}

export async function regenerateCompanionPairing(): Promise<CompanionHubState> {
  const res = await apiFetch(`${API_BASE}/companion/pair`, { method: 'POST' });
  return handleApiResponse(res, 'Falha ao gerar novo QR Code de pareamento.');
}

export async function enqueueRemoteCommand(payload: {
  device_id?: string;
  command: string;
  source?: RemoteCommandRecord['source'];
}): Promise<{ command: RemoteCommandRecord; state: CompanionHubState }> {
  const res = await apiFetch(`${API_BASE}/companion/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse(res, 'Falha ao enviar comando para o Desktop Companion.');
}

export async function decideRemoteCommand(
  commandId: string,
  decision: 'approve' | 'reject'
): Promise<{ command: RemoteCommandRecord; state: CompanionHubState }> {
  const res = await apiFetch(`${API_BASE}/companion/commands/${encodeURIComponent(commandId)}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }),
  });
  return handleApiResponse(res, 'Falha ao decidir comando remoto.');
}

export async function fetchCompanionScript(deviceName?: string): Promise<{
  filename: string;
  script: string;
  pairing_code: string;
}> {
  const qs = deviceName ? `?device_name=${encodeURIComponent(deviceName)}` : '';
  const res = await apiFetch(`${API_BASE}/companion/script${qs}`);
  return handleApiResponse(res, 'Falha ao gerar pacote do Desktop Companion.');
}
