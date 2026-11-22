/**
 * Fase 8 — Driver e Repositório Persistente do Cérebro no Modo `local_sqlite`.
 *
 * Usa o motor SQLite nativo do Node.js 22 (`node:sqlite` / DatabaseSync) em modo WAL,
 * com todas as consultas estritamente parametrizadas, pasta única limpa (`.jarvis-brain/`
 * ou `SQLITE_DATA_DIR`), backups reais em disco e migração transacional `.jarvis-pack`.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  createDefaultBrainProfiles,
  validateBrainProfileUrl,
  validateJarvisBrainPack,
  type BrainConnectionProfile,
  type BrainMode,
  type JarvisBrainPack,
} from '../../src/services/brainArchitectureEngine.ts';
import type { PairedDeviceRecord } from '../../src/services/androidAppEngine.ts';
import {
  BRAIN_SCHEMA_VERSION,
  CORE_SQLITE_TABLES,
  SQLITE_SCHEMA_DDL,
  type AgentWorkspaceModel,
  type AuditLogModel,
  type BrainBackupRecord,
  type BrainIdentityModel,
  type BrainProfileModel,
  type McpServerModel,
  type McpToolDescriptor,
  type McpToolLogModel,
  type McpTransport,
  type SessionLaneJobModel,
  type SqliteTableStats,
} from './models.ts';
import {
  resolveConfinedPath,
  sanitizeWorkspaceSlug,
  WorkspaceMemoryStore,
} from './workspaceMemoryStore.ts';

export interface LocalSqliteStoreOptions {
  dataDir?: string;
  dbFilename?: string;
  brainName?: string;
  assistantName?: string;
  defaultOrigin?: string;
}

export function resolveSafeSqliteStorageDir(rawDir?: string): string {
  const configured = String(rawDir || process.env.SQLITE_DATA_DIR || '').trim();
  if (!configured) {
    return path.resolve(process.cwd(), '.jarvis-brain');
  }
  const expanded = configured.startsWith('~/')
    ? path.join(os.homedir(), configured.slice(2))
    : configured;
  return path.resolve(expanded);
}

function nowIso(): string {
  return new Date().toISOString();
}

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToConnectionProfile(row: BrainProfileModel): BrainConnectionProfile {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    mode: row.mode,
    databaseEngine: row.database_engine,
    description: row.description,
    isDefault: Boolean(row.is_default),
    isLocalCurrent: Boolean(row.is_local_current),
    status: row.status,
    latencyMs: row.latency_ms,
    lastCheckedAt: row.last_checked_at,
    capabilities: safeJsonParse<string[]>(row.capabilities_json, []),
    version: row.version,
  };
}

export class LocalSqliteBrainStore {
  public readonly dataDir: string;
  public readonly dbPath: string;
  public readonly backupsDir: string;
  public readonly workspacesDir: string;
  private readonly db: DatabaseSync;
  private readonly workspaceStores = new Map<string, WorkspaceMemoryStore>();
  private readonly startedAtMs: number;
  private closed = false;

  constructor(options: LocalSqliteStoreOptions = {}) {
    this.startedAtMs = Date.now();
    this.dataDir = resolveSafeSqliteStorageDir(options.dataDir);
    this.backupsDir = path.join(this.dataDir, 'backups');
    this.workspacesDir = path.join(this.dataDir, 'workspaces');
    const safeFilename = path.basename(options.dbFilename || 'brain.db').replace(/[^a-zA-Z0-9._-]/g, '_') || 'brain.db';
    this.dbPath = path.join(this.dataDir, safeFilename);

    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, 'media'), { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, 'spreadsheets'), { recursive: true });
    fs.mkdirSync(this.backupsDir, { recursive: true });
    fs.mkdirSync(this.workspacesDir, { recursive: true });

    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(SQLITE_SCHEMA_DDL);

    this.ensureInitialRecords(options);
    this.ensureDefaultWorkspaceAndMcp();
  }

  private ensureInitialRecords(options: LocalSqliteStoreOptions): void {
    const now = nowIso();
    const existingIdentity = this.db
      .prepare('SELECT id FROM brain_identity LIMIT 1')
      .get() as { id: string } | undefined;

    if (!existingIdentity) {
      const brainName =
        String(options.brainName || process.env.BRAIN_NAME || 'Esta Máquina · Local (Sem Docker)')
          .trim()
          .slice(0, 64) || 'Esta Máquina · Local (Sem Docker)';
      const assistantName =
        String(options.assistantName || process.env.ASSISTANT_NAME || 'JARVIS').trim().slice(0, 32) || 'JARVIS';

      this.db
        .prepare(
          `INSERT INTO brain_identity
            (id, name, mode, schema_version, database_engine, assistant_name, mdns_service, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          `brain_local_${crypto.randomBytes(4).toString('hex')}`,
          brainName,
          'local_sqlite',
          BRAIN_SCHEMA_VERSION,
          'SQLite WAL (node:sqlite)',
          assistantName,
          '_jarvis-brain._tcp.local',
          now,
          now
        );
    }

    const profileCount = (
      this.db.prepare('SELECT COUNT(*) AS total FROM brain_profiles').get() as { total: number }
    ).total;

    if (profileCount === 0) {
      const origin = options.defaultOrigin || `http://localhost:${process.env.PORT || 3000}`;
      const defaults = createDefaultBrainProfiles(origin);
      const insertStmt = this.db.prepare(
        `INSERT INTO brain_profiles
          (id, name, base_url, mode, database_engine, description, is_default, is_local_current, is_active,
           status, latency_ms, last_checked_at, capabilities_json, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (let i = 0; i < defaults.length; i += 1) {
        const p = defaults[i];
        insertStmt.run(
          p.id,
          p.name,
          p.baseUrl,
          p.mode,
          p.databaseEngine,
          p.description,
          p.isDefault ? 1 : 0,
          p.isLocalCurrent ? 1 : 0,
          i === 0 ? 1 : 0,
          p.status,
          p.latencyMs,
          p.lastCheckedAt,
          JSON.stringify(p.capabilities || []),
          p.version || '3.8.0-dual',
          now,
          now
        );
      }
    }
  }

  public getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.startedAtMs) / 1000);
  }

  public getIdentity(): BrainIdentityModel {
    return this.db.prepare('SELECT * FROM brain_identity LIMIT 1').get() as unknown as BrainIdentityModel;
  }

  public updateIdentity(patch: { name?: string; assistant_name?: string }): BrainIdentityModel {
    const current = this.getIdentity();
    const nextName = patch.name !== undefined ? String(patch.name).trim().slice(0, 64) || current.name : current.name;
    const nextAssistant =
      patch.assistant_name !== undefined
        ? String(patch.assistant_name).trim().slice(0, 32) || current.assistant_name
        : current.assistant_name;
    const now = nowIso();

    this.db
      .prepare('UPDATE brain_identity SET name = ?, assistant_name = ?, updated_at = ? WHERE id = ?')
      .run(nextName, nextAssistant, now, current.id);

    this.appendAuditLog({
      action: 'brain.identity.updated',
      actor: 'admin',
      resource: current.id,
      detail: `Nome="${nextName}", Assistente="${nextAssistant}"`,
    });
    return this.getIdentity();
  }

  public getDatabaseHealth(): {
    ok: boolean;
    journalMode: string;
    dbSizeBytes: number;
    integrity: string;
  } {
    const jm = this.db.prepare('PRAGMA journal_mode').get() as { journal_mode?: string } | undefined;
    const check = this.db.prepare('PRAGMA quick_check(1)').get() as { quick_check?: string } | undefined;
    let dbSizeBytes = 0;
    try {
      dbSizeBytes = fs.statSync(this.dbPath).size;
    } catch {
      dbSizeBytes = 0;
    }
    const integrity = String(check?.quick_check || 'ok');
    return {
      ok: integrity.toLowerCase() === 'ok',
      journalMode: String(jm?.journal_mode || 'wal').toLowerCase(),
      dbSizeBytes,
      integrity,
    };
  }

  public getTableStats(): SqliteTableStats[] {
    const core = CORE_SQLITE_TABLES.map((table) => {
      const row = this.db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number };
      return { table, rows: Number(row?.total || 0) };
    });
    const wsStats = this.getActiveWorkspaceStore().getTableStats();
    return [...core, ...wsStats];
  }

  // ==================== MULTI-BRAIN PROFILES ====================
  public listBrainProfiles(): { activeProfileId: string; profiles: BrainConnectionProfile[] } {
    const rows = this.db
      .prepare('SELECT * FROM brain_profiles ORDER BY is_local_current DESC, created_at ASC')
      .all() as unknown as BrainProfileModel[];

    const activeRow = rows.find((r) => r.is_active === 1) || rows[0];
    return {
      activeProfileId: activeRow?.id || 'brain_local_primary',
      profiles: rows.map(rowToConnectionProfile),
    };
  }

  public getActiveBrainProfile(): BrainConnectionProfile {
    const { activeProfileId, profiles } = this.listBrainProfiles();
    return profiles.find((p) => p.id === activeProfileId) || profiles[0];
  }

  public addBrainProfile(input: {
    name: string;
    baseUrl: string;
    mode: BrainMode;
    description?: string;
  }): { created: BrainConnectionProfile; activeProfileId: string; profiles: BrainConnectionProfile[] } {
    const name = String(input.name || '').trim().slice(0, 64);
    if (name.length < 2) {
      throw new Error('Informe um nome amigável para este Cérebro (mínimo 2 caracteres).');
    }
    const check = validateBrainProfileUrl(input.baseUrl);
    if (!check.valid) {
      throw new Error(check.error || 'Endereço de servidor inválido.');
    }

    const mode: BrainMode =
      input.mode === 'local_sqlite' || input.mode === 'cloud' ? input.mode : 'docker_postgres';
    const databaseEngine =
      mode === 'local_sqlite'
        ? 'SQLite WAL + sqlite-vec'
        : mode === 'cloud'
        ? 'PostgreSQL 16 + HTTPS'
        : 'PostgreSQL 16 + pgvector + Redis';
    const description =
      String(input.description || '').trim().slice(0, 220) ||
      (mode === 'local_sqlite'
        ? 'Instância local sem Docker rodando diretamente na máquina.'
        : mode === 'cloud'
        ? 'Instância remota protegida por HTTPS.'
        : 'Contêiner Docker Compose com PostgreSQL + pgvector e Redis.');
    const capabilities =
      mode === 'local_sqlite'
        ? ['sqlite-wal', 'gemini-cloud']
        : ['postgres-pgvector', 'redis-queue', 'ollama-local'];

    const id = `brain_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
    const now = nowIso();

    this.db
      .prepare(
        `INSERT INTO brain_profiles
          (id, name, base_url, mode, database_engine, description, is_default, is_local_current, is_active,
           status, latency_ms, last_checked_at, capabilities_json, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 'offline', NULL, NULL, ?, '3.8.0', ?, ?)`
      )
      .run(id, name, check.normalizedUrl, mode, databaseEngine, description, JSON.stringify(capabilities), now, now);

    this.appendAuditLog({
      action: 'brain.profile.created',
      actor: 'admin',
      resource: id,
      detail: `${name} (${mode}) -> ${check.normalizedUrl}`,
    });

    const listed = this.listBrainProfiles();
    const created = listed.profiles.find((p) => p.id === id)!;
    return { created, ...listed };
  }

  public setActiveBrainProfile(id: string): {
    active: BrainConnectionProfile;
    activeProfileId: string;
    profiles: BrainConnectionProfile[];
  } {
    const existing = this.db
      .prepare('SELECT id, name FROM brain_profiles WHERE id = ?')
      .get(id) as { id: string; name: string } | undefined;

    if (!existing) {
      throw new Error('Cérebro não encontrado.');
    }

    const now = nowIso();
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE brain_profiles SET is_active = 0').run();
      this.db.prepare('UPDATE brain_profiles SET is_active = 1, updated_at = ? WHERE id = ?').run(now, id);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    this.appendAuditLog({
      action: 'brain.profile.activated',
      actor: 'admin',
      resource: id,
      detail: `Cérebro ativo alterado para "${existing.name}"`,
    });

    const listed = this.listBrainProfiles();
    const active = listed.profiles.find((p) => p.id === id)!;
    return { active, ...listed };
  }

  public updateBrainProfileHealth(
    id: string,
    status: 'online' | 'offline',
    latencyMs: number | null,
    checkedAt: string
  ): { profile: BrainConnectionProfile; profiles: BrainConnectionProfile[] } {
    const existing = this.db.prepare('SELECT id FROM brain_profiles WHERE id = ?').get(id) as
      | { id: string }
      | undefined;
    if (!existing) {
      throw new Error('Cérebro não encontrado.');
    }

    this.db
      .prepare('UPDATE brain_profiles SET status = ?, latency_ms = ?, last_checked_at = ?, updated_at = ? WHERE id = ?')
      .run(status, latencyMs, checkedAt, nowIso(), id);

    const listed = this.listBrainProfiles();
    const profile = listed.profiles.find((p) => p.id === id)!;
    return { profile, profiles: listed.profiles };
  }

  public deleteBrainProfile(id: string): { activeProfileId: string; profiles: BrainConnectionProfile[] } {
    const existing = this.db
      .prepare('SELECT id, name, is_local_current, is_active FROM brain_profiles WHERE id = ?')
      .get(id) as { id: string; name: string; is_local_current: number; is_active: number } | undefined;

    if (!existing) {
      throw new Error('Cérebro não encontrado.');
    }
    if (existing.is_local_current === 1) {
      throw new Error('O Cérebro local padrão desta máquina não pode ser removido.');
    }

    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM brain_profiles WHERE id = ?').run(id);
      if (existing.is_active === 1) {
        this.db
          .prepare('UPDATE brain_profiles SET is_active = 1 WHERE is_local_current = 1')
          .run();
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    this.appendAuditLog({
      action: 'brain.profile.deleted',
      actor: 'admin',
      resource: id,
      detail: `Cérebro "${existing.name}" removido`,
    });

    return this.listBrainProfiles();
  }

  // ==================== DISPOSITIVOS PAREADOS ====================
  public seedPairedDevicesIfEmpty(devices: PairedDeviceRecord[]): void {
    const count = (
      this.db.prepare('SELECT COUNT(*) AS total FROM paired_devices').get() as { total: number }
    ).total;
    if (count > 0) return;

    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO paired_devices
        (id, name, platform, model, os_version, status, token_hint, paired_at, last_seen, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    );
    for (const d of devices) {
      stmt.run(d.id, d.name, d.platform, d.model, d.os_version, d.status, d.token_hint, d.paired_at, d.last_seen);
    }
  }

  public listPairedDevices(): PairedDeviceRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM paired_devices WHERE revoked_at IS NULL ORDER BY paired_at DESC')
      .all() as unknown as Array<{
      id: string;
      name: string;
      platform: 'android' | 'desktop' | 'web';
      model: string;
      os_version: string;
      status: 'online' | 'offline';
      token_hint: string;
      paired_at: string;
      last_seen: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      platform: r.platform,
      model: r.model,
      os_version: r.os_version,
      status: r.status,
      token_hint: r.token_hint,
      paired_at: r.paired_at,
      last_seen: r.last_seen,
    }));
  }

  public savePairedDevice(device: PairedDeviceRecord): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO paired_devices
          (id, name, platform, model, os_version, status, token_hint, paired_at, last_seen, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .run(
        device.id,
        device.name,
        device.platform,
        device.model,
        device.os_version,
        device.status,
        device.token_hint,
        device.paired_at,
        device.last_seen
      );
  }

  public revokePairedDevice(id: string): boolean {
    const res = this.db
      .prepare('UPDATE paired_devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
      .run(nowIso(), id);
    return Number(res.changes || 0) > 0;
  }

  // ==================== SINCRONIZAÇÃO DE AGENTES, SKILLS, FLUXOS E CONHECIMENTO ====================
  public syncWorkspaceSnapshot(snapshot: {
    agents: Array<{
      role: string;
      name: string;
      handle: string;
      description: string;
      system_prompt: string;
      preferred_model?: string;
      autonomy_level?: string;
      is_custom?: boolean;
      installed_skills?: string[];
      version?: number;
      updated_at?: string;
    }>;
    skills: Array<{
      id: string;
      name: string;
      origin?: string;
      domain?: string;
      description: string;
      instructions?: string;
      is_approved?: boolean;
      assigned_agents?: string[];
      updated_at?: string;
    }>;
    workflows: Array<{
      id: string;
      title: string;
      description?: string;
      schedule_cron?: string | null;
      schedule_enabled?: boolean;
      nodes?: unknown[];
      edges?: unknown[];
      updated_at?: string;
    }>;
    knowledge: Array<{
      name: string;
      category?: string;
      file_type?: string;
      content: string;
      chunks?: number;
      size_bytes?: number;
      indexed_at?: string;
    }>;
  }): void {
    const now = nowIso();
    const upsertAgent = this.db.prepare(
      `INSERT INTO agents
        (role, name, handle, description, system_prompt, preferred_model, autonomy_level, is_custom, installed_skills_json, version, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(role) DO UPDATE SET
        name = excluded.name,
        handle = excluded.handle,
        description = excluded.description,
        system_prompt = excluded.system_prompt,
        preferred_model = excluded.preferred_model,
        autonomy_level = excluded.autonomy_level,
        is_custom = excluded.is_custom,
        installed_skills_json = excluded.installed_skills_json,
        version = excluded.version,
        updated_at = excluded.updated_at`
    );

    const upsertSkill = this.db.prepare(
      `INSERT INTO skills
        (id, name, origin, domain, description, instructions, is_approved, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        origin = excluded.origin,
        domain = excluded.domain,
        description = excluded.description,
        instructions = excluded.instructions,
        is_approved = excluded.is_approved,
        updated_at = excluded.updated_at`
    );

    const insertLink = this.db.prepare(
      `INSERT OR IGNORE INTO agent_skills (agent_role, skill_id, linked_at) VALUES (?, ?, ?)`
    );

    const upsertWorkflow = this.db.prepare(
      `INSERT INTO workflows
        (id, title, description, schedule_cron, schedule_enabled, nodes_json, edges_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        schedule_cron = excluded.schedule_cron,
        schedule_enabled = excluded.schedule_enabled,
        nodes_json = excluded.nodes_json,
        edges_json = excluded.edges_json,
        updated_at = excluded.updated_at`
    );

    const upsertDoc = this.db.prepare(
      `INSERT INTO knowledge_documents
        (name, category, file_type, content, chunks, size_bytes, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
        category = excluded.category,
        file_type = excluded.file_type,
        content = excluded.content,
        chunks = excluded.chunks,
        size_bytes = excluded.size_bytes,
        indexed_at = excluded.indexed_at`
    );

    this.db.exec('BEGIN');
    try {
      const validRoles = new Set<string>();
      for (const a of snapshot.agents) {
        if (!a?.role) continue;
        validRoles.add(a.role);
        upsertAgent.run(
          a.role,
          a.name || a.role,
          a.handle || `@${a.role}`,
          a.description || '',
          a.system_prompt || '',
          a.preferred_model || 'gemini-2.5-flash',
          a.autonomy_level || 'confirm',
          a.is_custom ? 1 : 0,
          JSON.stringify(Array.isArray(a.installed_skills) ? a.installed_skills : []),
          Number(a.version || 1),
          a.updated_at || now
        );
      }

      for (const s of snapshot.skills) {
        if (!s?.id) continue;
        upsertSkill.run(
          s.id,
          s.name || s.id,
          s.origin || 'system',
          s.domain || 'geral',
          s.description || '',
          s.instructions || '',
          s.is_approved === false ? 0 : 1,
          s.updated_at || now
        );
        if (Array.isArray(s.assigned_agents)) {
          for (const agentRole of s.assigned_agents) {
            if (validRoles.has(agentRole)) {
              insertLink.run(agentRole, s.id, now);
            }
          }
        }
      }

      for (const w of snapshot.workflows) {
        if (!w?.id) continue;
        upsertWorkflow.run(
          w.id,
          w.title || 'Fluxo',
          w.description || '',
          w.schedule_cron || null,
          w.schedule_enabled ? 1 : 0,
          JSON.stringify(Array.isArray(w.nodes) ? w.nodes : []),
          JSON.stringify(Array.isArray(w.edges) ? w.edges : []),
          w.updated_at || now
        );
      }

      for (const k of snapshot.knowledge) {
        if (!k?.name) continue;
        const content = String(k.content || '');
        upsertDoc.run(
          k.name,
          k.category || 'geral',
          k.file_type || 'md',
          content,
          Number(k.chunks || Math.max(1, Math.ceil(content.length / 650))),
          Number(k.size_bytes || Buffer.byteLength(content, 'utf8')),
          k.indexed_at || now
        );
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  // ==================== EXPORTAÇÃO & IMPORTAÇÃO .jarvis-pack ====================
  public exportJarvisPack(): JarvisBrainPack {
    const active = this.getActiveBrainProfile();
    const identity = this.getIdentity();

    const agentsRows = this.db.prepare('SELECT * FROM agents ORDER BY is_custom DESC, name ASC').all() as Array<
      Record<string, any>
    >;
    const skillsRows = this.db.prepare('SELECT * FROM skills ORDER BY updated_at DESC').all() as Array<
      Record<string, any>
    >;
    const linkRows = this.db.prepare('SELECT agent_role, skill_id FROM agent_skills').all() as Array<{
      agent_role: string;
      skill_id: string;
    }>;
    const workflowRows = this.db.prepare('SELECT * FROM workflows ORDER BY updated_at DESC').all() as Array<
      Record<string, any>
    >;
    const docRows = this.db.prepare('SELECT * FROM knowledge_documents ORDER BY indexed_at DESC').all() as Array<
      Record<string, any>
    >;

    const linksBySkill = new Map<string, string[]>();
    for (const l of linkRows) {
      const list = linksBySkill.get(l.skill_id) || [];
      list.push(l.agent_role);
      linksBySkill.set(l.skill_id, list);
    }

    return {
      schemaVersion: '1.0',
      format: 'jarvis-brain-pack',
      exportedAt: nowIso(),
      sourceBrain: {
        name: active?.name || identity.name,
        mode: active?.mode || identity.mode,
        databaseEngine: active?.databaseEngine || identity.database_engine,
        version: '3.8.0-dual',
      },
      agents: agentsRows.map((a) => ({
        role: String(a.role),
        name: String(a.name),
        handle: String(a.handle),
        description: String(a.description || ''),
        system_prompt: String(a.system_prompt || ''),
        installed_skills: safeJsonParse<string[]>(a.installed_skills_json, []),
        is_custom: Boolean(a.is_custom),
      })),
      skills: skillsRows.map((s) => ({
        id: String(s.id),
        name: String(s.name),
        description: String(s.description || ''),
        domain: String(s.domain || 'geral'),
        instructions: String(s.instructions || ''),
        assigned_agents: linksBySkill.get(String(s.id)) || [],
      })),
      workflows: workflowRows.map((w) => ({
        id: String(w.id),
        title: String(w.title),
        description: String(w.description || ''),
        schedule_cron: w.schedule_cron ? String(w.schedule_cron) : '0 8 * * *',
        schedule_enabled: Boolean(w.schedule_enabled),
        nodes: safeJsonParse<unknown[]>(w.nodes_json, []),
        edges: safeJsonParse<unknown[]>(w.edges_json, []),
      })),
      knowledge: docRows.map((k) => ({
        name: String(k.name),
        category: String(k.category || 'geral'),
        content: String(k.content || ''),
        file_type: String(k.file_type || 'md'),
      })),
    };
  }

  public importJarvisPack(rawPack: unknown): {
    pack: JarvisBrainPack;
    imported: { agents: number; skills: number; workflows: number; knowledge: number };
  } {
    const check = validateJarvisBrainPack(rawPack);
    if (!check.valid || !check.pack) {
      throw new Error(check.error || 'Pacote .jarvis-pack inválido.');
    }

    const pack = check.pack;
    const now = nowIso();
    let agentsCount = 0;
    let skillsCount = 0;
    let workflowsCount = 0;
    let knowledgeCount = 0;

    const hasAgent = this.db.prepare('SELECT 1 FROM agents WHERE role = ?');
    const insertAgent = this.db.prepare(
      `INSERT INTO agents
        (role, name, handle, description, system_prompt, preferred_model, autonomy_level, is_custom, installed_skills_json, version, updated_at)
       VALUES (?, ?, ?, ?, ?, 'gemini-2.5-flash', 'confirm', 1, ?, 1, ?)`
    );

    const hasSkill = this.db.prepare('SELECT 1 FROM skills WHERE lower(name) = lower(?)');
    const insertSkill = this.db.prepare(
      `INSERT INTO skills (id, name, origin, domain, description, instructions, is_approved, updated_at)
       VALUES (?, ?, 'custom', ?, ?, ?, 1, ?)`
    );

    const insertLink = this.db.prepare(
      `INSERT OR IGNORE INTO agent_skills (agent_role, skill_id, linked_at) VALUES (?, ?, ?)`
    );

    const hasWorkflow = this.db.prepare('SELECT 1 FROM workflows WHERE lower(title) = lower(?)');
    const insertWorkflow = this.db.prepare(
      `INSERT INTO workflows (id, title, description, schedule_cron, schedule_enabled, nodes_json, edges_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const hasDoc = this.db.prepare('SELECT 1 FROM knowledge_documents WHERE name = ?');
    const insertDoc = this.db.prepare(
      `INSERT INTO knowledge_documents (name, category, file_type, content, chunks, size_bytes, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    this.db.exec('BEGIN');
    try {
      for (const a of pack.agents) {
        if (!hasAgent.get(a.role)) {
          insertAgent.run(
            a.role,
            a.name,
            a.handle || `@${a.role}`,
            a.description || 'Agente migrado via .jarvis-pack.',
            a.system_prompt || 'Responda sempre em português do Brasil.',
            JSON.stringify(a.installed_skills || []),
            now
          );
          agentsCount += 1;
        }
      }

      for (const s of pack.skills) {
        if (!hasSkill.get(s.name)) {
          const skillId = s.id || `skill_pack_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
          insertSkill.run(
            skillId,
            s.name,
            s.domain || 'geral',
            s.description || 'Habilidade migrada via .jarvis-pack.',
            s.instructions || '',
            now
          );
          for (const agentRole of s.assigned_agents || []) {
            if (hasAgent.get(agentRole)) {
              insertLink.run(agentRole, skillId, now);
            }
          }
          skillsCount += 1;
        }
      }

      for (const w of pack.workflows) {
        if (!hasWorkflow.get(w.title)) {
          const wfId = w.id || `wf_pack_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
          insertWorkflow.run(
            wfId,
            w.title,
            w.description || 'Fluxo migrado via .jarvis-pack.',
            w.schedule_cron || '0 8 * * *',
            w.schedule_enabled ? 1 : 0,
            JSON.stringify(w.nodes || []),
            JSON.stringify(w.edges || []),
            now
          );
          workflowsCount += 1;
        }
      }

      for (const k of pack.knowledge) {
        if (!hasDoc.get(k.name)) {
          insertDoc.run(
            k.name,
            k.category || 'geral',
            k.file_type || 'md',
            k.content,
            Math.max(1, Math.ceil(k.content.length / 650)),
            Buffer.byteLength(k.content, 'utf8'),
            now
          );
          knowledgeCount += 1;
        }
      }

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    this.appendAuditLog({
      action: 'brain.pack.imported',
      actor: 'admin',
      resource: pack.sourceBrain.name,
      detail: `+${agentsCount} agentes, +${skillsCount} skills, +${workflowsCount} fluxos, +${knowledgeCount} docs`,
    });

    return {
      pack,
      imported: {
        agents: agentsCount,
        skills: skillsCount,
        workflows: workflowsCount,
        knowledge: knowledgeCount,
      },
    };
  }

  // ==================== BACKUPS REAIS DO SQLITE ====================
  public createSqliteBackup(): BrainBackupRecord {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `brain-backup-${stamp}.db`;
    const targetPath = path.join(this.backupsDir, filename);

    // Garante flush consistente do WAL antes da cópia/snapshot
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    // Usa VACUUM INTO para gerar snapshot limpo e consistente mesmo com leitores ativos
    const escapedTarget = targetPath.replace(/'/g, "''");
    this.db.exec(`VACUUM INTO '${escapedTarget}'`);

    const size_bytes = fs.statSync(targetPath).size;
    const created_at = nowIso();

    this.appendAuditLog({
      action: 'brain.sqlite.backup',
      actor: 'admin',
      resource: filename,
      detail: `Snapshot SQLite gerado (${size_bytes} bytes)`,
    });

    return {
      filename,
      path: targetPath,
      size_bytes,
      created_at,
    };
  }

  public listBackups(): BrainBackupRecord[] {
    if (!fs.existsSync(this.backupsDir)) return [];
    const entries = fs
      .readdirSync(this.backupsDir)
      .filter((name) => name.endsWith('.db'))
      .map((filename) => {
        const full = path.join(this.backupsDir, filename);
        const stat = fs.statSync(full);
        return {
          filename,
          path: full,
          size_bytes: stat.size,
          created_at: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return entries.slice(0, 20);
  }

  // ==================== AUDITORIA ====================
  public appendAuditLog(entry: { action: string; actor?: string; resource: string; detail?: string }): void {
    const id = `aud_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
    this.db
      .prepare('INSERT INTO audit_logs (id, action, actor, resource, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, entry.action, entry.actor || 'system', entry.resource, entry.detail || '', nowIso());
  }

  public listAuditLogs(limit = 30): AuditLogModel[] {
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
    return this.db
      .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?')
      .all(safeLimit) as unknown as AuditLogModel[];
  }

  // ==================== PERFIS ISOLADOS (HERMES / OPENCLAW) ====================
  private ensureDefaultWorkspaceAndMcp(): void {
    const now = nowIso();
    const wsCount = (
      this.db.prepare('SELECT COUNT(*) AS total FROM agent_workspaces').get() as { total: number }
    ).total;

    if (wsCount === 0) {
      this.db
        .prepare(
          `INSERT INTO agent_workspaces (slug, name, description, storage_subdir, db_filename, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'state.db', 1, ?, ?)`
        )
        .run(
          'default',
          'Perfil Principal',
          'Workspace local-first padrão com memória Markdown (SOUL/MEMORY/USER.md) e índice híbrido SQLite FTS5 + vetores.',
          'workspaces/default',
          now,
          now
        );
    }

    // Garante inicialização em disco do workspace ativo
    this.getActiveWorkspaceStore();

    const mcpCount = (
      this.db.prepare('SELECT COUNT(*) AS total FROM mcp_servers').get() as { total: number }
    ).total;

    if (mcpCount === 0) {
      const builtinServers: Array<{
        id: string;
        name: string;
        transport: McpTransport;
        endpoint: string;
        description: string;
        tools: McpToolDescriptor[];
      }> = [
        {
          id: 'mcp_jarvis_memory',
          name: 'JARVIS Memory MCP',
          transport: 'stdio',
          endpoint: 'builtin://memory-hybrid',
          description: 'Servidor MCP nativo de leitura/busca híbrida FTS5 + vetores e consulta aos arquivos SOUL.md, MEMORY.md e USER.md.',
          tools: [
            {
              name: 'memory.search_hybrid',
              description: 'Executa busca híbrida BM25 + cosseno (RRF) no perfil ativo',
              requires_approval: false,
              input_hint: '{"query": "sqlite wal"}',
            },
            {
              name: 'memory.list_facts',
              description: 'Lista fatos consolidados nas camadas memory e user (estilo Hermes)',
              requires_approval: false,
              input_hint: '{"scope": "memory"}',
            },
          ],
        },
        {
          id: 'mcp_jarvis_workspace',
          name: 'JARVIS Workspace Ops MCP',
          transport: 'stdio',
          endpoint: 'builtin://workspace-ops',
          description: 'Servidor MCP nativo para diagnóstico do SQLite WAL, perfis isolados e estatísticas de filas seriais.',
          tools: [
            {
              name: 'workspace.health_report',
              description: 'Retorna integridade SQLite WAL, tamanho do banco e tabelas ativas',
              requires_approval: false,
              input_hint: '{}',
            },
            {
              name: 'workspace.snapshot_backup',
              description: 'Dispara snapshot consistente VACUUM INTO do banco SQLite local',
              requires_approval: true,
              input_hint: '{}',
            },
          ],
        },
      ];

      const ins = this.db.prepare(
        `INSERT INTO mcp_servers
          (id, name, transport, endpoint, description, is_approved, is_builtin, status, tools_json, last_checked_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, 1, 'online', ?, ?, ?, ?)`
      );
      for (const s of builtinServers) {
        ins.run(s.id, s.name, s.transport, s.endpoint, s.description, JSON.stringify(s.tools), now, now, now);
      }
    }
  }

  public listWorkspaces(): { activeSlug: string; workspaces: AgentWorkspaceModel[] } {
    const rows = this.db
      .prepare('SELECT * FROM agent_workspaces ORDER BY is_active DESC, created_at ASC')
      .all() as unknown as AgentWorkspaceModel[];
    const active = rows.find((r) => r.is_active === 1) || rows[0];
    return {
      activeSlug: active?.slug || 'default',
      workspaces: rows,
    };
  }

  public getActiveWorkspace(): AgentWorkspaceModel {
    const { activeSlug, workspaces } = this.listWorkspaces();
    return workspaces.find((w) => w.slug === activeSlug) || workspaces[0];
  }

  public getWorkspaceStore(slug: string): WorkspaceMemoryStore {
    const clean = sanitizeWorkspaceSlug(slug);
    const cached = this.workspaceStores.get(clean);
    if (cached) return cached;

    const row = this.db
      .prepare('SELECT slug, name FROM agent_workspaces WHERE slug = ?')
      .get(clean) as { slug: string; name: string } | undefined;

    if (!row) {
      throw new Error(`Perfil isolado "${clean}" não encontrado.`);
    }

    const identity = this.getIdentity();
    const store = new WorkspaceMemoryStore({
      workspacesRootDir: this.workspacesDir,
      slug: row.slug,
      workspaceName: row.name,
      assistantName: identity?.assistant_name || 'JARVIS',
    });
    this.workspaceStores.set(clean, store);
    return store;
  }

  public getActiveWorkspaceStore(): WorkspaceMemoryStore {
    const active = this.getActiveWorkspace();
    return this.getWorkspaceStore(active.slug);
  }

  public createWorkspace(input: { name: string; description?: string; slug?: string }): {
    created: AgentWorkspaceModel;
    activeSlug: string;
    workspaces: AgentWorkspaceModel[];
  } {
    const name = String(input.name || '').trim().slice(0, 64);
    if (name.length < 2) {
      throw new Error('Informe um nome para o perfil isolado (mínimo 2 caracteres).');
    }
    const baseSlug = sanitizeWorkspaceSlug(input.slug || name);
    let slug = baseSlug;
    let suffix = 2;
    while (this.db.prepare('SELECT 1 FROM agent_workspaces WHERE slug = ?').get(slug)) {
      slug = `${baseSlug.slice(0, 28)}-${suffix}`;
      suffix += 1;
    }

    // Garante confinamento estrito do diretório do perfil
    resolveConfinedPath(this.workspacesDir, slug);
    const description =
      String(input.description || '').trim().slice(0, 220) ||
      `Ambiente isolado "${name}" com banco SQLite WAL próprio e arquivos Markdown dedicados.`;
    const now = nowIso();

    this.db
      .prepare(
        `INSERT INTO agent_workspaces (slug, name, description, storage_subdir, db_filename, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'state.db', 0, ?, ?)`
      )
      .run(slug, name, description, `workspaces/${slug}`, now, now);

    // Inicializa imediatamente state.db + SOUL.md / MEMORY.md / USER.md em disco
    this.getWorkspaceStore(slug);

    this.appendAuditLog({
      action: 'brain.workspace.created',
      actor: 'admin',
      resource: slug,
      detail: `Perfil isolado "${name}" criado em workspaces/${slug}/state.db`,
    });

    const listed = this.listWorkspaces();
    const created = listed.workspaces.find((w) => w.slug === slug)!;
    return { created, ...listed };
  }

  public activateWorkspace(slug: string): {
    active: AgentWorkspaceModel;
    activeSlug: string;
    workspaces: AgentWorkspaceModel[];
  } {
    const clean = sanitizeWorkspaceSlug(slug);
    const existing = this.db
      .prepare('SELECT slug, name FROM agent_workspaces WHERE slug = ?')
      .get(clean) as { slug: string; name: string } | undefined;
    if (!existing) {
      throw new Error('Perfil isolado não encontrado.');
    }

    const now = nowIso();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE agent_workspaces SET is_active = 0').run();
      this.db.prepare('UPDATE agent_workspaces SET is_active = 1, updated_at = ? WHERE slug = ?').run(now, clean);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    this.getWorkspaceStore(clean);
    this.appendAuditLog({
      action: 'brain.workspace.activated',
      actor: 'admin',
      resource: clean,
      detail: `Perfil isolado ativo alterado para "${existing.name}"`,
    });

    const listed = this.listWorkspaces();
    const active = listed.workspaces.find((w) => w.slug === clean)!;
    return { active, ...listed };
  }

  // ==================== FILAS SERIAIS POR SESSÃO ====================
  public recordLaneJob(job: SessionLaneJobModel): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO session_lane_jobs
          (id, session_id, workspace_slug, job_type, status, duration_ms, summary, error_message, created_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        job.id,
        job.session_id,
        job.workspace_slug,
        job.job_type,
        job.status,
        job.duration_ms,
        job.summary,
        job.error_message,
        job.created_at,
        job.finished_at
      );
  }

  public listLaneJobs(limit = 25): SessionLaneJobModel[] {
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 25));
    return this.db
      .prepare('SELECT * FROM session_lane_jobs ORDER BY created_at DESC LIMIT ?')
      .all(safeLimit) as unknown as SessionLaneJobModel[];
  }

  // ==================== GATEWAY MCP NATIVO ====================
  private rowToMcpServer(r: Record<string, any>): McpServerModel {
    return {
      id: String(r.id),
      name: String(r.name),
      transport: r.transport === 'http' ? 'http' : 'stdio',
      endpoint: String(r.endpoint),
      description: String(r.description || ''),
      is_approved: Boolean(r.is_approved),
      is_builtin: Boolean(r.is_builtin),
      status: r.status === 'online' || r.status === 'error' ? r.status : 'standby',
      tools: safeJsonParse<McpToolDescriptor[]>(r.tools_json, []),
      last_checked_at: r.last_checked_at ? String(r.last_checked_at) : null,
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
    };
  }

  public listMcpServers(): McpServerModel[] {
    const rows = this.db
      .prepare('SELECT * FROM mcp_servers ORDER BY is_builtin DESC, created_at ASC')
      .all() as Array<Record<string, any>>;
    return rows.map((r) => this.rowToMcpServer(r));
  }

  public addMcpServer(input: {
    name: string;
    transport: McpTransport;
    endpoint: string;
    description?: string;
  }): McpServerModel {
    const name = String(input.name || '').trim().slice(0, 64);
    if (name.length < 2) {
      throw new Error('Informe um nome para o servidor MCP (mínimo 2 caracteres).');
    }
    const transport: McpTransport = input.transport === 'http' ? 'http' : 'stdio';
    let endpoint = String(input.endpoint || '').trim().slice(0, 240);
    if (!endpoint) {
      throw new Error('Informe o endpoint ou comando de identificação do servidor MCP.');
    }

    if (transport === 'http') {
      const check = validateBrainProfileUrl(endpoint);
      if (!check.valid) {
        throw new Error(check.error || 'URL MCP inválida.');
      }
      endpoint = check.normalizedUrl;
    } else {
      // Para transporte stdio, bloqueia metacaracteres de shell
      if (/[;&|`$<>]/.test(endpoint)) {
        throw new Error('Identificador stdio não pode conter operadores de shell.');
      }
    }

    const description =
      String(input.description || '').trim().slice(0, 240) ||
      `Servidor MCP (${transport.toUpperCase()}) aguardando aprovação e descoberta de ferramentas.`;
    const id = `mcp_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
    const now = nowIso();

    this.db
      .prepare(
        `INSERT INTO mcp_servers
          (id, name, transport, endpoint, description, is_approved, is_builtin, status, tools_json, last_checked_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 0, 'standby', '[]', NULL, ?, ?)`
      )
      .run(id, name, transport, endpoint, description, now, now);

    this.appendAuditLog({
      action: 'brain.mcp.registered',
      actor: 'admin',
      resource: id,
      detail: `${name} (${transport}) -> ${endpoint}`,
    });

    const row = this.db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as Record<string, any>;
    return this.rowToMcpServer(row);
  }

  public toggleMcpServerApproval(id: string, isApproved: boolean): McpServerModel {
    const existing = this.db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as Record<string, any> | undefined;
    if (!existing) throw new Error('Servidor MCP não encontrado.');
    const now = nowIso();
    this.db
      .prepare('UPDATE mcp_servers SET is_approved = ?, updated_at = ? WHERE id = ?')
      .run(isApproved ? 1 : 0, now, id);
    this.appendAuditLog({
      action: isApproved ? 'brain.mcp.approved' : 'brain.mcp.revoked',
      actor: 'admin',
      resource: id,
      detail: `Servidor MCP "${existing.name}" ${isApproved ? 'aprovado' : 'bloqueado'}`,
    });
    const updated = this.db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as Record<string, any>;
    return this.rowToMcpServer(updated);
  }

  public updateMcpServerDiscovery(
    id: string,
    status: 'online' | 'standby' | 'error',
    tools: McpToolDescriptor[]
  ): McpServerModel {
    const existing = this.db.prepare('SELECT id FROM mcp_servers WHERE id = ?').get(id) as { id: string } | undefined;
    if (!existing) throw new Error('Servidor MCP não encontrado.');
    const now = nowIso();
    this.db
      .prepare('UPDATE mcp_servers SET status = ?, tools_json = ?, last_checked_at = ?, updated_at = ? WHERE id = ?')
      .run(status, JSON.stringify(tools), now, now, id);
    const updated = this.db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as Record<string, any>;
    return this.rowToMcpServer(updated);
  }

  public deleteMcpServer(id: string): void {
    const existing = this.db
      .prepare('SELECT id, name, is_builtin FROM mcp_servers WHERE id = ?')
      .get(id) as { id: string; name: string; is_builtin: number } | undefined;
    if (!existing) throw new Error('Servidor MCP não encontrado.');
    if (existing.is_builtin === 1) {
      throw new Error('Servidores MCP nativos do sistema não podem ser removidos.');
    }
    this.db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
    this.appendAuditLog({
      action: 'brain.mcp.deleted',
      actor: 'admin',
      resource: id,
      detail: `Servidor MCP "${existing.name}" removido`,
    });
  }

  public recordMcpToolLog(entry: Omit<McpToolLogModel, 'id' | 'created_at'>): McpToolLogModel {
    const id = `mcplog_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
    const created_at = nowIso();
    this.db
      .prepare(
        `INSERT INTO mcp_tool_logs
          (id, server_id, server_name, tool_name, arguments_json, status, output_summary, duration_ms, actor, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        entry.server_id,
        entry.server_name,
        entry.tool_name,
        entry.arguments_json,
        entry.status,
        entry.output_summary.slice(0, 600),
        Math.max(0, Number(entry.duration_ms || 0)),
        entry.actor || 'admin',
        created_at
      );
    return { id, ...entry, created_at };
  }

  public listMcpToolLogs(limit = 25): McpToolLogModel[] {
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 25));
    return this.db
      .prepare('SELECT * FROM mcp_tool_logs ORDER BY created_at DESC LIMIT ?')
      .all(safeLimit) as unknown as McpToolLogModel[];
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const ws of this.workspaceStores.values()) {
      ws.close();
    }
    this.workspaceStores.clear();
    this.db.close();
  }
}

export function createLocalSqliteBrainStore(options?: LocalSqliteStoreOptions): LocalSqliteBrainStore {
  return new LocalSqliteBrainStore(options);
}
