/**
 * Fase 8+ — Router Modular da API do Servidor "Cérebro" Poliglota (`/api/v1/brain/*`).
 *
 * Conecta:
 *   - `LocalSqliteBrainStore` (SQLite WAL + Perfis Isolados + Gateway MCP + Auditoria)
 *   - `SessionLaneQueue` (Escritor único + filas seriais por sessão)
 *   - `PythonWorkerBridge` (Worker Python 3.11 ao vivo para RAG híbrido FTS5+vetores e extração Hermes)
 */

import express, { type RequestHandler, type Router } from 'express';
import {
  buildDualModeBundleZip,
  probeBrainHealth,
  resolveDeploymentOptions,
} from '../brainServer.ts';
import type { LocalSqliteBrainStore } from './sqliteBrainStore.ts';
import { SessionLaneQueue } from './sessionLaneQueue.ts';
import { createPythonWorkerBridge, type PythonWorkerBridge } from './pythonWorkerBridge.ts';
import {
  ALLOWED_MEMORY_FILENAMES,
  type McpToolDescriptor,
  type MemoryFilename,
  type MemoryScope,
} from './models.ts';
import type { JarvisBrainPack } from '../../src/services/brainArchitectureEngine.ts';

export interface BrainRouterDeps {
  store: LocalSqliteBrainStore;
  requireAuth: RequestHandler;
  isGeminiConfigured: () => boolean;
  getLiveCounts: () => {
    agents: number;
    skills: number;
    workflows: number;
    knowledge: number;
    sessions: number;
    paired_devices: number;
  };
  syncSnapshotBeforeExport: () => void;
  onPackImported?: (pack: JarvisBrainPack) => void;
  onActiveBrainChanged?: (profile: { name: string; baseUrl: string }) => void;
  laneQueue?: SessionLaneQueue;
  pythonWorker?: PythonWorkerBridge;
}

export function createBrainRouter(deps: BrainRouterDeps): Router {
  const router = express.Router();
  const { store, requireAuth } = deps;
  const laneQueue = deps.laneQueue || new SessionLaneQueue();
  laneQueue.setPersistCallback((job) => store.recordLaneJob(job));
  const pythonWorker = deps.pythonWorker || createPythonWorkerBridge();

  // ==================== HEALTH & INFO ====================
  router.get('/health', (_req, res) => {
    const active = store.getActiveBrainProfile();
    const dbHealth = store.getDatabaseHealth();
    const activeWs = store.getActiveWorkspace();
    res.json({
      status: dbHealth.ok ? 'online' : 'degraded',
      brain_mode: active?.mode || 'local_sqlite',
      database_engine:
        active?.databaseEngine || `SQLite ${dbHealth.journalMode.toUpperCase()} + FTS5 + Vetores`,
      journal_mode: dbHealth.journalMode,
      sqlite_integrity: dbHealth.integrity,
      db_size_bytes: dbHealth.dbSizeBytes,
      active_workspace: activeWs.slug,
      gemini_configured: deps.isGeminiConfigured(),
      uptime_seconds: store.getUptimeSeconds(),
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/info', requireAuth, (_req, res) => {
    const identity = store.getIdentity();
    const active = store.getActiveBrainProfile();
    const dbHealth = store.getDatabaseHealth();
    const backups = store.listBackups();
    const activeWs = store.getActiveWorkspace();
    const wsStats = store.getActiveWorkspaceStore().getIndexStats();
    const isDocker = active?.mode === 'docker_postgres';

    res.json({
      brain_id: active?.id || identity.id,
      name: active?.name || identity.name,
      version: '3.9.0-polyglot',
      schema_version: identity.schema_version,
      mode: active?.mode || identity.mode,
      database_engine:
        active?.databaseEngine ||
        (isDocker ? 'PostgreSQL 16 + pgvector + Redis' : `SQLite ${dbHealth.journalMode.toUpperCase()} + FTS5 + Vetores`),
      storage_path: isDocker
        ? 'Volume Docker (jarvis_pg_data + jarvis_brain_storage)'
        : store.dbPath,
      db_size_bytes: dbHealth.dbSizeBytes,
      journal_mode: dbHealth.journalMode,
      backups_count: backups.length,
      active_workspace_slug: activeWs.slug,
      active_workspace_name: activeWs.name,
      hybrid_index: wsStats,
      mdns_service: identity.mdns_service,
      active_profile_id: active?.id || 'brain_local_primary',
      uptime_seconds: store.getUptimeSeconds(),
      services: {
        database: dbHealth.ok ? 'online' : 'offline',
        gemini_cloud: deps.isGeminiConfigured() ? 'configured' : 'standby',
        ollama_local: process.env.OLLAMA_HOST ? 'detected' : 'optional',
        redis_queue: isDocker ? 'online' : 'local_scheduler',
      },
      counts: deps.getLiveCounts(),
    });
  });

  router.patch('/identity', requireAuth, (req, res) => {
    try {
      const updated = store.updateIdentity({
        name: req.body?.name,
        assistant_name: req.body?.assistant_name,
      });
      res.json({ identity: updated });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Não foi possível atualizar a identidade do Cérebro.' });
    }
  });

  router.get('/schema', requireAuth, (_req, res) => {
    const identity = store.getIdentity();
    const dbHealth = store.getDatabaseHealth();
    res.json({
      mode: 'local_sqlite',
      schema_version: identity.schema_version,
      storage_path: store.dbPath,
      journal_mode: dbHealth.journalMode,
      db_size_bytes: dbHealth.dbSizeBytes,
      tables: store.getTableStats(),
    });
  });

  // ==================== MULTI-BRAIN PROFILES ====================
  router.get('/profiles', requireAuth, (_req, res) => {
    res.json(store.listBrainProfiles());
  });

  router.post('/profiles', requireAuth, (req, res) => {
    try {
      const result = store.addBrainProfile({
        name: String(req.body?.name || ''),
        baseUrl: String(req.body?.baseUrl || ''),
        mode: req.body?.mode || 'docker_postgres',
        description: req.body?.description,
      });
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Não foi possível cadastrar este Cérebro.' });
    }
  });

  router.post('/profiles/:id/activate', requireAuth, (req, res) => {
    try {
      const id = String(req.params.id || '');
      const result = store.setActiveBrainProfile(id);
      deps.onActiveBrainChanged?.({
        name: result.active.name,
        baseUrl: result.active.baseUrl,
      });
      res.json(result);
    } catch (err: any) {
      res.status(404).json({ error: err?.message || 'Cérebro não encontrado.' });
    }
  });

  router.post('/profiles/:id/ping', requireAuth, async (req, res) => {
    try {
      const id = String(req.params.id || '');
      const listed = store.listBrainProfiles();
      const target = listed.profiles.find((p) => p.id === id);
      if (!target) {
        res.status(404).json({ error: 'Cérebro não encontrado.' });
        return;
      }
      const probed = await probeBrainHealth(target.baseUrl, target.isLocalCurrent);
      const updated = store.updateBrainProfileHealth(id, probed.status, probed.latencyMs, probed.checkedAt);
      res.json({
        profile: updated.profile,
        profiles: updated.profiles,
        detail: probed.detail,
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Falha ao testar conexão com o Cérebro.' });
    }
  });

  router.delete('/profiles/:id', requireAuth, (req, res) => {
    try {
      const id = String(req.params.id || '');
      const result = store.deleteBrainProfile(id);
      res.json(result);
    } catch (err: any) {
      const status = String(err?.message || '').includes('não encontrado') ? 404 : 400;
      res.status(status).json({ error: err?.message || 'Não foi possível remover este Cérebro.' });
    }
  });

  // ==================== PERFIS ISOLADOS (HERMES / OPENCLAW) ====================
  router.get('/workspaces', requireAuth, (_req, res) => {
    const listed = store.listWorkspaces();
    const activeStats = store.getActiveWorkspaceStore().getIndexStats();
    res.json({
      ...listed,
      active_stats: activeStats,
    });
  });

  router.post('/workspaces', requireAuth, async (req, res) => {
    try {
      const active = store.getActiveWorkspace();
      const { result } = await laneQueue.enqueue({
        sessionId: 'workspace-admin',
        workspaceSlug: active.slug,
        jobType: 'workspace.create',
        task: () =>
          store.createWorkspace({
            name: String(req.body?.name || ''),
            description: req.body?.description ? String(req.body.description) : undefined,
            slug: req.body?.slug ? String(req.body.slug) : undefined,
          }),
        summarize: (r) => `Perfil isolado "${r.created.name}" (${r.created.slug}) criado com SQLite WAL próprio`,
      });
      res.status(201).json({
        ...result,
        active_stats: store.getActiveWorkspaceStore().getIndexStats(),
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Não foi possível criar o perfil isolado.' });
    }
  });

  router.post('/workspaces/:slug/activate', requireAuth, async (req, res) => {
    try {
      const slug = String(req.params.slug || '');
      const { result } = await laneQueue.enqueue({
        sessionId: 'workspace-admin',
        workspaceSlug: slug,
        jobType: 'workspace.activate',
        task: () => store.activateWorkspace(slug),
        summarize: (r) => `Perfil isolado alternado para "${r.active.name}" (${r.active.slug})`,
      });
      res.json({
        ...result,
        active_stats: store.getActiveWorkspaceStore().getIndexStats(),
      });
    } catch (err: any) {
      res.status(404).json({ error: err?.message || 'Perfil isolado não encontrado.' });
    }
  });

  // ==================== MEMÓRIA MARKDOWN + BUSCA HÍBRIDA (FTS5 + VETORES) ====================
  router.get('/memory/markdown', requireAuth, (_req, res) => {
    const active = store.getActiveWorkspace();
    const wsStore = store.getActiveWorkspaceStore();
    res.json({
      workspace: active,
      files: wsStore.getMarkdownFiles(),
      index_stats: wsStore.getIndexStats(),
    });
  });

  router.put('/memory/markdown/:filename', requireAuth, async (req, res) => {
    try {
      const rawName = String(req.params.filename || '') as MemoryFilename;
      if (!ALLOWED_MEMORY_FILENAMES.includes(rawName)) {
        res.status(400).json({ error: 'Arquivo inválido. Permitidos: SOUL.md, MEMORY.md ou USER.md.' });
        return;
      }
      const content = String(req.body?.content ?? '');
      const active = store.getActiveWorkspace();
      const sessionId = String(req.body?.session_id || `memory:${active.slug}`);

      // Chunking e vetorização executados ao vivo pelo Worker Python 3.11
      const vectorized = await pythonWorker.chunkAndVectorize({
        text: content,
        source_ref: rawName,
      });

      const { job, result } = await laneQueue.enqueue({
        sessionId,
        workspaceSlug: active.slug,
        jobType: 'memory.markdown_save_reindex',
        task: () => {
          const wsStore = store.getActiveWorkspaceStore();
          const saved = wsStore.saveMarkdownFile(rawName, content);
          const chunksInserted = wsStore.replaceChunksForSource(
            'markdown',
            rawName,
            vectorized.chunks.map((ch) => ({
              heading: ch.heading,
              content: ch.content,
              content_hash: ch.content_hash,
              token_estimate: ch.token_estimate,
              vector: ch.vector,
              model: `python-hash-${vectorized.dimensions}d`,
            }))
          );
          return {
            file: saved,
            chunks_indexed: chunksInserted,
            index_stats: wsStore.getIndexStats(),
          };
        },
        summarize: (r) => `${rawName} salvo e reindexado (${r.chunks_indexed} chunks FTS5 + vetores)`,
      });

      res.json({
        ...result,
        python_elapsed_ms: vectorized.elapsed_ms,
        lane_job: job,
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Falha ao salvar e reindexar arquivo Markdown.' });
    }
  });

  router.get('/memory/entries', requireAuth, (req, res) => {
    const rawScope = String(req.query?.scope || '');
    const scope: MemoryScope | undefined =
      rawScope === 'memory' || rawScope === 'user' ? rawScope : undefined;
    const wsStore = store.getActiveWorkspaceStore();
    res.json({
      workspace_slug: wsStore.slug,
      entries: wsStore.listMemoryEntries(scope),
      index_stats: wsStore.getIndexStats(),
    });
  });

  router.post('/memory/entries', requireAuth, async (req, res) => {
    try {
      const scope: MemoryScope = req.body?.scope === 'user' ? 'user' : 'memory';
      const title = String(req.body?.title || '').trim();
      const content = String(req.body?.content || '').trim();
      const tags = Array.isArray(req.body?.tags)
        ? req.body.tags.map(String)
        : String(req.body?.tags || '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);

      const active = store.getActiveWorkspace();
      const vecResp = await pythonWorker.chunkAndVectorize({
        text: `${title}\n${content}`,
        source_ref: `entry:${scope}`,
      });
      const vector = vecResp.chunks[0]?.vector || [];

      const { job, result } = await laneQueue.enqueue({
        sessionId: `memory:${active.slug}`,
        workspaceSlug: active.slug,
        jobType: 'memory.entry_add',
        task: () => {
          const wsStore = store.getActiveWorkspaceStore();
          const created = wsStore.addMemoryEntry({
            scope,
            title,
            content,
            source: String(req.body?.source || 'manual'),
            tags,
            confidence: Number(req.body?.confidence ?? 0.94),
            vector,
            model: `python-hash-${vecResp.dimensions}d`,
          });
          return {
            created,
            entries: wsStore.listMemoryEntries(),
            index_stats: wsStore.getIndexStats(),
          };
        },
        summarize: (r) => `Fato [${scope}] "${r.created.title}" gravado e indexado`,
      });

      res.status(201).json({ ...result, lane_job: job });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Não foi possível salvar fato na memória.' });
    }
  });

  router.delete('/memory/entries/:id', requireAuth, async (req, res) => {
    try {
      const id = String(req.params.id || '');
      const active = store.getActiveWorkspace();
      const { result } = await laneQueue.enqueue({
        sessionId: `memory:${active.slug}`,
        workspaceSlug: active.slug,
        jobType: 'memory.entry_delete',
        task: () => {
          const wsStore = store.getActiveWorkspaceStore();
          const deleted = wsStore.deleteMemoryEntry(id);
          if (!deleted) throw new Error('Fato não encontrado na memória do perfil ativo.');
          return {
            entries: wsStore.listMemoryEntries(),
            index_stats: wsStore.getIndexStats(),
          };
        },
        summarize: () => `Fato ${id} removido do perfil ${active.slug}`,
      });
      res.json(result);
    } catch (err: any) {
      res.status(404).json({ error: err?.message || 'Fato não encontrado.' });
    }
  });

  router.post('/memory/search', requireAuth, async (req, res) => {
    try {
      const query = String(req.body?.query || '').trim();
      if (!query) {
        res.status(400).json({ error: 'Digite um termo ou pergunta para a busca híbrida.' });
        return;
      }
      const limit = Math.max(1, Math.min(20, Number(req.body?.limit || 8)));
      const bm25Weight = Math.max(0, Math.min(1, Number(req.body?.bm25_weight ?? 0.5)));
      const vectorWeight = Math.max(0, Math.min(1, Number(req.body?.vector_weight ?? 0.5)));

      const wsStore = store.getActiveWorkspaceStore();
      const searchRes = await pythonWorker.hybridSearch({
        db_path: wsStore.dbPath,
        workspace_slug: wsStore.slug,
        query,
        limit,
        bm25_weight: bm25Weight,
        vector_weight: vectorWeight,
      });

      res.json({
        workspace_slug: wsStore.slug,
        query,
        weights: { bm25: bm25Weight, vector: vectorWeight },
        ...searchRes,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Falha ao executar busca híbrida no Worker Python.' });
    }
  });

  // ==================== WORKER PYTHON 3.11 & FILAS SERIAIS ====================
  router.get('/python/status', requireAuth, async (_req, res) => {
    try {
      const wsStore = store.getActiveWorkspaceStore();
      const [ping, analysis] = await Promise.all([
        pythonWorker.ping(),
        pythonWorker.analyzeWorkspace({ db_path: wsStore.dbPath, workspace_slug: wsStore.slug }),
      ]);
      res.json({
        worker: ping,
        workspace_slug: wsStore.slug,
        analysis,
        lanes: laneQueue.getSnapshot(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Worker Python 3.11 indisponível no momento.' });
    }
  });

  router.post('/python/reindex', requireAuth, async (req, res) => {
    try {
      const active = store.getActiveWorkspace();
      const wsStore = store.getActiveWorkspaceStore();
      const mdFiles = wsStore.getMarkdownFiles();
      const entries = wsStore.listMemoryEntries();
      const sessionId = String(req.body?.session_id || `python:${active.slug}`);

      const preparedMd = await Promise.all(
        mdFiles.map(async (f) => ({
          filename: f.filename,
          vec: await pythonWorker.chunkAndVectorize({ text: f.content, source_ref: f.filename }),
        }))
      );
      const preparedEntries = await Promise.all(
        entries.map(async (e) => ({
          entry: e,
          vec: await pythonWorker.chunkAndVectorize({
            text: `${e.title}\n${e.content}`,
            source_ref: `entry:${e.id}`,
          }),
        }))
      );

      const { job, result } = await laneQueue.enqueue({
        sessionId,
        workspaceSlug: active.slug,
        jobType: 'python.hybrid_reindex',
        task: () => {
          let totalChunks = 0;
          for (const item of preparedMd) {
            totalChunks += wsStore.replaceChunksForSource(
              'markdown',
              item.filename,
              item.vec.chunks.map((ch) => ({
                heading: ch.heading,
                content: ch.content,
                content_hash: ch.content_hash,
                token_estimate: ch.token_estimate,
                vector: ch.vector,
                model: `python-hash-${item.vec.dimensions}d`,
              }))
            );
          }
          for (const item of preparedEntries) {
            totalChunks += wsStore.replaceChunksForSource(
              'memory_entry',
              `entry:${item.entry.id}`,
              item.vec.chunks.map((ch) => ({
                heading: `[${item.entry.scope}] ${item.entry.title}`,
                content: item.entry.content,
                content_hash: ch.content_hash,
                token_estimate: ch.token_estimate,
                vector: ch.vector,
                model: `python-hash-${item.vec.dimensions}d`,
              }))
            );
          }
          return {
            chunks_reindexed: totalChunks,
            markdown_files: mdFiles.length,
            entries_reindexed: entries.length,
            index_stats: wsStore.getIndexStats(),
          };
        },
        summarize: (r) => `Reindexação Python concluída: ${r.chunks_reindexed} chunks (${r.markdown_files} Markdown + ${r.entries_reindexed} fatos)`,
      });

      res.json({ ...result, lane_job: job });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Falha ao reindexar workspace no Worker Python.' });
    }
  });

  router.post('/python/extract-facts', requireAuth, async (req, res) => {
    try {
      const text = String(req.body?.text || '').trim();
      const persist = req.body?.persist !== false;
      if (text.length < 15) {
        res.status(400).json({ error: 'Forneça um trecho de conversa ou nota (mínimo 15 caracteres) para extração.' });
        return;
      }

      const extracted = await pythonWorker.extractFacts(text);
      const active = store.getActiveWorkspace();

      if (!persist || extracted.facts.length === 0) {
        res.json({
          facts: extracted.facts,
          persisted_count: 0,
          python_elapsed_ms: extracted.elapsed_ms,
        });
        return;
      }

      const vectorizedFacts = await Promise.all(
        extracted.facts.map(async (f) => ({
          fact: f,
          vec: await pythonWorker.chunkAndVectorize({
            text: `${f.title}\n${f.content}`,
            source_ref: `hermes:${f.scope}`,
          }),
        }))
      );

      const { job, result } = await laneQueue.enqueue({
        sessionId: `hermes:${active.slug}`,
        workspaceSlug: active.slug,
        jobType: 'python.extract_facts',
        task: () => {
          const wsStore = store.getActiveWorkspaceStore();
          const saved = vectorizedFacts.map(({ fact, vec }) =>
            wsStore.addMemoryEntry({
              scope: fact.scope,
              title: fact.title,
              content: fact.content,
              source: 'python-hermes-extractor',
              tags: fact.tags,
              confidence: fact.confidence,
              vector: vec.chunks[0]?.vector || [],
              model: `python-hash-${vec.dimensions}d`,
            })
          );
          return {
            saved,
            index_stats: wsStore.getIndexStats(),
          };
        },
        summarize: (r) => `Worker Python extraiu e salvou ${r.saved.length} fato(s) Hermes (memory/user)`,
      });

      res.json({
        facts: extracted.facts,
        persisted_count: result.saved.length,
        saved_entries: result.saved,
        index_stats: result.index_stats,
        python_elapsed_ms: extracted.elapsed_ms,
        lane_job: job,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Falha ao extrair fatos no Worker Python.' });
    }
  });

  router.get('/lanes', requireAuth, (req, res) => {
    const limit = Number(req.query?.limit || 25);
    res.json({
      snapshot: laneQueue.getSnapshot(),
      jobs: store.listLaneJobs(limit),
    });
  });

  // ==================== GATEWAY MCP NATIVO ====================
  router.get('/mcp/servers', requireAuth, (_req, res) => {
    res.json({
      servers: store.listMcpServers(),
      logs: store.listMcpToolLogs(25),
    });
  });

  router.post('/mcp/servers', requireAuth, (req, res) => {
    try {
      const created = store.addMcpServer({
        name: String(req.body?.name || ''),
        transport: req.body?.transport === 'http' ? 'http' : 'stdio',
        endpoint: String(req.body?.endpoint || ''),
        description: req.body?.description ? String(req.body.description) : undefined,
      });
      res.status(201).json({
        created,
        servers: store.listMcpServers(),
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Não foi possível registrar este servidor MCP.' });
    }
  });

  router.patch('/mcp/servers/:id/approval', requireAuth, (req, res) => {
    try {
      const id = String(req.params.id || '');
      const isApproved = Boolean(req.body?.is_approved);
      const updated = store.toggleMcpServerApproval(id, isApproved);
      res.json({
        server: updated,
        servers: store.listMcpServers(),
      });
    } catch (err: any) {
      res.status(404).json({ error: err?.message || 'Servidor MCP não encontrado.' });
    }
  });

  router.post('/mcp/servers/:id/discover', requireAuth, async (req, res) => {
    try {
      const id = String(req.params.id || '');
      const server = store.listMcpServers().find((s) => s.id === id);
      if (!server) {
        res.status(404).json({ error: 'Servidor MCP não encontrado.' });
        return;
      }

      if (server.is_builtin) {
        const updated = store.updateMcpServerDiscovery(id, 'online', server.tools);
        res.json({
          server: updated,
          servers: store.listMcpServers(),
          detail: `${updated.tools.length} ferramentas nativas prontas para execução.`,
        });
        return;
      }

      if (server.transport === 'http') {
        const probe = await probeBrainHealth(server.endpoint, false);
        const tools: McpToolDescriptor[] =
          probe.status === 'online'
            ? [
                {
                  name: 'remote.health_check',
                  description: 'Verifica status remoto do servidor MCP compatível',
                  requires_approval: false,
                  input_hint: '{}',
                },
              ]
            : server.tools;
        const updated = store.updateMcpServerDiscovery(
          id,
          probe.status === 'online' ? 'online' : 'standby',
          tools
        );
        res.json({
          server: updated,
          servers: store.listMcpServers(),
          detail: probe.detail,
        });
        return;
      }

      // Transporte stdio customizado: registra catálogo seguro pronto para ativação local
      const discovered: McpToolDescriptor[] =
        server.tools.length > 0
          ? server.tools
          : [
              {
                name: 'stdio.ping',
                description: 'Verifica disponibilidade do conector stdio registrado',
                requires_approval: false,
                input_hint: '{}',
              },
            ];
      const updated = store.updateMcpServerDiscovery(id, 'standby', discovered);
      res.json({
        server: updated,
        servers: store.listMcpServers(),
        detail: `Catálogo MCP atualizado (${discovered.length} ferramenta(s) declaradas).`,
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Falha ao descobrir ferramentas do servidor MCP.' });
    }
  });

  router.post('/mcp/servers/:id/invoke', requireAuth, async (req, res) => {
    const id = String(req.params.id || '');
    const toolName = String(req.body?.tool_name || '').trim();
    const argsObj =
      req.body?.arguments && typeof req.body.arguments === 'object' ? req.body.arguments : {};
    const startedMs = Date.now();

    const server = store.listMcpServers().find((s) => s.id === id);
    if (!server) {
      res.status(404).json({ error: 'Servidor MCP não encontrado.' });
      return;
    }
    if (!server.is_approved) {
      const log = store.recordMcpToolLog({
        server_id: server.id,
        server_name: server.name,
        tool_name: toolName || 'unknown',
        arguments_json: JSON.stringify(argsObj),
        status: 'blocked',
        output_summary: 'Execução bloqueada: aprove este servidor MCP antes de invocar ferramentas.',
        duration_ms: Math.max(1, Date.now() - startedMs),
        actor: 'admin',
      });
      res.status(403).json({
        error: 'Este servidor MCP ainda não foi aprovado. Ative a aprovação antes de executar.',
        log,
      });
      return;
    }

    try {
      let output: unknown;
      let summary = '';
      const wsStore = store.getActiveWorkspaceStore();

      if (toolName === 'memory.search_hybrid') {
        const q = String((argsObj as any).query || 'sqlite wal').trim();
        const searchRes = await pythonWorker.hybridSearch({
          db_path: wsStore.dbPath,
          workspace_slug: wsStore.slug,
          query: q,
          limit: 5,
        });
        output = searchRes;
        summary = `${searchRes.hits.length} resultado(s) híbridos para "${q}" em ${searchRes.elapsed_ms} ms`;
      } else if (toolName === 'memory.list_facts') {
        const sc = (argsObj as any).scope === 'user' ? 'user' : (argsObj as any).scope === 'memory' ? 'memory' : undefined;
        const entries = wsStore.listMemoryEntries(sc);
        output = { workspace: wsStore.slug, count: entries.length, entries: entries.slice(0, 10) };
        summary = `${entries.length} fato(s) retornados do perfil "${wsStore.slug}"`;
      } else if (toolName === 'workspace.health_report') {
        const dbHealth = store.getDatabaseHealth();
        const wsStats = wsStore.getIndexStats();
        output = { db: dbHealth, workspace: wsStats, lanes: laneQueue.getSnapshot() };
        summary = `SQLite ${dbHealth.journalMode.toUpperCase()} (${dbHealth.integrity}) · ${wsStats.chunks} chunks indexados`;
      } else if (toolName === 'workspace.snapshot_backup') {
        const { result } = await laneQueue.enqueue({
          sessionId: `mcp:${server.id}`,
          workspaceSlug: wsStore.slug,
          jobType: 'mcp.workspace_backup',
          task: () => store.createSqliteBackup(),
          summarize: (b) => `Backup MCP "${b.filename}" gerado (${(b.size_bytes / 1024).toFixed(1)} KB)`,
        });
        output = result;
        summary = `Snapshot "${result.filename}" gerado (${(result.size_bytes / 1024).toFixed(1)} KB)`;
      } else {
        output = {
          server: server.name,
          tool: toolName,
          status: 'acknowledged',
          note: 'Ferramenta registrada e auditada pelo Gateway MCP.',
        };
        summary = `Ferramenta "${toolName}" despachada via ${server.transport.toUpperCase()}`;
      }

      const log = store.recordMcpToolLog({
        server_id: server.id,
        server_name: server.name,
        tool_name: toolName,
        arguments_json: JSON.stringify(argsObj),
        status: 'success',
        output_summary: summary,
        duration_ms: Math.max(1, Date.now() - startedMs),
        actor: 'admin',
      });

      res.json({
        output,
        summary,
        log,
        logs: store.listMcpToolLogs(25),
      });
    } catch (err: any) {
      const log = store.recordMcpToolLog({
        server_id: server.id,
        server_name: server.name,
        tool_name: toolName || 'unknown',
        arguments_json: JSON.stringify(argsObj),
        status: 'error',
        output_summary: String(err?.message || 'Erro ao executar ferramenta MCP'),
        duration_ms: Math.max(1, Date.now() - startedMs),
        actor: 'admin',
      });
      res.status(400).json({ error: err?.message || 'Falha ao invocar ferramenta MCP.', log });
    }
  });

  router.delete('/mcp/servers/:id', requireAuth, (req, res) => {
    try {
      const id = String(req.params.id || '');
      store.deleteMcpServer(id);
      res.json({ servers: store.listMcpServers(), logs: store.listMcpToolLogs(25) });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Não foi possível remover servidor MCP.' });
    }
  });

  // ==================== EXPORT, IMPORT, BACKUPS & BUNDLE ====================
  router.post('/export', requireAuth, (_req, res) => {
    try {
      deps.syncSnapshotBeforeExport();
      const pack = store.exportJarvisPack();
      res.json(pack);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Falha ao exportar pacote .jarvis-pack.' });
    }
  });

  router.post('/import', requireAuth, async (req, res) => {
    try {
      const active = store.getActiveWorkspace();
      const { result } = await laneQueue.enqueue({
        sessionId: 'pack-migration',
        workspaceSlug: active.slug,
        jobType: 'brain.pack_import',
        task: () => {
          deps.syncSnapshotBeforeExport();
          const importedRes = store.importJarvisPack(req.body);
          deps.onPackImported?.(importedRes.pack);
          return importedRes;
        },
        summarize: (r) => `Pacote "${r.pack.sourceBrain.name}" importado (+${r.imported.agents} agentes, +${r.imported.skills} skills)`,
      });
      res.json({
        imported: result.imported,
        message: `Migração de "${result.pack.sourceBrain.name}" gravada no SQLite local: +${result.imported.agents} agentes, +${result.imported.skills} habilidades, +${result.imported.workflows} fluxos e +${result.imported.knowledge} documentos.`,
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Falha ao importar pacote .jarvis-pack.' });
    }
  });

  router.get('/backups', requireAuth, (_req, res) => {
    res.json({
      backups_dir: store.backupsDir,
      backups: store.listBackups(),
    });
  });

  router.post('/backup', requireAuth, async (_req, res) => {
    try {
      const active = store.getActiveWorkspace();
      const { result: created } = await laneQueue.enqueue({
        sessionId: 'sqlite-backup',
        workspaceSlug: active.slug,
        jobType: 'sqlite.vacuum_backup',
        task: () => {
          deps.syncSnapshotBeforeExport();
          return store.createSqliteBackup();
        },
        summarize: (b) => `Backup "${b.filename}" criado (${(b.size_bytes / 1024).toFixed(1)} KB)`,
      });
      res.status(201).json({
        backup: created,
        backups: store.listBackups(),
        message: `Backup SQLite "${created.filename}" criado (${(created.size_bytes / 1024).toFixed(1)} KB).`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Não foi possível gerar o backup do banco SQLite.' });
    }
  });

  router.post('/bundle/preview', requireAuth, async (req, res) => {
    try {
      const options = resolveDeploymentOptions(req.body || {});
      const { files, zipBuffer, filename } = await buildDualModeBundleZip(options);
      res.json({
        options,
        files,
        zip_size_bytes: zipBuffer.length,
        filename,
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Não foi possível gerar os arquivos do servidor.' });
    }
  });

  router.post('/bundle.zip', requireAuth, async (req, res) => {
    try {
      const options = resolveDeploymentOptions(req.body || {});
      const { zipBuffer, filename } = await buildDualModeBundleZip(options);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(zipBuffer);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Falha ao compactar o servidor Poliglota.' });
    }
  });

  return router;
}
