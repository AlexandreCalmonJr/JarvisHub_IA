/**
 * Armazenamento Isolado por Perfil de Agente (Inspirado em Hermes Agent + OpenClaw).
 *
 * Cada perfil isolado (`slug`) possui seu próprio diretório confinado em disco:
 *   `<dataDir>/workspaces/<slug>/`
 *     ├── state.db         (SQLite WAL + FTS5 + memory_embeddings BLOB)
 *     ├── SOUL.md          (Identidade, princípios e estilo do agente)
 *     ├── MEMORY.md        (Notas técnicas, ambiente e fatos aprendidos)
 *     └── USER.md          (Preferências, rotina e perfil do usuário)
 *
 * Toda resolução de caminho valida confinamento estrito com `path.resolve` + `path.sep`.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ALLOWED_MEMORY_FILENAMES,
  WORKSPACE_SQLITE_DDL,
  WORKSPACE_SQLITE_TABLES,
  type MarkdownMemoryFileModel,
  type MemoryEntryModel,
  type MemoryFilename,
  type MemoryScope,
  type SqliteTableStats,
} from './models.ts';

export interface ChunkInsertInput {
  heading: string;
  content: string;
  content_hash: string;
  token_estimate: number;
  vector: number[];
  model?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sha256Short(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 24);
}

export function sanitizeWorkspaceSlug(raw: string): string {
  const clean = String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 36);
  return clean || 'default';
}

export function resolveConfinedPath(baseDir: string, ...segments: string[]): string {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, ...segments);
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + path.sep)) {
    throw new Error('Caminho fora do diretório confinado do Cérebro.');
  }
  return resolvedTarget;
}

export function floatVectorToBlob(vec: number[]): Uint8Array {
  const arr = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i += 1) {
    arr[i] = Number(vec[i] || 0);
  }
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}

export function defaultMarkdownTemplates(workspaceName: string, assistantName = 'JARVIS'): Record<MemoryFilename, string> {
  return {
    'SOUL.md': `# Identidade do Perfil — ${workspaceName}

## Diretrizes Centrais
- Você é o **${assistantName}**, operando no perfil isolado **${workspaceName}**.
- Responda sempre de forma objetiva, verificável e em português do Brasil.
- Priorize fatos confirmados em \`MEMORY.md\`, \`USER.md\` e na busca híbrida FTS5 + vetores antes de assumir contexto.

## Política de Execução
- Mutações em estado local devem passar pelo escritor único SQLite WAL e pelas filas seriais por sessão.
- Ferramentas externas conectadas via MCP exigem aprovação explícita quando modificarem recursos sensíveis.
`,
    'MEMORY.md': `# Memória Técnica do Agente — ${workspaceName}

## Arquitetura do Cérebro
- Motor de banco: SQLite em modo WAL com tabela virtual FTS5 (BM25) e embeddings vetoriais locais em BLOB.
- Worker Python 3.11 local executa chunking de Markdown (~400 tokens), busca híbrida com fusão RRF e extração de fatos.
- Pacote Docker/VPS inclui o serviço Go para Edge Gateway, WebSockets concorrentes e workspace crawler.

## Notas Operacionais
- Backups consistentes são gerados via \`PRAGMA wal_checkpoint(TRUNCATE)\` + \`VACUUM INTO\`.
- Perfis isolados mantêm arquivos \`state.db\` e documentos Markdown separados por diretório.
`,
    'USER.md': `# Perfil e Preferências do Usuário — ${workspaceName}

## Preferências de Comunicação
- Idioma principal: Português do Brasil (pt-BR).
- Estilo preferido: respostas diretas, organizadas em tópicos e com comandos prontos para uso.

## Contexto de Trabalho
- Prefere arquitetura local-first com privacidade total em disco e caminho opcional para VPS Docker.
- Valoriza transparência editável sobre o que o agente memoriza entre sessões.
`,
  };
}

/**
 * Fallback leve de vetorização determinística (usado no bootstrap antes do worker Python ou se offline).
 */
export function buildFallbackVector(text: string, dim = 128): number[] {
  const vec = new Array<number>(dim).fill(0);
  const tokens = String(text || '')
    .toLowerCase()
    .replace(/[^0-9a-zà-ÿ_-]+/gi, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return vec;

  for (const tok of tokens) {
    const hash = crypto.createHash('sha256').update(tok, 'utf8').digest();
    const idx = hash.readUInt32LE(0) % dim;
    const sign = (hash[4] & 1) === 0 ? 1 : -1;
    vec[idx] += sign;
  }

  let normSq = 0;
  for (let i = 0; i < dim; i += 1) normSq += vec[i] * vec[i];
  const norm = Math.sqrt(normSq);
  if (norm > 1e-9) {
    for (let i = 0; i < dim; i += 1) vec[i] /= norm;
  }
  return vec;
}

export class WorkspaceMemoryStore {
  public readonly slug: string;
  public readonly workspaceDir: string;
  public readonly dbPath: string;
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(options: {
    workspacesRootDir: string;
    slug: string;
    workspaceName: string;
    assistantName?: string;
  }) {
    this.slug = sanitizeWorkspaceSlug(options.slug);
    this.workspaceDir = resolveConfinedPath(options.workspacesRootDir, this.slug);
    this.dbPath = resolveConfinedPath(this.workspaceDir, 'state.db');

    fs.mkdirSync(this.workspaceDir, { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(WORKSPACE_SQLITE_DDL);

    this.ensureDefaultFilesAndSeed(options.workspaceName, options.assistantName || 'JARVIS');
  }

  private ensureDefaultFilesAndSeed(workspaceName: string, assistantName: string): void {
    const templates = defaultMarkdownTemplates(workspaceName, assistantName);
    const now = nowIso();

    for (const filename of ALLOWED_MEMORY_FILENAMES) {
      const filePath = resolveConfinedPath(this.workspaceDir, filename);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, templates[filename], 'utf8');
      }
      const content = fs.readFileSync(filePath, 'utf8');
      const hash = sha256Short(content);
      const sizeBytes = Buffer.byteLength(content, 'utf8');

      this.db
        .prepare(
          `INSERT INTO markdown_memory_files (workspace_slug, filename, content_hash, size_bytes, synced_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(workspace_slug, filename) DO UPDATE SET
             content_hash = excluded.content_hash,
             size_bytes = excluded.size_bytes,
             synced_at = excluded.synced_at`
        )
        .run(this.slug, filename, hash, sizeBytes, now);

      // Garante indexação inicial se o arquivo ainda não possui chunks
      const existingChunks = (
        this.db
          .prepare('SELECT COUNT(*) AS total FROM memory_chunks WHERE workspace_slug = ? AND source_ref = ?')
          .get(this.slug, filename) as { total: number }
      ).total;

      if (existingChunks === 0) {
        this.replaceChunksForSource('markdown', filename, [
          {
            heading: filename,
            content,
            content_hash: hash,
            token_estimate: Math.max(1, Math.ceil(content.length / 4)),
            vector: buildFallbackVector(`${filename}\n${content}`),
            model: 'local-hash-128',
          },
        ]);
      }
    }

    const entryCount = (
      this.db
        .prepare('SELECT COUNT(*) AS total FROM memory_entries WHERE workspace_slug = ?')
        .get(this.slug) as { total: number }
    ).total;

    if (entryCount === 0) {
      this.addMemoryEntry({
        scope: 'memory',
        title: 'Banco SQLite WAL + FTS5 ativo por perfil',
        content: `O perfil "${workspaceName}" utiliza banco SQLite isolado em modo WAL com busca híbrida FTS5 (BM25) + vetores locais.`,
        source: 'bootstrap',
        tags: ['sqlite', 'wal', 'fts5', 'hibrido'],
        confidence: 0.98,
      });
      this.addMemoryEntry({
        scope: 'user',
        title: 'Preferência de idioma e privacidade local-first',
        content: 'Respostas sempre em português do Brasil (pt-BR), com armazenamento local transparente em Markdown e SQLite.',
        source: 'bootstrap',
        tags: ['pt-br', 'local-first', 'markdown'],
        confidence: 0.96,
      });
    }
  }

  public getMarkdownFiles(): MarkdownMemoryFileModel[] {
    return ALLOWED_MEMORY_FILENAMES.map((filename) => {
      const filePath = resolveConfinedPath(this.workspaceDir, filename);
      const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
      const meta = this.db
        .prepare('SELECT content_hash, size_bytes, synced_at FROM markdown_memory_files WHERE workspace_slug = ? AND filename = ?')
        .get(this.slug, filename) as { content_hash?: string; size_bytes?: number; synced_at?: string } | undefined;

      return {
        workspace_slug: this.slug,
        filename,
        content,
        content_hash: meta?.content_hash || sha256Short(content),
        size_bytes: meta?.size_bytes ?? Buffer.byteLength(content, 'utf8'),
        synced_at: meta?.synced_at || nowIso(),
      };
    });
  }

  public saveMarkdownFile(filename: MemoryFilename, content: string): MarkdownMemoryFileModel {
    if (!ALLOWED_MEMORY_FILENAMES.includes(filename)) {
      throw new Error('Arquivo Markdown não permitido. Use SOUL.md, MEMORY.md ou USER.md.');
    }
    const safeContent = String(content || '').slice(0, 120_000);
    const filePath = resolveConfinedPath(this.workspaceDir, filename);
    fs.writeFileSync(filePath, safeContent, 'utf8');

    const hash = sha256Short(safeContent);
    const sizeBytes = Buffer.byteLength(safeContent, 'utf8');
    const syncedAt = nowIso();

    this.db
      .prepare(
        `INSERT INTO markdown_memory_files (workspace_slug, filename, content_hash, size_bytes, synced_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(workspace_slug, filename) DO UPDATE SET
           content_hash = excluded.content_hash,
           size_bytes = excluded.size_bytes,
           synced_at = excluded.synced_at`
      )
      .run(this.slug, filename, hash, sizeBytes, syncedAt);

    return {
      workspace_slug: this.slug,
      filename,
      content: safeContent,
      content_hash: hash,
      size_bytes: sizeBytes,
      synced_at: syncedAt,
    };
  }

  public replaceChunksForSource(
    sourceType: 'markdown' | 'memory_entry' | 'knowledge',
    sourceRef: string,
    chunks: ChunkInsertInput[]
  ): number {
    const now = nowIso();
    const existingRows = this.db
      .prepare('SELECT chunk_id FROM memory_chunks WHERE workspace_slug = ? AND source_type = ? AND source_ref = ?')
      .all(this.slug, sourceType, sourceRef) as Array<{ chunk_id: string }>;

    const delFts = this.db.prepare('DELETE FROM memory_chunks_fts WHERE chunk_id = ?');
    const delChunk = this.db.prepare('DELETE FROM memory_chunks WHERE chunk_id = ?');
    const insChunk = this.db.prepare(
      `INSERT INTO memory_chunks
        (chunk_id, workspace_slug, source_type, source_ref, heading, content, content_hash, token_estimate, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insFts = this.db.prepare(
      `INSERT INTO memory_chunks_fts (chunk_id, workspace_slug, source_ref, heading, content)
       VALUES (?, ?, ?, ?, ?)`
    );
    const insEmb = this.db.prepare(
      `INSERT INTO memory_embeddings (chunk_id, model, dimensions, vector_blob, content_hash, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of existingRows) {
        delFts.run(row.chunk_id);
        delChunk.run(row.chunk_id);
      }

      let inserted = 0;
      for (let i = 0; i < chunks.length; i += 1) {
        const ch = chunks[i];
        const cleanBody = String(ch.content || '').trim();
        if (!cleanBody) continue;
        const chunkId = `chk_${sha256Short(`${this.slug}:${sourceType}:${sourceRef}:${i}:${ch.content_hash}`)}`;
        insChunk.run(
          chunkId,
          this.slug,
          sourceType,
          sourceRef,
          String(ch.heading || sourceRef).slice(0, 120),
          cleanBody,
          ch.content_hash || sha256Short(cleanBody),
          Math.max(1, Number(ch.token_estimate || Math.ceil(cleanBody.length / 4))),
          now
        );
        insFts.run(chunkId, this.slug, sourceRef, String(ch.heading || sourceRef).slice(0, 120), cleanBody);
        const vec = Array.isArray(ch.vector) && ch.vector.length > 0 ? ch.vector : buildFallbackVector(cleanBody);
        insEmb.run(
          chunkId,
          ch.model || 'local-hash-128',
          vec.length,
          floatVectorToBlob(vec),
          ch.content_hash || sha256Short(cleanBody),
          now
        );
        inserted += 1;
      }

      this.db.exec('COMMIT');
      return inserted;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  public listMemoryEntries(scope?: MemoryScope): MemoryEntryModel[] {
    const rows = scope
      ? (this.db
          .prepare('SELECT * FROM memory_entries WHERE workspace_slug = ? AND scope = ? ORDER BY updated_at DESC')
          .all(this.slug, scope) as Array<Record<string, any>>)
      : (this.db
          .prepare('SELECT * FROM memory_entries WHERE workspace_slug = ? ORDER BY updated_at DESC')
          .all(this.slug) as Array<Record<string, any>>);

    return rows.map((r) => ({
      id: String(r.id),
      workspace_slug: String(r.workspace_slug),
      scope: r.scope === 'user' ? 'user' : 'memory',
      title: String(r.title),
      content: String(r.content),
      source: String(r.source || 'manual'),
      tags: (() => {
        try {
          const parsed = JSON.parse(String(r.tags_json || '[]'));
          return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
          return [];
        }
      })(),
      confidence: Number(r.confidence || 0.9),
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
    }));
  }

  public addMemoryEntry(input: {
    scope: MemoryScope;
    title: string;
    content: string;
    source?: string;
    tags?: string[];
    confidence?: number;
    vector?: number[];
    model?: string;
  }): MemoryEntryModel {
    const scope: MemoryScope = input.scope === 'user' ? 'user' : 'memory';
    const title = String(input.title || '').trim().slice(0, 120);
    const content = String(input.content || '').trim().slice(0, 4000);
    if (title.length < 2 || content.length < 4) {
      throw new Error('Informe título (mín. 2 caracteres) e conteúdo para salvar o fato na memória.');
    }

    const tags = Array.isArray(input.tags)
      ? input.tags.map((t) => String(t).trim().toLowerCase().slice(0, 32)).filter(Boolean).slice(0, 8)
      : [];
    const confidence = Math.max(0.1, Math.min(1, Number(input.confidence ?? 0.92)));
    const id = `mem_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
    const now = nowIso();

    this.db
      .prepare(
        `INSERT INTO memory_entries
          (id, workspace_slug, scope, title, content, source, tags_json, confidence, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, this.slug, scope, title, content, String(input.source || 'manual').slice(0, 48), JSON.stringify(tags), confidence, now, now);

    // Indexa imediatamente no FTS5 + Vetores
    this.replaceChunksForSource('memory_entry', `entry:${id}`, [
      {
        heading: `[${scope}] ${title}`,
        content,
        content_hash: sha256Short(content),
        token_estimate: Math.max(1, Math.ceil(content.length / 4)),
        vector: input.vector && input.vector.length > 0 ? input.vector : buildFallbackVector(`${title}\n${content}`),
        model: input.model || 'local-hash-128',
      },
    ]);

    return {
      id,
      workspace_slug: this.slug,
      scope,
      title,
      content,
      source: String(input.source || 'manual').slice(0, 48),
      tags,
      confidence,
      created_at: now,
      updated_at: now,
    };
  }

  public deleteMemoryEntry(id: string): boolean {
    const res = this.db
      .prepare('DELETE FROM memory_entries WHERE id = ? AND workspace_slug = ?')
      .run(id, this.slug);
    this.replaceChunksForSource('memory_entry', `entry:${id}`, []);
    return Number(res.changes || 0) > 0;
  }

  public getIndexStats(): {
    db_path: string;
    db_size_bytes: number;
    chunks: number;
    embeddings: number;
    entries_memory: number;
    entries_user: number;
    markdown_files: number;
  } {
    let dbSize = 0;
    try {
      dbSize = fs.statSync(this.dbPath).size;
    } catch {
      dbSize = 0;
    }
    const chunks = (
      this.db.prepare('SELECT COUNT(*) AS total FROM memory_chunks WHERE workspace_slug = ?').get(this.slug) as { total: number }
    ).total;
    const embeddings = (
      this.db
        .prepare(
          `SELECT COUNT(*) AS total FROM memory_embeddings e
           INNER JOIN memory_chunks c ON c.chunk_id = e.chunk_id
           WHERE c.workspace_slug = ?`
        )
        .get(this.slug) as { total: number }
    ).total;
    const memCount = (
      this.db
        .prepare("SELECT COUNT(*) AS total FROM memory_entries WHERE workspace_slug = ? AND scope = 'memory'")
        .get(this.slug) as { total: number }
    ).total;
    const userCount = (
      this.db
        .prepare("SELECT COUNT(*) AS total FROM memory_entries WHERE workspace_slug = ? AND scope = 'user'")
        .get(this.slug) as { total: number }
    ).total;
    const mdCount = (
      this.db
        .prepare('SELECT COUNT(*) AS total FROM markdown_memory_files WHERE workspace_slug = ?')
        .get(this.slug) as { total: number }
    ).total;

    return {
      db_path: this.dbPath,
      db_size_bytes: dbSize,
      chunks: Number(chunks || 0),
      embeddings: Number(embeddings || 0),
      entries_memory: Number(memCount || 0),
      entries_user: Number(userCount || 0),
      markdown_files: Number(mdCount || 0),
    };
  }

  public getTableStats(): SqliteTableStats[] {
    return WORKSPACE_SQLITE_TABLES.map((table) => {
      const row = this.db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number };
      return { table: `workspace.${table}`, rows: Number(row?.total || 0) };
    });
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}
