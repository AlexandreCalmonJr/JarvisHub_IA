/**
 * Cliente API da Fase 8+ — Servidor Cérebro Poliglota (Node.js v22 + Python 3.11 + Go Docker/VPS).
 * Inclui Multi-Cérebros, Perfis Isolados, Memória Markdown (SOUL/MEMORY/USER.md),
 * Busca Híbrida FTS5 + Vetores (RRF), Worker Python 3.11, Filas Seriais e Gateway MCP.
 */
import { apiFetch } from '../sessionTransport';
import { API_BASE } from './client';
import type {
  BrainConnectionProfile,
  BrainDeploymentOptions,
  BrainMode,
  GeneratedServerArtifact,
  JarvisBrainPack,
} from '../brainArchitectureEngine';

export interface WorkspaceIndexStats {
  db_path: string;
  db_size_bytes: number;
  chunks: number;
  embeddings: number;
  entries_memory: number;
  entries_user: number;
  markdown_files: number;
}

export interface BrainInfoResponse {
  brain_id: string;
  name: string;
  version: string;
  schema_version?: string;
  mode: BrainMode;
  database_engine: string;
  storage_path: string;
  db_size_bytes?: number;
  journal_mode?: string;
  backups_count?: number;
  active_workspace_slug?: string;
  active_workspace_name?: string;
  hybrid_index?: WorkspaceIndexStats;
  mdns_service: string;
  active_profile_id: string;
  uptime_seconds: number;
  services: {
    database: 'online' | 'offline';
    gemini_cloud: 'configured' | 'standby';
    ollama_local: 'detected' | 'optional';
    redis_queue: 'online' | 'local_scheduler';
  };
  counts: {
    agents: number;
    skills: number;
    workflows: number;
    knowledge: number;
    sessions: number;
    paired_devices: number;
  };
}

export interface BrainSchemaResponse {
  mode: BrainMode;
  schema_version: string;
  storage_path: string;
  journal_mode: string;
  db_size_bytes: number;
  tables: Array<{ table: string; rows: number }>;
}

export interface BrainBackupItem {
  filename: string;
  path: string;
  size_bytes: number;
  created_at: string;
}

export interface BrainProfilesResponse {
  activeProfileId: string;
  profiles: BrainConnectionProfile[];
}

export interface AgentWorkspaceItem {
  slug: string;
  name: string;
  description: string;
  storage_subdir: string;
  db_filename: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspacesResponse {
  activeSlug: string;
  workspaces: AgentWorkspaceItem[];
  active_stats: WorkspaceIndexStats;
}

export type MemoryFilename = 'SOUL.md' | 'MEMORY.md' | 'USER.md';
export type MemoryScope = 'memory' | 'user';

export interface MarkdownMemoryFileItem {
  workspace_slug: string;
  filename: MemoryFilename;
  content: string;
  content_hash: string;
  size_bytes: number;
  synced_at: string;
}

export interface MemoryEntryItem {
  id: string;
  workspace_slug: string;
  scope: MemoryScope;
  title: string;
  content: string;
  source: string;
  tags: string[];
  confidence: number;
  created_at: string;
  updated_at: string;
}

export interface HybridSearchHitItem {
  chunk_id: string;
  workspace_slug: string;
  source_type: 'markdown' | 'memory_entry' | 'knowledge';
  source_ref: string;
  heading: string;
  snippet: string;
  bm25_score: number;
  vector_score: number;
  rrf_score: number;
}

export interface HybridSearchResponse {
  workspace_slug: string;
  query: string;
  weights: { bm25: number; vector: number };
  hits: HybridSearchHitItem[];
  fts_candidates: number;
  vector_candidates: number;
  engine: string;
  elapsed_ms: number;
}

export interface SessionLaneJobItem {
  id: string;
  session_id: string;
  workspace_slug: string;
  job_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  duration_ms: number;
  summary: string;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface PythonWorkerStatusResponse {
  worker: {
    status: 'online' | 'offline';
    python_version: string;
    sqlite_version: string;
    fts5_available: boolean;
    vector_dimensions: number;
    pid: number;
    elapsed_ms?: number;
  };
  workspace_slug: string;
  analysis: {
    chunks: number;
    estimated_tokens: number;
    embeddings: number;
    entries_memory: number;
    entries_user: number;
    top_terms: Array<{ term: string; count: number }>;
    elapsed_ms?: number;
  };
  lanes: {
    active_lanes: number;
    pending_jobs: number;
    total_executed: number;
    lanes: Array<{ session_id: string; depth: number; running: boolean }>;
  };
}

export interface McpToolItem {
  name: string;
  description: string;
  requires_approval: boolean;
  input_hint: string;
}

export interface McpServerItem {
  id: string;
  name: string;
  transport: 'stdio' | 'http';
  endpoint: string;
  description: string;
  is_approved: boolean;
  is_builtin: boolean;
  status: 'online' | 'standby' | 'error';
  tools: McpToolItem[];
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface McpToolLogItem {
  id: string;
  server_id: string;
  server_name: string;
  tool_name: string;
  arguments_json: string;
  status: 'success' | 'blocked' | 'error';
  output_summary: string;
  duration_ms: number;
  actor: string;
  created_at: string;
}

// ==================== CORE MULTI-BRAIN & BACKUP ====================
export async function fetchBrainInfoApi(): Promise<BrainInfoResponse> {
  const res = await apiFetch(`${API_BASE}/brain/info`);
  if (!res.ok) throw new Error('Falha ao consultar informações do Cérebro ativo.');
  return res.json();
}

export async function fetchBrainProfilesApi(): Promise<BrainProfilesResponse> {
  const res = await apiFetch(`${API_BASE}/brain/profiles`);
  if (!res.ok) throw new Error('Falha ao listar Cérebros conectados.');
  return res.json();
}

export async function addBrainProfileApi(input: {
  name: string;
  baseUrl: string;
  mode: BrainMode;
  description?: string;
}): Promise<BrainProfilesResponse & { created: BrainConnectionProfile }> {
  const res = await apiFetch(`${API_BASE}/brain/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível cadastrar este Cérebro.');
  return data;
}

export async function activateBrainProfileApi(id: string): Promise<BrainProfilesResponse & { active: BrainConnectionProfile }> {
  const res = await apiFetch(`${API_BASE}/brain/profiles/${encodeURIComponent(id)}/activate`, {
    method: 'POST',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível alternar o Cérebro ativo.');
  return data;
}

export async function pingBrainProfileApi(id: string): Promise<{
  profile: BrainConnectionProfile;
  profiles: BrainConnectionProfile[];
  detail: string;
}> {
  const res = await apiFetch(`${API_BASE}/brain/profiles/${encodeURIComponent(id)}/ping`, {
    method: 'POST',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível testar a conexão com este Cérebro.');
  return data;
}

export async function removeBrainProfileApi(id: string): Promise<BrainProfilesResponse> {
  const res = await apiFetch(`${API_BASE}/brain/profiles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível remover este Cérebro.');
  return data;
}

export async function exportBrainPackApi(): Promise<JarvisBrainPack> {
  const res = await apiFetch(`${API_BASE}/brain/export`, {
    method: 'POST',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao exportar o pacote .jarvis-pack.');
  return data;
}

export async function importBrainPackApi(pack: unknown): Promise<{
  imported: { agents: number; skills: number; workflows: number; knowledge: number };
  message: string;
}> {
  const res = await apiFetch(`${API_BASE}/brain/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pack),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao importar o pacote .jarvis-pack.');
  return data;
}

export async function fetchBrainSchemaApi(): Promise<BrainSchemaResponse> {
  const res = await apiFetch(`${API_BASE}/brain/schema`);
  if (!res.ok) throw new Error('Falha ao consultar tabelas do banco SQLite.');
  return res.json();
}

export async function createSqliteBackupApi(): Promise<{
  backup: BrainBackupItem;
  backups: BrainBackupItem[];
  message: string;
}> {
  const res = await apiFetch(`${API_BASE}/brain/backup`, {
    method: 'POST',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao gerar backup SQLite.');
  return data;
}

export async function previewDualModeBundleApi(options: Partial<BrainDeploymentOptions>): Promise<{
  options: BrainDeploymentOptions;
  files: GeneratedServerArtifact[];
  zip_size_bytes: number;
  filename: string;
}> {
  const res = await apiFetch(`${API_BASE}/brain/bundle/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível montar a prévia do servidor.');
  return data;
}

export async function downloadDualModeBundleZipApi(options: Partial<BrainDeploymentOptions>): Promise<void> {
  const res = await apiFetch(`${API_BASE}/brain/bundle.zip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Falha ao baixar o pacote do servidor.');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] || 'jarvis-brain-server.zip';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ==================== PERFIS ISOLADOS ====================
export async function fetchWorkspacesApi(): Promise<WorkspacesResponse> {
  const res = await apiFetch(`${API_BASE}/brain/workspaces`);
  if (!res.ok) throw new Error('Falha ao listar perfis isolados.');
  return res.json();
}

export async function createWorkspaceApi(input: { name: string; description?: string }): Promise<
  WorkspacesResponse & { created: AgentWorkspaceItem }
> {
  const res = await apiFetch(`${API_BASE}/brain/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao criar perfil isolado.');
  return data;
}

export async function activateWorkspaceApi(slug: string): Promise<WorkspacesResponse & { active: AgentWorkspaceItem }> {
  const res = await apiFetch(`${API_BASE}/brain/workspaces/${encodeURIComponent(slug)}/activate`, {
    method: 'POST',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao alternar perfil isolado.');
  return data;
}

// ==================== MEMÓRIA MARKDOWN + HERMES + BUSCA HÍBRIDA ====================
export async function fetchMarkdownMemoryApi(): Promise<{
  workspace: AgentWorkspaceItem;
  files: MarkdownMemoryFileItem[];
  index_stats: WorkspaceIndexStats;
}> {
  const res = await apiFetch(`${API_BASE}/brain/memory/markdown`);
  if (!res.ok) throw new Error('Falha ao carregar arquivos Markdown de memória.');
  return res.json();
}

export async function saveMarkdownMemoryApi(filename: MemoryFilename, content: string): Promise<{
  file: MarkdownMemoryFileItem;
  chunks_indexed: number;
  index_stats: WorkspaceIndexStats;
  python_elapsed_ms: number;
}> {
  const res = await apiFetch(`${API_BASE}/brain/memory/markdown/${encodeURIComponent(filename)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao salvar e reindexar arquivo Markdown.');
  return data;
}

export async function fetchMemoryEntriesApi(scope?: MemoryScope): Promise<{
  workspace_slug: string;
  entries: MemoryEntryItem[];
  index_stats: WorkspaceIndexStats;
}> {
  const qs = scope ? `?scope=${encodeURIComponent(scope)}` : '';
  const res = await apiFetch(`${API_BASE}/brain/memory/entries${qs}`);
  if (!res.ok) throw new Error('Falha ao listar fatos da memória.');
  return res.json();
}

export async function addMemoryEntryApi(input: {
  scope: MemoryScope;
  title: string;
  content: string;
  tags?: string[];
}): Promise<{
  created: MemoryEntryItem;
  entries: MemoryEntryItem[];
  index_stats: WorkspaceIndexStats;
}> {
  const res = await apiFetch(`${API_BASE}/brain/memory/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao salvar fato na memória.');
  return data;
}

export async function deleteMemoryEntryApi(id: string): Promise<{
  entries: MemoryEntryItem[];
  index_stats: WorkspaceIndexStats;
}> {
  const res = await apiFetch(`${API_BASE}/brain/memory/entries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao remover fato da memória.');
  return data;
}

export async function hybridSearchMemoryApi(input: {
  query: string;
  limit?: number;
  bm25_weight?: number;
  vector_weight?: number;
}): Promise<HybridSearchResponse> {
  const res = await apiFetch(`${API_BASE}/brain/memory/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha na busca híbrida.');
  return data;
}

// ==================== WORKER PYTHON 3.11 & FILAS SERIAIS ====================
export async function fetchPythonWorkerStatusApi(): Promise<PythonWorkerStatusResponse> {
  const res = await apiFetch(`${API_BASE}/brain/python/status`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao consultar o Worker Python 3.11.');
  return data;
}

export async function triggerPythonReindexApi(): Promise<{
  chunks_reindexed: number;
  markdown_files: number;
  entries_reindexed: number;
  index_stats: WorkspaceIndexStats;
  lane_job: SessionLaneJobItem;
}> {
  const res = await apiFetch(`${API_BASE}/brain/python/reindex`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao reindexar workspace no Worker Python.');
  return data;
}

export async function triggerPythonExtractFactsApi(text: string, persist = true): Promise<{
  facts: Array<{ scope: MemoryScope; title: string; content: string; tags: string[]; confidence: number }>;
  persisted_count: number;
  python_elapsed_ms: number;
  lane_job?: SessionLaneJobItem;
}> {
  const res = await apiFetch(`${API_BASE}/brain/python/extract-facts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, persist }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao extrair fatos no Worker Python.');
  return data;
}

export async function fetchSessionLanesApi(): Promise<{
  snapshot: PythonWorkerStatusResponse['lanes'];
  jobs: SessionLaneJobItem[];
}> {
  const res = await apiFetch(`${API_BASE}/brain/lanes`);
  if (!res.ok) throw new Error('Falha ao consultar filas seriais por sessão.');
  return res.json();
}

// ==================== GATEWAY MCP NATIVO ====================
export async function fetchMcpServersApi(): Promise<{
  servers: McpServerItem[];
  logs: McpToolLogItem[];
}> {
  const res = await apiFetch(`${API_BASE}/brain/mcp/servers`);
  if (!res.ok) throw new Error('Falha ao listar servidores MCP.');
  return res.json();
}

export async function addMcpServerApi(input: {
  name: string;
  transport: 'stdio' | 'http';
  endpoint: string;
  description?: string;
}): Promise<{ created: McpServerItem; servers: McpServerItem[] }> {
  const res = await apiFetch(`${API_BASE}/brain/mcp/servers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível registrar servidor MCP.');
  return data;
}

export async function toggleMcpApprovalApi(id: string, isApproved: boolean): Promise<{
  server: McpServerItem;
  servers: McpServerItem[];
}> {
  const res = await apiFetch(`${API_BASE}/brain/mcp/servers/${encodeURIComponent(id)}/approval`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_approved: isApproved }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao atualizar aprovação MCP.');
  return data;
}

export async function discoverMcpToolsApi(id: string): Promise<{
  server: McpServerItem;
  servers: McpServerItem[];
  detail: string;
}> {
  const res = await apiFetch(`${API_BASE}/brain/mcp/servers/${encodeURIComponent(id)}/discover`, {
    method: 'POST',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao descobrir ferramentas MCP.');
  return data;
}

export async function invokeMcpToolApi(
  id: string,
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<{
  output: unknown;
  summary: string;
  log: McpToolLogItem;
  logs: McpToolLogItem[];
}> {
  const res = await apiFetch(`${API_BASE}/brain/mcp/servers/${encodeURIComponent(id)}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool_name: toolName, arguments: args }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao executar ferramenta MCP.');
  return data;
}

export async function deleteMcpServerApi(id: string): Promise<{
  servers: McpServerItem[];
  logs: McpToolLogItem[];
}> {
  const res = await apiFetch(`${API_BASE}/brain/mcp/servers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Falha ao remover servidor MCP.');
  return data;
}
