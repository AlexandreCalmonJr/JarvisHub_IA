export type BrainLayer = 'private' | 'agent' | 'household';

export type BrainSourceKind =
  | 'chat_research'
  | 'web_search'
  | 'document'
  | 'manual'
  | 'assistant_sync'
  | 'integration';

export interface BrainMemoryItem {
  id: string;
  title: string;
  content: string;
  layer: BrainLayer;
  owner_user_id: string;
  owner_name: string;
  agent_role?: string | null;
  agent_name?: string | null;
  source_kind: BrainSourceKind;
  source_label: string;
  source_url?: string | null;
  tags: string[];
  pinned: boolean;
  confidence: number;
  embedding?: number[];
  created_at: string;
  updated_at: string;
}

export interface BrainSearchHit {
  memory: BrainMemoryItem;
  score: number;
}

export interface AssistantPeer {
  id: string;
  assistant_name: string;
  owner_name: string;
  device_label: string;
  status: 'online' | 'standby';
  shared_memory_enabled: boolean;
  last_seen_at: string;
  accent_color: string;
}

export interface AssistantRelayMessage {
  id: string;
  from_peer_id: string;
  from_assistant: string;
  from_owner: string;
  to_peer_id: string;
  to_assistant: string;
  content: string;
  saved_to_household_brain: boolean;
  memory_id?: string | null;
  created_at: string;
}

export interface SharedAssetTransfer {
  id: string;
  kind: 'agent' | 'workflow' | 'context_set';
  asset_id: string;
  asset_name: string;
  summary: string;
  from_assistant: string;
  to_assistant: string;
  status: 'pending' | 'accepted';
  payload?: Record<string, unknown>;
  created_at: string;
  accepted_at?: string | null;
}

const STOPWORDS = new Set([
  'a', 'o', 'e', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
  'um', 'uma', 'para', 'por', 'com', 'sem', 'que', 'se', 'como', 'mais', 'muito',
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'were',
]);

export function tokenizeSemanticText(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((tok) => tok.length >= 2 && !STOPWORDS.has(tok));
}

/**
 * Deterministic 64-dim semantic hash embedding (trigram + token hashing)
 * used as local vector baseline and fallback when remote pgvector/embedding is offline.
 */
export function computeTextEmbedding(text: string, dims = 64): number[] {
  const vec = new Array<number>(dims).fill(0);
  const tokens = tokenizeSemanticText(text);
  if (tokens.length === 0) return vec;

  for (const token of tokens) {
    let h = 2166136261;
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % dims;
    vec[idx] += 1.4;

    if (token.length >= 4) {
      for (let i = 0; i <= token.length - 3; i++) {
        const tri = token.slice(i, i + 3);
        let th = 2166136261;
        for (let j = 0; j < tri.length; j++) {
          th ^= tri.charCodeAt(j);
          th = Math.imul(th, 16777619);
        }
        vec[Math.abs(th) % dims] += 0.45;
      }
    }
  }

  let norm = 0;
  for (let i = 0; i < dims; i++) norm += vec[i] * vec[i];
  const mag = Math.sqrt(norm);
  if (mag === 0) return vec;
  return vec.map((v) => Number((v / mag).toFixed(6)));
}

export function cosineSimilarity(a?: number[], b?: number[]): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function canUserReadMemory(memory: BrainMemoryItem, username: string): boolean {
  if (memory.layer === 'household') return true;
  if (memory.owner_user_id === username) return true;
  if (memory.owner_user_id === 'system' || memory.owner_user_id === 'admin') {
    return memory.layer !== 'private' || username === 'admin';
  }
  return false;
}

export function searchBrainMemories(
  memories: BrainMemoryItem[],
  query: string,
  options?: {
    layer?: BrainLayer | 'all';
    agentRole?: string;
    username?: string;
    pinnedOnly?: boolean;
    limit?: number;
  }
): BrainSearchHit[] {
  const layer = options?.layer || 'all';
  const username = options?.username || 'admin';
  const limit = options?.limit ?? 30;
  const trimmed = (query || '').trim();

  const visible = memories.filter((m) => {
    if (!canUserReadMemory(m, username)) return false;
    if (layer !== 'all' && m.layer !== layer) return false;
    if (options?.agentRole && options.agentRole !== 'all' && m.agent_role !== options.agentRole) {
      return false;
    }
    if (options?.pinnedOnly && !m.pinned) return false;
    return true;
  });

  if (!trimmed) {
    return visible
      .slice()
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updated_at.localeCompare(a.updated_at);
      })
      .slice(0, limit)
      .map((memory) => ({ memory, score: memory.pinned ? 1 : 0.88 }));
  }

  const queryVec = computeTextEmbedding(trimmed);
  const queryTokens = tokenizeSemanticText(trimmed);
  const queryLower = trimmed.toLowerCase();

  const scored: BrainSearchHit[] = [];
  for (const memory of visible) {
    const fullText = `${memory.title} ${memory.content} ${memory.tags.join(' ')} ${memory.agent_name || ''}`;
    const memVec =
      memory.embedding && memory.embedding.length === queryVec.length
        ? memory.embedding
        : computeTextEmbedding(fullText);

    const cos = cosineSimilarity(queryVec, memVec);
    const fullLower = fullText.toLowerCase();
    const exactMatch = fullLower.includes(queryLower) ? 0.32 : 0;
    const tokenHits = queryTokens.filter((t) => fullLower.includes(t)).length;
    const tokenRatio = queryTokens.length > 0 ? tokenHits / queryTokens.length : 0;
    const pinnedBoost = memory.pinned ? 0.06 : 0;

    const rawScore = cos * 0.55 + tokenRatio * 0.35 + exactMatch + pinnedBoost;
    if (rawScore >= 0.14 || exactMatch > 0) {
      scored.push({
        memory,
        score: Number(Math.min(0.99, rawScore).toFixed(3)),
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function distillConversationToMemory(input: {
  prompt: string;
  answer: string;
  ownerUserId: string;
  ownerName: string;
  agentRole?: string;
  agentName?: string;
  sources?: Array<{ title?: string; url: string }>;
  layer?: BrainLayer;
}): Omit<BrainMemoryItem, 'id' | 'created_at' | 'updated_at'> {
  const cleanPrompt = (input.prompt || '').replace(/\s+/g, ' ').trim();
  const cleanAnswer = (input.answer || '')
    .replace(/```[\s\S]*?```/g, '[bloco técnico]')
    .replace(/\s+/g, ' ')
    .trim();

  const titleBase = cleanPrompt.length > 68 ? `${cleanPrompt.slice(0, 65)}...` : cleanPrompt;
  const title = titleBase || `Descoberta de ${input.agentName || 'Assistente'}`;

  const excerpt = cleanAnswer.length > 420 ? `${cleanAnswer.slice(0, 417)}...` : cleanAnswer;
  const hasWeb = Array.isArray(input.sources) && input.sources.length > 0;
  const sourceKind: BrainSourceKind = hasWeb ? 'web_search' : 'chat_research';

  const autoTags = Array.from(
    new Set([
      ...(input.agentRole ? [input.agentRole.replace(/_/g, '-')] : []),
      ...(hasWeb ? ['pesquisa-web'] : ['conversa']),
      ...tokenizeSemanticText(cleanPrompt).slice(0, 3),
    ])
  ).slice(0, 6);

  const layer: BrainLayer =
    input.layer || (input.agentRole && input.agentRole !== 'jarvis_master' ? 'agent' : 'private');

  const combinedText = `${title} ${excerpt} ${autoTags.join(' ')}`;

  return {
    title,
    content: excerpt,
    layer,
    owner_user_id: input.ownerUserId,
    owner_name: input.ownerName,
    agent_role: input.agentRole || null,
    agent_name: input.agentName || null,
    source_kind: sourceKind,
    source_label: hasWeb
      ? `Pesquisa Web · ${input.agentName || 'Assistente'}`
      : `Destilado do Chat · ${input.agentName || 'Assistente'}`,
    source_url: hasWeb ? input.sources?.[0]?.url || null : null,
    tags: autoTags,
    pinned: false,
    confidence: hasWeb ? 0.94 : 0.86,
    embedding: computeTextEmbedding(combinedText),
  };
}
