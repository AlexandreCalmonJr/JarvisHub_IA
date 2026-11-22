import { API_BASE, handleApiResponse } from './client';
import { apiFetch } from '../sessionTransport';
import type {
  AssistantPeer,
  AssistantRelayMessage,
  BrainLayer,
  BrainMemoryItem,
  BrainSearchHit,
  SharedAssetTransfer,
} from '../secondBrain';

export interface BrainOverviewResponse {
  memories: BrainSearchHit[];
  counts: {
    total: number;
    private: number;
    agent: number;
    household: number;
    pinned: number;
  };
  auto_distill_enabled: boolean;
}

export async function fetchBrainMemories(params?: {
  q?: string;
  layer?: BrainLayer | 'all';
  agent_role?: string;
  pinned_only?: boolean;
}): Promise<BrainOverviewResponse> {
  const sp = new URLSearchParams();
  if (params?.q) sp.set('q', params.q);
  if (params?.layer && params.layer !== 'all') sp.set('layer', params.layer);
  if (params?.agent_role && params.agent_role !== 'all') sp.set('agent_role', params.agent_role);
  if (params?.pinned_only) sp.set('pinned_only', 'true');
  const qs = sp.toString();
  const res = await apiFetch(`${API_BASE}/brain/memories${qs ? `?${qs}` : ''}`);
  return handleApiResponse<BrainOverviewResponse>(res, 'Falha ao carregar o Mapa do Cérebro.');
}

export async function createBrainMemory(payload: {
  title: string;
  content: string;
  layer: BrainLayer;
  agent_role?: string | null;
  agent_name?: string | null;
  source_kind?: string;
  source_label?: string;
  source_url?: string | null;
  tags?: string[];
  pinned?: boolean;
}): Promise<BrainMemoryItem> {
  const res = await apiFetch(`${API_BASE}/brain/memories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse<BrainMemoryItem>(res, 'Falha ao gravar memória no Segundo Cérebro.');
}

export async function distillToBrain(payload: {
  prompt: string;
  answer: string;
  agent_role?: string;
  agent_name?: string;
  layer?: BrainLayer;
  sources?: Array<{ title?: string; url: string }>;
}): Promise<BrainMemoryItem> {
  const res = await apiFetch(`${API_BASE}/brain/distill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse<BrainMemoryItem>(res, 'Falha ao destilar conhecimento para o Cérebro.');
}

export async function updateBrainMemory(
  id: string,
  patch: Partial<{
    title: string;
    content: string;
    layer: BrainLayer;
    pinned: boolean;
    tags: string[];
  }>
): Promise<BrainMemoryItem> {
  const res = await apiFetch(`${API_BASE}/brain/memories/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return handleApiResponse<BrainMemoryItem>(res, 'Falha ao atualizar memória.');
}

export async function deleteBrainMemory(id: string): Promise<{ deleted: boolean }> {
  const res = await apiFetch(`${API_BASE}/brain/memories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return handleApiResponse<{ deleted: boolean }>(res, 'Falha ao esquecer memória.');
}

export async function setBrainAutoDistill(enabled: boolean): Promise<{ auto_distill_enabled: boolean }> {
  const res = await apiFetch(`${API_BASE}/brain/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auto_distill_enabled: enabled }),
  });
  return handleApiResponse<{ auto_distill_enabled: boolean }>(
    res,
    'Falha ao atualizar auto-destilação.'
  );
}

export interface AssistantFederationState {
  peers: AssistantPeer[];
  messages: AssistantRelayMessage[];
  shared_assets: SharedAssetTransfer[];
  household_memories_count: number;
}

export async function fetchAssistantFederation(): Promise<AssistantFederationState> {
  const res = await apiFetch(`${API_BASE}/assistants/federation`);
  return handleApiResponse<AssistantFederationState>(
    res,
    'Falha ao carregar os assistentes conectados da casa.'
  );
}

export async function sendAssistantRelayMessage(payload: {
  from_assistant?: string;
  to_peer_id: string;
  content: string;
  save_to_household_brain?: boolean;
}): Promise<{ message: AssistantRelayMessage; reply?: AssistantRelayMessage; memory?: BrainMemoryItem }> {
  const res = await apiFetch(`${API_BASE}/assistants/relay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse(res, 'Falha ao enviar recado entre assistentes.');
}

export async function shareAssetWithPeer(payload: {
  kind: 'agent' | 'workflow' | 'context_set';
  asset_id: string;
  asset_name: string;
  summary: string;
  from_assistant?: string;
  to_peer_id: string;
}): Promise<SharedAssetTransfer> {
  const res = await apiFetch(`${API_BASE}/assistants/share-asset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse<SharedAssetTransfer>(res, 'Falha ao compartilhar item com o outro assistente.');
}

export async function acceptSharedAsset(transferId: string): Promise<{ transfer: SharedAssetTransfer; installed_name: string }> {
  const res = await apiFetch(`${API_BASE}/assistants/shared-assets/${encodeURIComponent(transferId)}/accept`, {
    method: 'POST',
  });
  return handleApiResponse(res, 'Falha ao aceitar item compartilhado.');
}

export async function togglePeerSharedMemory(peerId: string, enabled: boolean): Promise<AssistantPeer> {
  const res = await apiFetch(`${API_BASE}/assistants/peers/${encodeURIComponent(peerId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shared_memory_enabled: enabled }),
  });
  return handleApiResponse<AssistantPeer>(res, 'Falha ao atualizar sincronização de memória.');
}

export interface JarvisRealtimeEvent {
  type:
    | 'assistant_message'
    | 'brain_memory_updated'
    | 'shared_asset_received'
    | 'office_agent_event'
    | 'roundtable_started'
    | 'roundtable_turn'
    | 'roundtable_verdict'
    | 'workflow_run_progress'
    | 'sentinel_incident'
    | 'ide_checkpoint_created'
    | 'push_notification'
    | 'companion_update'
    | 'connected';
  payload?: any;
}

export function subscribeJarvisRealtime(onEvent: (event: JarvisRealtimeEvent) => void): () => void {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    return () => {};
  }
  let closed = false;
  let ws: WebSocket | null = null;
  let retryTimer: number | null = null;

  const connect = () => {
    if (closed) return;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(String(ev.data || '{}'));
          if (parsed && parsed.type) onEvent(parsed);
        } catch {
          // ignore malformed event
        }
      };
      ws.onclose = () => {
        if (!closed) {
          retryTimer = window.setTimeout(connect, 4000);
        }
      };
      ws.onerror = () => {
        // handled silently via onclose retry
      };
    } catch {
      // ignore ws init failure
    }
  };

  connect();

  return () => {
    closed = true;
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    try {
      ws?.close();
    } catch {
      // ignore
    }
  };
}
