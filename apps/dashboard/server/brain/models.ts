/**
 * Fase 8+ — Modelos de Dados e DDL SQLite WAL + FTS5 + Vetores do Servidor "Cérebro".
 *
 * Unifica o contrato das 19 tabelas do Cérebro Poliglota (Node.js v22 + Python 3.11 + Go Docker/VPS):
 *   - 12 tabelas núcleo de plataforma (identidade, multi-brain, dispositivos, agentes, skills, chats, docs, fluxos, auditoria)
 *   - 7 tabelas/índices híbridos inspirados em OpenBot/OpenClaw, Hermes Agent e GrokBot:
 *     perfis isolados (agent_workspaces), memória Hermes (memory_entries), chunks + FTS5 BM25,
 *     embeddings vetoriais locais, arquivos Markdown sincronizados (SOUL/MEMORY/USER.md),
 *     filas seriais por sessão (session_lane_jobs) e Gateway MCP nativo (mcp_servers / mcp_tool_logs).
 */

import type { BrainMode } from '../../src/services/brainArchitectureEngine.ts';

export interface BrainIdentityModel {
  id: string;
  name: string;
  mode: BrainMode;
  schema_version: string;
  database_engine: string;
  assistant_name: string;
  mdns_service: string;
  created_at: string;
  updated_at: string;
}

export interface BrainProfileModel {
  id: string;
  name: string;
  base_url: string;
  mode: BrainMode;
  database_engine: string;
  description: string;
  is_default: number;
  is_local_current: number;
  is_active: number;
  status: 'online' | 'offline' | 'checking';
  latency_ms: number | null;
  last_checked_at: string | null;
  capabilities_json: string;
  version: string;
  created_at: string;
  updated_at: string;
}

export interface PairedDeviceModel {
  id: string;
  name: string;
  platform: 'android' | 'desktop' | 'web';
  model: string;
  os_version: string;
  status: 'online' | 'offline';
  token_hint: string;
  paired_at: string;
  last_seen: string;
  revoked_at: string | null;
}

export interface AgentModel {
  role: string;
  name: string;
  handle: string;
  description: string;
  system_prompt: string;
  preferred_model: string;
  autonomy_level: string;
  is_custom: number;
  installed_skills_json: string;
  version: number;
  updated_at: string;
}

export interface SkillModel {
  id: string;
  name: string;
  origin: string;
  domain: string;
  description: string;
  instructions: string;
  is_approved: number;
  updated_at: string;
}

export interface WorkflowModel {
  id: string;
  title: string;
  description: string;
  schedule_cron: string | null;
  schedule_enabled: number;
  nodes_json: string;
  edges_json: string;
  updated_at: string;
}

export interface KnowledgeDocumentModel {
  name: string;
  category: string;
  file_type: string;
  content: string;
  chunks: number;
  size_bytes: number;
  indexed_at: string;
}

export interface AuditLogModel {
  id: string;
  action: string;
  actor: string;
  resource: string;
  detail: string;
  created_at: string;
}

export interface BrainBackupRecord {
  filename: string;
  path: string;
  size_bytes: number;
  created_at: string;
}

export interface SqliteTableStats {
  table: string;
  rows: number;
}

// ==================== NOVOS MODELOS POLIGLOTAS (OpenClaw / Hermes / GrokBot) ====================

export type MemoryFilename = 'SOUL.md' | 'MEMORY.md' | 'USER.md';
export type MemoryScope = 'memory' | 'user';
export type McpTransport = 'stdio' | 'http';

export interface AgentWorkspaceModel {
  slug: string;
  name: string;
  description: string;
  storage_subdir: string;
  db_filename: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface MemoryEntryModel {
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

export interface MarkdownMemoryFileModel {
  workspace_slug: string;
  filename: MemoryFilename;
  content: string;
  content_hash: string;
  size_bytes: number;
  synced_at: string;
}

export interface HybridSearchHit {
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

export interface SessionLaneJobModel {
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

export interface McpToolDescriptor {
  name: string;
  description: string;
  requires_approval: boolean;
  input_hint: string;
}

export interface McpServerModel {
  id: string;
  name: string;
  transport: McpTransport;
  endpoint: string;
  description: string;
  is_approved: boolean;
  is_builtin: boolean;
  status: 'online' | 'standby' | 'error';
  tools: McpToolDescriptor[];
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface McpToolLogModel {
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

export const BRAIN_SCHEMA_VERSION = '2.0.0';

export const ALLOWED_MEMORY_FILENAMES: readonly MemoryFilename[] = [
  'SOUL.md',
  'MEMORY.md',
  'USER.md',
] as const;

export const WORKSPACE_SQLITE_DDL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS memory_entries (
  id TEXT PRIMARY KEY,
  workspace_slug TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('memory', 'user')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  tags_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0.9,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS markdown_memory_files (
  workspace_slug TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (workspace_slug, filename)
);

CREATE TABLE IF NOT EXISTS memory_chunks (
  chunk_id TEXT PRIMARY KEY,
  workspace_slug TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  heading TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_chunks_fts USING fts5(
  chunk_id UNINDEXED,
  workspace_slug UNINDEXED,
  source_ref,
  heading,
  content,
  tokenize='unicode61'
);

CREATE TABLE IF NOT EXISTS memory_embeddings (
  chunk_id TEXT PRIMARY KEY REFERENCES memory_chunks(chunk_id) ON DELETE CASCADE,
  model TEXT NOT NULL DEFAULT 'local-hash-128',
  dimensions INTEGER NOT NULL DEFAULT 128,
  vector_blob BLOB NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_entries_scope ON memory_entries(workspace_slug, scope, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_chunks_source ON memory_chunks(workspace_slug, source_type, source_ref);
`;

export const SQLITE_SCHEMA_DDL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS brain_identity (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'local_sqlite',
  schema_version TEXT NOT NULL DEFAULT '${BRAIN_SCHEMA_VERSION}',
  database_engine TEXT NOT NULL DEFAULT 'SQLite WAL + FTS5 + Vetores',
  assistant_name TEXT NOT NULL DEFAULT 'JARVIS',
  mdns_service TEXT NOT NULL DEFAULT '_jarvis-brain._tcp.local',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brain_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'local_sqlite',
  database_engine TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  is_local_current INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'offline',
  latency_ms INTEGER,
  last_checked_at TEXT,
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  version TEXT NOT NULL DEFAULT '3.9.0',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paired_devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'android',
  model TEXT NOT NULL DEFAULT 'Android',
  os_version TEXT NOT NULL DEFAULT 'Android 15',
  status TEXT NOT NULL DEFAULT 'online',
  token_hint TEXT NOT NULL,
  paired_at TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS agents (
  role TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  handle TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  preferred_model TEXT NOT NULL DEFAULT 'gemini-4-hydrogen',
  autonomy_level TEXT NOT NULL DEFAULT 'confirm',
  is_custom INTEGER NOT NULL DEFAULT 0,
  installed_skills_json TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'system',
  domain TEXT NOT NULL DEFAULT 'geral',
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  is_approved INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_skills (
  agent_role TEXT NOT NULL REFERENCES agents(role) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  linked_at TEXT NOT NULL,
  PRIMARY KEY (agent_role, skill_id)
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'admin',
  title TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'standard',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  agent_role TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  name TEXT PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'geral',
  file_type TEXT NOT NULL DEFAULT 'md',
  content TEXT NOT NULL,
  chunks INTEGER NOT NULL DEFAULT 1,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  indexed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  schedule_cron TEXT,
  schedule_enabled INTEGER NOT NULL DEFAULT 0,
  nodes_json TEXT NOT NULL DEFAULT '[]',
  edges_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'completed',
  output_summary TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  resource TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_workspaces (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  storage_subdir TEXT NOT NULL,
  db_filename TEXT NOT NULL DEFAULT 'state.db',
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_lane_jobs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  workspace_slug TEXT NOT NULL DEFAULT 'default',
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL DEFAULT '',
  error_message TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transport TEXT NOT NULL CHECK(transport IN ('stdio', 'http')),
  endpoint TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_approved INTEGER NOT NULL DEFAULT 0,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'standby',
  tools_json TEXT NOT NULL DEFAULT '[]',
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_tool_logs (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  server_name TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  arguments_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'success',
  output_summary TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  actor TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id, started_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lane_jobs_created ON session_lane_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_logs_created ON mcp_tool_logs(created_at DESC);
`;

export const CORE_SQLITE_TABLES = [
  'brain_identity',
  'brain_profiles',
  'paired_devices',
  'agents',
  'skills',
  'agent_skills',
  'chat_sessions',
  'chat_messages',
  'knowledge_documents',
  'workflows',
  'workflow_runs',
  'audit_logs',
  'agent_workspaces',
  'session_lane_jobs',
  'mcp_servers',
  'mcp_tool_logs',
] as const;

export const WORKSPACE_SQLITE_TABLES = [
  'memory_entries',
  'markdown_memory_files',
  'memory_chunks',
  'memory_embeddings',
] as const;
