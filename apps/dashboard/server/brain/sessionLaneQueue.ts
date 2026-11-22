/**
 * Filas Seriais por Sessão + Escritor Único (Inspirado em OpenClaw & Hermes Agent).
 *
 * Garante que todas as mutações no banco SQLite de uma mesma sessão executem estritamente
 * em ordem FIFO (sem condições de corrida em execuções multi-etapas), e que escritas
 * concorrentes passem pelo funil canônico do Control Plane sem erros SQLITE_BUSY.
 */

import crypto from 'node:crypto';
import type { SessionLaneJobModel } from './models.ts';

export interface LaneJobPersistCallback {
  (job: SessionLaneJobModel): void;
}

export interface LaneSnapshot {
  active_lanes: number;
  pending_jobs: number;
  total_executed: number;
  lanes: Array<{ session_id: string; depth: number; running: boolean }>;
}

export class SessionLaneQueue {
  private readonly sessionChains = new Map<string, Promise<unknown>>();
  private readonly laneCounts = new Map<string, number>();
  private writerChain: Promise<unknown> = Promise.resolve();
  private totalExecuted = 0;
  private onPersist?: LaneJobPersistCallback;

  public setPersistCallback(cb: LaneJobPersistCallback): void {
    this.onPersist = cb;
  }

  /**
   * Enfileira uma tarefa na fila serial da sessão especificada e, quando `exclusiveWrite`
   * é verdadeiro, sincroniza também no escritor único do SQLite.
   */
  public enqueue<T>(options: {
    sessionId: string;
    workspaceSlug: string;
    jobType: string;
    exclusiveWrite?: boolean;
    task: () => Promise<T> | T;
    summarize?: (result: T) => string;
  }): Promise<{ job: SessionLaneJobModel; result: T }> {
    const sessionId = String(options.sessionId || 'global').trim().slice(0, 80) || 'global';
    const workspaceSlug = String(options.workspaceSlug || 'default').trim().slice(0, 48) || 'default';
    const jobType = String(options.jobType || 'task').trim().slice(0, 64) || 'task';
    const exclusiveWrite = options.exclusiveWrite !== false;

    const jobId = `lane_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
    const createdAt = new Date().toISOString();

    const currentDepth = (this.laneCounts.get(sessionId) || 0) + 1;
    this.laneCounts.set(sessionId, currentDepth);

    const prevSession = this.sessionChains.get(sessionId) || Promise.resolve();

    const runWork = async (): Promise<{ job: SessionLaneJobModel; result: T }> => {
      const execute = async (): Promise<{ job: SessionLaneJobModel; result: T }> => {
        const startedMs = Date.now();
        try {
          const result = await options.task();
          const durationMs = Math.max(1, Date.now() - startedMs);
          const summary = options.summarize
            ? String(options.summarize(result)).slice(0, 260)
            : `${jobType} concluído em ${durationMs} ms.`;
          const job: SessionLaneJobModel = {
            id: jobId,
            session_id: sessionId,
            workspace_slug: workspaceSlug,
            job_type: jobType,
            status: 'completed',
            duration_ms: durationMs,
            summary,
            error_message: null,
            created_at: createdAt,
            finished_at: new Date().toISOString(),
          };
          this.totalExecuted += 1;
          try {
            this.onPersist?.(job);
          } catch {
            // Falha na persistência de telemetria não deve quebrar a resposta da tarefa.
          }
          return { job, result };
        } catch (err: any) {
          const durationMs = Math.max(1, Date.now() - startedMs);
          const errorMessage = String(err?.message || 'Erro interno na execução da fila.');
          const job: SessionLaneJobModel = {
            id: jobId,
            session_id: sessionId,
            workspace_slug: workspaceSlug,
            job_type: jobType,
            status: 'failed',
            duration_ms: durationMs,
            summary: `Falha em ${jobType}`,
            error_message: errorMessage.slice(0, 300),
            created_at: createdAt,
            finished_at: new Date().toISOString(),
          };
          this.totalExecuted += 1;
          try {
            this.onPersist?.(job);
          } catch {
            // ignore
          }
          throw err;
        }
      };

      if (!exclusiveWrite) {
        return execute();
      }

      // Funil de escritor único SQLite
      let releaseWriter!: () => void;
      const prevWriter = this.writerChain;
      this.writerChain = new Promise<void>((resolve) => {
        releaseWriter = resolve;
      });
      await prevWriter;
      try {
        return await execute();
      } finally {
        releaseWriter();
      }
    };

    const nextPromise = prevSession.then(runWork, runWork);

    const cleanupPromise = nextPromise.finally(() => {
      const remaining = (this.laneCounts.get(sessionId) || 1) - 1;
      if (remaining <= 0) {
        this.laneCounts.delete(sessionId);
        if (this.sessionChains.get(sessionId) === cleanupPromise) {
          this.sessionChains.delete(sessionId);
        }
      } else {
        this.laneCounts.set(sessionId, remaining);
      }
    });

    this.sessionChains.set(sessionId, cleanupPromise);
    return nextPromise;
  }

  public getSnapshot(): LaneSnapshot {
    const lanes: Array<{ session_id: string; depth: number; running: boolean }> = [];
    let pending = 0;
    for (const [session_id, depth] of this.laneCounts.entries()) {
      lanes.push({ session_id, depth, running: depth > 0 });
      pending += depth;
    }
    return {
      active_lanes: lanes.length,
      pending_jobs: pending,
      total_executed: this.totalExecuted,
      lanes,
    };
  }
}
