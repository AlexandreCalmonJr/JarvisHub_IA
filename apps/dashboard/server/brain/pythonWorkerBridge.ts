/**
 * Ponte Segura Node.js ↔ Python 3.11 Worker (JSON-RPC NDJSON via stdio).
 *
 * - Inicia `python3` sem shell intermediário (`shell: false`), passando caminho absoluto do script.
 * - Timeout rígido por requisição, fila interna correlacionada por ID e reinício automático se encerrado.
 * - Sem dependências pip obrigatórias: roda ao vivo no ambiente padrão Python 3.11.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { HybridSearchHit } from './models.ts';

export interface PythonPingResult {
  status: 'online' | 'offline';
  python_version: string;
  sqlite_version: string;
  fts5_available: boolean;
  vector_dimensions: number;
  pid: number;
  elapsed_ms?: number;
}

export interface PythonChunkItem {
  index: number;
  heading: string;
  content: string;
  content_hash: string;
  token_estimate: number;
  vector: number[];
}

export interface PythonExtractedFact {
  scope: 'memory' | 'user';
  title: string;
  content: string;
  tags: string[];
  confidence: number;
}

export interface PythonWorkspaceAnalysis {
  chunks: number;
  estimated_tokens: number;
  embeddings: number;
  entries_memory: number;
  entries_user: number;
  top_terms: Array<{ term: string; count: number }>;
}

interface PendingRpc {
  resolve: (value: { result: any; elapsed_ms: number }) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

const DEFAULT_SCRIPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'python_worker.py'
);

export class PythonWorkerBridge {
  private readonly scriptPath: string;
  private readonly timeoutMs: number;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: readline.Interface | null = null;
  private readonly pending = new Map<string, PendingRpc>();
  private disposed = false;

  constructor(options: { scriptPath?: string; timeoutMs?: number } = {}) {
    this.scriptPath = options.scriptPath || DEFAULT_SCRIPT_PATH;
    this.timeoutMs = Math.max(1500, options.timeoutMs || 15000);
  }

  private ensureProcess(): ChildProcessWithoutNullStreams {
    if (this.disposed) {
      throw new Error('Worker Python já foi encerrado.');
    }
    if (this.proc && !this.proc.killed && this.proc.exitCode === null) {
      return this.proc;
    }

    const pythonBin =
      process.env.PYTHON_BIN ||
      process.env.PYTHON_PATH ||
      (process.platform === 'win32' ? 'python' : 'python3');

    const child = spawn(pythonBin, [this.scriptPath], {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
      },
    });

    this.proc = child;
    this.rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });

    this.rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const msg = JSON.parse(trimmed) as {
          id?: string;
          ok?: boolean;
          result?: any;
          error?: string;
          elapsed_ms?: number;
        };
        if (!msg.id) return;
        const entry = this.pending.get(msg.id);
        if (!entry) return;
        clearTimeout(entry.timer);
        this.pending.delete(msg.id);
        if (msg.ok) {
          entry.resolve({ result: msg.result, elapsed_ms: Number(msg.elapsed_ms || 0) });
        } else {
          entry.reject(new Error(msg.error || 'Erro no Worker Python.'));
        }
      } catch {
        // Ignora linhas não-JSON inesperadas
      }
    });

    child.on('exit', () => {
      this.proc = null;
      this.rl?.close();
      this.rl = null;
      for (const [id, entry] of this.pending.entries()) {
        clearTimeout(entry.timer);
        entry.reject(new Error('Worker Python reiniciou antes de responder.'));
        this.pending.delete(id);
      }
    });

    child.on('error', (err) => {
      for (const [id, entry] of this.pending.entries()) {
        clearTimeout(entry.timer);
        entry.reject(new Error(`Falha ao iniciar python3: ${err.message}`));
        this.pending.delete(id);
      }
    });

    return child;
  }

  public call<T = any>(method: string, params: Record<string, unknown> = {}): Promise<{ result: T; elapsed_ms: number }> {
    const child = this.ensureProcess();
    const id = `py_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout no Worker Python ao executar "${method}".`));
      }, this.timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      const payload = JSON.stringify({ id, method, params }) + '\n';
      child.stdin.write(payload, 'utf8', (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(new Error(`Falha ao enviar comando ao Worker Python: ${err.message}`));
        }
      });
    });
  }

  public async ping(): Promise<PythonPingResult> {
    const { result, elapsed_ms } = await this.call<PythonPingResult>('ping', {});
    return { ...result, elapsed_ms };
  }

  public async chunkAndVectorize(params: {
    text: string;
    source_ref: string;
    max_chars?: number;
    overlap?: number;
  }): Promise<{ chunks: PythonChunkItem[]; dimensions: number; elapsed_ms: number }> {
    const { result, elapsed_ms } = await this.call<{
      chunks: PythonChunkItem[];
      dimensions: number;
    }>('chunk_and_vectorize', params);
    return { ...result, elapsed_ms };
  }

  public async hybridSearch(params: {
    db_path: string;
    workspace_slug: string;
    query: string;
    limit?: number;
    bm25_weight?: number;
    vector_weight?: number;
    query_vector?: number[];
  }): Promise<{
    hits: HybridSearchHit[];
    fts_candidates: number;
    vector_candidates: number;
    engine: string;
    elapsed_ms: number;
  }> {
    const { result, elapsed_ms } = await this.call<{
      hits: HybridSearchHit[];
      fts_candidates: number;
      vector_candidates: number;
      engine: string;
    }>('hybrid_search', params);
    return { ...result, elapsed_ms };
  }

  public async extractFacts(text: string): Promise<{ facts: PythonExtractedFact[]; elapsed_ms: number }> {
    const { result, elapsed_ms } = await this.call<{ facts: PythonExtractedFact[] }>('extract_facts', { text });
    return { facts: result.facts || [], elapsed_ms };
  }

  public async analyzeWorkspace(params: {
    db_path: string;
    workspace_slug: string;
  }): Promise<PythonWorkspaceAnalysis & { elapsed_ms: number }> {
    const { result, elapsed_ms } = await this.call<PythonWorkspaceAnalysis>('analyze_workspace', params);
    return { ...result, elapsed_ms };
  }

  public close(): void {
    this.disposed = true;
    for (const [id, entry] of this.pending.entries()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('Worker Python encerrado.'));
      this.pending.delete(id);
    }
    this.rl?.close();
    this.rl = null;
    if (this.proc && !this.proc.killed) {
      this.proc.kill('SIGTERM');
    }
    this.proc = null;
  }
}

export function createPythonWorkerBridge(): PythonWorkerBridge {
  return new PythonWorkerBridge();
}
